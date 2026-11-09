/**
 * Admin API. Every route here requires a signed-in admin: the two guards below run first.
 * The acting admin is always taken from the verified login token, never from the request body.
 */
import { Router, Request, Response } from 'express';
import { getSupabaseAdmin } from '../../models/lib/supabaseAdmin';
import { serviceDb, hasServiceKey } from '../../models/lib/serverDb';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin, requireFreshTwoStep, requireStaff } from '../middleware/requireAdmin';
import { clientIp, isDateOnly, isUuid, isText, reject } from '../middleware/security';
import { SecurityEventService } from '../../models/services/SecurityEventService';
import { HealthService } from '../../models/services/HealthService';
import { RealTimeService } from '../../models/services/RealTimeService';
import { SmsOutageService } from '../../models/services/SmsOutageService';
import { reginaDateKey, startOfReginaDay } from '../../models/services/ReginaTime';
import { presentWithin, summarizeEvents, type VisitorEvent } from '../../models/services/UsageEvents';

const router = Router();
// Everyone on the admin panel (admins and view-only admins) may look; anything that changes something also needs requireAdmin
router.use(requireAuth, requireStaff);

const FEATURE_KEY = /^[a-z][a-z0-9_]{1,40}$/;
/** Records an admin action; `target` is the account it was about, so a person's page can list what was done to them */
const audit = (req: Request, type: string, message: string, severity: 'info' | 'warning' | 'critical' = 'info', target?: string) =>
    SecurityEventService.record({ type, severity, message, ip: clientIp(req), userId: req.user!.id, targetUser: target, path: req.originalUrl });

/** Things an admin did (as opposed to things that happened to the site). Shown in the activity log. */
const ADMIN_ACTIONS = ['user_deleted', 'role_changed', 'status_changed', 'user_updated', 'feature_access_changed', 'route_changed', 'sms_broadcast', 'sms_outage_declared', 'sms_settings_changed', 'personal_data_viewed', 'events_handled', 'note_added', 'note_deleted', 'reports_handled'];
/** An optional reason typed by the admin, tidied for the log. */
const reasonOf = (req: Request) => (typeof req.body?.reason === 'string' && req.body.reason.trim() ? ` Reason: ${req.body.reason.trim().slice(0, 200)}` : '');
const countOf = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

/** Critical events nobody has marked as handled yet. Counts them all if the handled columns are not there yet (script 003). */
async function unhandledCriticalSince(since: string): Promise<number> {
    const q = () => serviceDb().from('security_events').select('*', { count: 'exact', head: true }).eq('severity', 'critical').gte('created_at', since);
    const r = await q().is('handled_at', null);
    return r.error ? countOf(q()) : r.count ?? 0;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

/**
 * Makes events readable: every account id in a message becomes that person's email, and each
 * event gets `admin` — the name of whoever did it. An id with no account left is shown as the
 * email recorded when it was deleted, or "a deleted account".
 */
async function withPeople<T extends { user_id: string | null; message: string }>(rows: T[]) {
    const ids = new Set<string>();
    for (const r of rows) { if (r.user_id) ids.add(r.user_id); for (const id of r.message.match(UUID) ?? []) ids.add(id.toLowerCase()); }
    const { data } = ids.size ? await serviceDb().from('profiles').select('id, full_name, email').in('id', [...ids]) : { data: [] };
    const people = new Map((data ?? []).map(p => [p.id as string, p]));
    return rows.map(r => {
        const actor = r.user_id ? people.get(r.user_id) : null;
        return {
            ...r,
            message: r.message.replace(new RegExp(`(${UUID.source})(?: \\(([^)\\s]+@[^)\\s]+)\\))?`, 'gi'),
                (_m, id: string, kept?: string) => people.get(id.toLowerCase())?.email ?? kept ?? '(deleted account)'),
            admin: r.user_id ? actor?.full_name || actor?.email || 'A deleted account' : 'System',
            who: actor?.email ?? null,
        };
    });
}

// ── Home: is everything okay, and how big is the app right now? ──
router.get('/overview', async (_req: Request, res: Response) => {
    const db = serviceDb(), now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60_000).toISOString(), dayAgo = new Date(now - 86_400_000).toISOString();
    const today = startOfReginaDay(0).toISOString(), weekAgo = startOfReginaDay(-6).toISOString();
    const head = { count: 'exact' as const, head: true };

    const [activeNow, signedInNow, visitorsToday, totalUsers, signupsToday, signupsWeek, criticalDay, week, recent, buses, openReports] = await Promise.all([
        countOf(db.from('visitor_sessions').select('*', head).gte('last_seen', fiveMinAgo)),
        countOf(db.from('profiles').select('*', head).gte('last_active', fiveMinAgo)),
        countOf(db.from('visitor_sessions').select('*', head).gte('last_seen', today)),
        countOf(db.from('profiles').select('*', head)),
        countOf(db.from('profiles').select('*', head).gte('created_at', today)),
        countOf(db.from('profiles').select('*', head).gte('created_at', weekAgo)),
        unhandledCriticalSince(dayAgo),
        // Counted in the database by Regina day (script 011): reading rows through the API stops at 1,000
        db.rpc('usage_days', { p_from: weekAgo, p_to: startOfReginaDay(1).toISOString() }),
        db.from('security_events').select('type, severity, message, user_id, created_at').in('type', ADMIN_ACTIONS).order('created_at', { ascending: false }).limit(8),
        RealTimeService.getLiveBuses().then(b => b.length).catch(() => null),
        countOf(db.from('rider_reports').select('*', head).is('handled_at', null)),   // 0 before script 012
    ]);

    // Seven Regina days, oldest first
    const days = Array.from({ length: 7 }, (_, i) => reginaDateKey(startOfReginaDay(i - 6)));
    const counted = new Map(((week.data ?? []) as UsageDay[]).map(d => [d.day, d]));
    const trend = days.map(day => { const d = counted.get(day); return { day, visitors: Number(d?.visitors ?? 0), searches: Number(d?.searches ?? 0), trips: Number(d?.trips ?? 0) }; });
    const todayRow = trend[trend.length - 1];

    const health = HealthService.report();
    const attention = [
        ...health.checks.filter(c => !c.ok).map(c => ({ level: 'critical', text: `${c.name} is down: ${c.detail}`, link: '/admin/security' })),
        ...(criticalDay ? [{ level: 'critical', text: `${criticalDay} critical security event${criticalDay === 1 ? '' : 's'} in the last 24 hours`, link: '/admin/security' }] : []),
        ...health.config.map(text => ({ level: 'warning', text, link: '/admin/security' })),
        ...(openReports ? [{ level: 'warning', text: `${openReports} open rider report${openReports === 1 ? '' : 's'}`, link: '/admin/reports' }] : []),
    ];

    res.json({
        at: new Date(now).toISOString(),
        live: { activeNow, signedInNow, buses },
        today: { visitors: visitorsToday, searches: todayRow.searches, trips: todayRow.trips, signups: signupsToday },
        totals: { users: totalUsers, signupsWeek },
        trend, attention, usageReady: !week.error,
        recent: await withPeople(recent.data ?? []),
    });
});

