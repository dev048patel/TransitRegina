/**
 * UsageExplorer — the admin Insights drill-downs, worked out from rows of public.usage_events:
 *  - one item (a place, route, bus, stop, page, error…): who did it, when, on what, and where (the places involved)
 *  - everyone who used the app in a period, with what each of them did
 *
 * Pure functions over rows the route has already fetched, so they are easy to test and need no new SQL.
 * Who someone is follows UsageEvents: a signed-in rider by account, a signed-out one by an anonymous id that
 * changes every Regina day. Places are the ones riders picked (rounded to ~100 m), never where they are.
 */
import { reginaDateKey } from './ReginaTime';

export interface ExploreRow {
    at: string; kind: string; page: string | null; device: string | null;
    detail: Record<string, unknown> | null; visitor: string; user_id: string | null;
    /** The account's email, added by the route for signed-in riders */
    who?: string | null;
}

/** Who did something, as the admin pages show and link it */
export interface Actor { key: string; who: string; userId: string | null; visitor: string | null }

export function actorOf(r: ExploreRow): Actor {
    return {
        key: r.visitor,
        who: r.user_id ? (r.who ?? 'A deleted account') : `Visitor ${r.visitor.slice(2, 8)}`,
        userId: r.user_id,
        visitor: r.visitor.startsWith('a:') ? r.visitor.slice(2) : null,
    };
}

/* Regina is UTC-6 all year (no daylight saving) */
const reginaWeekdayHour = (iso: string) => { const d = new Date(Date.parse(iso) - 6 * 3_600_000); return { weekday: d.getUTCDay(), hour: d.getUTCHours() }; };
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v: unknown) => v === undefined || v === null || v === '' ? null : String(v);

/** Per Regina hour of the day (0–23): how many actions, how many different people, and how many searches and trips.
 *  For a one-day period, where a chart per day would be a single bar. */
export function perHour(rows: Pick<ExploreRow, 'at' | 'kind' | 'visitor'>[]) {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, events: 0, people: new Set<string>(), searches: 0, trips: 0 }));
    for (const r of rows) {
        const h = hours[reginaWeekdayHour(r.at).hour];
        h.events++; h.people.add(r.visitor);
        if (r.kind === 'place_searched') h.searches++;
        if (r.kind === 'trip_started') h.trips++;
    }
    return hours.map(h => ({ hour: h.hour, events: h.events, people: h.people.size, searches: h.searches, trips: h.trips }));
}

/** Pages of the admin panel itself: admins looking at it are not riders using the app */
export const isAdminPage = (r: Pick<ExploreRow, 'page'>) => !!r.page && (r.page === '/admin' || r.page.startsWith('/admin/'));

