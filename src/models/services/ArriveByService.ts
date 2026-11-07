/*
 "Arrive by" trip planning on the bus timetable: the latest bus (or buses) that still gets the rider to
 their destination by the time they picked, and the other ways of making the same trip.

 It reuses the SMS service's timetable and planner (services/sms/src/transit), which plan riders' saved
 commutes the same way and are tested there. They are plain modules that only read
 services/sms/data/timetable.json, so this works whether or not the SMS service is running.
*/
import { timetable } from '../../../services/sms/src/transit/timetable';
import { planArriveBy, type Journey } from '../../../services/sms/src/transit/planner';
import { addDays, clock, reginaDate, reginaMinutes } from '../../../services/sms/src/time';

export interface PlannedStop { id: string; name: string; lat: number; lng: number }

export interface PlannedLeg {
    route: string;
    headsign: string;
    boardStop: PlannedStop;
    alightStop: PlannedStop;
    board: string;            // "1:58 PM"
    alight: string;
    rideMin: number;
    walkBeforeMin: number;    // to this bus: from the start for the first, between buses for a transfer
    /** the stops the bus calls at between boarding and getting off */
    stopsBetween: string[];
}

/** best: the latest that makes it · other: a different set of routes · earlier: the best one's routes, an earlier bus */
export type JourneyKind = 'best' | 'other' | 'earlier';

export interface PlannedJourney {
    kind: JourneyKind;
    leave: string;            // when to set off on foot
    arrive: string;           // at the destination, final walk included
    totalMin: number;         // leave to arrive
    walkAfterMin: number;
    legs: PlannedLeg[];
}

export type ArriveByPlan =
    /** journeys: the best first, then other routes (latest-leaving first), then earlier buses as backups */
    | { status: 'planned'; day: 'today' | 'tomorrow'; arriveBy: string; journeys: PlannedJourney[] }
    | { status: 'partial'; day: 'today' | 'tomorrow'; arriveBy: string; journey: PlannedJourney; remainingMetres: number }
    | { status: 'no_service'; day: 'today' | 'tomorrow'; arriveBy: string; earliest: PlannedJourney | null };

export interface LatLng { lat: number; lng: number }

/** At most this many ways to make the trip */
const MAX_OPTIONS = 5;
/** Re-plans spent looking for other routes (each one is a full arrive-by search, ~10-20 ms) */
const MAX_SEARCHES = 12;
/** An other-route option that leaves this much earlier than the best one, or takes this much longer, isn't worth offering */
const MAX_EARLIER_MIN = 60;
const MAX_LONGER_MIN = 30;

/**
 * `a` is at least as good as `b` on every count and better on one: leaves no earlier, arrives no later, takes no
 * more buses. In whole minutes, as the rider sees them (walks make the planner's times fractional).
 */
function beats(a: Journey, b: Journey): boolean {
    const [aLeave, bLeave, aArrive, bArrive] = [a.leaveMin, b.leaveMin, a.arriveMin, b.arriveMin].map(Math.round);
    const noWorse = aLeave >= bLeave && aArrive <= bArrive && a.legs.length <= b.legs.length;
    return noWorse && (aLeave > bLeave || aArrive < bArrive || a.legs.length < b.legs.length);
}
/** With fewer different routes than this, earlier buses of the best one fill the list, in case the rider misses it */
const MIN_OPTIONS = 3;

/** Two journeys on the same buses in the same order are one option, whichever stop they use */
const routesOf = (j: Journey) => j.legs.map(l => l.route).join('>');

function describe(j: Journey, kind: JourneyKind): PlannedJourney {
    const tt = timetable();
    const stop = (i: number): PlannedStop => ({ id: tt.stopIds[i], name: tt.names[i], lat: tt.lat[i], lng: tt.lng[i] });
    return {
        kind,
        leave: clock(j.leaveMin),
        arrive: clock(j.arriveMin),
        totalMin: Math.round(j.arriveMin - j.leaveMin),
        walkAfterMin: j.walkAfterMin,
        legs: j.legs.map(l => {
            const stops = tt.patterns[l.pattern].stops;
            const from = stops.indexOf(l.boardStop);
            const to = from >= 0 ? stops.indexOf(l.alightStop, from + 1) : -1;
            return {
                route: l.route,
                headsign: l.headsign,
                boardStop: stop(l.boardStop),
                alightStop: stop(l.alightStop),
                board: clock(l.boardMin),
                alight: clock(l.alightMin),
                rideMin: Math.round(l.alightMin - l.boardMin),
                walkBeforeMin: l.walkBeforeMin,
                stopsBetween: to > from ? stops.slice(from + 1, to).map(s => tt.names[s]) : [],
            };
        }),
    };
}