// ── Usage: what riders do, counted in the database by Regina day (scripts 011 and 012) ──
interface UsageDay { day: string; visitors: number; riders: number; page_views: number; searches: number; trips: number }
type Top = { value: string; events: number; visitors: number };
/** Most common values to show: [name in the answer, kind of action, detail field] */
const USAGE_TOPS: [string, string, string][] = [
    ['places', 'place_searched', 'place'], ['tappedPlaces', 'place_tapped', 'place'], ['tripDestinations', 'trip_started', 'place'],
    ['tripRoutes', 'trip_started', 'routes'], ['routes', 'route_selected', 'route'], ['busRoutes', 'bus_opened', 'route'],
    ['buses', 'bus_opened', 'bus'], ['stops', 'stop_opened', 'name'], ['pages', 'page_view', 'path'], ['characters', 'character_changed', 'character'],
    ['menus', 'menu_opened', 'panel'], ['location', 'location', 'choice'], ['locationProblems', 'location_problem', 'problem'],
    ['sources', 'session_start', 'source'], ['campaigns', 'session_start', 'campaign'], ['browsers', 'session_start', 'browser'],
    ['systems', 'session_start', 'os'], ['screens', 'session_start', 'screen'], ['languages', 'session_start', 'lang'],
    ['installed', 'session_start', 'installed'], ['connections', 'session_start', 'connection'], ['versions', 'session_start', 'version'],
    ['errors', 'app_error', 'message'], ['errorPlaces', 'app_error', 'where'], ['apiErrors', 'api_error', 'endpoint'],
    ['chosenRank', 'trip_started', 'rank'], ['expandedRank', 'option_expanded', 'rank'], ['reports', 'report_sent', 'kind'],
];
/** For one rider's page: a shorter list */
const PERSON_TOPS = USAGE_TOPS.filter(([name]) => ['places', 'tripDestinations', 'tripRoutes', 'routes', 'busRoutes', 'stops', 'pages', 'browsers', 'systems', 'errors'].includes(name));
/** The steps a rider takes to get a bus, in order: [label, kind, path for page views] */
const FUNNEL: [string, string, string?][] = [
    ['Opened the map', 'page_view', '/map'], ['Searched for a place', 'place_searched'], ['Saw bus options', 'suggestions_shown'],
    ['Started a trip', 'trip_started'], ['Turned on trip texts', 'trip_texts_on'],
];
const sumDays = (rows: UsageDay[]) => rows.reduce((t, d) => ({ visitors: t.visitors + Number(d.visitors), riders: t.riders + Number(d.riders), pageViews: t.pageViews + Number(d.page_views), searches: t.searches + Number(d.searches), trips: t.trips + Number(d.trips) }),
    { visitors: 0, riders: 0, pageViews: 0, searches: 0, trips: 0 });
const notSetUp = (e: { code?: string } | null) => !!e && ['42883', '42P01', '42703', 'PGRST202', 'PGRST205', 'PGRST204'].includes(e.code ?? '');   // function, table or column missing
const nums = <T,>(rows: unknown, keys: (keyof T)[]): T[] => ((rows ?? []) as T[]).map(r => { const o = { ...r }; for (const k of keys) (o as Record<keyof T, unknown>)[k] = r[k] === null ? null : Number(r[k]); return o; });
const tops = (data: unknown): Top[] => nums<Top>(data, ['events', 'visitors']);

/**
 * The range asked for, as whole Regina days: ?days=1..90 (ending today), or ?from=YYYY-MM-DD&to=YYYY-MM-DD (up to a year).
 * Also the same length just before it, to compare with. null = not a valid range.
 */
function usageRange(q: Record<string, unknown>): { p_from: string; p_to: string; before: { p_from: string; p_to: string }; days: number } | null {
    const reginaDay = (d: string) => new Date(`${d}T00:00:00-06:00`);
    if (q.from !== undefined || q.to !== undefined) {
        if (!isDateOnly(q.from) || !isDateOnly(q.to)) return null;
        const from = reginaDay(q.from as string), to = new Date(reginaDay(q.to as string).getTime() + 86_400_000);
        const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
        if (days < 1 || days > 366) return null;
        return { p_from: from.toISOString(), p_to: to.toISOString(), days, before: { p_from: new Date(from.getTime() - days * 86_400_000).toISOString(), p_to: from.toISOString() } };
    }
    const days = Number(q.days ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 90) return null;
    const p_from = startOfReginaDay(1 - days).toISOString();
    return { p_from, p_to: startOfReginaDay(1).toISOString(), days, before: { p_from: startOfReginaDay(1 - 2 * days).toISOString(), p_to: p_from } };
}

