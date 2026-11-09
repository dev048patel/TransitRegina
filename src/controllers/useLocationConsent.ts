// useLocationConsent — the rider's choice about sharing their location, shared by every map component
import { useEffect, useState } from 'react';
import { askAgainOnMapOpen, browserAlreadyAllows, getLocationAttempt, getLocationChoice, getLocationProblem, onLocationChoice, onLocationProblem, retryLocation, setLocationChoice, type LocationChoice } from '../models/services/LocationConsent';
import type { LocationProblem } from '../models/services/LocationHelp';
import { track } from '../models/services/UsageTracker';

export function useLocationConsent() {
    const [choice, setChoice] = useState<LocationChoice>(getLocationChoice);
    /* What is stopping the location, if anything, and a counter that restarts position watching */
    const [problem, setProblem] = useState<LocationProblem | null>(getLocationProblem);
    const [attempt, setAttempt] = useState(getLocationAttempt);
    useEffect(() => onLocationProblem(() => {
        const next = getLocationProblem();
        setProblem(next); setAttempt(getLocationAttempt());
    }), []);

    useEffect(() => {
        const stop = onLocationChoice(setChoice);
        /* Someone who already allowed location in this browser is not asked again */
        if (getLocationChoice() === null) browserAlreadyAllows().then(yes => { if (yes) setLocationChoice('allowed'); });
        return stop;
    }, []);

    return {
        choice,
        /** Call when the map page opens (see MapPage) */
        askAgainOnMapOpen,
        problem,
        attempt,
        /* Saying yes asks the browser straight away, from the tap, so its prompt can appear */
        allow: () => { setLocationChoice('allowed'); track('location', { choice: 'allowed' }); void retryLocation(); },
        decline: () => { setLocationChoice('declined'); track('location', { choice: 'declined' }); },
        retry: retryLocation,
    };
}
