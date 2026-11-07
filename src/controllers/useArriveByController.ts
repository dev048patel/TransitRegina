/* Arrive-by controller — the scheduled trips that get the rider to the destination by the time they picked,
   and which of them is being previewed on the map */
import { useEffect, useMemo, useState } from 'react';
import { fetchArriveByPlan, journeyToTrip, type ArriveByPlan, type PlannedJourney } from '../models/services/ArriveByClient';
import type { TripOption } from '../models/transit/RoutePlanning';

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
            .then(p => { if (current) setPlan(p); })
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
