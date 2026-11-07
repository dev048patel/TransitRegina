/**
 * useWalkPathsController.ts — Transit Regina  [MVC Controller]
 * The real walks of a tracked trip, along sidewalks, paths and streets (WalkPathService → POST /api/walk)
 * instead of straight lines through buildings:
 *  - useTripWalksController (MapView): the walks from where the trip was planned: to the first stop, between
 *    transfer stops, and from the last stop. Their real length corrects the trip's walk distances and times.
 *  - useWalkToStopController (the map overlay, which already follows the GPS): the walk to the first stop
 *    redrawn from where the rider is now, until they reach it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { WalkPathService } from '../models/services/WalkPathService';
import { distanceMeters } from '../models/services/StopDirectionIndex';
import type { TripOption } from '../models/transit/RoutePlanning';
import type { TripWalks, WalkPoint, WalkRoute } from '../models/transit/WalkRoute';

/** The planner's walking pace (RoutePlanningService.WALKING_SPEED) */
const WALK_KMH = 5;
/** Ask for a new path from the rider only after they have moved this far */
const REDRAW_AFTER_M = 40;
/** The rider counts as at the first stop within this distance; the walk to it is then done */
const AT_STOP_M = 40;

const minutes = (meters: number) => (meters / 1000) / WALK_KMH * 60;

interface Answers { toStop?: WalkRoute | null; transfers: (WalkRoute | null | undefined)[]; toDest?: WalkRoute | null }

/** The trip's walks from where it was planned, and how much longer they really are. null while not tracking. */
export function useTripWalksController(trip: TripOption | null): TripWalks | null {
    const [answers, setAnswers] = useState<{ trip: TripOption; walks: Answers } | null>(null);

    useEffect(() => {
        if (!trip) return;
        let cancelled = false;
        const segs = trip.segments, first = segs[0], last = segs[segs.length - 1];
        Promise.all([
            WalkPathService.route({ lat: trip.originLat, lng: trip.originLng }, { lat: first.fromStopLat, lng: first.fromStopLng }),
            Promise.all(segs.slice(0, -1).map((s, i) => s.toStopId === segs[i + 1].fromStopId
                ? Promise.resolve(undefined)
                : WalkPathService.route({ lat: s.toStopLat, lng: s.toStopLng }, { lat: segs[i + 1].fromStopLat, lng: segs[i + 1].fromStopLng }))),
            WalkPathService.route({ lat: last.toStopLat, lng: last.toStopLng }, { lat: trip.destLat, lng: trip.destLng }),
        ]).then(([toStop, transfers, toDest]) => { if (!cancelled) setAnswers({ trip, walks: { toStop, transfers, toDest } }); });
        return () => { cancelled = true; };
    }, [trip]);

    return useMemo(() => {
        if (!trip) return null;
        // Answers for an earlier trip don't belong to this one
        const w: Answers = answers?.trip === trip ? answers.walks : { transfers: [] };

        // What the planner assumed (straight lines), leg by leg
        const plannedToStop = trip.walkToFirstStop ?? trip.walkingDistance;
        const plannedTransfer = trip.transferWalkDistance ?? 0;
        const plannedToDest = Math.max(0, trip.walkingDistance - plannedToStop - plannedTransfer);
        const realTransfer = w.transfers.reduce<number | undefined>((sum, r) => r ? (sum ?? 0) + r.meters : sum, undefined);

        let extra = 0;
        if (w.toStop) extra += w.toStop.meters - plannedToStop;
        if (realTransfer !== undefined) extra += realTransfer - plannedTransfer;
        if (w.toDest) extra += w.toDest.meters - plannedToDest;

        return {
            toStopPath: w.toStop?.path ?? null,
            transferPaths: trip.segments.slice(0, -1).map((_, i) => w.transfers[i]?.path ?? null),
            toDestPath: w.toDest?.path ?? null,
            meters: { toStop: w.toStop?.meters, transfers: trip.segments.slice(0, -1).map((_, i) => w.transfers[i]?.meters), toDest: w.toDest?.meters },
            extraMinutes: Math.max(0, Math.round(minutes(extra))),
        };
    }, [trip, answers]);
}

/**
 * The walk to the first stop from where the rider is now; falls back to `planned` (from where the trip was
 * planned) until a fresh one arrives. `path` is null when there is no walking path (draw a straight line);
 * `done` once the rider has reached the stop (draw no walk at all).
 */
export function useWalkToStopController(trip: TripOption, here: WalkPoint | null, planned: WalkPoint[] | null): { path: WalkPoint[] | null; done: boolean } {
    const [live, setLive] = useState<{ trip: TripOption; path: WalkPoint[] } | null>(null);
    const [reached, setReached] = useState(false);
    const askedFrom = useRef<WalkPoint | null>(null);
    const latest = useRef(0);
    const stop = useMemo(() => ({ lat: trip.segments[0].fromStopLat, lng: trip.segments[0].fromStopLng }), [trip]);

    // A new trip starts its walk again
    useEffect(() => { setReached(false); setLive(null); askedFrom.current = null; }, [trip]);

    useEffect(() => {
        if (!here || reached) return;
        if (distanceMeters(here, stop) <= AT_STOP_M) { setReached(true); return; }
        if (askedFrom.current && distanceMeters(askedFrom.current, here) < REDRAW_AFTER_M) return;
        askedFrom.current = here;
        // Not cancelled when the GPS moves on (it updates every second or so); only the newest answer is used
        const ask = ++latest.current;
        WalkPathService.route(here, stop).then(r => { if (r && ask === latest.current) setLive({ trip, path: r.path }); });
    }, [here, stop, trip, reached]);

    return { path: live?.trip === trip ? live.path : planned, done: reached };
}
