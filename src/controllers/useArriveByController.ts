/* Arrive-by controller — the scheduled trips that get the rider to the destination by the time they picked,
   and which of them is being previewed on the map */
import { useEffect, useMemo, useState } from 'react';
import { fetchArriveByPlan, journeyToTrip, type ArriveByPlan, type PlannedJourney } from '../models/services/ArriveByClient';
import type { TripOption } from '../models/transit/RoutePlanning';
import { track } from '../models/services/UsageTracker';

interface ArriveByInput {
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number };
    /** "HH:MM", or '' while no time is picked */
    time: string;
}

export function useArriveByController({ origin, destination, time }: ArriveByInput) {
    const [plan, setPlan] = useState<ArriveByPlan | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState<PlannedJourney | null>(null);
    const { lat: destLat, lng: destLng } = destination;

    useEffect(() => {
        setPlan(null);
        setError(null);
        setPreviewing(null);    // a preview belongs to the plan it came from
        if (!origin || !/^\d{1,2}:\d{2}$/.test(time)) return;
        let current = true;
        setLoading(true);
        fetchArriveByPlan(origin, { lat: destLat, lng: destLng }, time)
            .then(p => {
                if (!current) return;
                setPlan(p);
                // For the admin Insights pages: whether a bus gets there in time, and how long the best way takes
                const best = p.status === 'planned' ? p.journeys[0] : p.status === 'partial' ? p.journey : p.earliest;
                track('arrive_by_planned', { status: p.status, day: p.day, options: p.status === 'planned' ? p.journeys.length : p.status === 'partial' ? 1 : 0, minutes: best ? Math.round(best.totalMin) : undefined });
            })
            .catch(() => { if (current) setError("Couldn't plan this trip. Check your connection and try again."); })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };   // a newer time or place replaces this answer
    }, [origin, destLat, destLng, time]);

    /** The previewed journey as a trip the map can draw */
    const previewTrip: TripOption | null = useMemo(
        () => previewing && origin ? journeyToTrip(previewing, origin, { lat: destLat, lng: destLng }) : null,
        [previewing, origin, destLat, destLng]);

    return { plan, loading, error, previewing, previewTrip, preview: setPreviewing, endPreview: () => setPreviewing(null) };
}