router.get('/usage', async (req: Request, res: Response) => {
    const range = usageRange(req.query);
    if (!range) { reject(req, res, 'Use days=1 to 90, or from and to dates (YYYY-MM-DD) up to a year apart'); return; }
    const { before, days, ...r } = range;
    const db = serviceDb();
    const [daily, previous, kinds, hours, devices, latest, ...rest] = await Promise.all([
        db.rpc('usage_days', r), db.rpc('usage_days', before), db.rpc('usage_kinds', r), db.rpc('usage_hours', r), db.rpc('usage_devices', r),
        db.from('usage_events').select('at, kind, page, device, detail, visitor, user_id').order('at', { ascending: false }).limit(60),
        ...USAGE_TOPS.map(([, p_kind, p_key]) => db.rpc('usage_top', { ...r, p_kind, p_key, p_limit: 15 })),
    ]);
    if (notSetUp(daily.error)) { res.json({ setup: false }); return; }
    const failed = [daily, previous, kinds, hours, devices, latest, ...rest].find(x => x.error);
    if (failed) { console.error('[Admin] Usage error:', failed.error!.message); res.status(500).json({ error: 'Could not load usage' }); return; }

    // Script 012's extras: sessions, speed, unmet demand, returning riders. Missing before it is run: shown as not set up.
    const [sessions, vitals, timings, unmet, retention] = await Promise.all([
        db.rpc('usage_sessions', r), db.rpc('usage_metric', { ...r, p_kind: 'vitals', p_name_key: 'name', p_value_key: 'value' }),
        db.rpc('usage_metric', { ...r, p_kind: 'timing', p_name_key: 'what', p_value_key: 'ms' }), db.rpc('usage_unmet', { ...r, p_limit: 30 }), db.rpc('usage_retention', { p_weeks: 8 }),
    ]);
    const deeper = !sessions.error;
    const counted = new Map((daily.data as UsageDay[]).map(d => [d.day, d]));
    const fromDay = new Date(r.p_from);
    const dayList = Array.from({ length: days }, (_, i) => reginaDateKey(new Date(fromDay.getTime() + (i + 0.5) * 86_400_000)));
    const top = Object.fromEntries(USAGE_TOPS.map(([name], i) => [name, tops(rest[i].data)])) as Record<string, Top[]>;
    const kindList = nums<{ kind: string; events: number; visitors: number }>(kinds.data, ['events', 'visitors']);
    const visitorsOf = (kind: string, path?: string) => path ? (top.pages.find(p => p.value === path)?.visitors ?? 0) : (kindList.find(k => k.kind === kind)?.visitors ?? 0);
    const people = await withPeople(((latest.data ?? []) as { at: string; kind: string; page: string | null; device: string | null; detail: Record<string, unknown>; visitor: string; user_id: string | null }[]).map(x => ({ ...x, message: '' })));

    res.json({
        setup: true, deeper, days, from: r.p_from, to: r.p_to,
        totals: sumDays(daily.data as UsageDay[]), previous: sumDays(previous.data as UsageDay[]),
        daily: dayList.map(day => { const d = counted.get(day); return { day, visitors: Number(d?.visitors ?? 0), riders: Number(d?.riders ?? 0), pageViews: Number(d?.page_views ?? 0), searches: Number(d?.searches ?? 0), trips: Number(d?.trips ?? 0) }; }),
        kinds: kindList,
        funnel: FUNNEL.map(([label, kind, path]) => ({ label, visitors: visitorsOf(kind, path) })),
        hours: nums<{ weekday: number; hour: number; events: number }>(hours.data, ['events']),
        devices: nums<{ device: string; visitors: number }>(devices.data, ['visitors']),
        top,
        sessions: deeper ? nums<Record<string, number>>(sessions.data, ['sessions', 'avg_minutes', 'median_minutes', 'avg_pages', 'bounce_rate'])[0] ?? null : null,
        vitals: deeper ? nums<{ name: string; samples: number; p50: number; p75: number; p90: number }>(vitals.data, ['samples', 'p50', 'p75', 'p90']) : [],
        timings: deeper ? nums<{ name: string; samples: number; p50: number; p75: number; p90: number }>(timings.data, ['samples', 'p50', 'p75', 'p90']) : [],
        unmet: deeper ? nums<Record<string, number | string>>(unmet.data, ['looked', 'riders', 'no_options', 'over_hour', 'avg_best_minutes', 'trips', 'took_bus_pct']) : [],
        retention: deeper ? nums<{ week: string; riders: number; returning_riders: number; new_riders: number }>(retention.data, ['riders', 'returning_riders', 'new_riders']) : [],
        latest: people.map(x => ({ at: x.at, kind: x.kind, page: x.page, device: x.device, detail: x.detail, who: x.user_id ? (x.who ?? 'A deleted account') : `Visitor ${x.visitor.slice(2, 8)}`, userId: x.user_id, visitor: x.visitor.startsWith('a:') ? x.visitor.slice(2) : null })),
    });
});

// Who is on the app right now: the latest thing each visitor did in the last 5 minutes
router.get('/usage/now', async (_req: Request, res: Response) => {
    const { data, error } = await serviceDb().rpc('usage_now', { p_minutes: 5 });
    if (notSetUp(error)) { res.json({ setup: false, visitors: [] }); return; }
    if (error) { console.error('[Admin] Now error:', error.message); res.status(500).json({ error: 'Could not load who is on now' }); return; }
    const rows = (data ?? []) as { visitor: string; user_id: string | null; last_at: string; last_kind: string; last_page: string | null; device: string | null; events: number }[];
    // Add riders who only have the app open (60-second "still here" signal): newer than their last action, it shows where they are now
    const byVisitor = new Map(rows.map(r => [r.visitor, r]));
    for (const p of presentWithin(5 * 60_000)) {
        const row = byVisitor.get(p.visitor), at = new Date(p.at).toISOString();
        if (!row) byVisitor.set(p.visitor, { visitor: p.visitor, user_id: p.userId, last_at: at, last_kind: 'still_here', last_page: p.page, device: p.device, events: 0 });
        else if (p.at > Date.parse(row.last_at)) Object.assign(row, { last_at: at, last_kind: 'still_here', last_page: p.page ?? row.last_page });
    }
    const people = await withPeople([...byVisitor.values()].map(x => ({ ...x, message: '' })));
    res.json({ setup: true, visitors: people.map(x => ({ who: x.user_id ? (x.who ?? 'A deleted account') : `Visitor ${x.visitor.slice(2, 8)}`, userId: x.user_id, visitor: x.visitor.startsWith('a:') ? x.visitor.slice(2) : null, at: x.last_at, kind: x.last_kind, page: x.last_page, device: x.device, events: Number(x.events) }))
        .sort((a, b) => b.at.localeCompare(a.at)) });
});

