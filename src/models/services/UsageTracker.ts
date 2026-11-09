/* UsageTracker — records what riders do for the admin Usage page (POST /api/analytics/events).
   Events wait in a short queue and go in batches of up to 20 every few seconds, and whatever is left is sent when
   the tab is hidden or closed. Never throws and never slows the app: analytics must not get in the rider's way.
   Who did it is worked out by the server from the login token, never sent from here.

   Also, once per visit: the visit id (random, a new one after 30 minutes idle), the device and where the rider came
   from; how fast pages load (Core Web Vitals); and any crash, so admins hear about bugs on phones they don't have. */
import { getCLS, getFCP, getFID, getLCP, getTTFB, type Metric } from 'web-vitals';
import { supabase } from '../lib/supabase';

const BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const FLUSH_MS = 5000, BATCH = 20, MAX_QUEUE = 200;
const SESSION_IDLE_MS = 30 * 60_000, SESSION_KEY = 'transit-regina:visit';
const MAX_ERRORS_PER_PAGE = 5;

export type UsageDetail = Record<string, string | number | undefined>;
const queue: { kind: string; page: string; session: string; detail: UsageDetail }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/* The current login, kept ready: when the tab is closing there is no time to look it up before sending
   (an await there and the page is gone before the request leaves, losing the rider's last actions) */
let token: string | null = null;
if (typeof window !== 'undefined') {
    supabase.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null; }).catch(() => { });
    supabase.auth.onAuthStateChange((_event, session) => { token = session?.access_token ?? null; });
}

function send(events: typeof queue, keepalive = false): Promise<void> {
    return fetch(`${BASE_URL}/api/analytics/events`, {
        method: 'POST', keepalive,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ events }),
    }).then(() => { }, () => { /* offline or blocked: these events are lost, the app carries on */ });
}

function flush(keepalive = false): void {
    if (timer) { clearTimeout(timer); timer = null; }
    while (queue.length) void send(queue.splice(0, BATCH), keepalive);
}

/* ── The visit: one per tab, kept across reloads, new after 30 minutes without activity ── */
let visit: { id: string; last: number } | null = null;
function currentVisit(): { id: string; isNew: boolean } {
    const now = Date.now();
    if (!visit) { try { visit = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); } catch { /* storage blocked */ } }
    const isNew = !visit || now - visit.last > SESSION_IDLE_MS;
    if (isNew) visit = { id: (crypto.randomUUID?.() ?? `${now}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32), last: now };
    else visit!.last = now;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(visit)); } catch { /* storage blocked: one visit per page load */ }
    return { id: visit!.id, isNew };
}

/** The device and where the rider came from, once per visit. No personal data: the referring site's name only. */
function visitContext(): UsageDetail {
    const ua = navigator.userAgent, params = new URLSearchParams(location.search);
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
    const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
    let source = params.get('utm_source') ?? '';
    if (!source && document.referrer) { try { const host = new URL(document.referrer).hostname.replace(/^www\./, ''); source = host === location.hostname ? '' : host; } catch { /* bad referrer */ } }
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    return {
        browser, os, screen: `${screen.width}x${screen.height}`, lang: (navigator.language || '').slice(0, 10),
        source: source || 'direct', campaign: params.get('utm_campaign') ?? undefined, installed: standalone ? 'yes' : 'no',
        connection: (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType, version: import.meta.env.VITE_APP_VERSION || undefined,
    };
}

let lastPage = { path: '', at: 0 };
/** Records one thing the rider did. Fields must be on the server's list for that kind (UsageEvents.CLIENT_EVENTS). */
export function track(kind: string, detail: UsageDetail = {}): void {
    if (typeof window === 'undefined') return;   // prerendering
    // The same page reported twice within a second is one visit (React can run the page effect twice)
    if (kind === 'page_view') {
        if (detail.path === lastPage.path && Date.now() - lastPage.at < 1000) return;
        lastPage = { path: String(detail.path), at: Date.now() };
    }
    const v = currentVisit();
    if (v.isNew) queue.push({ kind: 'session_start', page: location.pathname, session: v.id, detail: visitContext() });
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push({ kind, page: location.pathname, session: v.id, detail });
    if (queue.length >= BATCH) flush();
    else timer ??= setTimeout(() => flush(), FLUSH_MS);
}

/** Sends one event (and anything queued) right away: for signing out, while the login can still say who it was */
export async function trackNow(kind: string, detail: UsageDetail = {}): Promise<void> {
    if (typeof window === 'undefined') return;
    track(kind, detail);
    if (timer) { clearTimeout(timer); timer = null; }
    await Promise.race([send(queue.splice(0, BATCH)), new Promise(r => setTimeout(r, 1500))]);   // never hold up signing out for long
    flush();
}

/** How long something took, in milliseconds since `since` (performance.now()) */
export function trackTiming(what: 'map_load' | 'plan_routes' | 'stop_board' | 'live_feed', since: number): void {
    track('timing', { what, ms: Math.max(0, Math.round(performance.now() - since)) });
}

/** A request to our backend failed (server error or no answer) */
export function trackApiError(endpoint: string, status: number): void {
    track('api_error', { endpoint: endpoint.split('?')[0].replace(/\/[0-9a-f-]{36}(?=\/|$)/gi, '/:id').replace(/\/\d+(?=\/|$)/g, '/:n').slice(0, 80), status });
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
    window.addEventListener('pagehide', () => flush(true));

    // How fast pages are for riders (Google's Core Web Vitals), rated by Google's published thresholds
    const LIMITS: Record<string, [number, number]> = { LCP: [2500, 4000], FCP: [1800, 3000], CLS: [0.1, 0.25], TTFB: [800, 1800], FID: [100, 300] };
    const report = (m: Metric) => {
        const [good, poor] = LIMITS[m.name] ?? [Infinity, Infinity];
        track('vitals', { name: m.name, value: m.value, rating: m.value <= good ? 'good' : m.value <= poor ? 'needs-improvement' : 'poor' });
    };
    getCLS(report); getFCP(report); getFID(report); getLCP(report); getTTFB(report);

    // Crashes on riders' devices: the message and where, a few per page (a loop of errors must not flood)
    let errors = 0;
    const crash = (message: string, where: string) => { if (errors++ < MAX_ERRORS_PER_PAGE) track('app_error', { message: message.slice(0, 200), where: where.slice(0, 120) }); };
    window.addEventListener('error', e => crash(String(e.message || 'Unknown error'), `${(e.filename || '').split('/').pop()}:${e.lineno || 0}`));
    window.addEventListener('unhandledrejection', e => crash(String((e.reason as Error)?.message ?? e.reason ?? 'Unhandled rejection'), 'promise'));
}
