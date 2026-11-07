/* Asks the backend for the scheduled trips that arrive by a time (see ArriveByService) */
import { apiGet } from '../lib/apiClient';
import type { ArriveByPlan, LatLng, PlannedJourney } from './ArriveByService';
import type { TripOption } from '../transit/RoutePlanning';

export type { ArriveByPlan, PlannedJourney, PlannedLeg, JourneyKind } from './ArriveByService';

/** `time` is "HH:MM" in Regina time, as an <input type="time"> gives it */
export async function fetchArriveByPlan(origin: LatLng, destination: LatLng, time: string): Promise<ArriveByPlan> {
    const q = `from=${origin.lat},${origin.lng}&to=${destination.lat},${destination.lng}&time=${encodeURIComponent(time)}`;
    const res = await apiGet(`/api/plan/arrive-by?${q}`);
    return res.json();
}

/**
 * A planned journey in the shape the map draws trips in (RouteTrackingOverlay), so a preview shows the
 * same walks, bus paths and stops as tracking a trip. Times are the schedule's, so nothing is live.
 */
export function journeyToTrip(journey: PlannedJourney, origin: LatLng, destination: LatLng): TripOption {
    const legs = journey.legs, first = legs[0], last = legs[legs.length - 1];
    return {
        segments: legs.map(l => ({
            routeNum: l.route,
            routeName: l.headsign,
            fromStop: l.boardStop.name, fromStopId: l.boardStop.id, fromStopLat: l.boardStop.lat, fromStopLng: l.boardStop.lng,
            toStop: l.alightStop.name, toStopId: l.alightStop.id, toStopLat: l.alightStop.lat, toStopLng: l.alightStop.lng,
            estimatedTime: l.rideMin,
            intermediateStops: l.stopsBetween,
        })),
        totalTime: journey.totalMin,
        transfers: legs.length - 1,
        walkingDistance: 0,
        originStop: first.boardStop.name,
        destinationStop: last.alightStop.name,
        originLat: origin.lat, originLng: origin.lng,
        destLat: destination.lat, destLng: destination.lng,
        isLivePrediction: false,
        estimatedArrival: journey.arrive,
    };
}