// Where riders search: points (rounded to ~100 m) and how often, for the map
router.get('/usage/points', async (req: Request, res: Response) => {
    const range = usageRange(req.query);
    const kind = req.query.kind ?? 'place_searched';
    if (!range || (kind !== 'place_searched' && kind !== 'place_tapped')) { reject(req, res, 'Invalid range or kind'); return; }
    const { data, error } = await serviceDb().rpc('usage_points', { p_from: range.p_from, p_to: range.p_to, p_kind: kind });
    if (notSetUp(error)) { res.json({ setup: false, points: [] }); return; }
    if (error) { console.error('[Admin] Points error:', error.message); res.status(500).json({ error: 'Could not load the map' }); return; }
    res.json({ setup: true, points: nums<{ lat: number; lng: number; events: number; label: string }>(data, ['lat', 'lng', 'events']) });
});

// ── One rider in depth: what they do, texts sent to them, what they saved, admin notes. Personal data: viewing is recorded. ──
router.get('/users/:id/activity', async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isUuid(id)) { reject(req, res, 'Invalid user id'); return; }
    const db = serviceDb(), r = { p_from: startOfReginaDay(-89).toISOString(), p_to: startOfReginaDay(1).toISOString(), p_user: id };
    const events = await db.from('usage_events').select('at, kind, page, device, session, detail').eq('user_id', id).order('at', { ascending: false }).limit(500);
    if (notSetUp(events.error)) {
        const old = await db.from('usage_events').select('at, kind, page, device, detail').eq('user_id', id).order('at', { ascending: false }).limit(500);   // before script 012 (no session column)
        if (notSetUp(old.error)) { res.json({ setup: false, events: [] }); return; }
        await audit(req, 'personal_data_viewed', `Admin viewed the app activity of user ${id}`, 'info', id);
        res.json({ setup: true, deeper: false, events: old.data ?? [] });
        return;
    }
    if (events.error) { console.error('[Admin] Activity error:', events.error.message); res.status(500).json({ error: 'Could not load the activity' }); return; }
    const [kinds, sessions, hours, devices, texts, saved, weekly, notes, ...personTops] = await Promise.all([
        db.rpc('usage_kinds', r), db.rpc('usage_sessions', r), db.rpc('usage_hours', r), db.rpc('usage_devices', r),
        db.schema('sms').from('messages').select('kind, status, error_code, segments, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(50),
        db.from('saved_destinations').select('id', { count: 'exact', head: true }).eq('user_id', id),
        db.from('weekly_schedules').select('day_of_week, enabled, depart_by, arrive_by, route_num').eq('user_id', id),
        db.from('admin_notes').select('id, at, note, author').eq('user_id', id).order('at', { ascending: false }).limit(50),
        ...PERSON_TOPS.map(([, p_kind, p_key]) => db.rpc('usage_top', { p_from: r.p_from, p_to: r.p_to, p_kind, p_key, p_limit: 8, p_user: id })),
    ]);
    await audit(req, 'personal_data_viewed', `Admin viewed the app activity of user ${id}`, 'info', id);
    const authors = await withPeople(((notes.data ?? []) as { id: number; at: string; note: string; author: string | null }[]).map(n => ({ ...n, user_id: n.author, message: '' })));
    res.json({
        setup: true, deeper: true,
        events: events.data ?? [],
        summary: {
            kinds: nums<{ kind: string; events: number; visitors: number }>(kinds.data, ['events', 'visitors']),
            sessions: nums<Record<string, number>>(sessions.data, ['sessions', 'avg_minutes', 'median_minutes', 'avg_pages', 'bounce_rate'])[0] ?? null,
            hours: nums<{ weekday: number; hour: number; events: number }>(hours.data, ['events']),
            devices: nums<{ device: string; visitors: number }>(devices.data, ['visitors']),
            top: Object.fromEntries(PERSON_TOPS.map(([name], i) => [name, tops(personTops[i].data)])),
        },
        // Texts: what kind, and whether it arrived (never the phone number or the text itself)
        texts: texts.error ? null : texts.data ?? [],
        saved: { places: saved.error ? null : saved.count ?? 0, weekly: weekly.error ? null : weekly.data ?? [] },
        notes: notes.error ? null : authors.map(n => ({ id: n.id, at: n.at, note: n.note, author: n.who ?? 'A deleted account' })),
    });
});

// ── One signed-out visitor in depth. Their anonymous id changes every Regina day, so this is one day at most; no address is stored. ──
router.get('/visitors/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!/^[A-Za-z0-9_-]{22}$/.test(id)) { reject(req, res, 'Invalid visitor id'); return; }
    const { data, error } = await serviceDb().from('usage_events').select('at, kind, page, device, session, detail').eq('visitor', `a:${id}`).order('at', { ascending: false }).limit(1000);
    if (notSetUp(error)) { res.json({ setup: false, events: [] }); return; }
    if (error) { console.error('[Admin] Visitor error:', error.message); res.status(500).json({ error: 'Could not load the visitor' }); return; }
    const events = (data ?? []) as VisitorEvent[];
    res.json({ setup: true, deeper: true, events, summary: summarizeEvents(events, PERSON_TOPS) });
});

