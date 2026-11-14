/* Weekly Commute controller — each day's trip there and trip home, planned on the bus timetable for that
   weekday, saved for reminders (texts, push, the banner) and previewed on the map. */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../models/context/AuthContext';
import { SavedDestination } from '../models/transit/SavedDestination';
import { SavedDestinationsService } from '../models/services/SavedDestinationsService';
import { TripOption } from '../models/transit/RoutePlanning';
import { WeeklyScheduleService } from '../models/services/WeeklyScheduleService';
import { PushSubscriptionService } from '../models/services/PushSubscriptionService';
import { SmsService, type CommuteTexts } from '../models/services/SmsService';
import { fetchArriveByPlan, journeyToTrip, type PlannedJourney } from '../models/services/ArriveByClient';
import {
    DAY_LABELS, DAY_ORDER, DayPlan, TripSlot, applyConflicts, applyToWeekdays, blankDay, blankWeek, clockToHhmm,
    hhmmToClock, isSet, legacyTripKeys, planFields, rowsToSave, samePlans, tripHomeFor, tripKey, weekFromRows,
} from '../models/transit/WeeklySchedule';
import { track } from '../models/services/UsageTracker';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** The buses found for one trip: every way that gets there in time, or why there's none */
export interface TripSearch {
    journeys: PlannedJourney[];
    /** partial / no service: what to tell the rider */
    notice: string;
    calculating: boolean;
    error: string;
}
const noSearch: TripSearch = { journeys: [], notice: '', calculating: false, error: '' };

function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/** What a pinned journey saves: when to leave, and every bus */
function pinFields(j: PlannedJourney): Partial<DayPlan> {
    const routeList = j.legs.map(l => l.route);
    return { departBy: clockToHhmm(j.leave), routeNum: routeList[0] ?? null, routeList, routeTotalMinutes: Math.round(j.totalMin) };
}

/** The journey to pin from a search: the one with the buses already pinned, else the best */
function preferred(journeys: PlannedJourney[], routeList: string[] | null): PlannedJourney | null {
    const same = routeList?.length ? journeys.find(j => j.legs.map(l => l.route).join('>') === routeList.join('>')) : undefined;
    return same ?? journeys[0] ?? null;
}

