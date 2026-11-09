/**
 * UsageEvents — what riders do in the app, one row per action (public.usage_events, script 011), so the admin
 * Usage page can count it accurately: every total is computed in the database by Regina day.
 *
 * Who did it:
 *  - signed in: the account ('u:<id>'), taken from the login token, never from the request
 *  - signed out: an anonymous id that changes every Regina day: a keyed one-way hash of the address and browser.
 *    The address is not stored and the id can't be turned back into it, and tomorrow the same rider is a new id
 *    (the method privacy-first analytics such as Plausible use).
 *
 * Only the kinds and fields listed below are kept; everything else is dropped. Searches keep the place the rider
 * picked and its area (about 100 m), never what they typed.
 */
import crypto from 'node:crypto';
import { serviceDb } from '../lib/serverDb';
import { reginaDateKey } from './ReginaTime';

type Field = { str: number } | 'int' | 'num' | 'coord' | readonly string[];
const s = (max: number): Field => ({ str: max });
const ROUTE = s(12);

/** Kinds the app may send, and the detail fields each may carry */
export const CLIENT_EVENTS: Record<string, Record<string, Field>> = {
    page_view: { path: s(120) },
    location: { choice: ['allowed', 'declined'] },
    place_searched: { place: s(120), lat: 'coord', lng: 'coord' },
    place_tapped: { place: s(120), lat: 'coord', lng: 'coord' },
    route_selected: { route: ROUTE },
    stop_opened: { stop: s(10), name: s(80) },
    bus_opened: { bus: s(10), route: ROUTE },
    suggestions_shown: { place: s(120), options: 'int', best_route: s(20), best_minutes: 'int' },
    plan_later: {},
    trip_started: { routes: s(30), minutes: 'int', place: s(120), rank: 'int', best_minutes: 'int' },
    trip_stopped: { how: ['stopped', 'back'], after_min: 'int' },
    option_expanded: { rank: 'int' },
    stop_more: { stop: s(10) },
    stop_refresh: { stop: s(10) },
    search_no_results: { chars: 'int' },
    location_problem: { problem: s(30) },
    report_sent: { kind: s(20) },
    // One per visit: the device and where the rider came from (no personal data)
    session_start: { browser: s(20), os: s(20), screen: s(12), lang: s(10), source: s(60), campaign: s(60), installed: ['yes', 'no'], connection: s(10), version: s(20) },
    // How fast the app is for riders: Core Web Vitals, and our own timings
    vitals: { name: ['LCP', 'CLS', 'INP', 'FID', 'FCP', 'TTFB'], value: 'num', rating: ['good', 'needs-improvement', 'poor'] },
    timing: { what: ['map_load', 'plan_routes', 'stop_board', 'live_feed'], ms: 'int' },
    // What went wrong on riders' devices
    app_error: { message: s(200), where: s(120) },
    api_error: { endpoint: s(80), status: 'int' },
    trip_texts: { action: ['asked', 'declined', 'signin_needed'] },
    menu_opened: { panel: ['trip_planner', 'saved', 'weekly'] },
    place_saved: {},
    weekly_saved: { days: 'int' },
    signed_up: {},
    signed_in: { method: ['email', 'phone'] },
    signed_out: {},
    profile_updated: { fields: s(60) },
    character_changed: { character: s(20) },
};
/** Kinds only the server records, after the action really happened (the app can't send these) */
export const SERVER_EVENTS = ['sms_opt_in', 'sms_opt_out', 'phone_code_sent', 'phone_verified', 'trip_texts_on'] as const;
export type ServerEvent = typeof SERVER_EVENTS[number];

export interface UsageRow { at?: string; visitor: string; user_id: string | null; session?: string | null; kind: string; page: string | null; device: string | null; detail: Record<string, unknown> }

/** A visit id the app makes (random, no personal data): kept only if it looks like one */
export const cleanSession = (v: unknown): string | null => typeof v === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(v) ? v : null;