// Private notes on an account ("called 5 Nov, number changed"). Admins only; recorded.
router.post('/users/:id/notes', requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params, note = req.body?.note;
    if (!isUuid(id) || !isText(note, 1000)) { reject(req, res, 'A note is 1 to 1,000 characters'); return; }
    const { data, error } = await serviceDb().from('admin_notes').insert({ user_id: id, author: req.user!.id, note: note.trim() }).select('id, at').single();
    if (error) { console.error('[Admin] Note error:', error.message); res.status(notSetUp(error) ? 503 : 500).json({ error: notSetUp(error) ? 'Notes are not set up yet (script 012)' : 'Could not save the note' }); return; }
    await audit(req, 'note_added', `Admin added a note to user ${id}`, 'info', id);
    res.json(data);
});
router.delete('/notes/:noteId', requireAdmin, async (req: Request, res: Response) => {
    const noteId = Number(req.params.noteId);
    if (!Number.isInteger(noteId) || noteId < 1) { reject(req, res, 'Invalid note'); return; }
    const { data, error } = await serviceDb().from('admin_notes').delete().eq('id', noteId).select('user_id');
    if (error) { console.error('[Admin] Note delete error:', error.message); res.status(500).json({ error: 'Could not delete the note' }); return; }
    const owner = (data ?? [])[0]?.user_id as string | undefined;
    if (owner) await audit(req, 'note_deleted', `Admin deleted a note on user ${owner}`, 'info', owner);
    res.json({ deleted: data?.length ?? 0 });
});

// ── Text messages: per day, cost, why texts failed, and how riders get through phone verification ──
router.get('/sms/stats', async (req: Request, res: Response) => {
    const range = usageRange(req.query);
    if (!range) { reject(req, res, 'Use days=1 to 90, or from and to dates'); return; }
    const { before: _b, days, ...r } = range;
    const db = serviceDb();
    const [daily, failures, kinds, optedIn] = await Promise.all([
        db.rpc('sms_daily', r), db.rpc('sms_failures', r), db.rpc('usage_kinds', r),
        db.from('profiles').select('*', { count: 'exact', head: true }).eq('sms_opted_in', true).eq('mobile_verified', true),
    ]);
    if (notSetUp(daily.error)) { res.json({ setup: false }); return; }
    if (daily.error || failures.error) { console.error('[Admin] SMS stats error:', (daily.error ?? failures.error)!.message); res.status(500).json({ error: 'Could not load the text message numbers' }); return; }
    const k = nums<{ kind: string; events: number; visitors: number }>(kinds.data, ['events', 'visitors']);
    const riders = (kind: string) => k.find(x => x.kind === kind)?.visitors ?? 0;
    const counted = new Map(nums<{ day: string; sent: number; delivered: number; failed: number; dry_run: number; segments: number; cost: number }>(daily.data, ['sent', 'delivered', 'failed', 'dry_run', 'segments', 'cost']).map(d => [d.day, d]));
    const fromDay = new Date(r.p_from);
    const dayList = Array.from({ length: days }, (_, i) => reginaDateKey(new Date(fromDay.getTime() + (i + 0.5) * 86_400_000)));
    const perDay = dayList.map(day => counted.get(day) ?? { day, sent: 0, delivered: 0, failed: 0, dry_run: 0, segments: 0, cost: 0 });
    const total = perDay.reduce((t, d) => ({ sent: t.sent + d.sent, delivered: t.delivered + d.delivered, failed: t.failed + d.failed, segments: t.segments + d.segments, cost: Math.round((t.cost + d.cost) * 10000) / 10000 }), { sent: 0, delivered: 0, failed: 0, segments: 0, cost: 0 });
    res.json({
        setup: true, days, daily: perDay, total, optedInNow: optedIn.count ?? 0,
        failures: nums<{ error_code: number; failed: number }>(failures.data, ['error_code', 'failed']),
        verification: [['Sent a code', 'phone_code_sent'], ['Verified their phone', 'phone_verified'], ['Turned on text alerts', 'sms_opt_in'], ['Turned text alerts off', 'sms_opt_out']].map(([label, kind]) => ({ label, riders: riders(kind) })),
    });
});

// ── Riders' problem reports ("the bus didn't come"): the inbox ──
router.get('/reports', async (req: Request, res: Response) => {
    const handled = req.query.handled === '1';
    let q = serviceDb().from('rider_reports').select('id, at, user_id, visitor, kind, stop, route, bus, note, context, handled_at, handled_by').order('at', { ascending: false }).limit(300);
    q = handled ? q.not('handled_at', 'is', null) : q.is('handled_at', null);
    const { data, error } = await q;
    if (notSetUp(error)) { res.json({ setup: false, reports: [] }); return; }
    if (error) { console.error('[Admin] Reports error:', error.message); res.status(500).json({ error: 'Could not load reports' }); return; }
    const people = await withPeople(((data ?? []) as { user_id: string | null }[]).map(x => ({ ...x, message: '' })));
    res.json({ setup: true, reports: people.map(({ message: _m, admin: _a, ...x }) => ({ ...x, who: x.user_id ? (x.who ?? 'A deleted account') : 'Signed-out rider' })) });
});
router.post('/reports/handled', requireAdmin, async (req: Request, res: Response) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 300 || !ids.every(n => Number.isInteger(n) && n > 0)) { reject(req, res, 'Invalid report list'); return; }
    const { data, error } = await serviceDb().from('rider_reports').update({ handled_at: new Date().toISOString(), handled_by: req.user!.id }).in('id', ids).is('handled_at', null).select('id');
    if (error) { console.error('[Admin] Reports handled error:', error.message); res.status(500).json({ error: 'Could not update the reports' }); return; }
    await audit(req, 'reports_handled', `Admin marked ${data?.length ?? 0} rider report${data?.length === 1 ? '' : 's'} as handled`);
    res.json({ handled: data?.length ?? 0 });
});

