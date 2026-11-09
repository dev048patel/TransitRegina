/*
  Analytics API Routes
  Beacon-based visitor tracking endpoints.
*/

import { Router, Request, Response } from 'express';
import { registerSession, heartbeat, getVisitorRecords, getAnalyticsSummary } from '../middleware/visitorTracker';
import { requireAuth, verifyRequest } from '../middleware/requireAuth';
import { serviceDb } from '../../models/lib/serverDb';
import { requireStaff } from '../middleware/requireAdmin';
import { clientIp, rateLimit, isDateOnly, reject } from '../middleware/security';
import { cleanEvent, cleanPage, cleanSession, deviceOf, isBot, saveEvents, visitorId, type UsageRow } from '../../models/services/UsageEvents';

const router = Router();

const trackLimit = rateLimit('analytics', 120);

/** The signed-in user, taken from the login token if one was sent — never from the request body. */
async function signedInUserId(req: Request): Promise<string | undefined> {
    const user = await verifyRequest(req);
    return user && user !== 'unavailable' ? user.id : undefined;
}

/**
 * POST /api/analytics/beacon
 * Called once when a user opens the site. Creates or reactivates their session.
 */
router.post('/beacon', trackLimit, async (req: Request, res: Response) => {
    try {
        const ip = clientIp(req);
        const userAgent = (req.headers['user-agent'] || 'Unknown').slice(0, 300);
        const page = cleanPage(req.body?.page) ?? '/';
        const userId = await signedInUserId(req);

        const sessionId = await registerSession(ip, userAgent, page, userId);
        res.json({ ok: true, sessionId });
    } catch (error) {
        console.error('Beacon error:', error);
        res.status(500).json({ error: 'Failed to register session' });
    }
});

/**
 * POST /api/analytics/heartbeat
 * Called every 60s by the frontend to keep the session alive.
 */
router.post('/heartbeat', trackLimit, async (req: Request, res: Response) => {
    try {
        const ip = clientIp(req);
        const userAgent = (req.headers['user-agent'] || 'Unknown').slice(0, 300);
        const page = cleanPage(req.body?.page) ?? undefined;
        const userId = await signedInUserId(req);

        await heartbeat(ip, userAgent, page, userId);
        res.json({ ok: true });
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ error: 'Failed to update heartbeat' });
    }
});

/**
 * POST /api/analytics/events  { events: [{ kind, page?, session?, detail? }] }  (up to 20)
 * What the rider did. The app sends these in small batches. Only allowed kinds and fields are kept (see
 * UsageEvents); who did it comes from the login token or the daily anonymous id, never from the request body.
 */
const MAX_BATCH = 20;
router.post('/events', rateLimit('usage-events', 120), async (req: Request, res: Response) => {
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
    const list = req.body?.events;
    if (!Array.isArray(list) || list.length > MAX_BATCH) { reject(req, res, `Send 1 to ${MAX_BATCH} events`); return; }
    if (isBot(userAgent)) { res.status(204).end(); return; }   // crawlers and scripts are not riders

    const userId = await signedInUserId(req);
    const visitor = visitorId(clientIp(req), userAgent, userId), device = deviceOf(userAgent);
    const rows: UsageRow[] = [];
    for (const e of list) {
        const clean = cleanEvent(e?.kind, e?.detail);
        if (clean) rows.push({ visitor, user_id: userId ?? null, session: cleanSession(e?.session), kind: clean.kind, page: cleanPage(e?.page), device, detail: clean.detail });
    }
    await saveEvents(rows);
    res.status(204).end();
});

/**
 * POST /api/analytics/report  { kind, stop?, route?, bus?, note?, shown? }
 * A rider tells us something is wrong ("the bus didn't come"). Goes to the admin Reports inbox with the stop, route
 * and what the app showed. Signed in or not; who it was comes from the login token, never the body.
 */
const REPORT_KINDS = ['bus_no_show', 'wrong_time', 'stop_problem', 'app_problem', 'other'];
router.post('/report', rateLimit('rider-report', 5), async (req: Request, res: Response) => {
    const { kind, stop, route, bus, note, shown } = req.body ?? {};
    const optional = (v: unknown, re: RegExp) => v === undefined || v === null || v === '' || (typeof v === 'string' && re.test(v));
    if (!REPORT_KINDS.includes(kind) || !optional(stop, /^[0-9]{1,6}$/) || !optional(route, /^[A-Za-z0-9>]{1,30}$/) || !optional(bus, /^[0-9]{1,8}$/)
        || (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 500)) || (shown !== undefined && (typeof shown !== 'string' || shown.length > 80))) {
        reject(req, res, 'Invalid report');
        return;
    }
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
    const userId = await signedInUserId(req);
    const row = {
        user_id: userId ?? null, visitor: visitorId(clientIp(req), userAgent, userId), kind,
        stop: stop || null, route: route || null, bus: bus || null, note: typeof note === 'string' && note.trim() ? note.trim() : null,
        context: { page: cleanPage(req.body?.page), shown: typeof shown === 'string' ? shown : null, device: deviceOf(userAgent) },
    };
    const { error } = await serviceDb().from('rider_reports').insert(row);
    if (error) { console.error('[Reports] Not saved:', error.message); res.status(503).json({ error: 'Your report could not be sent right now. Please try again later.' }); return; }
    res.json({ ok: true });
});

/**
 * GET /api/analytics/visitors
 * Returns unique visitor sessions (newest first). Admins only: this is personal data.
 */
router.get('/visitors', requireAuth, requireStaff, async (req: Request, res: Response) => {
    try {
        const from = req.query.from as string | undefined;
        const to = req.query.to as string | undefined;
        if ((from && !isDateOnly(from)) || (to && !isDateOnly(to))) { reject(req, res, 'Dates must look like 2026-01-31'); return; }
        const records = await getVisitorRecords(from, to);
        res.json(records);
    } catch (error) {
        console.error('Error fetching visitor records:', error);
        res.status(500).json({ error: 'Failed to fetch visitor data' });
    }
});

/**
 * GET /api/analytics/summary
 * Returns aggregated analytics.
 */
router.get('/summary', requireAuth, requireStaff, async (req: Request, res: Response) => {
    try {
        const from = req.query.from as string | undefined;
        const to = req.query.to as string | undefined;
        if ((from && !isDateOnly(from)) || (to && !isDateOnly(to))) { reject(req, res, 'Dates must look like 2026-01-31'); return; }
        const summary = await getAnalyticsSummary(from, to);
        res.json(summary);
    } catch (error) {
        console.error('Error fetching analytics summary:', error);
        res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
});

export default router;