/** Keeps only the allowed fields of a detail object, cleaned; null when the kind isn't allowed from the app */
export function cleanEvent(kind: unknown, detail: unknown): { kind: string; detail: Record<string, unknown> } | null {
    if (typeof kind !== 'string' || !Object.hasOwn(CLIENT_EVENTS, kind)) return null;
    const spec = CLIENT_EVENTS[kind], out: Record<string, unknown> = {};
    const d = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail as Record<string, unknown> : {};
    for (const [key, field] of Object.entries(spec)) {
        const v = d[key];
        if (v === undefined || v === null) continue;
        if (typeof field === 'object' && 'str' in field) { if (typeof v === 'string') { const t = v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, field.str); if (t) out[key] = t; } }
        else if (typeof field === 'object') { if (typeof v === 'string' && field.includes(v)) out[key] = v; }
        else if (field === 'int') { if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e6) out[key] = v; }
        else if (field === 'num') { if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7) out[key] = Math.round(v * 1000) / 1000; }
        else if (field === 'coord') { if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 180) out[key] = Math.round(v * 1000) / 1000; }   // ~100 m
    }
    // Errors are written by the browser, so nothing personal may ride along in them (the app scrubs too; this is the guarantee)
    if (kind === 'api_error' && typeof out.endpoint === 'string') out.endpoint = out.endpoint.split(/[?#]/)[0].replace(UUID_RE, ':id').replace(/\/\d+(?=\/|$)/g, '/:n');
    if (kind === 'app_error' && typeof out.message === 'string') out.message = out.message.replace(UUID_RE, ':id').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]').replace(/(token|key|code)=[^&\s]+/gi, '$1=[hidden]');
    return { kind, detail: out };
}
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** A page path the rider is on: must look like a path, kept short */
export function cleanPage(v: unknown): string | null {
    return typeof v === 'string' && /^\/[A-Za-z0-9\/_.-]{0,120}$/.test(v) ? v : null;
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python-requests|axios\//i;
/** Crawlers and scripts are not riders */
export const isBot = (ua: string) => !ua || BOT.test(ua);

/** Mobile / Tablet / Desktop, from the browser's description of itself */
export function deviceOf(ua: string): 'Mobile' | 'Tablet' | 'Desktop' {
    if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'Tablet';
    if (/iPhone|Mobile|Android/i.test(ua)) return 'Mobile';
    return 'Desktop';
}

/* The key for the daily anonymous id. A dedicated ANALYTICS_SECRET is best; the service key is secret too and
   always set on the server. Without either (tests, a laptop) a random key: ids then change when the server restarts. */
const KEY = process.env.ANALYTICS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || crypto.randomBytes(32).toString('hex');

/** Who did it: the account when signed in, otherwise an id for this address + browser that changes every Regina day */
export function visitorId(ip: string, userAgent: string, userId: string | null | undefined, now: Date | number = Date.now()): string {
    if (userId) return `u:${userId}`;
    return 'a:' + crypto.createHmac('sha256', KEY).update(`${reginaDateKey(now)}|${ip}|${userAgent}`).digest('base64url').slice(0, 22);
}

let missingTableLogged = false;
/** Saves events. Never throws: analytics must never break what the rider is doing. */
export async function saveEvents(rows: UsageRow[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await serviceDb().from('usage_events').insert(rows);
    if (error && !missingTableLogged) {
        missingTableLogged = true;
        console.error('[Usage] Events not saved (has docs/security/011_usage_analytics.sql been run?):', error.message);
    }
}

/** Records something that happened on the server for a signed-in rider (SMS turned on, a number verified…) */
export function recordServerEvent(userId: string, kind: ServerEvent, detail: Record<string, unknown> = {}): void {
    void saveEvents([{ visitor: `u:${userId}`, user_id: userId, kind, page: null, device: null, detail }]).catch(() => { });
}

/** The same summary the rider page gets from the database, worked out from one visitor's events (a day's worth at most) */
export type VisitorEvent = { at: string; kind: string; page: string | null; device: string | null; session?: string | null; detail: Record<string, unknown> | null };
export function summarizeEvents(events: VisitorEvent[], tops: [string, string, string][]) {
    const tally = (vals: (string | null)[]) => { const m = new Map<string, number>(); for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
    const sessions = new Map<string, VisitorEvent[]>();
    for (const e of events) if (e.session) sessions.set(e.session, [...(sessions.get(e.session) ?? []), e]);
    const s = [...sessions.values()].map(list => {
        const t = list.map(e => Date.parse(e.at));
        return { minutes: (Math.max(...t) - Math.min(...t)) / 60_000, pages: list.filter(e => e.kind === 'page_view').length, actions: list.filter(e => !['page_view', 'session_start', 'vitals', 'timing'].includes(e.kind)).length };
    });
    const mins = s.map(x => x.minutes).sort((a, b) => a - b), r1 = (v: number) => Math.round(v * 10) / 10;
    const median = mins.length ? (mins.length % 2 ? mins[(mins.length - 1) / 2] : (mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2) : null;
    return {
        kinds: tally(events.map(e => e.kind)).map(([kind, n]) => ({ kind, events: n, visitors: 1 })),
        sessions: s.length ? { sessions: s.length, avg_minutes: r1(mins.reduce((a, b) => a + b, 0) / s.length), median_minutes: median === null ? null : r1(median),
            avg_pages: r1(s.reduce((a, x) => a + x.pages, 0) / s.length), bounce_rate: r1(100 * s.filter(x => x.actions === 0 && x.pages <= 1).length / s.length) } : null,
        // Regina is UTC-6 all year (no daylight saving)
        hours: tally(events.map(e => { const d = new Date(Date.parse(e.at) - 6 * 3_600_000); return `${d.getUTCDay()}|${d.getUTCHours()}`; }))
            .map(([k, n]) => ({ weekday: Number(k.split('|')[0]), hour: Number(k.split('|')[1]), events: n })),
        devices: tally(events.map(e => e.device ?? 'Unknown')).map(([device]) => ({ device, visitors: 1 })),
        top: Object.fromEntries(tops.map(([name, kind, key]) => [name, tally(events.filter(e => e.kind === kind).map(e => { const v = e.detail?.[key]; return v === undefined || v === null || v === '' ? null : String(v); }))
            .slice(0, 8).map(([value, n]) => ({ value, events: n, visitors: 1 }))])),
    };
}

/* Who has the app open right now: the latest page load or 60-second heartbeat from each visitor (a visible tab only).
   Kept in memory, not in usage_events, so a minute-by-minute signal doesn't swamp the counts. After a restart
   the list fills again within a minute.
   ponytail: one server process; move this to a table if the API ever runs on more than one instance. */
export interface Presence { visitor: string; userId: string | null; at: number; page: string | null; device: string }
const presence = new Map<string, Presence>();
const PRESENCE_KEEP_MS = 10 * 60_000;

export function markPresent(visitor: string, userId: string | null, page: string | null, device: string, now = Date.now()): void {
    presence.set(visitor, { visitor, userId, at: now, page, device });
    for (const [k, p] of presence) if (now - p.at > PRESENCE_KEEP_MS) presence.delete(k);
}

/** Everyone whose app said "still here" within the last `ms` */
export function presentWithin(ms: number, now = Date.now()): Presence[] {
    return [...presence.values()].filter(p => now - p.at <= ms);
}
/** Tests: start from nobody on the app */
export const forgetPresence = (): void => presence.clear();