// Filters: ?type= one kind of action, ?admin= who did it, ?target= the account it was about (all optional)
router.get('/activity', async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const { type, admin, target } = req.query as Record<string, string | undefined>;
    if ((type && !ADMIN_ACTIONS.includes(type)) || (admin && !isUuid(admin)) || (target && !isUuid(target))) { reject(req, res, 'Invalid filter'); return; }
    let q = serviceDb().from('security_events').select('type, severity, message, user_id, ip, created_at')
        .in('type', type ? [type] : ADMIN_ACTIONS).order('created_at', { ascending: false }).limit(limit);
    if (admin) q = q.eq('user_id', admin);
    if (target) q = q.or(`target_user.eq.${target},message.ilike.%${target}%`);
    const { data, error } = await q;
    if (error) { console.error('[Admin] Activity error:', error.message); res.status(500).json({ error: 'Could not load the activity log' }); return; }
    res.json(await withPeople(data ?? []));
});

// Everyone with an account, newest first, read in pages (one read through the API stops at 1,000 rows)
router.get('/people', async (_req: Request, res: Response) => {
    const rows: unknown[] = [];
    for (let from = 0; from < 20_000; from += 1000) {
        const { data, error } = await serviceDb().from('profiles').select('id, full_name, email, role, account_status, created_at, last_active')
            .order('created_at', { ascending: false }).range(from, from + 999);
        if (error) { console.error('[Admin] People error:', error.message); res.status(500).json({ error: 'Could not load people' }); return; }
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
    }
    res.json(rows);
});

/** What admins did to one account: by the target_user column (script 012), and by the id in the message for older entries */
async function historyOf(id: string) {
    const cols = 'type, severity, message, user_id, created_at';
    const byTarget = await serviceDb().from('security_events').select(cols).in('type', ADMIN_ACTIONS).or(`target_user.eq.${id},message.ilike.%${id}%`).order('created_at', { ascending: false }).limit(30);
    if (!byTarget.error) return byTarget;
    // ponytail: before script 012 there is no target_user column, so the message search alone
    return serviceDb().from('security_events').select(cols).in('type', ADMIN_ACTIONS).ilike('message', `%${id}%`).order('created_at', { ascending: false }).limit(30);
}

// ── One person: everything about them in one answer ──
router.get('/users/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isUuid(id)) { reject(req, res, 'Invalid user id'); return; }
    const db = serviceDb();
    const [profile, features, sessions, history] = await Promise.all([
        db.from('profiles').select('id, full_name, email, role, account_status, mobile_number, mobile_verified, sms_opted_in, created_at, last_active').eq('id', id).maybeSingle(),
        db.from('feature_access').select('feature, enabled').eq('user_id', id),
        db.from('visitor_sessions').select('browser, os, device, first_seen, last_seen, page_views').eq('user_id', id).order('last_seen', { ascending: false }).limit(10),
        // ponytail: finds actions on this person by their id in the message text; add a target_id column if the log grows large
        historyOf(id),
    ]);
    if (!profile.data) { res.status(404).json({ error: 'No such user' }); return; }
    res.json({ profile: profile.data, features: features.data ?? [], sessions: sessions.data ?? [], history: await withPeople(history.data ?? []) });
});

// Looking at personal data that is hidden by default (full IP addresses) is itself recorded
router.post('/reveal', async (req: Request, res: Response) => {
    const what = req.body?.what;
    if (!isText(what, 60)) { reject(req, res, 'Invalid request'); return; }
    await audit(req, 'personal_data_viewed', `Admin revealed ${what.trim()}`);
    res.json({ ok: true });
});

// Hard-delete a user from auth.users (cascades to profiles via FK)
router.delete('/users/:id', requireAdmin, requireFreshTwoStep, async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isUuid(id)) { reject(req, res, 'Invalid user id'); return; }
    if (id === req.user!.id) { reject(req, res, 'You cannot delete your own account from the admin panel'); return; }
    // Note the email first: once the account is gone, the log could only show an id
    const { data: gone } = await serviceDb().from('profiles').select('email').eq('id', id).maybeSingle();
    // The SMS service's copy of this person (texts with their number, alerts, trips) is not removed with the account
    for (const table of ['alerts', 'messages', 'trip_plans', 'outage_notices']) {
        const { error: smsErr } = await serviceDb().schema('sms').from(table).delete().eq('user_id', id);
        if (smsErr) { console.error(`[Admin] Delete user stopped at sms.${table}:`, smsErr.message); res.status(500).json({ error: 'Could not delete the user' }); return; }
    }
    // Problem reports outlive the account otherwise (they only lose the link to it); usage and notes go with the profile
    const { error: reportsErr } = await serviceDb().from('rider_reports').delete().eq('user_id', id);
    if (reportsErr && !notSetUp(reportsErr)) { console.error('[Admin] Delete user stopped at rider_reports:', reportsErr.message); res.status(500).json({ error: 'Could not delete the user' }); return; }
    const { error } = await getSupabaseAdmin().auth.admin.deleteUser(id);
    if (error) { console.error('[Admin] Delete user error:', error.message); res.status(500).json({ error: 'Could not delete the user' }); return; }
    await audit(req, 'user_deleted', `Admin deleted user ${id}${gone?.email ? ` (${gone.email})` : ''}.${reasonOf(req)}`, 'critical', id);
    res.json({ ok: true });
});