/** Plans one trip on the timetable for its weekday */
async function planTrip(from: SavedDestination, to: SavedDestination, arriveBy: string, day: number): Promise<{ journeys: PlannedJourney[]; notice: string }> {
    const plan = await fetchArriveByPlan({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, arriveBy, day);
    if (plan.status === 'planned') return { journeys: plan.journeys, notice: '' };
    if (plan.status === 'partial') {
        return { journeys: [plan.journey], notice: `No bus goes all the way in time. This gets you within ${(plan.remainingMetres / 1000).toFixed(1)} km.` };
    }
    return plan.earliest
        ? { journeys: [plan.earliest], notice: `No bus gets you there by ${plan.arriveBy} on ${DAY_LABELS[day]}. The earliest you can arrive is ${plan.earliest.arrive}.` }
        : { journeys: [], notice: `No buses run between these places around that time on ${DAY_LABELS[day]}.` };
}

export function useWeeklyPlannerController() {
    const { user, isAuthenticated } = useAuth();

    const [isOpen, setIsOpen] = useState(false);
    const [savedDests, setSavedDests] = useState<SavedDestination[]>([]);
    const [loading, setLoading] = useState(false);
    // The schedule couldn't be read: nothing may be saved over it until it is
    const [loadError, setLoadError] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [reloadCount, setReloadCount] = useState(0);

    // The week being edited, and the week as saved (unsaved changes = the difference)
    const [week, setWeek] = useState<Record<string, DayPlan>>(blankWeek);
    const [savedWeek, setSavedWeek] = useState<Record<string, DayPlan>>(blankWeek);
    // The latest week, for the background re-check of old leave times (it runs across renders)
    const weekRef = useRef(week);
    weekRef.current = week;
    // Old leave times corrected from the timetable on opening, waiting to be saved
    const [recheckNote, setRecheckNote] = useState('');
    // Rows that exist in the database (they're always written, so clearing a trip clears it there)
    const [stored, setStored] = useState<Set<string>>(new Set());
    const [searches, setSearches] = useState<Record<string, TripSearch>>({});

    const today = new Date().getDay();
    const [selectedDay, setSelectedDayRaw] = useState<number>(today);
    const [selectedTrip, setSelectedTripRaw] = useState<TripSlot>(0);
    const [previewing, setPreviewing] = useState<PlannedJourney | null>(null);

    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saveNotes, setSaveNotes] = useState<string[]>([]);
    // Confirmations shown in the panel (not browser dialogs)
    const [confirmClose, setConfirmClose] = useState(false);
    const [confirmApply, setConfirmApply] = useState<number[] | null>(null);

    const [texts, setTexts] = useState<CommuteTexts | null>(null);

    // Push notification state
    const [notifPermission, setNotifPermission] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');
    const [subscribing, setSubscribing] = useState(false);

    useEffect(() => {
        setNotifPermission(
            'Notification' in window ? (Notification.permission as 'default' | 'granted' | 'denied') : 'unsupported'
        );
    }, []);

    const dirty = useMemo(() => loaded && !samePlans(week, savedWeek), [loaded, week, savedWeek]);
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;

    // Opening the panel: saved places, the schedule and whether texts are on. Unsaved edits from an earlier
    // opening are kept (closing the panel doesn't throw them away), so the schedule is only read when there are none.
    useEffect(() => {
        if (!isOpen || !user) return;
        let cancelled = false;
        const keepEdits = dirtyRef.current;
        setLoading(true);
        setLoadError('');

        SmsService.commuteTexts(user.id).then(t => { if (!cancelled) setTexts(t); }).catch(() => { if (!cancelled) setTexts(null); });

        // Trips saved before leave times came from the timetable: plan them on their weekday's buses, keeping the
        // pinned bus where it still works. The corrected times are shown as unsaved changes; nothing is saved
        // without the rider. A trip the rider edits meanwhile is left as they made it.
        const recheckLegacy = async (keys: string[], w: Record<string, DayPlan>, dests: SavedDestination[]) => {
            const changed: string[] = [];
            for (const k of keys) {
                const p = w[k], [day, slot] = k.split('-').map(Number);
                const from = dests.find(d => d.id === p.fromId), to = dests.find(d => d.id === p.toId);
                if (!from || !to) continue;
                try {
                    const { journeys } = await planTrip(from, to, p.arriveBy, day);
                    if (cancelled) return;
                    const pick = preferred(journeys, p.routeList);
                    if (!pick) continue;
                    const fields = pinFields(pick);
                    const untouched = (cur: DayPlan) =>
                        cur.fromId === p.fromId && cur.toId === p.toId && cur.arriveBy === p.arriveBy && cur.departBy === p.departBy;
                    if (!untouched(weekRef.current[k])) continue;
                    setWeek(prev => untouched(prev[k]) ? { ...prev, [k]: { ...prev[k], ...fields } } : prev);
                    if (fields.departBy !== p.departBy) {
                        changed.push(`${DAY_LABELS[day]}${slot === 1 ? ' (trip home)' : ''} ${hhmmToClock(p.departBy)} → ${hhmmToClock(fields.departBy ?? null)}`);
                    }
                } catch { /* offline or rate-limited: the saved time stays; it's checked again next opening */ }
            }
            if (!cancelled && changed.length) {
                setRecheckNote(`Leave times updated to match the bus schedule: ${changed.join(', ')}. Save to keep them.`);
            }
        };

        Promise.all([
            SavedDestinationsService.getAll(user.id),
            keepEdits ? Promise.resolve(null) : WeeklyScheduleService.getForUser(user.id),
        ])
            .then(([dests, rows]) => {
                if (cancelled) return;
                setSavedDests(dests);
                if (rows) {
                    const w = weekFromRows(rows);
                    setWeek(w);
                    setSavedWeek(w);
                    setStored(new Set(rows.map(r => tripKey(r.day_of_week, r.trip === 1 ? 1 : 0))));
                    setSearches({});
                    setRecheckNote('');
                    void recheckLegacy(legacyTripKeys(rows), w, dests);
                }
                setLoaded(true);
            })
            .catch(() => {
                if (cancelled) return;
                // Never show a blank week that Save would write over the real one
                if (!keepEdits) setLoaded(false);
                setLoadError("Couldn't load your commute. Check your connection and try again.");
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [isOpen, user?.id, reloadCount]);

    const retryLoad = useCallback(() => setReloadCount(c => c + 1), []);

    const key = tripKey(selectedDay, selectedTrip);
    const trip = week[key];
    const search = searches[key] ?? noSearch;

    const setSelectedDay = useCallback((d: number) => { setSelectedDayRaw(d); setPreviewing(null); setConfirmApply(null); }, []);
    const setSelectedTrip = useCallback((t: TripSlot) => { setSelectedTripRaw(t); setPreviewing(null); setConfirmApply(null); }, []);
    const select = useCallback((d: number, t: TripSlot) => { setSelectedDayRaw(d); setSelectedTripRaw(t); setPreviewing(null); setConfirmApply(null); }, []);

    const patchTrip = useCallback((k: string, patch: Partial<DayPlan>) => {
        setWeek(prev => ({ ...prev, [k]: { ...prev[k], ...patch } }));
        setSaveSuccess(false);
    }, []);
    const setSearch = useCallback((k: string, s: Partial<TripSearch>) => {
        setSearches(prev => ({ ...prev, [k]: { ...(prev[k] ?? noSearch), ...s } }));
    }, []);

    /** Places or time changed: the leave time has to be worked out again (on Find buses, or on Save) */
    const updateTrip = useCallback((patch: Partial<Pick<DayPlan, 'fromId' | 'toId' | 'arriveBy'>>) => {
        patchTrip(key, { ...patch, departBy: null, routeTotalMinutes: null });
        setSearch(key, noSearch);
        setPreviewing(null);
    }, [key, patchTrip, setSearch]);
    const swapTrip = useCallback(() => updateTrip({ fromId: trip.toId, toId: trip.fromId }), [trip, updateTrip]);
    const setEnabled = useCallback((enabled: boolean) => patchTrip(key, { enabled }), [key, patchTrip]);

    const placeOf = useCallback((id: string | null) => savedDests.find(d => d.id === id), [savedDests]);

    const handleFindRoutes = useCallback(async () => {
        const from = placeOf(trip.fromId), to = placeOf(trip.toId);
        if (!from || !to) { setSearch(key, { error: 'Select both From and To first.' }); return; }
        const k = key, day = selectedDay, routeList = trip.routeList;
        setSearch(k, { ...noSearch, calculating: true });
        setPreviewing(null);
        try {
            const { journeys, notice } = await planTrip(from, to, trip.arriveBy, day);
            setSearch(k, { journeys, notice, calculating: false });
            // Pin straight away: the buses already pinned if they still work, else the best
            const pick = preferred(journeys, routeList);
            if (pick) patchTrip(k, pinFields(pick));
        } catch {
            setSearch(k, { calculating: false, error: "Couldn't find buses. Check your connection and try again." });
        }
    }, [key, selectedDay, trip, placeOf, patchTrip, setSearch]);

    const handlePin = useCallback((j: PlannedJourney) => patchTrip(key, pinFields(j)), [key, patchTrip]);

    /** Whether a journey is the one pinned for the selected trip */
    const isPinned = useCallback((j: PlannedJourney) =>
        trip.departBy === clockToHhmm(j.leave) && (trip.routeList ?? []).join('>') === j.legs.map(l => l.route).join('>'),
    [trip]);

    // ── Trip home ──
    const addTripHome = useCallback(() => {
        const there = week[tripKey(selectedDay, 0)];
        setWeek(prev => ({ ...prev, [tripKey(selectedDay, 1)]: tripHomeFor(there) }));
        setSearch(tripKey(selectedDay, 1), noSearch);
        select(selectedDay, 1);
    }, [week, selectedDay, setSearch, select]);
    const removeTrip = useCallback(() => {
        setWeek(prev => ({ ...prev, [key]: blankDay(selectedTrip) }));
        setSearch(key, noSearch);
        setPreviewing(null);
        if (selectedTrip === 1) setSelectedTripRaw(0);
    }, [key, selectedTrip, setSearch]);

    // ── Apply to weekdays (Mon–Fri), asking first when it replaces days set up differently ──
    const handleApplyToAll = useCallback((confirmed = false) => {
        const conflicts = applyConflicts(week, selectedDay, selectedTrip);
        if (conflicts.length && !confirmed) { setConfirmApply(conflicts); return; }
        setWeek(prev => applyToWeekdays(prev, selectedDay, selectedTrip));
        setSearches(prev => {
            const next = { ...prev };
            for (const d of DAY_ORDER) if (d !== selectedDay) delete next[tripKey(d, selectedTrip)];
            return next;
        });
        setConfirmApply(null);
        setSaveSuccess(false);
    }, [week, selectedDay, selectedTrip]);
    const cancelApply = useCallback(() => setConfirmApply(null), []);

    // ── Save ──
    const handleSave = useCallback(async (): Promise<boolean> => {
        if (!user || !loaded) return false;
        setSaving(true);
        setSaveError('');
        setSaveNotes([]);
        setSaveSuccess(false);
        try {
            // Trips whose leave time isn't known yet (new, changed, or copied to other days): plan them on the
            // timetable now, keeping the buses already pinned where they still work
            const next = { ...week };
            const notes: string[] = [];
            for (const day of DAY_ORDER) for (const t of [0, 1] as TripSlot[]) {
                const k = tripKey(day, t), p = next[k];
                if (!isSet(p) || p.departBy) continue;
                const from = placeOf(p.fromId), to = placeOf(p.toId);
                const label = `${DAY_LABELS[day]}${t === 1 ? ' (trip home)' : ''}`;
                if (!from || !to) { notes.push(`${label}: a saved place is missing.`); continue; }
                try {
                    const { journeys } = await planTrip(from, to, p.arriveBy, day);
                    const pick = preferred(journeys, p.routeList);
                    if (pick) next[k] = { ...p, ...pinFields(pick) };
                    else notes.push(`${label}: no bus found, so there's no leave time.`);
                } catch {
                    notes.push(`${label}: couldn't work out the leave time. Save again to retry.`);
                }
            }

            await WeeklyScheduleService.saveAll(user.id, rowsToSave(next, stored));
            const saved: Record<string, DayPlan> = {};
            for (const k of Object.keys(next)) saved[k] = planFields(next[k]);
            setWeek(next);
            setSavedWeek(saved);
            setStored(prev => new Set([...prev, ...rowsToSave(next, prev).map(r => tripKey(r.day, r.trip))]));
            setSaveNotes(notes);
            setRecheckNote('');
            track('weekly_saved', { days: DAY_ORDER.filter(d => next[tripKey(d, 0)].enabled || next[tripKey(d, 1)].enabled).length });
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
            return true;
        } catch (err) {
            console.error('[WeeklyPlanner] Save failed:', err);
            // The database is behind this app version (docs/security/commute_001_trip_home.sql not run yet):
            // a missing column (42703 / PGRST204) or no unique (user, day, trip) to save on (42P10)
            const code = (err as { code?: string } | null)?.code;
            setSaveError(code === '42703' || code === 'PGRST204' || code === '42P10'
                ? "Saving isn't available right now while the app is being updated. Please try again later."
                : 'Failed to save. Please try again.');
            return false;
        } finally {
            setSaving(false);
        }
    }, [user, loaded, week, stored, placeOf]);

    const handleDiscard = useCallback(() => {
        setWeek(savedWeek);
        setSearches({});
        setRecheckNote('');
        setPreviewing(null);
        setConfirmClose(false);
    }, [savedWeek]);

    const handleEnableNotifications = useCallback(async () => {
        if (!user || !('Notification' in window) || !('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) return;
        setSubscribing(true);
        try {
            const permission = await Notification.requestPermission();
            setNotifPermission(permission as 'default' | 'granted' | 'denied');
            if (permission !== 'granted') return;

            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            const sub = existing ?? await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
            });
            const json = sub.toJSON() as PushSubJson;
            if (json.keys) await PushSubscriptionService.save(user.id, { endpoint: json.endpoint!, keys: json.keys as { p256dh: string; auth: string } });
        } catch (err) {
            console.error('[WeeklyPlanner] Push subscribe failed:', err);
        } finally {
            setSubscribing(false);
        }
    }, [user]);

    // ── Open / close ──
    const handleOpen = useCallback(() => setIsOpen(true), []);
    /** Closes at once (another panel opening). Unsaved edits are kept for the next opening. */
    const handleClose = useCallback(() => {
        setIsOpen(false);
        setSaveSuccess(false);
        setSaveError('');
        setSaveNotes([]);
        setPreviewing(null);
        setConfirmClose(false);
        setConfirmApply(null);
    }, []);
    /** The panel's own close (✕, backdrop): asks first when there are unsaved changes */
    const requestClose = useCallback(() => {
        if (dirtyRef.current) setConfirmClose(true);
        else handleClose();
    }, [handleClose]);
    const cancelClose = useCallback(() => setConfirmClose(false), []);
    const saveAndClose = useCallback(async () => { if (await handleSave()) handleClose(); }, [handleSave, handleClose]);
    const discardAndClose = useCallback(() => { handleDiscard(); handleClose(); }, [handleDiscard, handleClose]);

    // ── Preview on map ──
    const preview = useCallback((j: PlannedJourney) => setPreviewing(j), []);
    const endPreview = useCallback(() => setPreviewing(null), []);
    const previewTrip: TripOption | null = useMemo(() => {
        const from = placeOf(trip.fromId), to = placeOf(trip.toId);
        return previewing && from && to ? journeyToTrip(previewing, { lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) : null;
    }, [previewing, trip.fromId, trip.toId, placeOf]);

    return {
        isOpen, isAuthenticated,
        savedDests, loading, loaded, loadError, retryLoad,
        week, selectedDay, setSelectedDay, selectedTrip, setSelectedTrip, select, today,
        trip, search, updateTrip, swapTrip, setEnabled,
        handleFindRoutes, handlePin, isPinned,
        addTripHome, removeTrip,
        handleApplyToAll, confirmApply, cancelApply,
        handleSave, saving, saveSuccess, saveError, saveNotes, dirty, handleDiscard, recheckNote,
        texts,
        notifPermission, subscribing, handleEnableNotifications,
        handleOpen, handleClose, requestClose, confirmClose, cancelClose, saveAndClose, discardAndClose,
        previewing, previewTrip, preview, endPreview,
    };
}

interface PushSubJson {
    endpoint?: string;
    keys?: Record<string, string>;
}
