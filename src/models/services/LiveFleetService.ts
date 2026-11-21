/**
 * LiveFleetService — which routes and buses are running today, for the admin Service page.
 *
 * Every 15 seconds (server.ts) it reads the live feed, the same shared fetch the map uses, and keeps
 * for today:
 *   per bus    where it was last seen, when it last moved, and its route
 *   per route  when a bus was last seen on it
 *
 * A route is inactive when no bus on it has been in the feed for 5 minutes. A bus is inactive when it
 * has been missing from the feed for 5 minutes, or has not moved for 5 minutes away from its route's
 * ends (standing at a route's first or last stop is a layover, not a problem).
 *
 * Kept in memory only: it starts again at midnight (Regina) and after a redeploy. While the feed is
 * down, time stands still: nothing becomes missing because TransitLive stopped answering.
 */
import transitRoutes from '../data/transitRoutes';
import transitStops from '../data/transitStops';
import stopSequences from '../data/gtfsStopSequences.json';
import { RealTimeService } from './RealTimeService';
import { reginaDateKey } from './ReginaTime';
import type { BusPosition } from '../transit/BusPosition';

export const INACTIVE_AFTER_MS = 5 * 60_000;
const MOVED_METRES = 50;          // GPS wander at a standstill stays well inside this
const ROUTE_END_METRES = 200;     // this close to a route's first or last stop is a layover
const FEED_STALE_MS = 60_000;     // no good answer for this long: the feed is down
const OFF_ROUTE = '0';            // TransitLive's route for a bus not in service ("Off Route")

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6_371_000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/* The ends of each route: the first and last stop of each direction (a loop starts and ends at one stop) */
const stopAt = new Map(transitStops.map(s => [s.STOP_ID, { lat: Number(s.LAT), lng: Number(s.LON) }]));
const routeEnds = new Map<string, { lat: number; lng: number }[]>(
    Object.entries(stopSequences as Record<string, Record<string, string[]>>).map(([route, dirs]) => [
        route,
        Object.values(dirs).flatMap(seq => [seq[0], seq[seq.length - 1]]).map(id => stopAt.get(id)).filter((p): p is { lat: number; lng: number } => !!p),
    ]));
const atRouteEnd = (route: string, p: { lat: number; lng: number }) => (routeEnds.get(route) ?? []).some(e => metres(e, p) <= ROUTE_END_METRES);