// Change a user's name, role or status. Suspending also blocks their login at the auth server,
// so a token they already hold stops working when it next refreshes.
router.patch('/users/:id', requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { full_name, role, account_status } = req.body ?? {};
    if (!isUuid(id)) { reject(req, res, 'Invalid user id'); return; }
    if (full_name !== undefined && !isText(full_name, 80)) { reject(req, res, 'Invalid name'); return; }
    if (role !== undefined && role !== 'user' && role !== 'admin' && role !== 'viewer') { reject(req, res, 'Invalid role'); return; }
    if (account_status !== undefined && !['active', 'suspended', 'deleted'].includes(account_status)) { reject(req, res, 'Invalid status'); return; }
    if (id === req.user!.id && ((role !== undefined && role !== 'admin') || (account_status && account_status !== 'active'))) { reject(req, res, 'You cannot demote or suspend yourself'); return; }
    // Handing out admin power or view-only access (it shows every rider's personal data), or taking an admin out of action,
    // needs a freshly entered authenticator code
    const weakens = role === 'user' || role === 'viewer' || (account_status !== undefined && account_status !== 'active');
    const targetIsAdmin = weakens && (await serviceDb().from('profiles').select('role').eq('id', id).maybeSingle()).data?.role === 'admin';
    if ((role === 'admin' || role === 'viewer' || targetIsAdmin) && Date.now() / 1000 - req.user!.twoStepAt > 10 * 60) {
        res.status(403).json({ error: 'Enter your authenticator code again to do this', code: 'fresh_two_step_required' });
        return;
    }

    const fields: Record<string, string> = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) fields.full_name = full_name.trim();
    if (role !== undefined) fields.role = role;
    if (account_status !== undefined) fields.account_status = account_status;
    const { error } = await getSupabaseAdmin().from('profiles').update(fields).eq('id', id);
    if (error) { console.error('[Admin] Update user error:', error.message); res.status(500).json({ error: 'Could not update the user' }); return; }
    if (account_status !== undefined) {
        const { error: banErr } = await getSupabaseAdmin().auth.admin.updateUserById(id, { ban_duration: account_status === 'active' ? 'none' : '876000h' });
        if (banErr) console.error('[Admin] Ban sync error:', banErr.message);
    }
    if (role !== undefined) await audit(req, 'role_changed', `Admin set user ${id} to role "${role}".${reasonOf(req)}`, 'critical', id);
    if (account_status !== undefined) await audit(req, 'status_changed', `Admin set user ${id} to status "${account_status}".${reasonOf(req)}`, 'warning', id);
    if (full_name !== undefined && role === undefined && account_status === undefined) await audit(req, 'user_updated', `Admin renamed user ${id}`, 'info', id);
    res.json({ ok: true });
});

// Set a single feature flag for one user
router.post('/fac/set', requireAdmin, async (req: Request, res: Response) => {
    const { userId, feature, enabled } = req.body ?? {};
    if (!isUuid(userId) || typeof feature !== 'string' || !FEATURE_KEY.test(feature) || typeof enabled !== 'boolean') { reject(req, res, 'Invalid feature access request'); return; }
    const { error } = await getSupabaseAdmin().from('feature_access')
        .upsert({ user_id: userId, feature, enabled, updated_by: req.user!.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id,feature' });
    if (error) { console.error('[Admin] Set feature error:', error.message); res.status(500).json({ error: 'Could not save the change' }); return; }
    await audit(req, 'feature_access_changed', `Admin turned "${feature}" ${enabled ? 'on' : 'off'} for user ${userId}`, 'info', userId);
    res.json({ ok: true });
});

// Delete all feature_access rows for a user (resets to full access)
router.delete('/fac/reset/:userId', requireAdmin, async (req: Request, res: Response) => {
    const { userId } = req.params;
    if (!isUuid(userId)) { reject(req, res, 'Invalid user id'); return; }
    const { error } = await getSupabaseAdmin().from('feature_access').delete().eq('user_id', userId);
    if (error) { console.error('[Admin] Reset access error:', error.message); res.status(500).json({ error: 'Could not save the change' }); return; }
    await audit(req, 'feature_access_changed', `Admin reset feature access for user ${userId}`, 'info', userId);
    res.json({ ok: true });
});

// Toggle a feature for ALL users at once
router.post('/fac/set-all', requireAdmin, async (req: Request, res: Response) => {
    const { feature, enabled, userIds } = req.body ?? {};
    if (typeof feature !== 'string' || !FEATURE_KEY.test(feature) || typeof enabled !== 'boolean') { reject(req, res, 'Invalid feature access request'); return; }
    if (!enabled && (!Array.isArray(userIds) || userIds.length > 5000 || !userIds.every(isUuid))) { reject(req, res, 'Invalid user list'); return; }

    const db = getSupabaseAdmin();
    const { error } = enabled
        ? await db.from('feature_access').delete().eq('feature', feature)
        : await db.from('feature_access').upsert(
            (userIds as string[]).map(userId => ({ user_id: userId, feature, enabled: false, updated_by: req.user!.id, updated_at: new Date().toISOString() })),
            { onConflict: 'user_id,feature' });
    if (error) { console.error('[Admin] Set-all error:', error.message); res.status(500).json({ error: 'Could not save the change' }); return; }
    await audit(req, 'feature_access_changed', `Admin turned "${feature}" ${enabled ? 'on' : 'off'} for all users`, 'warning');
    res.json({ ok: true });
});

// What the Security page shows: recent events, and whether the things the site depends on are up
router.get('/security', async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    let events: unknown[] = SecurityEventService.recent(limit), stored = false;
    let canHandle = false;
    if (hasServiceKey()) {
        const cols = 'type, severity, message, ip, user_id, path, created_at';
        const q = (c: string) => serviceDb().from('security_events').select(c).order('created_at', { ascending: false }).limit(limit);
        // Events an admin has dealt with are left out unless asked for
        let { data, error } = await (req.query.handled === '1' ? q(`id, handled_at, ${cols}`) : q(`id, handled_at, ${cols}`).is('handled_at', null));
        canHandle = !error;
        if (error) ({ data, error } = await q(cols));   // the handled columns are added by script 003
        if (!error && data) {
            stored = true;
            events = (await withPeople(data as any[])).map(r => ({ id: r.id, handledAt: r.handled_at ?? null, type: r.type, severity: r.severity, message: r.message, ip: r.ip, who: r.who, path: r.path, at: r.created_at }));
        }
    }
    res.json({ events, stored, canHandle, health: HealthService.report() });
});

// Mark events as dealt with. They are hidden from the default view, never deleted.
router.post('/security/handled', requireAdmin, async (req: Request, res: Response) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(n => Number.isInteger(n) && n > 0)) { reject(req, res, 'Invalid event list'); return; }
    const { data, error } = await serviceDb().from('security_events')
        .update({ handled_at: new Date().toISOString(), handled_by: req.user!.id }).in('id', ids).is('handled_at', null).select('id');
    if (error) { console.error('[Admin] Mark handled error:', error.message); res.status(500).json({ error: 'Could not update the events. Has script 003 been run?' }); return; }
    await audit(req, 'events_handled', `Admin marked ${data?.length ?? 0} security event${data?.length === 1 ? '' : 's'} as handled`);
    res.json({ handled: data?.length ?? 0 });
});

