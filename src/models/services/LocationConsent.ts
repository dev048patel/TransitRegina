/* Whether the rider has agreed to share their location with the map.

   The browser's own permission prompt only appears once the rider taps "Use my location", so
   location is asked for at the moment it is useful, with an explanation first. "Allowed" is kept on
   this device; "Not now" lasts only until the map is next opened, so every visit to the map asks. */

import { problemFromError, type LocationProblem } from './LocationHelp';
import { track } from './UsageTracker';

export type LocationChoice = 'allowed' | 'declined' | null;

const KEY = 'transit-regina:location-choice';
const listeners = new Set<(choice: LocationChoice) => void>();
/** "Not now" for this visit to the map only (a "declined" saved by older versions is ignored, so they're asked again) */
let declinedThisVisit = false;
let allowedThisVisit = false;

export function getLocationChoice(): LocationChoice {
    if (allowedThisVisit) return 'allowed';
    try { if (localStorage.getItem(KEY) === 'allowed') return 'allowed'; } catch { /* storage blocked */ }
    return declinedThisVisit ? 'declined' : null;
}

export function setLocationChoice(choice: Exclude<LocationChoice, null>): void {
    if (choice === 'allowed') {
        allowedThisVisit = true;
        declinedThisVisit = false;
        try { localStorage.setItem(KEY, 'allowed'); } catch { /* private mode: remember for this visit only */ }
    } else {
        declinedThisVisit = true;
        try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
    }
    listeners.forEach(listener => listener(choice));
}

/** Opening the map: a "Not now" from an earlier visit no longer counts, so the rider is asked again */
export function askAgainOnMapOpen(): void {
    if (!declinedThisVisit) return;
    declinedThisVisit = false;
    listeners.forEach(listener => listener(getLocationChoice()));
}

export function onLocationChoice(listener: (choice: LocationChoice) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** True when the browser already has permission, so asking again would only add a step */
export async function browserAlreadyAllows(): Promise<boolean> {
    try {
        const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        return status?.state === 'granted';
    } catch {
        return false;
    }
}

/* ── When the rider said yes but the device or browser still won't give a location ── */

let problem: LocationProblem | null = null;
/** Goes up each time location starts working again, so anything watching the position restarts */
let attempt = 0;
const problemListeners = new Set<() => void>();
const notify = () => problemListeners.forEach(l => l());

export const getLocationProblem = () => problem;
export const getLocationAttempt = () => attempt;
export function setLocationProblem(next: LocationProblem | null): void {
    if (next === problem) return;
    problem = next;
    if (next) track('location_problem', { problem: next });   // here, once per change (several components listen)
    notify();
}
export function onLocationProblem(listener: () => void): () => void {
    problemListeners.add(listener);
    return () => { problemListeners.delete(listener); };
}

/**
 * Asks for the position once. From a tap, this lets the browser show its prompt again; after the
 * rider has changed a setting, it confirms the fix. Records the outcome either way.
 */
export function retryLocation(): Promise<boolean> {
    if (!navigator.geolocation) { setLocationProblem('unsupported'); return Promise.resolve(false); }
    return new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            () => { problem = null; attempt++; notify(); resolve(true); },
            err => { setLocationProblem(problemFromError(err.code)); resolve(false); },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    });
}

/* Coming back from Settings: try again by itself, so a fixed setting just starts working */
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && problem && problem !== 'unsupported' && getLocationChoice() === 'allowed') void retryLocation();
    });
    navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then(status => {
        status.onchange = () => { if (status.state === 'granted' && problem) void retryLocation(); };
    }).catch(() => { /* no Permissions API (older Safari): the visibility check covers it */ });
}