/** Every route the City runs (the 22 on the Service page), in route number order */
export const ROUTE_NUMS = [...new Set(transitRoutes.map(r => String(r.ROUTE_NUM)))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

interface BusState { busId: number; route: string; line: string; lat: number; lng: number; firstSeen: number; lastSeen: number; anchor: { lat: number; lng: number }; lastMoved: number }

export type BusStatus = 'moving' | 'layover' | 'stopped' | 'missing';
export interface FleetBus {
    busId: number;
    route: string;
    line: string;
    status: BusStatus;
    /** stopped or missing: one of the two ways a bus is inactive */
    inactive: boolean;
    lastSeenAt: string;
    /** When it last moved (stopped, layover) or was last in the feed (missing) */
    since: string | null;
    lat: number;
    lng: number;
}
export type RouteStatus = 'live' | 'inactive' | 'checking';
export interface FleetRoute {
    route: string;
    /** live: a bus on it in the last 5 min. inactive: none for 5 min or more. checking: tracking began under 5 min ago. */
    status: RouteStatus;
    /** Buses on it in the feed now (or in the last 5 min) */
    buses: number;
    /** Of those, stopped mid-route for 5+ min */
    stopped: number;
    lastSeenAt: string | null;
    /** inactive: since when no bus has been seen (the start of tracking if none was seen today) */
    inactiveSince: string | null;
}
export interface FleetSnapshot {
    day: string;
    trackingSince: string | null;
    feedOk: boolean;
    lastFeedAt: string | null;
    routes: FleetRoute[];
    buses: FleetBus[];
}

let day = '';
let trackingSince = 0;
let lastFeedOk = 0;
const buses = new Map<number, BusState>();
const routeLastSeen = new Map<string, number>();

const iso = (ms: number) => new Date(ms).toISOString();

function startDay(d: string, now: number) {
    day = d;
    trackingSince = now;
    buses.clear();
    routeLastSeen.clear();
}

export const LiveFleetService = {
    /** Takes in one answer from the feed */
    record(feed: BusPosition[], now = Date.now()): void {
        const d = reginaDateKey(now);
        if (d !== day) startDay(d, now);
        lastFeedOk = now;
        for (const b of feed) {
            const lat = Number(b.lat), lng = Number(b.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || b.bus_id == null) continue;
            const route = String(b.route_num ?? OFF_ROUTE) || OFF_ROUTE;
            const known = buses.get(b.bus_id);
            if (!known) {
                buses.set(b.bus_id, { busId: b.bus_id, route, line: b.line_name ?? '', lat, lng, firstSeen: now, lastSeen: now, anchor: { lat, lng }, lastMoved: now });
            } else {
                // Moving to another route (or off route) counts as moving: it is doing something
                if (known.route !== route || metres(known.anchor, { lat, lng }) > MOVED_METRES) { known.anchor = { lat, lng }; known.lastMoved = now; }
                Object.assign(known, { route, line: b.line_name ?? known.line, lat, lng, lastSeen: now });
            }
            if (route !== OFF_ROUTE) routeLastSeen.set(route, now);
        }
    },

    /** Reads the feed once. A failed read changes nothing (the feed being down is not buses going missing). */
    async poll(now = Date.now()): Promise<void> {
        try { LiveFleetService.record(await RealTimeService.getLiveBuses(), now); }
        catch { /* RealTimeService has logged it; snapshot() reports the feed as down after a minute */ }
    },

    snapshot(now = Date.now()): FleetSnapshot {
        if (!day) return { day: reginaDateKey(now), trackingSince: null, feedOk: false, lastFeedAt: null, routes: ROUTE_NUMS.map(route => ({ route, status: 'checking', buses: 0, stopped: 0, lastSeenAt: null, inactiveSince: null })), buses: [] };
        // While the feed is down the clock stops at its last good answer, so nothing goes missing for that
        const ref = Math.min(now, lastFeedOk);
        const list: FleetBus[] = [...buses.values()].map(b => {
            let status: BusStatus, since: number | null;
            if (ref - b.lastSeen >= INACTIVE_AFTER_MS) { status = 'missing'; since = b.lastSeen; }
            else if (ref - b.lastMoved >= INACTIVE_AFTER_MS && b.route !== OFF_ROUTE) { status = atRouteEnd(b.route, b) ? 'layover' : 'stopped'; since = b.lastMoved; }
            else { status = 'moving'; since = null; }
            return { busId: b.busId, route: b.route, line: b.line, status, inactive: status === 'stopped' || status === 'missing', lastSeenAt: iso(b.lastSeen), since: since === null ? null : iso(since), lat: b.lat, lng: b.lng };
        }).sort((a, b) => Number(b.inactive) - Number(a.inactive) || (Number(a.route) - Number(b.route)) || a.busId - b.busId);

        const routes: FleetRoute[] = ROUTE_NUMS.map(route => {
            const last = routeLastSeen.get(route) ?? null;
            const onIt = list.filter(b => b.route === route && b.status !== 'missing');
            const quietFor = ref - (last ?? trackingSince);
            const status: RouteStatus = last !== null && ref - last < INACTIVE_AFTER_MS ? 'live' : quietFor >= INACTIVE_AFTER_MS ? 'inactive' : 'checking';
            return {
                route, status, buses: onIt.length, stopped: onIt.filter(b => b.status === 'stopped').length,
                lastSeenAt: last === null ? null : iso(last),
                inactiveSince: status === 'inactive' ? iso(last ?? trackingSince) : null,
            };
        });
        return { day, trackingSince: iso(trackingSince), feedOk: now - lastFeedOk < FEED_STALE_MS, lastFeedAt: lastFeedOk ? iso(lastFeedOk) : null, routes, buses: list };
    },

    /** Tests: forget everything */
    _reset() { day = ''; trackingSince = 0; lastFeedOk = 0; buses.clear(); routeLastSeen.clear(); },
};