// ── Text alerts: today's state of the SMS service, and the "declare an outage" button ──
router.get('/sms', async (_req: Request, res: Response) => {
    try { res.json(await SmsOutageService.status()); }
    catch (err) { console.error('[Admin] SMS status error:', (err as Error).message); res.status(500).json({ error: 'Could not read the SMS tables. Has docs/security/sms_001_schema.sql been run, and "sms" added to the exposed schemas?' }); }
});

// Turns text alerts off for the rest of today and emails every affected rider once. It emails riders,
// so like deleting an account it needs an authenticator code entered in the last few minutes.
router.post('/sms/outage', requireAdmin, requireFreshTwoStep, async (req: Request, res: Response) => {
    if (!SmsOutageService.configured()) { res.status(400).json({ error: 'The SMS service is not set up (SMS_SERVICE_URL)' }); return; }
    const reason = reasonOf(req);
    try {
        const r = await SmsOutageService.declare(`Declared by an admin.${reason}`, req.user!.id);
        if (!r.declared) { res.status(409).json({ error: 'Today is already declared an SMS outage. Riders have been emailed.' }); return; }
        await audit(req, 'sms_outage_declared', `Admin turned text alerts off for today and emailed ${r.emailed} rider${r.emailed === 1 ? '' : 's'}.${reason}`, 'warning');
        res.json(r);
    } catch (err) {
        console.error('[Admin] SMS outage error:', (err as Error).message);
        res.status(500).json({ error: 'Could not declare the outage' });
    }
});

// Dry run and the pilot numbers, which the SMS service rereads every 15 seconds. Anything that lets real
// texts go out, or changes who gets them, needs an authenticator code entered in the last few minutes.
// Turning dry run back on never does: it is the brake.
const PILOT_NUMBER = /^\+1\d{10}$/;
router.patch('/sms/settings', requireAdmin, async (req: Request, res: Response) => {
    if (!SmsOutageService.configured()) { res.status(400).json({ error: 'The SMS service is not set up (SMS_SERVICE_URL)' }); return; }
    const { dryRun, allowlist } = req.body ?? {};
    if (dryRun !== undefined && typeof dryRun !== 'boolean') { reject(req, res, 'Invalid dry run setting'); return; }
    let numbers: string[] | undefined;
    if (allowlist !== undefined) {
        if (!Array.isArray(allowlist) || allowlist.length > 50 || !allowlist.every(n => typeof n === 'string' && n.length <= 30)) { reject(req, res, 'Invalid pilot numbers'); return; }
        numbers = [...new Set((allowlist as string[]).map(n => n.replace(/[\s\-().]/g, '')).filter(Boolean))];
        if (!numbers.every(n => PILOT_NUMBER.test(n))) { reject(req, res, 'Pilot numbers must be Canadian numbers like +13065550111'); return; }
    }
    if (dryRun === undefined && numbers === undefined) { reject(req, res, 'Nothing to change'); return; }
    const braking = dryRun === true && numbers === undefined;
    if (!braking && Date.now() / 1000 - req.user!.twoStepAt > 10 * 60) {
        res.status(403).json({ error: 'Enter your authenticator code again to do this', code: 'fresh_two_step_required' });
        return;
    }

    const db = serviceDb().schema('sms');
    const notSetUp = 'Could not save the SMS settings. Has docs/security/sms_003_send_settings.sql been run?';
    const { data: before, error: readErr } = await db.from('settings').select('dry_run, allowlist').maybeSingle();
    if (readErr) { console.error('[Admin] SMS settings read error:', readErr.message); res.status(500).json({ error: notSetUp }); return; }
    const next = { dry_run: dryRun ?? before?.dry_run ?? true, allowlist: numbers ?? (before?.allowlist as string[] | undefined) ?? [] };
    const { error } = await db.from('settings').upsert({ id: true, ...next, updated_at: new Date().toISOString(), updated_by: req.user!.id });
    if (error) { console.error('[Admin] SMS settings save error:', error.message); res.status(500).json({ error: notSetUp }); return; }

    const who = next.allowlist.length ? `only the ${next.allowlist.length} pilot number${next.allowlist.length === 1 ? '' : 's'}` : 'every rider with text alerts on';
    const changes = [
        dryRun !== undefined && dryRun !== (before?.dry_run ?? true) && (dryRun ? 'turned dry run on: texts are recorded, not sent' : `turned dry run off: real texts go to ${who}`),
        numbers !== undefined && `set the pilot numbers to ${numbers.length ? numbers.map(n => `…${n.slice(-4)}`).join(', ') : 'none'}${next.dry_run ? '' : ` (real texts now go to ${who})`}`,
    ].filter(Boolean);
    if (changes.length) await audit(req, 'sms_settings_changed', `Admin ${changes.join('; ')}.${reasonOf(req)}`, next.dry_run ? 'info' : 'warning');
    res.json({ ok: true, settings: { dryRun: next.dry_run, allowlist: next.allowlist } });
});

export default router;