/** Everything about one item: totals, per day, per hour, devices, the people, and the places on a map */
export function summarizeItem(rows: ExploreRow[], days: string[]) {
    const people = new Map<string, Actor & { events: number; first: string; last: string; device: string | null }>();
    const perDay = new Map<string, { events: number; people: Set<string> }>();
    const hours = new Map<string, number>();
    const devices = new Map<string, Set<string>>();
    const points = new Map<string, { lat: number; lng: number; label: string; events: number; people: Set<string> }>();

    for (const r of rows) {
        const a = actorOf(r);
        const p = people.get(a.key);
        if (!p) people.set(a.key, { ...a, events: 1, first: r.at, last: r.at, device: r.device });
        else { p.events++; if (r.at < p.first) p.first = r.at; if (r.at > p.last) { p.last = r.at; p.device = r.device ?? p.device; } }

        const day = reginaDateKey(new Date(r.at));
        const d = perDay.get(day) ?? { events: 0, people: new Set<string>() };
        d.events++; d.people.add(a.key); perDay.set(day, d);

        const { weekday, hour } = reginaWeekdayHour(r.at);
        hours.set(`${weekday}|${hour}`, (hours.get(`${weekday}|${hour}`) ?? 0) + 1);

        const dev = r.device ?? 'Unknown';
        devices.set(dev, (devices.get(dev) ?? new Set()).add(a.key));

        const lat = num(r.detail?.lat), lng = num(r.detail?.lng);
        if (lat !== null && lng !== null) {
            const k = `${lat},${lng}`;
            const pt = points.get(k) ?? { lat, lng, label: str(r.detail?.place) ?? '', events: 0, people: new Set<string>() };
            pt.events++; pt.people.add(a.key); points.set(k, pt);
        }
    }

    const list = [...people.values()];
    return {
        totals: { events: rows.length, people: list.length, signedIn: list.filter(p => p.userId).length, anonymous: list.filter(p => !p.userId).length },
        daily: days.map(day => ({ day, events: perDay.get(day)?.events ?? 0, people: perDay.get(day)?.people.size ?? 0 })),
        hourly: perHour(rows),
        hours: [...hours].map(([k, events]) => ({ weekday: Number(k.split('|')[0]), hour: Number(k.split('|')[1]), events })),
        devices: [...devices].map(([device, who]) => ({ device, visitors: who.size })).sort((a, b) => b.visitors - a.visitors),
        people: list.sort((a, b) => b.events - a.events || b.last.localeCompare(a.last)),
        points: [...points.values()].map(p => ({ lat: p.lat, lng: p.lng, label: p.label, events: p.events, people: p.people.size })).sort((a, b) => b.events - a.events),
    };
}

/** What counts as doing something (not just loading the app or being measured) */
const NOT_ACTIONS = new Set(['page_view', 'session_start', 'vitals', 'timing', 'still_here']);

/** Everyone who used the app in a period, busiest first, with what each did */
export function summarizePeople(rows: ExploreRow[]) {
    type Person = Actor & {
        events: number; actions: number; searches: number; trips: number; stops: number; buses: number; routes: number; errors: number;
        visits: Set<string>; first: string; last: string; device: string | null; places: Map<string, number>;
    };
    const people = new Map<string, Person>();
    for (const r of rows) {
        const a = actorOf(r);
        let p = people.get(a.key);
        if (!p) {
            p = { ...a, events: 0, actions: 0, searches: 0, trips: 0, stops: 0, buses: 0, routes: 0, errors: 0, visits: new Set(), first: r.at, last: r.at, device: r.device, places: new Map() };
            people.set(a.key, p);
        }
        p.events++;
        if (!NOT_ACTIONS.has(r.kind)) p.actions++;
        if (r.kind === 'place_searched' || r.kind === 'planner_searched') p.searches++;
        if (r.kind === 'trip_started') p.trips++;
        if (r.kind === 'stop_opened') p.stops++;
        if (r.kind === 'bus_opened') p.buses++;
        if (r.kind === 'route_selected') p.routes++;
        if (r.kind === 'app_error' || r.kind === 'api_error') p.errors++;
        const visit = str((r as { session?: unknown }).session);
        if (visit) p.visits.add(visit);
        if (r.at < p.first) p.first = r.at;
        if (r.at > p.last) { p.last = r.at; p.device = r.device ?? p.device; }
        const place = ['place_searched', 'planner_searched', 'trip_started', 'place_tapped'].includes(r.kind) ? str(r.detail?.place) : null;
        if (place) p.places.set(place, (p.places.get(place) ?? 0) + 1);
    }
    return [...people.values()]
        .map(({ visits, places, ...p }) => ({ ...p, visits: visits.size, topPlace: [...places].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }))
        .sort((a, b) => b.actions - a.actions || b.events - a.events || b.last.localeCompare(a.last));
}

/** Words typed into the activity search, made safe to put in a database filter: letters, digits, spaces, # and - only
 *  (commas, dots, brackets and quotes mean something in the filter syntax) */
export function cleanSearch(q: unknown): string | null {
    if (typeof q !== 'string') return null;
    const t = q.normalize('NFKC').replace(/[^\p{L}\p{N} #-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    return t.length ? t : null;
}