/**
 * Other ways to make the trip: plan again leaving out each route the best journey uses, then each route
 * of what that finds as well, and so on (breadth first, so single swaps come before double ones).
 */
function otherRoutes(date: string, origin: LatLng, destination: LatLng, arriveByMin: number, best: Journey, earlier: Journey[]): Journey[] {
    const found: Journey[] = [];
    const seen = new Set([routesOf(best)]);
    const queue: Set<string>[] = best.legs.map(l => new Set([l.route]));
    const tried = new Set<string>();
    let searches = 0;
    const bestMin = best.arriveMin - best.leaveMin;
    while (queue.length && searches < MAX_SEARCHES) {
        const avoid = queue.shift()!;
        const key = [...avoid].sort().join(',');
        if (tried.has(key)) continue;
        tried.add(key);
        searches++;
        const r = planArriveBy(timetable(), date, origin, destination, arriveByMin, avoid);
        if (r.status !== 'planned') continue;
        const j = r.journey;
        if (j.leaveMin < best.leaveMin - MAX_EARLIER_MIN || j.arriveMin - j.leaveMin > bestMin + MAX_LONGER_MIN) continue;
        if (!seen.has(routesOf(j))) { seen.add(routesOf(j)); found.push(j); }
        for (const l of j.legs) queue.push(new Set([...avoid, l.route]));
    }
    // Only the ones nothing else beats on every count (an earlier bus of the best routes included); the ones you
    // can leave latest for first, fewer buses breaking a tie
    const all = [best, ...earlier, ...found];
    return found
        .filter(j => !all.some(k => k !== j && beats(k, j)))
        .sort((a, b) => b.leaveMin - a.leaveMin || a.legs.length - b.legs.length)
        .slice(0, MAX_OPTIONS - 1);
}

export class ArriveByService {
    /**
     * Plan to arrive by `arriveByMin` (minutes after midnight, Regina time). A time that has already
     * passed today is taken as tomorrow, so "8:00" asked in the evening plans tomorrow morning.
     */
    static plan(origin: LatLng, destination: LatLng, arriveByMin: number, now: Date = new Date()): ArriveByPlan {
        const tomorrow = arriveByMin <= reginaMinutes(now);
        const day = tomorrow ? 'tomorrow' : 'today';
        const date = tomorrow ? addDays(reginaDate(now), 1) : reginaDate(now);
        const arriveBy = clock(arriveByMin);
        const r = planArriveBy(timetable(), date, origin, destination, arriveByMin);
        if (r.status === 'planned') {
            // The trips before the best one, each the latest arriving before the one before it: backups in case
            // the rider misses it, and the yardstick other routes must beat
            const earlier: Journey[] = [];
            for (let last = r.journey; earlier.length < MIN_OPTIONS - 1;) {
                const next = planArriveBy(timetable(), date, origin, destination, last.arriveMin - 1);
                if (next.status !== 'planned') break;
                earlier.push(last = next.journey);
            }
            const others = otherRoutes(date, origin, destination, arriveByMin, r.journey, earlier);
            const listed = new Set([r.journey, ...others].map(j => `${routesOf(j)}@${j.leaveMin}`));
            const journeys = [describe(r.journey, 'best'), ...others.map(j => describe(j, 'other'))];
            // Few other routes: fill up with the earlier trips not already listed
            for (const j of earlier) {
                if (journeys.length >= MIN_OPTIONS) break;
                if (!listed.has(`${routesOf(j)}@${j.leaveMin}`)) journeys.push(describe(j, 'earlier'));
            }
            return { status: 'planned', day, arriveBy, journeys };
        }
        if (r.status === 'partial') return { status: 'partial', day, arriveBy, journey: describe(r.journey, 'best'), remainingMetres: r.remainingMetres };
        return { status: 'no_service', day, arriveBy, earliest: r.earliest ? describe(r.earliest, 'best') : null };
    }
}
