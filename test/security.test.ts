/**
 * Security tests for the backend API.  Run:  npm test
 *
 * The real Express app is started against a small stand-in for Supabase (below), so the
 * tests exercise the actual guards, validation and alerting end to end without touching
 * any real data.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const SUSPENDED = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const NEWCOMER = '55555555-5555-4555-8555-555555555555';
const VIEWER = '66666666-6666-4666-8666-666666666666';
/** Must match SITE.TERMS_VERSION in src/models/data/legal.ts */
const TERMS = '2026-10-17.2';
/** A token shaped like Supabase's: the middle part says whether the login passed the second step (aal2). */
const jwt = (sub: string, aal: 'aal1' | 'aal2', codeAgeSeconds = 30) =>
    ['e30', Buffer.from(JSON.stringify({ sub, aal, amr: aal === 'aal2' ? [{ method: 'password', timestamp: 1 }, { method: 'totp', timestamp: Math.floor(Date.now() / 1000) - codeAgeSeconds }] : [{ method: 'password', timestamp: 1 }] })).toString('base64url'), 'signature'].join('.');
const T = { admin: jwt(ADMIN, 'aal2'), adminStaleCode: jwt(ADMIN, 'aal2', 3600), adminDayOldCode: jwt(ADMIN, 'aal2', 13 * 3600), adminNoTwoStep: jwt(ADMIN, 'aal1'), user: jwt(USER, 'aal1'), suspended: jwt(SUSPENDED, 'aal1'), newcomer: jwt(NEWCOMER, 'aal1'),
    viewer: jwt(VIEWER, 'aal2'), viewerNoTwoStep: jwt(VIEWER, 'aal1'), viewerDayOldCode: jwt(VIEWER, 'aal2', 13 * 3600) };
/** `terms`: the Terms version on the account's profile (everyone has agreed except the newcomer) */
const TOKENS: Record<string, { id: string; role: string; status: string; terms?: string | null }> = {
    [T.admin]: { id: ADMIN, role: 'admin', status: 'active' },
    [T.adminNoTwoStep]: { id: ADMIN, role: 'admin', status: 'active' },
    [T.adminStaleCode]: { id: ADMIN, role: 'admin', status: 'active' },
    [T.adminDayOldCode]: { id: ADMIN, role: 'admin', status: 'active' },
    [T.user]: { id: USER, role: 'user', status: 'active' },
    [T.suspended]: { id: SUSPENDED, role: 'user', status: 'suspended' },
    [T.newcomer]: { id: NEWCOMER, role: 'user', status: 'active', terms: null },
    [T.viewer]: { id: VIEWER, role: 'viewer', status: 'active' },
    [T.viewerNoTwoStep]: { id: VIEWER, role: 'viewer', status: 'active' },
    [T.viewerDayOldCode]: { id: VIEWER, role: 'viewer', status: 'active' },
};
/** Switch for one test: the terms columns have not been added to the database yet */
let termsColumnMissing = false;

/* ── stand-in Supabase: just enough of the auth and REST API, and a log of what was asked ── */
const calls: { method: string; url: string; auth: string; body: any }[] = [];
/** Rows the stand-in returns for the stored event log (empty unless a test fills it). */
let storedEvents: any[] = [];
/** Switches for single tests: the profile lookup failing; the role of the account being changed. */
let profilesDown = false;
let targetRole: string | null = null;
/** Stand-in live bus feed: counts how often it is asked, and moves the bus each time. */
let feedHits = 0;
let feedDown = false;   // the feed answers 503 while set
/** Switch for single tests: answers chosen requests (an array, an object, or [status, body]); undefined falls through. */
let answer: ((method: string, url: string, body: any) => unknown) | null = null;
const fake = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
        const url = req.url ?? '', auth = (req.headers.authorization ?? '').replace('Bearer ', '');
        let body: any = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        calls.push({ method: req.method ?? '', url, auth, body });
        const send = (code: number, data: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
        const single = (req.headers.accept ?? '').includes('vnd.pgrst.object');

        if (url.startsWith('/feed')) {
            if (feedDown) return send(503, { error: 'unavailable' });
            feedHits++;
            return send(200, [{ properties: { b: 'bus-1', dir: 0, speed: 10, r: '7', line: 'x' }, geometry: { coordinates: [-104.6, 50.4 + feedHits / 1000] } }]);
        }
        if (url.startsWith('/auth/v1/user')) {
            const u = TOKENS[auth];
            return u ? send(200, { id: u.id, aud: 'authenticated', role: 'authenticated', email: `${u.role}@example.com` }) : send(401, { msg: 'invalid token' });
        }
        if (url.startsWith('/auth/v1/admin/users/')) return send(200, { id: url.split('/').pop() });
        const custom = answer?.(req.method ?? '', url, body);
        if (custom !== undefined) {
            if (Array.isArray(custom) && custom.length === 2 && typeof custom[0] === 'number') return send(custom[0], custom[1]);
            return send(200, single && Array.isArray(custom) ? custom[0] : custom);
        }
        // Text alerts need approval: unless a test says otherwise, everyone asked about is approved
        if (url.startsWith('/rest/v1/feature_access') && req.method === 'GET' && url.includes('feature=eq.sms_alerts') && url.includes('enabled=eq.true'))
            return send(200, (/user_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url))?.[1] ?? '').split(',').filter(Boolean).map(id => ({ user_id: id.replace(/"/g, '') })));
        if (url.startsWith('/auth/v1/token')) {
            return body?.email === 'rider@example.com' && body?.password === 'correct-password'
                ? send(200, { access_token: T.user, refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, user: { id: USER, aud: 'authenticated', email: body.email } })
                : send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        }
        if (url.startsWith('/rest/v1/profiles') && req.method === 'GET' && profilesDown) return send(500, { message: 'database unavailable' });
        if (url.startsWith('/rest/v1/profiles') && req.method === 'GET' && targetRole && url.includes(OTHER) && url.includes('select=role') && !url.includes('account_status')) return send(200, [{ role: targetRole }]);
        if (url.startsWith('/rest/v1/profiles') && req.method === 'GET' && single) {
            const id = /id=eq\.([0-9a-f-]+)/.exec(url)?.[1];
            const u = Object.values(TOKENS).find(t => t.id === id);
            // requireAuth reads role, status and Terms agreement in one query (two if the terms column is missing)
            if (u && url.includes('terms_version') && termsColumnMissing) return send(400, { code: '42703', message: 'column profiles.terms_version does not exist' });
            if (u && url.includes('terms_version')) return send(200, { role: u.role, account_status: u.status, terms_version: u.terms === undefined ? TERMS : u.terms });
            return u ? send(200, { role: u.role, account_status: u.status }) : send(406, { code: 'PGRST116', message: 'no rows' });
        }
        if (url.startsWith('/rest/v1/profiles') && req.method === 'GET' && url.includes('id=in.')) {
            const known = new Map(Object.values(TOKENS).map(t => [t.id, { id: t.id, full_name: null, email: `${t.role}-${t.id.slice(0, 4)}@example.com` }]));
            return send(200, [...known.values()].filter(k => url.includes(k.id)));
        }
        if (url.startsWith('/rest/v1/security_events') && req.method === 'GET') return send(200, storedEvents);
        // The real function compares digits only (010_sms_and_admin_fixes.sql)
        if (url.startsWith('/rest/v1/rpc/get_email_by_mobile')) return send(200, String(body?.mobile ?? '').replace(/\D/g, '') === '13065550199' ? 'rider@example.com' : null);
        if (req.method === 'GET' || req.method === 'HEAD') return single ? send(406, { message: 'no rows' }) : send(200, []);
        return send(req.method === 'POST' ? 201 : 200, []);
    });
});

let base = '';
let server: http.Server;
let events: typeof import('../src/models/services/SecurityEventService').SecurityEventService;
let phoneVerify: typeof import('../src/models/services/PhoneVerificationService').PhoneVerificationService;
let VerifyErr: typeof import('../src/models/services/PhoneVerificationService').VerifyError;
const mails: { subject: string; text: string }[] = [];
let nextIp = 10;
/** Each test talks from its own address so rate limits and burst counters don't leak between tests. */
const freshIp = () => `10.0.${Math.floor(nextIp / 250)}.${nextIp++ % 250}`;

async function api(method: string, p: string, opts: { token?: string; body?: unknown; ip?: string; headers?: Record<string, string>; raw?: string } = {}) {
    const res = await fetch(base + p, {
        method,
        headers: {
            ...(opts.raw === undefined ? { 'Content-Type': 'application/json' } : {}),
            'X-Forwarded-For': opts.ip ?? freshIp(),
            ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
            ...opts.headers,
        },
        body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
}
/** Calls made with the backend's own key, other than writing the security event log itself. */
const backendWrites = () => calls.filter(c => c.auth === 'service-key' && c.method !== 'GET' && !c.url.startsWith('/rest/v1/security_events'));
const settle = () => new Promise(r => setTimeout(r, 30));   // events are recorded without blocking the response

before(async () => {
    await new Promise<void>(r => fake.listen(0, '127.0.0.1', r));
    process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.TRANSIT_LIVE_API_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/feed`;
    process.env.TWILIO_AUTH_TOKEN = 'twilio-test-token';
    process.env.BACKEND_URL = 'https://api.example.test';
    process.env.ROUTE_OVERRIDES_FILE = path.join(os.tmpdir(), `route-overrides-test-${process.pid}.json`);
    // imported only now, so the modules read the settings above
    const { createApp } = await import('../src/apiApp');
    events = (await import('../src/models/services/SecurityEventService')).SecurityEventService;
    ({ PhoneVerificationService: phoneVerify, VerifyError: VerifyErr } = await import('../src/models/services/PhoneVerificationService'));
    events._setMailer(async (subject, text) => { mails.push({ subject, text }); });
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); fake.close(); });
beforeEach(() => { calls.length = 0; mails.length = 0; events._reset(); answer = null; });

/* ── who may call what ── */

const ADMIN_ONLY: [string, string, unknown?][] = [
    ['DELETE', `/api/admin/users/${OTHER}`],
    ['PATCH', `/api/admin/users/${OTHER}`, { role: 'admin' }],
    ['POST', '/api/admin/fac/set', { userId: OTHER, feature: 'weekly_planner', enabled: false }],
    ['DELETE', `/api/admin/fac/reset/${OTHER}`],
    ['POST', '/api/admin/fac/set-all', { feature: 'weekly_planner', enabled: true }],
    ['GET', '/api/admin/security'],
    ['GET', '/api/admin/overview'],
    ['GET', '/api/admin/activity'],
    ['GET', `/api/admin/users/${OTHER}`],
    ['POST', '/api/admin/reveal', { what: 'visitor addresses' }],
    ['POST', '/api/admin/security/handled', { ids: [1] }],
    ['GET', '/api/admin/routes'],
    ['PATCH', '/api/admin/routes/4', { hidden: true }],
    ['GET', '/api/analytics/visitors'],
    ['GET', '/api/analytics/summary'],
    ['GET', '/api/admin/usage'],
    ['GET', `/api/admin/users/${OTHER}/activity`],
    ['POST', '/api/sms/broadcast', { routeNum: '4', message: 'hello' }],
    ['GET', '/api/admin/sms'],
    ['POST', '/api/admin/sms/outage', { reason: 'testing' }],
];

test('admin endpoints refuse a caller with no login', async () => {
    for (const [method, p, body] of ADMIN_ONLY) {
        const r = await api(method, p, { body });
        assert.equal(r.status, 401, `${method} ${p}`);
    }
    assert.equal(backendWrites().length, 0, 'nothing but the event log may reach the database with backend rights');
});

test('admin endpoints refuse a signed-in non-admin, and record the attempt', async () => {
    for (const [method, p, body] of ADMIN_ONLY) {
        const r = await api(method, p, { body, token: T.user });
        assert.equal(r.status, 403, `${method} ${p}`);
    }
    await settle();
    assert.ok(events.recent().some(e => e.type === 'admin_denied' && e.userId === USER));
    assert.equal(calls.filter(c => c.url.includes('/auth/v1/admin/')).length, 0);
});

test('an admin who has not passed two-step sign-in cannot use admin endpoints', async () => {
    for (const [method, p, body] of ADMIN_ONLY) {
        const r = await api(method, p, { body, token: T.adminNoTwoStep });
        assert.equal(r.status, 403, `${method} ${p}`);
        assert.equal(r.json.code, 'two_step_required');
    }
    await settle();
    assert.ok(events.recent().some(e => e.type === 'admin_two_step_missing' && e.userId === ADMIN));
    assert.equal(backendWrites().length, 0);
    assert.equal(calls.filter(c => c.url.includes('/auth/v1/admin/')).length, 0);
});

test('an authenticator code entered more than 12 hours ago no longer opens admin endpoints', async () => {
    // Supabase keeps a login "passed two-step" until sign-out, so an old phone session must be asked again
    for (const [method, p, body] of ADMIN_ONLY) {
        const r = await api(method, p, { body, token: T.adminDayOldCode });
        assert.equal(r.status, 403, `${method} ${p}`);
        assert.equal(r.json.code, 'two_step_required');
    }
    assert.equal(backendWrites().length, 0);
});

test('a password-only admin login still works for ordinary signed-in features', async () => {
    assert.equal((await api('POST', '/api/sms/opt-out', { token: T.adminNoTwoStep })).status, 200);
});

test('a forged or expired token is refused', async () => {
    assert.equal((await api('GET', '/api/admin/security', { token: 'made-up' })).status, 401);
});

test('a suspended account is refused even with a valid token', async () => {
    assert.equal((await api('POST', '/api/sms/opt-out', { token: T.suspended })).status, 401);
});

test('an admin can use the admin endpoints', async () => {
    assert.equal((await api('GET', '/api/admin/security', { token: T.admin })).status, 200);
    assert.equal((await api('GET', '/api/analytics/visitors', { token: T.admin })).status, 200);
    assert.equal((await api('GET', '/api/admin/routes', { token: T.admin })).status, 200);
});

/* ── admin actions ── */

test('deleting a user works for an admin, is audited, and emails the admins', async () => {
    const r = await api('DELETE', `/api/admin/users/${OTHER}`, { token: T.admin });
    assert.equal(r.status, 200);
    assert.ok(calls.some(c => c.method === 'DELETE' && c.url === `/auth/v1/admin/users/${OTHER}` && c.auth === 'service-key'));
    assert.ok(events.recent().some(e => e.type === 'user_deleted' && e.severity === 'critical' && e.userId === ADMIN));
    assert.equal(mails.length, 1);
    assert.match(mails[0].subject, /CRITICAL/);
});

test('an admin cannot delete, demote or suspend their own account', async () => {
    assert.equal((await api('DELETE', `/api/admin/users/${ADMIN}`, { token: T.admin })).status, 400);
    assert.equal((await api('PATCH', `/api/admin/users/${ADMIN}`, { token: T.admin, body: { role: 'user' } })).status, 400);
    assert.equal((await api('PATCH', `/api/admin/users/${ADMIN}`, { token: T.admin, body: { account_status: 'suspended' } })).status, 400);
});

test('suspending a user also blocks them at the auth server', async () => {
    const r = await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.admin, body: { account_status: 'suspended' } });
    assert.equal(r.status, 200);
    const ban = calls.find(c => c.method === 'PUT' && c.url === `/auth/v1/admin/users/${OTHER}`);
    assert.ok(ban && ban.body.ban_duration !== 'none');
});

test('changing a role is recorded as critical', async () => {
    assert.equal((await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.admin, body: { role: 'admin' } })).status, 200);
    assert.ok(events.recent().some(e => e.type === 'role_changed' && e.severity === 'critical'));
});

test('feature changes record the real admin, not an id sent in the request', async () => {
    const r = await api('POST', '/api/admin/fac/set', { token: T.admin, body: { userId: OTHER, feature: 'weekly_planner', enabled: false, adminId: USER } });
    assert.equal(r.status, 200);
    const write = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/feature_access'));
    assert.equal(write?.body.updated_by, ADMIN);
});

test('bad input to admin endpoints is rejected before reaching the database', async () => {
    const bad: [string, string, unknown?][] = [
        ['DELETE', '/api/admin/users/not-a-uuid'],
        ['PATCH', `/api/admin/users/${OTHER}`, { role: 'superuser' }],
        ['PATCH', `/api/admin/users/${OTHER}`, { account_status: 'banned' }],
        ['POST', '/api/admin/fac/set', { userId: OTHER, feature: 'x; drop table', enabled: true }],
        ['POST', '/api/admin/fac/set', { userId: OTHER, feature: 'weekly_planner', enabled: 'yes' }],
        ['POST', '/api/admin/fac/set-all', { feature: 'weekly_planner', enabled: false, userIds: ['nope'] }],
        ['PATCH', '/api/admin/routes/4', { hidden: 'true' }],
        ['PATCH', '/api/admin/routes/4', { route_name: 'x'.repeat(200) }],
        ['PATCH', '/api/admin/routes/..%2F..%2Fetc', { hidden: true }],
    ];
    for (const [method, p, body] of bad) {
        calls.length = 0;
        const r = await api(method, p, { body, token: T.admin });
        assert.equal(r.status, 400, `${method} ${p} ${JSON.stringify(body)}`);
        assert.equal(backendWrites().length, 0);
    }
});

test('deleting a user or granting admin needs a freshly entered authenticator code', async () => {
    const del = await api('DELETE', `/api/admin/users/${OTHER}`, { token: T.adminStaleCode });
    assert.equal(del.status, 403);
    assert.equal(del.json.code, 'fresh_two_step_required');
    const grant = await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.adminStaleCode, body: { role: 'admin' } });
    assert.equal(grant.json.code, 'fresh_two_step_required');
    assert.equal(calls.filter(c => c.url.includes('/auth/v1/admin/')).length, 0);
    // routine admin work is not interrupted by an older code
    assert.equal((await api('GET', '/api/admin/activity', { token: T.adminStaleCode })).status, 200);
    assert.equal((await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.adminStaleCode, body: { account_status: 'suspended' } })).status, 200);
});

test('a reason given for an action is kept in the log', async () => {
    await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.admin, body: { account_status: 'suspended', reason: 'Abusive reports' } });
    assert.ok(events.recent().some(e => e.type === 'status_changed' && /Reason: Abusive reports/.test(e.message)));
});

test('marking events as handled updates only those events, keeps them, and is recorded', async () => {
    assert.equal((await api('POST', '/api/admin/security/handled', { token: T.admin, body: { ids: [7] } })).status, 200);
    assert.ok(!events.recent().some(e => e.type === 'events_handled'), 'marking nothing new is not logged');
    calls.length = 0;
    answer = (method, url) => method === 'PATCH' && url.startsWith('/rest/v1/security_events') ? [{ id: 7 }, { id: 9 }] : undefined;
    assert.equal((await api('POST', '/api/admin/security/handled', { token: T.admin, body: { ids: [7, 9] } })).status, 200);
    const write = calls.find(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/security_events'));
    assert.ok(write && /id=in\.(%28|\()7(%2C|,)9/.test(write.url), 'only the chosen events');
    assert.equal(write.body.handled_by, ADMIN);
    assert.ok(write.body.handled_at);
    assert.equal(calls.filter(c => c.method === 'DELETE').length, 0, 'events are never deleted');
    assert.ok(events.recent().some(e => e.type === 'events_handled' && e.userId === ADMIN));
    for (const ids of [[], ['1'], [0], [1.5], 'all', Array(501).fill(1)])
        assert.equal((await api('POST', '/api/admin/security/handled', { token: T.admin, body: { ids } })).status, 400, JSON.stringify(ids).slice(0, 20));
});

test('events name people by email, never by account id', async () => {
    const row = (message: string, user_id: string | null) => ({ id: 1, handled_at: null, type: 'role_changed', severity: 'critical', message, user_id, ip: null, path: null, created_at: new Date().toISOString() });
    storedEvents = [
        row(`Admin set user ${USER} to role "admin".`, ADMIN),
        row(`Admin deleted user ${OTHER} (gone@example.com). Reason: spam`, ADMIN),
        row(`Admin deleted user ${OTHER}.`, null),
    ];
    try {
        const { json } = await api('GET', '/api/admin/security', { token: T.admin });
        assert.equal(json.events[0].message, 'Admin set user user-2222@example.com to role "admin".');
        assert.equal(json.events[0].who, 'admin-1111@example.com');
        assert.equal(json.events[1].message, 'Admin deleted user gone@example.com. Reason: spam', 'a deleted account keeps the email noted at deletion');
        assert.equal(json.events[2].message, 'Admin deleted user (deleted account).');
        assert.equal(json.events[2].who, null);
        assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(json.events)), 'no account ids are sent to the page');
        const activity = await api('GET', '/api/admin/activity', { token: T.admin });
        assert.equal(activity.json[0].admin, 'admin-1111@example.com');
    } finally { storedEvents = []; }
});

test('revealing hidden personal data is recorded against the admin', async () => {
    assert.equal((await api('POST', '/api/admin/reveal', { token: T.admin, body: { what: 'visitor addresses' } })).status, 200);
    assert.ok(events.recent().some(e => e.type === 'personal_data_viewed' && e.userId === ADMIN));
});

test('the overview reports live numbers, a seven-day trend and anything needing attention', async () => {
    const r = await api('GET', '/api/admin/overview', { token: T.admin });
    assert.equal(r.status, 200);
    assert.equal(r.json.trend.length, 7);
    for (const k of ['live', 'today', 'totals', 'attention']) assert.ok(k in r.json, k);
    assert.ok(!('recent' in r.json), 'admin actions are in the Activity log, not on Home');
});

/* ── public endpoints ── */

test('public transit data needs no login', async () => {
    for (const p of ['/api/routes', '/api/stops', '/api/colors', '/api/status']) assert.equal((await api('GET', p)).status, 200, p);
});

test('stop numbers are validated', async () => {
    assert.equal((await api('GET', '/api/stop-predictions/abc')).status, 400);
    assert.equal((await api('GET', '/api/stop-predictions/0251%26x%3D1')).status, 400);
});

test('the visitor beacon ignores a user id sent in the body', async () => {
    const r = await api('POST', '/api/analytics/beacon', { body: { page: '/map', userId: OTHER } });
    assert.equal(r.status, 200);
    const write = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/visitor_sessions'));
    assert.ok(write, 'a session is stored');
    assert.equal(write.body.user_id, undefined);
});

test('the visitor beacon links the user from their login token', async () => {
    await api('POST', '/api/analytics/beacon', { body: { page: '/map' }, token: T.user });
    const write = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/visitor_sessions'));
    assert.equal(write?.body.user_id, USER);
});

test('a page value that is not a path is not stored', async () => {
    await api('POST', '/api/analytics/beacon', { body: { page: '<script>alert(1)</script>' } });
    const write = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/visitor_sessions'));
    assert.deepEqual(write?.body.pages_visited, ['/']);
});

test('push subscriptions need a login and are stored for the token owner only', async () => {
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'key', auth: 'secret', userId: OTHER };
    assert.equal((await api('POST', '/api/push/subscribe', { body: sub })).status, 401);
    assert.equal((await api('POST', '/api/push/subscribe', { body: sub, token: T.user })).status, 200);
    const write = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/push_subscriptions'));
    assert.equal(write?.body.user_id, USER);
    assert.equal(write?.auth, T.user, 'written as the user, so row-level security applies');
    assert.equal((await api('POST', '/api/push/subscribe', { body: { ...sub, endpoint: 'javascript:alert(1)' }, token: T.user })).status, 400);
});

test('the text-message webhook refuses calls without a valid Twilio signature', async () => {
    const r = await api('POST', '/api/sms/webhook', { raw: 'From=%2B13065550199&Body=START', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(r.status, 403);
    assert.equal(calls.filter(c => c.url.startsWith('/rest/v1/profiles') && c.method === 'PATCH').length, 0);
    await settle();
    assert.ok(events.recent().some(e => e.type === 'webhook_rejected'));
});

test('the text-message webhook accepts a correctly signed call', async () => {
    const twilio = (await import('twilio')).default;
    const params = { From: '+13065550199', Body: 'STOP' };
    const signature = twilio.getExpectedTwilioSignature('twilio-test-token', 'https://api.example.test/api/sms/webhook', params);
    const r = await api('POST', '/api/sms/webhook', { raw: new URLSearchParams(params).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature } });
    assert.equal(r.status, 200);
    assert.ok(calls.some(c => c.url.startsWith('/rest/v1/profiles') && c.method === 'PATCH' && c.body.sms_opted_in === false));
});

/* ── rate limits ── */

test('phone sign-in is done by the backend and never reveals the email', async () => {
    const ok = await api('POST', '/api/auth/login-mobile', { body: { mobile: '+1 306-555-0199', password: 'correct-password' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.json).sort(), ['access_token', 'refresh_token']);
    assert.ok(!JSON.stringify(ok.json).includes('rider@example.com'));
    // wrong password, unknown number and nonsense all get the same answer
    const answers = [
        await api('POST', '/api/auth/login-mobile', { body: { mobile: '+1 306-555-0199', password: 'wrong' } }),
        await api('POST', '/api/auth/login-mobile', { body: { mobile: '+1 306-555-0100', password: 'correct-password' } }),
        await api('POST', '/api/auth/login-mobile', { body: { mobile: "+1' OR 1=1 --", password: 'x' } }),
        await api('POST', '/api/auth/login-mobile', { body: {} }),
    ];
    for (const r of answers) { assert.equal(r.status, 401); assert.deepEqual(r.json, { error: 'Invalid credentials' }); }
    assert.equal((await api('POST', '/api/auth/resolve-mobile', { body: { mobile: '+1 306-555-0199' } })).status, 404, 'the old lookup is gone');
});

test('phone sign-in is limited to a few tries a minute per address', async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await api('POST', '/api/auth/login-mobile', { ip, body: { mobile: '+1 306-555-0199', password: 'wrong' } });
    const sixth = await api('POST', '/api/auth/login-mobile', { ip, body: { mobile: '+1 306-555-0199', password: 'correct-password' } });
    assert.equal(sixth.status, 429);
    assert.ok(sixth.headers.get('retry-after'));
    assert.equal((await api('POST', '/api/auth/login-mobile', { body: { mobile: '+1 306-555-0199', password: 'correct-password' } })).status, 200, 'another address is unaffected');
    await settle();
    assert.equal(events.recent().filter(e => e.type === 'rate_limited' && e.ip === ip).length, 1, 'one event per window, not one per request');
});

/* ── findings from the October 2026 audit ── */

test('the visitor is identified by their own address, not the proxy in front of the backend', async () => {
    // The visit id is a one-way hash now, so compare ids, and check the address stored with the visit
    const seen = async (chain: string) => {
        calls.length = 0;
        const id = (await api('POST', '/api/analytics/beacon', { ip: chain, body: { page: '/' } })).json.sessionId;
        return { id, ip: calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/visitor_sessions'))?.body.ip };
    };
    assert.equal((await seen('203.0.113.7, 152.233.40.1')).ip, '203.0.113.7', 'visitor, then Railway');
    const plain = await seen('203.0.113.8, 152.233.40.1'), invented = await seen('6.6.6.6, 203.0.113.8, 152.233.40.1');
    assert.equal(invented.id, plain.id, 'an address the caller invented in front is ignored');
    assert.notEqual((await seen('203.0.113.9, 152.233.40.1')).id, plain.id, 'another visitor is another id');
    assert.doesNotMatch(plain.id, /203\.0\.113/, 'the id does not contain the address');
});

test('two visitors behind the same proxy have separate rate limits', async () => {
    for (let i = 0; i < 6; i++) await api('POST', '/api/auth/login-mobile', { ip: '203.0.113.20, 152.233.40.1', body: {} });
    assert.equal((await api('POST', '/api/auth/login-mobile', { ip: '203.0.113.20, 152.233.40.1', body: {} })).status, 429);
    assert.equal((await api('POST', '/api/auth/login-mobile', { ip: '203.0.113.21, 152.233.40.1', body: {} })).status, 401);
});

test('a stream of requests without a login cannot flood the event log', async () => {
    const ip = freshIp();
    calls.length = 0;
    for (let i = 0; i < 40; i++) await api('GET', `/api/admin/overview?n=${i}`, { ip });
    await settle();
    const stored = calls.filter(c => c.method === 'POST' && c.url.startsWith('/rest/v1/security_events')).map(c => c.body.type);
    assert.deepEqual(stored.sort(), ['auth_failed', 'burst'], 'one row for the kind of event, one for the alert');
    assert.equal(mails.length, 1, 'the repeated-probing alert still fires');
});

test('changing the browser name does not create extra visitor records', async () => {
    const ip = freshIp();
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) ids.add((await api('POST', '/api/analytics/beacon', { ip, headers: { 'User-Agent': `Made-up/${i}` }, body: { page: '/' } })).json.sessionId);
    assert.equal(ids.size, 1);
});

test('push notifications can only be registered for real push services', async () => {
    const keys = { p256dh: 'k', auth: 'a' };
    for (const endpoint of ['https://127.0.0.1:8443/x', 'https://10.0.0.5/admin', 'https://backend.railway.internal/', 'https://victim.example/receive', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x', 'https://fcm.googleapis.com:8443/x'])
        assert.equal((await api('POST', '/api/push/subscribe', { token: T.user, body: { endpoint, ...keys } })).status, 400, endpoint);
    for (const endpoint of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/abc', 'https://wns2-by3p.notify.windows.com/w/?token=abc'])
        assert.equal((await api('POST', '/api/push/subscribe', { token: T.user, body: { endpoint, ...keys } })).status, 200, endpoint);
});

test('if an account\'s status cannot be read, the request is refused rather than allowed', async () => {
    profilesDown = true;
    try {
        const r = await api('POST', '/api/sms/opt-out', { token: T.suspended });
        assert.equal(r.status, 503);
        assert.equal((await api('GET', '/api/admin/overview', { token: T.admin })).status, 503);
    } finally { profilesDown = false; }
});

test('demoting or suspending another admin needs a freshly entered code', async () => {
    targetRole = 'admin';
    try {
        for (const body of [{ role: 'user' }, { account_status: 'suspended' }]) {
            const r = await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.adminStaleCode, body });
            assert.equal(r.json.code, 'fresh_two_step_required', JSON.stringify(body));
        }
        assert.equal((await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.admin, body: { role: 'user' } })).status, 200);
    } finally { targetRole = null; }
});

test('the live bus feed is fetched once and shared, and is never more than half a second old', async () => {
    await new Promise(r => setTimeout(r, 600));   // let any earlier copy expire
    feedHits = 0;
    const answers = await Promise.all(Array.from({ length: 30 }, () => api('GET', '/api/live')));
    assert.equal(feedHits, 1, '30 riders asking at once cause one request to the feed');
    assert.ok(answers.every(a => a.status === 200 && a.json.length === 1 && a.json[0].bus_id === 'bus-1'));
    const first = answers[0].json[0].lat;
    for (let i = 0; i < 5; i++) await api('GET', '/api/live');
    assert.equal(feedHits, 1, 'asks inside the same half second share the copy');
    await new Promise(r => setTimeout(r, 600));
    const later = await api('GET', '/api/live');
    assert.equal(feedHits, 2, 'after half a second the feed is asked again');
    assert.notEqual(later.json[0].lat, first, 'and the bus has moved: riders never keep seeing an old position');
});

test('a failed bus feed is an error, not an empty list, so the map keeps its buses', async () => {
    await new Promise(r => setTimeout(r, 600));   // let any earlier copy expire
    feedDown = true;
    try {
        const r = await api('GET', '/api/live');
        assert.equal(r.status, 502, 'an empty list would tell the map every bus has gone');
    } finally { feedDown = false; }
    const back = await api('GET', '/api/live');
    assert.equal(back.status, 200);
    assert.equal(back.json.length, 1, 'the next good answer is fetched straight away');
});

test('arrive-by planning checks its input and answers with a plan', async () => {
    for (const q of ['', 'from=50.42,-104.6&to=50.42,-104.56', 'from=abc&to=50.42,-104.56&time=14:13', 'from=50.42,-104.6&to=50.42,-104.56&time=25:00']) {
        assert.equal((await api('GET', `/api/plan/arrive-by?${q}`)).status, 400, q);
    }
    const r = await api('GET', '/api/plan/arrive-by?from=50.4205,-104.6&to=50.4195,-104.5655&time=14:13');
    assert.equal(r.status, 200);
    assert.ok(['planned', 'partial', 'no_service'].includes(r.json.status));
    assert.equal(r.json.arriveBy, '2:13 PM');
});

test('usage tracking with no body is a bad request, not a server error', async () => {
    const r = await fetch(base + '/api/analytics/events', { method: 'POST', headers: { 'X-Forwarded-For': freshIp() } });
    assert.equal(r.status, 400);
});

test('usage tracking is rate limited', async () => {
    const ip = freshIp(); let last = 204;
    for (let i = 0; i < 125; i++) last = (await api('POST', '/api/analytics/events', { ip, body: { events: [{ kind: 'page_view', detail: { path: '/map' } }] } })).status;
    assert.equal(last, 429);
});

/* ── transport and errors ── */

test('responses carry security headers and do not advertise Express', async () => {
    const r = await api('GET', '/api/status');
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.match(r.headers.get('strict-transport-security') ?? '', /max-age=\d+/);
    assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'/);
});

test('a website that is not on the allow list is refused', async () => {
    const r = await api('GET', '/api/status', { headers: { Origin: 'https://evil.example' } });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    const ok = await api('GET', '/api/status', { headers: { Origin: 'https://transitregina.ca' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://transitregina.ca');
});

test('oversized and malformed bodies are refused without leaking details', async () => {
    const big = await api('POST', '/api/analytics/events', { raw: JSON.stringify({ events: [{ kind: 'x'.repeat(50_000) }] }), headers: { 'Content-Type': 'application/json' } });
    assert.equal(big.status, 413);
    const broken = await api('POST', '/api/analytics/events', { raw: '{"events":', headers: { 'Content-Type': 'application/json' } });
    assert.equal(broken.status, 400);
    assert.doesNotMatch(broken.text, /SyntaxError|at JSON|node_modules/);
});

test('unknown paths answer 404 as JSON', async () => {
    const r = await api('GET', '/api/does-not-exist');
    assert.equal(r.status, 404);
    assert.deepEqual(r.json, { error: 'Not found' });
});

/* ── days are counted in Regina time, not the server's ── */

test('a Sunday-evening search in Regina is counted on Sunday, not Monday', async () => {
    const { reginaWeekday, reginaDateKey, startOfReginaDay, startOfReginaWeek } = await import('../src/models/services/ReginaTime');
    // 9 p.m. Sunday 11 Oct 2026 in Regina is 3 a.m. Monday in UTC — the bug counted it as Monday
    const sundayEvening = '2026-10-12T03:00:00Z';
    assert.equal(reginaWeekday(sundayEvening), 'Sun');
    assert.equal(reginaDateKey(sundayEvening), '2026-10-11');
    assert.equal(reginaWeekday('2026-10-12T06:00:00Z'), 'Mon', 'midnight in Regina starts Monday');
    assert.equal(reginaWeekday('2026-10-12T05:59:59Z'), 'Sun');
    // day and week boundaries
    const now = Date.parse(sundayEvening);
    assert.equal(startOfReginaDay(0, now).toISOString(), '2026-10-11T06:00:00.000Z');
    assert.equal(startOfReginaDay(-1, now).toISOString(), '2026-10-10T06:00:00.000Z');
    assert.equal(startOfReginaWeek(now).toISOString(), '2026-10-05T06:00:00.000Z', 'the week began the previous Monday');
    assert.equal(startOfReginaWeek(Date.parse('2026-10-12T06:00:00Z')).toISOString(), '2026-10-12T06:00:00.000Z');
});

/* ── alerting ── */

test('repeated probing from one address is escalated and emailed once', async () => {
    const ip = freshIp();
    for (let i = 0; i < 12; i++) await api('GET', '/api/admin/security', { ip });
    await settle();
    const burst = events.recent().filter(e => e.type === 'burst');
    assert.equal(burst.length, 1);
    assert.equal(burst[0].severity, 'critical');
    assert.equal(mails.length, 1);
});

test('alert emails are throttled so an attack cannot flood the inbox', async () => {
    for (let i = 0; i < 5; i++) await events.record({ type: 'dependency_down', severity: 'critical', message: 'Database is not working' });
    assert.equal(mails.length, 1);
    await events.record({ type: 'user_deleted', severity: 'critical', message: 'another kind still gets through' });
    assert.equal(mails.length, 2);
});

test('the security page lists recent events and system health for admins', async () => {
    await events.record({ type: 'admin_denied', severity: 'warning', message: 'test event', ip: '10.9.9.9' });
    const r = await api('GET', '/api/admin/security', { token: T.admin });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.events));
    assert.ok(Array.isArray(r.json.health.checks) && Array.isArray(r.json.health.config));
});

test('a dependency going down alerts after two failed checks and reports recovery', async () => {
    const { HealthService } = await import('../src/models/services/HealthService');
    HealthService._reset();
    delete process.env.TRANSIT_LIVE_API_URL;                       // the bus feed check now fails
    await HealthService.run();
    assert.equal(events.recent().filter(e => e.type === 'dependency_down').length, 0, 'one blip is not an outage');
    await HealthService.run();
    assert.equal(events.recent().filter(e => e.type === 'dependency_down').length, 1);
    await HealthService.run();
    assert.equal(events.recent().filter(e => e.type === 'dependency_down').length, 1, 'no repeat alerts while it stays down');
    assert.ok(HealthService.report().checks.some(c => c.name === 'Live bus feed' && !c.ok));
    process.env.TRANSIT_LIVE_API_URL = `${base}/api/routes`;         // any URL answering 200 with a JSON list
    await HealthService.run();
    assert.ok(events.recent().some(e => e.type === 'dependency_recovered'));
});

test('an account that has not agreed to the current Terms can only agree or delete itself', async () => {
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'key', auth: 'secret' };
    const blocked = await api('POST', '/api/push/subscribe', { body: sub, token: T.newcomer });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.error, 'terms_required');
    assert.ok(!calls.some(c => c.url.startsWith('/rest/v1/push_subscriptions') && c.auth === T.newcomer), 'nothing written before agreeing');

    const agreed = await api('POST', '/api/auth/accept-terms', { token: T.newcomer });
    assert.equal(agreed.status, 200);
    const write = calls.find(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles') && c.url.includes(NEWCOMER));
    assert.equal(write?.body.terms_version, TERMS, 'the current version is recorded');
    assert.ok(Math.abs(Date.parse(write?.body.terms_accepted_at) - Date.now()) < 60_000, "stamped with the server's clock");
    assert.notEqual(write?.auth, T.newcomer, "written by the server, not with the rider's own token");

    assert.notEqual((await api('DELETE', '/api/auth/account', { token: T.newcomer })).status, 403, 'deleting the account is always allowed');
    assert.equal((await api('POST', '/api/auth/accept-terms')).status, 401, 'agreeing needs a login');
});

test('the Terms check is skipped, not fatal, before its database columns exist', async () => {
    termsColumnMissing = true;
    try {
        const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'key', auth: 'secret' };
        assert.equal((await api('POST', '/api/push/subscribe', { body: sub, token: T.newcomer })).status, 200);
    } finally { termsColumnMissing = false; }
});

test('deleting an account or changing a password needs the current password again', async () => {
    assert.equal((await api('DELETE', '/api/auth/account', { token: T.user })).status, 401, 'no password');
    assert.equal((await api('DELETE', '/api/auth/account', { token: T.user, body: { password: 'wrong-password' } })).status, 401, 'wrong password');
    assert.ok(!calls.some(c => c.method === 'DELETE' && c.url.startsWith('/rest/v1/profiles')), 'nothing deleted');
    assert.equal((await api('POST', '/api/auth/confirm-password', { token: T.user, body: { password: 'wrong-password' } })).status, 401);
    assert.equal((await api('POST', '/api/auth/confirm-password', { body: { password: 'x' } })).status, 401, 'needs a login');
});

/* ── text alerts: the SMS service runs on its own (services/sms) ── */

/** The SMS service's address for these tests: the stand-in answers /smsvc/* like the service would. */
const smsService = () => `${process.env.VITE_SUPABASE_URL}/smsvc`;
async function withSmsService<T>(run: () => Promise<T>, url = smsService()): Promise<T> {
    Object.assign(process.env, { SMS_SERVICE_URL: url, SMS_SERVICE_TOKEN: 'sms-internal-token' });
    try { return await run(); } finally { delete process.env.SMS_SERVICE_URL; delete process.env.SMS_SERVICE_TOKEN; }
}

test('a broadcast goes through the SMS service, with its internal token', async () => {
    answer = (method, url) => url.startsWith('/smsvc/internal/broadcast') ? { ok: true, sent: 3 } : undefined;
    const r = await withSmsService(() => api('POST', '/api/sms/broadcast', { token: T.admin, body: { routeNum: '4', message: 'Detour on Albert St' } }));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, sent: 3 });
    const forwarded = calls.find(c => c.url.startsWith('/smsvc/internal/broadcast'));
    assert.equal(forwarded?.auth, 'sms-internal-token');
    assert.deepEqual(forwarded?.body, { routeNum: '4', message: 'Detour on Albert St' });
    assert.ok(!calls.some(c => c.url.startsWith('/rest/v1/weekly_schedules')), 'this API no longer looks up the recipients itself');
});

test('text alerts need approval: a rider without it cannot turn them on', async () => {
    const verified = (method: string, url: string) => method === 'GET' && url.startsWith('/rest/v1/profiles') && url.includes('select=mobile_number') ? [{ mobile_number: '+13065550111', mobile_verified: true }] : undefined;
    answer = (method, url) => {
        if (method === 'GET' && url.startsWith('/rest/v1/feature_access') && url.includes('feature=eq.sms_alerts')) return [];   // no approval row
        return verified(method, url);
    };
    const r = await api('POST', '/api/sms/opt-in', { token: T.user });
    assert.equal(r.status, 403);
    assert.match(r.json.error, /approval/);
    assert.ok(!calls.some(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles')), 'sms_opted_in is not turned on');

    answer = verified;   // the stand-in approves by default
    assert.equal((await api('POST', '/api/sms/opt-in', { token: T.user })).status, 200, 'approved: they can turn texts on');
});

/* ── Asking for text alerts, and an admin's decision ── */

const askingRider = { full_name: 'Riley Rider', email: 'riley@example.com', mobile_number: '+13065550111', mobile_verified: true };

test('a verified rider asks for text alerts: the request waits, consent is recorded, and the admins and the rider each get one email', async () => {
    const riderMails: { to: string; subject: string; text: string; html: string }[] = [];
    const { SmsAccessService } = await import('../src/models/services/SmsAccessService');
    SmsAccessService._setMailer(async (to, subject, body) => { riderMails.push({ to, subject, text: body.text, html: body.html }); });
    let asked = false;
    answer = (method, url) => {
        if (method === 'GET' && url.startsWith('/rest/v1/profiles') && url.includes('mobile_verified')) return [askingRider];
        if (method === 'GET' && url.startsWith('/rest/v1/feature_access')) return [];
        if (method === 'GET' && url.startsWith('/rest/v1/sms_access_requests')) return asked ? [{ user_id: USER }] : [];
        if (method === 'POST' && url.startsWith('/rest/v1/sms_access_requests')) { const first = !asked; asked = true; return first ? [{ user_id: USER }] : []; }
        return undefined;
    };
    assert.equal((await api('GET', '/api/sms/access', { token: T.user })).json.status, 'none');
    const r = await api('POST', '/api/sms/access/request', { token: T.user });
    assert.deepEqual([r.status, r.json.status], [200, 'pending']);
    const insert = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/sms_access_requests'))!;
    assert.equal(insert.body.user_id ?? insert.body[0]?.user_id, USER, 'the rider comes from the login, not the body');
    assert.ok(calls.some(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles') && c.body?.sms_consent_at), 'asking is consent');
    assert.ok(!calls.some(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles') && c.body?.sms_opted_in), 'no texts until approved');
    await settle();
    assert.equal(mails.length, 1);
    assert.match(mails[0].subject, /Text alert request from Riley Rider/);
    assert.equal((await api('GET', '/api/sms/access', { token: T.user })).json.status, 'pending');

    assert.equal(riderMails.length, 1);
    assert.deepEqual([riderMails[0].to, riderMails[0].subject], ['riley@example.com', 'We got your request for text alerts']);
    assert.match(riderMails[0].text, /review your request soon/);

    await api('POST', '/api/sms/access/request', { token: T.user });   // asks again
    await settle();
    assert.equal(mails.length, 1, 'the admins are told once');
    assert.equal(riderMails.length, 1, 'and so is the rider');
    SmsAccessService._setMailer(null);
});

test('asking for text alerts needs a verified phone, and a declined rider cannot ask again', async () => {
    answer = (method, url) => method === 'GET' && url.startsWith('/rest/v1/profiles') && url.includes('mobile_verified') ? [{ ...askingRider, mobile_verified: false }] : undefined;
    assert.equal((await api('POST', '/api/sms/access/request', { token: T.user })).status, 400);
    answer = (method, url) => {
        if (method === 'GET' && url.startsWith('/rest/v1/profiles') && url.includes('mobile_verified')) return [askingRider];
        if (method === 'GET' && url.startsWith('/rest/v1/feature_access')) return [{ enabled: false }];
        return undefined;
    };
    const r = await api('POST', '/api/sms/access/request', { token: T.user });
    assert.equal(r.status, 403);
    assert.ok(!calls.some(c => c.method === 'POST' && c.url.startsWith('/rest/v1/sms_access_requests')));
});

test('an admin approves a request: texts turn on, the rider is emailed, and it is logged', async () => {
    const riderMails: { to: string; subject: string; text: string; html: string }[] = [];
    const { SmsAccessService } = await import('../src/models/services/SmsAccessService');
    SmsAccessService._setMailer(async (to, subject, body) => { riderMails.push({ to, subject, text: body.text, html: body.html }); });
    try {
        answer = (method, url) => {
            if (method === 'DELETE' && url.startsWith('/rest/v1/sms_access_requests')) return [{ user_id: USER }];
            if (method === 'PATCH' && url.startsWith('/rest/v1/profiles')) return [{ email: 'riley@example.com', full_name: 'Riley Rider', mobile_number: '+13065550111' }];
            return undefined;
        };
        assert.equal((await api('POST', `/api/admin/sms/requests/${USER}`, { token: T.viewer, body: { approve: true } })).status, 403, 'view-only admins cannot decide');
        const r = await api('POST', `/api/admin/sms/requests/${USER}`, { token: T.admin, body: { approve: true } });
        assert.equal(r.status, 200);
        const grant = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/feature_access'))!;
        assert.deepEqual([grant.body.feature, grant.body.enabled, grant.body.user_id, grant.body.updated_by], ['sms_alerts', true, USER, ADMIN]);
        const optIn = calls.find(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles'))!;
        assert.equal(optIn.body.sms_opted_in, true);
        assert.match(decodeURIComponent(optIn.url), /mobile_verified=eq\.true/, 'only a verified number');
        assert.equal(riderMails.length, 1);
        assert.deepEqual([riderMails[0].to, riderMails[0].subject], ['riley@example.com', 'Your account is ready for text alerts']);
        assert.match(riderMails[0].text, /ready to use them\. Enjoy!/);
        assert.match(riderMails[0].text, /request for text alerts has been accepted/);
        assert.match(riderMails[0].text, /306-555-0111/);
        assert.match(riderMails[0].html, /email-logo\.gif/, 'the branded design');
        await settle();
        assert.ok(events.recent().some(e => e.type === 'feature_access_changed' && /approved text alerts/.test(e.message) && e.userId === ADMIN));
    } finally { SmsAccessService._setMailer(null); }
});

test('approving someone who never asked only allows it, and declining keeps texts off without an email', async () => {
    const riderMails: string[] = [];
    const { SmsAccessService } = await import('../src/models/services/SmsAccessService');
    SmsAccessService._setMailer(async to => { riderMails.push(to); });
    try {
        await api('POST', '/api/admin/fac/set', { token: T.admin, body: { userId: OTHER, feature: 'sms_alerts', enabled: true } });   // the Features page
        assert.ok(calls.some(c => c.method === 'POST' && c.url.startsWith('/rest/v1/feature_access') && c.body.enabled === true));
        assert.ok(!calls.some(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles')), 'no texts without their consent');
        calls.length = 0;
        answer = (method, url) => method === 'DELETE' && url.startsWith('/rest/v1/sms_access_requests') ? [{ user_id: OTHER }] : undefined;
        assert.equal((await api('POST', `/api/admin/sms/requests/${OTHER}`, { token: T.admin, body: { approve: false } })).status, 200);
        assert.ok(calls.some(c => c.method === 'POST' && c.url.startsWith('/rest/v1/feature_access') && c.body.enabled === false));
        assert.ok(!calls.some(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles')));
        assert.equal(riderMails.length, 0);
    } finally { SmsAccessService._setMailer(null); }
});

test('text alerts have no switch for everyone, and resetting a person keeps their approval', async () => {
    const all = await api('POST', '/api/admin/fac/set-all', { token: T.admin, body: { feature: 'sms_alerts', enabled: true } });
    assert.equal(all.status, 400);
    assert.ok(!calls.some(c => c.url.startsWith('/rest/v1/feature_access') && c.method !== 'GET'), 'nothing changed');
    await api('DELETE', `/api/admin/fac/reset/${OTHER}`, { token: T.admin });
    const reset = calls.find(c => c.method === 'DELETE' && c.url.startsWith('/rest/v1/feature_access'))!;
    assert.match(decodeURIComponent(reset.url), /feature=neq\.sms_alerts/);
});

test('rider emails use the branded design, come from the rider address, and cannot be broken by a name', async () => {
    const { riderEmail, riderFrom, riderReplyTo } = await import('../src/models/services/RiderEmail');
    const e = riderEmail({ preview: 'Preview line', heading: 'Your request is in', greeting: 'Hi <img src=x onerror=alert(1)>,', paragraphs: ['First & second'],
        button: { label: 'Open', url: 'https://transitregina.ca/map' }, list: { title: 'What happens next:', items: [{ icon: '👀', title: 'Step one', text: 'We look.' }] } });
    assert.match(e.html, /src="https:\/\/transitregina\.ca\/email-logo\.gif"/, 'the animated logo');
    assert.match(e.html, /alt="Transit Regina"/, 'readable with images off');
    assert.ok(!e.html.includes('<img src=x'), 'a name cannot add HTML');
    assert.match(e.html, /Hi &lt;img src=x onerror=alert\(1\)&gt;,/);
    assert.match(e.html, /First &amp; second/);
    assert.match(e.html, /href="https:\/\/transitregina\.ca\/map"/);
    assert.match(e.text, /^Your request is in\n\nHi <img src=x onerror=alert\(1\)>,\n\nFirst & second\n\nOpen: https:\/\/transitregina\.ca\/map\n\nWhat happens next:\n- Step one: We look\./, 'a plain-text copy for every email');
    assert.match(e.html, /v:roundrect/, 'the button works in Outlook too');
    assert.equal(riderFrom(), 'Transit Regina <noreply@transitregina.ca>');
    assert.equal(riderReplyTo(), 'transitregina.ca@gmail.com', 'replies reach a person');
    assert.doesNotMatch(riderFrom(), /alerts@/);
});

test('the Text alerts page shows who is waiting (with what an admin needs to decide), approved and declined', async () => {
    answer = (method, url) => {
        if (method === 'GET' && url.startsWith('/rest/v1/sms_access_requests')) return [{ user_id: USER, requested_at: '2026-11-10T15:00:00Z' }];
        if (method === 'GET' && url.startsWith('/rest/v1/feature_access') && url.includes('updated_by')) return [
            { user_id: OTHER, enabled: true, updated_at: '2026-11-09T15:00:00Z', updated_by: ADMIN },
            { user_id: NEWCOMER, enabled: false, updated_at: '2026-11-08T15:00:00Z', updated_by: ADMIN },
        ];
        if (method === 'GET' && url.startsWith('/rest/v1/profiles') && url.includes('last_active')) return [
            { id: USER, full_name: 'Riley Rider', email: 'riley@example.com', mobile_number: '+13065550111', mobile_verified: true, sms_opted_in: false, account_status: 'active', created_at: '2026-10-01T00:00:00Z', last_active: '2026-11-10T14:00:00Z' },
            { id: OTHER, full_name: 'Olly Other', email: 'olly@example.com', mobile_number: '+13065550122', mobile_verified: true, sms_opted_in: true, account_status: 'active', created_at: '2026-09-01T00:00:00Z', last_active: null },
            { id: ADMIN, full_name: 'Ada Admin', email: 'ada@example.com' },
        ];
        if (method === 'GET' && url.startsWith('/rest/v1/weekly_schedules')) return [
            { user_id: USER, day_of_week: 1, enabled: true, arrive_by: '08:30:00', depart_by: null },
            { user_id: USER, day_of_week: 6, enabled: false, arrive_by: '10:00:00', depart_by: null },
        ];
        return undefined;
    };
    const r = await api('GET', '/api/admin/sms/requests', { token: T.viewer });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.pending, [{ userId: USER, at: '2026-11-10T15:00:00Z', name: 'Riley Rider', email: 'riley@example.com', phone: '+13065550111', phoneVerified: true, textsOn: false,
        accountStatus: 'active', joined: '2026-10-01T00:00:00Z', lastActive: '2026-11-10T14:00:00Z', decidedBy: null, commutes: [{ day: 1, arriveBy: '08:30', departBy: null }] }]);
    assert.deepEqual(r.json.approved.map((x: any) => [x.userId, x.decidedBy, x.textsOn]), [[OTHER, 'Ada Admin', true]]);
    assert.deepEqual(r.json.declined.map((x: any) => x.userId), [NEWCOMER]);
    assert.equal((await api('GET', '/api/admin/sms/requests', { token: T.user })).status, 403, 'riders cannot see the list');
});

/* ── Phone verification ── */

/** A stand-in for Twilio Verify: the right code is 123456, and "expired" numbers have no code waiting */
function fakeVerify(opts: { expired?: boolean; sendFails?: Error } = {}) {
    const sent: string[] = [], checked: { to: string; code: string }[] = [];
    phoneVerify._setClient({
        async send(to) { if (opts.sendFails) throw opts.sendFails; sent.push(to); },
        async check(to, code) { checked.push({ to, code }); return opts.expired ? 'expired' : code === '123456' ? 'approved' : 'wrong'; },
    });
    return { sent, checked };
}
const profileWith = (row: object) => (method: string, url: string) =>
    method === 'GET' && url.startsWith('/rest/v1/profiles') && url.includes('select=mobile_number') ? [row] : undefined;
const profileWrites = () => calls.filter(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles'));

test('a code is texted to the number on the profile, in the +1XXXXXXXXXX form', async () => {
    const v = fakeVerify();
    answer = profileWith({ mobile_number: '+1 306-555-0111', mobile_verified: false });
    const r = await api('POST', '/api/sms/verify/send', { token: T.user });
    assert.equal(r.status, 200);
    assert.deepEqual(v.sent, ['+13065550111']);
    assert.equal(profileWrites().length, 0, 'sending a code changes nothing in the database');
    phoneVerify._setClient(null);
});

test('a wrong or expired code leaves the number unverified', async () => {
    for (const [opts, code, message] of [[{}, '654321', /not right/], [{ expired: true }, '123456', /expired/]] as const) {
        calls.length = 0;
        fakeVerify(opts);
        answer = profileWith({ mobile_number: '+13065550111', mobile_verified: false });
        const r = await api('POST', '/api/sms/verify/check', { token: T.user, body: { code } });
        assert.equal(r.status, 400);
        assert.match(r.json.error, message);
        assert.equal(profileWrites().length, 0, 'mobile_verified stays false');
    }
    phoneVerify._setClient(null);
});

test('the right code marks the number verified, written by the backend', async () => {
    const v = fakeVerify();
    answer = (method, url) => {
        if (method === 'PATCH' && url.startsWith('/rest/v1/profiles')) return [{ id: USER }];
        return profileWith({ mobile_number: '+1 306-555-0111', mobile_verified: false })(method, url);
    };
    const r = await api('POST', '/api/sms/verify/check', { token: T.user, body: { code: '123456' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, phone: '+13065550111' });
    assert.deepEqual(v.checked, [{ to: '+13065550111', code: '123456' }]);
    const write = profileWrites()[0];
    assert.equal(write.auth, 'service-key');
    assert.equal(write.body.mobile_verified, true);
    assert.equal(write.body.mobile_number, '+13065550111');
    assert.ok(write.url.includes(`id=eq.${USER}`) && write.url.includes('mobile_number=eq.'), 'only if the number is still the one the code went to');
    phoneVerify._setClient(null);
});

test('a code that is not digits is refused before Twilio is asked', async () => {
    const v = fakeVerify();
    answer = profileWith({ mobile_number: '+13065550111', mobile_verified: false });
    for (const code of ['', '12', 'abcdef', '1234567890123']) {
        assert.equal((await api('POST', '/api/sms/verify/check', { token: T.user, body: { code } })).status, 400, code);
    }
    assert.equal(v.checked.length, 0);
    phoneVerify._setClient(null);
});

test('text alerts cannot be turned on until the number is verified', async () => {
    answer = profileWith({ mobile_number: '+13065550111', mobile_verified: false });
    const r = await api('POST', '/api/sms/opt-in', { token: T.user });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Verify your phone number/);
    assert.equal(profileWrites().length, 0);
});

test('Twilio refusing to send says why, and needs a signed-in rider', async () => {
    fakeVerify({ sendFails: new VerifyErr('Too many codes sent to this number. Wait 10 minutes and try again.', 429) });
    answer = profileWith({ mobile_number: '+13065550111', mobile_verified: false });
    const r = await api('POST', '/api/sms/verify/send', { token: T.user });
    assert.equal(r.status, 429);
    assert.match(r.json.error, /Too many codes/);
    assert.equal((await api('POST', '/api/sms/verify/send')).status, 401);
    phoneVerify._setClient(null);
});

test('only an admin can switch text alerts off for someone', async () => {
    const body = { userId: OTHER, feature: 'sms_alerts', enabled: false };
    assert.equal((await api('POST', '/api/admin/fac/set', { token: T.user, body })).status, 403);
    assert.equal(backendWrites().length, 0);
    assert.equal((await api('POST', '/api/admin/fac/set', { token: T.admin, body })).status, 200);
    const write = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/feature_access'));
    assert.deepEqual({ feature: write?.body.feature, enabled: write?.body.enabled, updated_by: write?.body.updated_by }, { feature: 'sms_alerts', enabled: false, updated_by: ADMIN });
});

test('a broadcast while the SMS service is down says so, and nothing else breaks', async () => {
    const r = await withSmsService(() => api('POST', '/api/sms/broadcast', { token: T.admin, body: { routeNum: '4', message: 'hello' } }), 'http://127.0.0.1:9');
    assert.equal(r.status, 503);
    assert.match(r.json.error, /not answering/);
    assert.equal((await api('GET', '/api/status')).status, 200);
});

test('declaring an SMS outage needs an authenticator code entered in the last few minutes', async () => {
    const r = await withSmsService(() => api('POST', '/api/admin/sms/outage', { token: T.adminStaleCode, body: { reason: 'testing' } }));
    assert.equal(r.status, 403);
    assert.equal(r.json.code, 'fresh_two_step_required');
    assert.ok(!calls.some(c => c.url.startsWith('/rest/v1/outage_days')));
});

/** The database as it looks on a day with one rider, alerts still to come */
const outageDay = (opts: { alreadyDeclared?: boolean } = {}) => (method: string, url: string) => {
    if (url.startsWith('/rest/v1/outage_days') && method === 'POST' && opts.alreadyDeclared) return [409, { code: '23505', message: 'duplicate key value violates unique constraint "outage_days_pkey"' }];
    if (url.startsWith('/rest/v1/weekly_schedules')) return [{ user_id: USER, arrive_by: '23:59' }];
    if (url.startsWith('/rest/v1/alerts') && method === 'GET') return [{ id: 'a1', user_id: USER }];
    if (url.startsWith('/rest/v1/trip_plans') && method === 'GET') return [{ id: 'p1', user_id: USER }];
    if (url.startsWith('/rest/v1/outage_notices') && method === 'POST') return [{ user_id: USER }];
    return undefined;
};

/* ── One-time trip texts ── */

const TRIP = { legs: [{ route: '4', boardStopId: '0742', alightStopId: '0123' }], origin: { lat: 50.44, lng: -104.61 }, destination: { lat: 50.41, lng: -104.58 }, destinationName: 'U of R' };
const riderProfile = (row: object) => (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/rest/v1/profiles') && url.includes('select=mobile_number')) return [row];
    if (url.startsWith('/smsvc/internal/trips/cancel')) return { ok: true, cancelled: 1 };
    if (url.startsWith('/smsvc/internal/trips')) return { ok: true, planId: 'p1', texts: 2, leaveAt: '2026-10-21T14:10:00Z', arriveAt: '2026-10-21T14:40:00Z', textsLeft: 8 };
    return undefined;
};

test('trip texts: an admin with a verified number and texts on gets them, through the SMS service', async () => {
    answer = riderProfile({ mobile_number: '+13065550111', mobile_verified: true, sms_opted_in: true });
    const r = await withSmsService(() => api('POST', '/api/sms/trip', { token: T.admin, body: { ...TRIP, userId: OTHER } }));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, texts: 2, leaveAt: '2026-10-21T14:10:00Z', arriveAt: '2026-10-21T14:40:00Z', textsLeft: 8 });
    const forwarded = calls.find(c => c.url.startsWith('/smsvc/internal/trips'));
    assert.equal(forwarded?.auth, 'sms-internal-token');
    assert.equal(forwarded?.body.userId, ADMIN, 'the rider is taken from the login, never the request');
    assert.deepEqual(forwarded?.body.legs, TRIP.legs);

    const cancel = await withSmsService(() => api('POST', '/api/sms/trip/cancel', { token: T.admin }));
    assert.deepEqual(cancel.json, { ok: true, cancelled: 1 });
    assert.equal(calls.find(c => c.url.startsWith('/smsvc/internal/trips/cancel'))?.body.userId, ADMIN);
});

test('trip texts: refused with the reason when the number is not verified or texts are off', async () => {
    for (const [row, code] of [[{ mobile_number: '+13065550111', mobile_verified: false, sms_opted_in: true }, 'verify_phone'], [{ mobile_number: '+13065550111', mobile_verified: true, sms_opted_in: false }, 'opt_in']] as const) {
        calls.length = 0;
        answer = riderProfile(row);
        const r = await withSmsService(() => api('POST', '/api/sms/trip', { token: T.admin, body: TRIP }));
        assert.equal(r.status, 400);
        assert.equal(r.json.code, code);
        assert.ok(!calls.some(c => c.url.startsWith('/smsvc/')), 'the SMS service is not asked');
    }
});

test('trip texts: riders who are not admins, bad trips, and a silent SMS service are refused', async () => {
    answer = riderProfile({ mobile_number: '+13065550111', mobile_verified: true, sms_opted_in: true });
    assert.equal((await withSmsService(() => api('POST', '/api/sms/trip', { token: T.user, body: TRIP }))).status, 403, 'admins only for now');
    for (const body of [{ ...TRIP, legs: [] }, { ...TRIP, legs: [{ route: '4', boardStopId: '../x', alightStopId: '1' }] }, { ...TRIP, origin: null }, { ...TRIP, destinationName: 'x'.repeat(200) }]) {
        assert.equal((await withSmsService(() => api('POST', '/api/sms/trip', { token: T.admin, body }))).status, 400, JSON.stringify(body).slice(0, 60));
    }
    const down = await withSmsService(() => api('POST', '/api/sms/trip', { token: T.admin, body: TRIP }), 'http://127.0.0.1:9');
    assert.equal(down.status, 503);
    assert.match(down.json.error, /not answering/);
});

/* ── Dry run and pilot numbers ── */

const settingsWrite = () => calls.find(c => c.url.startsWith('/rest/v1/settings') && c.method === 'POST');
const savedSettings = (row: object) => (method: string, url: string) => url.startsWith('/rest/v1/settings') && method === 'GET' ? [row] : undefined;

test('sending real texts needs a fresh authenticator code; turning dry run back on never does', async () => {
    answer = savedSettings({ dry_run: true, allowlist: [] });
    const stale = await withSmsService(() => api('PATCH', '/api/admin/sms/settings', { token: T.adminStaleCode, body: { dryRun: false } }));
    assert.equal(stale.status, 403);
    assert.equal(stale.json.code, 'fresh_two_step_required');
    assert.equal(settingsWrite(), undefined);

    const live = await withSmsService(() => api('PATCH', '/api/admin/sms/settings', { token: T.admin, body: { dryRun: false, reason: 'pilot week' } }));
    assert.equal(live.status, 200);
    const w = settingsWrite();
    assert.deepEqual({ dry_run: w?.body.dry_run, allowlist: w?.body.allowlist, updated_by: w?.body.updated_by, auth: w?.auth }, { dry_run: false, allowlist: [], updated_by: ADMIN, auth: 'service-key' });
    await settle();
    assert.ok(events.recent().some(e => e.type === 'sms_settings_changed' && /turned dry run off: real texts go to every rider/.test(e.message) && /Reason: pilot week/.test(e.message)));

    calls.length = 0;
    answer = savedSettings({ dry_run: false, allowlist: [] });
    const brake = await withSmsService(() => api('PATCH', '/api/admin/sms/settings', { token: T.adminStaleCode, body: { dryRun: true } }));
    assert.equal(brake.status, 200);
    assert.equal(settingsWrite()?.body.dry_run, true);
});

test('pilot numbers are tidied to +1XXXXXXXXXX, and anything else is refused', async () => {
    answer = savedSettings({ dry_run: true, allowlist: [] });
    const r = await withSmsService(() => api('PATCH', '/api/admin/sms/settings', { token: T.admin, body: { allowlist: ['+1 306-555-0111', '+13065550111', '+1 (306) 555-0222'] } }));
    assert.equal(r.status, 200);
    assert.deepEqual(settingsWrite()?.body.allowlist, ['+13065550111', '+13065550222']);
    assert.equal(settingsWrite()?.body.dry_run, true, 'dry run is left as it was');

    for (const body of [{ allowlist: ['306'] }, { allowlist: ['+447700900123'] }, { allowlist: 'nope' }, { dryRun: 'false' }, {}]) {
        calls.length = 0;
        const bad = await withSmsService(() => api('PATCH', '/api/admin/sms/settings', { token: T.admin, body }));
        assert.equal(bad.status, 400, JSON.stringify(body));
        assert.equal(settingsWrite(), undefined);
    }
    assert.equal((await withSmsService(() => api('PATCH', '/api/admin/sms/settings', { token: T.user, body: { dryRun: false } }))).status, 403);
});

test('an admin can turn text alerts off for the day: riders with alerts ahead get one email', async () => {
    const { SmsOutageService } = await import('../src/models/services/SmsOutageService');
    const sent: { to: string; subject: string; text: string; at: number }[] = [];
    SmsOutageService._setMailer(async emails => { for (const e of emails) sent.push({ ...e, at: calls.length }); });
    try {
        answer = outageDay();
        const r = await withSmsService(() => api('POST', '/api/admin/sms/outage', { token: T.admin, body: { reason: 'Twilio account suspended' } }));
        assert.equal(r.status, 200);
        assert.deepEqual(r.json, { declared: true, emailed: 1 });

        const declared = calls.find(c => c.url.startsWith('/rest/v1/outage_days') && c.method === 'POST');
        assert.match(declared?.body.cause, /Declared by an admin\. Reason: Twilio account suspended/);
        assert.equal(declared?.body.declared_by, ADMIN);
        assert.ok(calls.some(c => c.url.startsWith('/rest/v1/alerts') && c.method === 'PATCH' && c.body.status === 'suppressed'), 'nothing more goes out today');

        assert.equal(sent.length, 1);
        assert.equal(sent[0].to, `user-${USER.slice(0, 4)}@example.com`);
        assert.match(sent[0].subject, /^No TransitR SMS alerts today \(\w+day, \w+ \d+\)$/);
        assert.match(sent[0].text, /You can still see live bus times in the TransitR app\.[\s\S]*See live buses: https:\/\/transitregina\.ca\/map/);
        assert.match(sent[0].html ?? '', /href="https:\/\/transitregina\.ca\/map"/, 'the branded design, with a button to the map');
        const notice = calls.findIndex(c => c.url.startsWith('/rest/v1/outage_notices') && c.method === 'POST');
        assert.ok(notice >= 0 && notice < sent[0].at, 'the notice row is written before the email is sent');
        await settle();
        assert.ok(events.recent().some(e => e.type === 'sms_outage_declared' && e.userId === ADMIN));

        // A second press the same day: nobody is emailed again
        answer = outageDay({ alreadyDeclared: true });
        const again = await withSmsService(() => api('POST', '/api/admin/sms/outage', { token: T.admin, body: { reason: 'again' } }));
        assert.equal(again.status, 409);
        assert.equal(sent.length, 1);
    } finally { SmsOutageService._setMailer(null); }
});

test('the SMS service going quiet during alert hours is declared an outage automatically', async () => {
    const { SmsOutageService } = await import('../src/models/services/SmsOutageService');
    const sent: string[] = [];
    SmsOutageService._setMailer(async emails => { sent.push(...emails.map(e => e.to)); });
    const nineAm = Date.parse('2026-10-21T15:00:00Z');   // 9:00 in Regina
    try {
        const lastSeen = (minutesAgo: number) => (m: string, u: string) =>
            u.startsWith('/rest/v1/heartbeats') ? [{ last_seen: new Date(nineAm - minutesAgo * 60_000).toISOString() }] : outageDay()(m, u);
        // checked in 3 minutes ago: fine
        answer = lastSeen(3);
        assert.equal(await withSmsService(() => SmsOutageService.check(nineAm)), null);
        assert.equal(sent.length, 0);
        // not since 25 minutes ago: an outage
        calls.length = 0;
        answer = lastSeen(25);
        const cause = await withSmsService(() => SmsOutageService.check(nineAm));
        assert.match(cause ?? '', /has not checked in since/);
        assert.equal(sent.length, 1);
        // half the recent texts failing at Twilio is an outage too
        calls.length = 0; sent.length = 0;
        answer = (m, u) => u.startsWith('/rest/v1/messages') ? ['failed', 'undelivered', 'failed', 'delivered', 'delivered', 'failed'].map(status => ({ status }))
            : lastSeen(1)(m, u);
        assert.match(await withSmsService(() => SmsOutageService.check(nineAm)) ?? '', /4 of the last 6 texts failed at Twilio/);
        // before the SMS service is deployed, nothing is watched
        calls.length = 0;
        assert.equal(await SmsOutageService.check(nineAm), null);
        assert.equal(calls.length, 0);
    } finally { SmsOutageService._setMailer(null); }
});

/* ── Fraud and crowd protections (Nov 2026 review) ── */

test('one rule for phone numbers: stored +1XXXXXXXXXX, shown XXX-XXX-XXXX, typed without the +1', async () => {
    const { toStoredPhone, formatPhone, formatPhoneInput, phoneDigits } = await import('../src/models/lib/phone');
    for (const typed of ['306-201-5465', '3062015465', '(306) 201 5465', '+1 306-201-5465', '+13062015465', '1 306 201 5465'])
        assert.deepEqual([toStoredPhone(typed), formatPhone(typed)], ['+13062015465', '306-201-5465'], typed);
    for (const bad of ['306-201-546', '23062015465', '+44 20 7946 0958', '', null])
        assert.equal(toStoredPhone(bad as string | null), null, String(bad));
    assert.deepEqual(['3', '306', '3062', '306201', '3062015', '3062015465', '30620154659'].map(formatPhoneInput),
        ['3', '306', '306-2', '306-201', '306-201-5', '306-201-5465', '306-201-5465'], 'formats while typing, at most 10 digits');
    assert.equal(formatPhoneInput('+1 306-201-5465'), '306-201-5465', 'a pasted +1 is dropped (it is fixed in front of the box)');
    assert.equal(phoneDigits('+1 306-201-5465'), phoneDigits('3062015465'), 'the same number in any format is the same number');
});

test('phone sign-in works however the number is typed', async () => {
    for (const mobile of ['306-555-0199', '3065550199', '+1 (306) 555-0199'])
        assert.equal((await api('POST', '/api/auth/login-mobile', { body: { mobile, password: 'correct-password' } })).status, 200, mobile);
    const lookup = calls.filter(c => c.url.startsWith('/rest/v1/rpc/get_email_by_mobile')).map(c => c.body.mobile);
    assert.deepEqual([...new Set(lookup)], ['+13065550199'], 'looked up in the stored form');
});

test('only Canadian mobile numbers can get texts', async () => {
    const { isValidPhone } = await import('../src/controllers/routes/sms.routes');
    // The +1 is fixed (lib/phone), so the 10 digits on their own count too
    for (const ok of ['+13065550111', '+1 306-555-0111', '+1 (639) 555-0111', '+14165550111', '+16045550111', '+18675550111', '3065550111', '306-555-0111'])
        assert.equal(isValidPhone(ok), true, ok);
    // US and Caribbean +1 numbers are where SMS-pumping fraud sends paid texts
    for (const bad of ['+12125550111', '+18765550111', '+12845550111', '+16495550111', '+1306555011', '+443065550111', '306555011', '212-555-0111', ''])
        assert.equal(isValidPhone(bad), false, bad);
});

test('a code is never sent to a number outside Canada, even if it is saved on the profile', async () => {
    const v = fakeVerify();
    answer = profileWith({ mobile_number: '+1 876-555-0111', mobile_verified: false });   // Jamaica
    const r = await api('POST', '/api/sms/verify/send', { token: T.user });   // the admin's daily codes are used by the next test
    assert.equal(r.status, 400);
    assert.match(r.json.error, /only for Canadian mobile numbers/);
    assert.equal(v.sent.length, 0, 'Twilio is not asked to text it');
    phoneVerify._setClient(null);
});

test('each account gets a few codes a day, whichever network it uses', async () => {
    const v = fakeVerify();
    answer = profileWith({ mobile_number: '+1 306-555-0122', mobile_verified: false });
    // five codes are sent, each from a different address, so the per-address limit never trips
    for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/api/sms/verify/send', { token: T.admin })).status, 200, `code ${i + 1}`);
    const sixth = await api('POST', '/api/sms/verify/send', { token: T.admin });
    assert.equal(sixth.status, 429, 'the sixth code that day is refused');
    assert.equal(v.sent.length, 5, 'Twilio was asked only five times');
    assert.equal((await api('POST', '/api/sms/verify/send', { token: T.user })).status, 200, 'another account is unaffected');
    await settle();
    assert.ok(events.recent().some(e => e.type === 'rate_limited' && /sms-verify-send-account/.test(e.message) && e.userId === ADMIN), 'recorded against the account');
    phoneVerify._setClient(null);
});

test('the live bus feed has its own, much larger limit than the rest of the API', async () => {
    // Every open map asks for /api/live every 1.5 s. Under the shared 3,000-a-minute cap, about 75 riders on one
    // network (campus Wi-Fi, a mobile carrier) locked each other out of the map.
    const ip = freshIp();
    const live = await api('GET', '/api/live', { ip });
    assert.equal(live.status, 200);
    assert.equal(live.headers.get('ratelimit-limit'), String(40 * 600));
    const other = await api('GET', '/api/routes', { ip });
    assert.equal(other.headers.get('ratelimit-limit'), '3000', 'everything else keeps the shared cap');
    assert.equal(other.headers.get('ratelimit-remaining'), '2999', 'live requests do not use up the shared cap');
});

test('a signed-in request reads the profile once, not twice', async () => {
    await api('POST', '/api/sms/opt-out', { token: T.user });
    const profileReads = calls.filter(c => c.method === 'GET' && c.url.startsWith('/rest/v1/profiles') && c.auth === T.user);
    assert.equal(profileReads.length, 1, profileReads.map(c => c.url).join('\n'));
    assert.match(decodeURIComponent(profileReads[0].url), /role,account_status,terms_version/);
});

test('the website enforces its Content Security Policy', async () => {
    const { readFileSync } = await import('node:fs');
    const conf = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const headers = Object.fromEntries(conf.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    assert.ok(headers['Content-Security-Policy'], 'enforced, not report-only');
    assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
    for (const rule of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"])
        assert.ok(headers['Content-Security-Policy'].includes(rule), rule);
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(headers['Content-Security-Policy']), 'no inline scripts allowed');
});

test('failed code requests do not use up the daily quota', async () => {
    // Twilio down: the code never went out, so it doesn't count
    let v = fakeVerify({ sendFails: new Error('Twilio unavailable') });
    answer = profileWith({ mobile_number: '+1 306-555-0133', mobile_verified: false });
    for (let i = 0; i < 6; i++) assert.equal((await api('POST', '/api/sms/verify/send', { token: T.user })).status, 503, `failed send ${i + 1}`);
    // A number outside Canada is refused before Twilio; that doesn't count either
    answer = profileWith({ mobile_number: '+1 876-555-0111', mobile_verified: false });
    for (let i = 0; i < 6; i++) assert.equal((await api('POST', '/api/sms/verify/send', { token: T.user })).status, 400, `refused number ${i + 1}`);
    // Once fixed, the rider can still get a code
    v = fakeVerify();
    answer = profileWith({ mobile_number: '+1 306-555-0133', mobile_verified: false });
    assert.equal((await api('POST', '/api/sms/verify/send', { token: T.user })).status, 200);
    assert.equal(v.sent.length, 1);
    phoneVerify._setClient(null);
});

test('parallel code requests cannot get past the daily quota', async () => {
    const v = fakeVerify();
    answer = profileWith({ mobile_number: '+1 306-555-0144', mobile_verified: false });
    // The rider has had three codes today (earlier tests), so two are left: a burst of ten from many addresses,
    // all in flight at once, gets exactly two
    const burst = await Promise.all(Array.from({ length: 10 }, () => api('POST', '/api/sms/verify/send', { token: T.user })));
    const codes = burst.map(r => r.status);
    assert.equal(codes.filter(s => s === 200).length, 2, codes.join(','));
    assert.equal(codes.filter(s => s === 429).length, 8, codes.join(','));
    assert.equal(v.sent.length, 2);
    phoneVerify._setClient(null);
});

/* ── Walking paths (POST /api/walk) ── */

test('the walking path between two points follows the walkable ways', async () => {
    const from = { lat: 50.4320, lng: -104.6050 }, to = { lat: 50.4330, lng: -104.6175 };   // across Wascana Lake
    const r = await api('POST', '/api/walk', { body: { from, to } });
    assert.equal(r.status, 200);
    assert.ok(r.json.route.path.length > 2, 'more than a straight line');
    assert.deepEqual(r.json.route.path[0], from);
    assert.ok(r.json.route.meters > 1000);
    assert.equal(r.headers.get('ratelimit-limit'), '120');
});

test('a walking path request needs two points, and the location never goes in a URL', async () => {
    for (const body of [{}, { from: { lat: 50.43 }, to: { lat: 50.44, lng: -104.6 } }, { from: '50.43,-104.6', to: '50.44,-104.6' }, { from: { lat: 'x', lng: 1 }, to: { lat: 1, lng: 1 } }])
        assert.equal((await api('POST', '/api/walk', { body })).status, 400, JSON.stringify(body));
    assert.equal((await api('GET', '/api/walk?from=50.43,-104.6&to=50.44,-104.6')).status, 404, 'no GET form');
});

test('no walking path far from any walkable way: the map keeps its straight line', async () => {
    const r = await api('POST', '/api/walk', { body: { from: { lat: 50.37, lng: -104.80 }, to: { lat: 50.4495, lng: -104.6125 } } });
    assert.equal(r.status, 200);
    assert.equal(r.json.route, null);
});

/* ── Usage analytics: what riders do (Nov 2026) ── */

const usageWrites = () => calls.filter(c => c.method === 'POST' && c.url.startsWith('/rest/v1/usage_events'));
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

test('rider events keep only the allowed kinds and fields, cleaned', async () => {
    const r = await api('POST', '/api/analytics/events', { headers: { 'User-Agent': PHONE_UA }, body: { events: [
        { kind: 'place_searched', page: '/map', detail: { place: '  Cornwall Centre  ', lat: 50.44873219, lng: -104.61123, typed: 'cornw', userId: OTHER } },
        { kind: 'bus_opened', detail: { bus: '2407', route: '7', speed: 55 } },
        { kind: 'location', detail: { choice: 'maybe' } },
        { kind: 'not_a_kind', detail: { x: 1 } },
        { kind: 'sms_opt_in' },                                    // only the server may record this
        { kind: 'stop_opened', page: '<script>', detail: { stop: '0589', name: 'x'.repeat(500) } },
    ] } });
    assert.equal(r.status, 204);
    const rows = usageWrites().flatMap(c => c.body);
    assert.deepEqual(rows.map((e: any) => e.kind), ['place_searched', 'bus_opened', 'location', 'stop_opened'], 'unknown and server-only kinds are dropped');
    const search = rows[0];
    assert.deepEqual(search.detail, { place: 'Cornwall Centre', lat: 50.449, lng: -104.611 }, 'what was typed is not kept; the area is rounded to about 100 m');
    assert.equal(search.page, '/map');
    assert.equal(search.device, 'Mobile');
    assert.deepEqual(rows[1].detail, { bus: '2407', route: '7' }, 'fields not on the list are dropped');
    assert.deepEqual(rows[2].detail, {}, 'a value not on the list is dropped');
    assert.equal(rows[3].page, null, 'a page that is not a path is not stored');
    assert.equal(rows[3].detail.name.length, 80, 'text is cut to its limit');
    for (const e of rows) {
        assert.equal(e.user_id, null, 'signed out: no account, whatever the body says');
        assert.match(e.visitor, /^a:[A-Za-z0-9_-]{22}$/, 'an anonymous id');
    }
    assert.equal(usageWrites()[0].auth, 'service-key', 'written by the backend');
});

test('a signed-in rider\'s events are theirs, from the login token', async () => {
    await api('POST', '/api/analytics/events', { token: T.user, body: { events: [{ kind: 'route_selected', detail: { route: '4' } }] } });
    const row = usageWrites()[0].body[0];
    assert.equal(row.user_id, USER);
    assert.equal(row.visitor, `u:${USER}`);
});

test('crawlers are not counted, and batches are limited', async () => {
    const bot = await api('POST', '/api/analytics/events', { headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' }, body: { events: [{ kind: 'page_view', detail: { path: '/' } }] } });
    assert.equal(bot.status, 204);
    assert.equal(usageWrites().length, 0, 'nothing stored for a crawler');
    const many = Array.from({ length: 21 }, () => ({ kind: 'page_view', detail: { path: '/' } }));
    assert.equal((await api('POST', '/api/analytics/events', { body: { events: many } })).status, 400, 'at most 20 per request');
    assert.equal((await api('POST', '/api/analytics/events', { body: { events: 'page_view' } })).status, 400);
});

test('an anonymous visitor keeps one id all day, and gets a new one the next day', async () => {
    const { visitorId } = await import('../src/models/services/UsageEvents');
    const nine = new Date('2026-11-07T15:00:00Z'), tenPm = new Date('2026-11-08T04:00:00Z'), nextDay = new Date('2026-11-08T15:00:00Z');   // Regina 9 am, 10 pm, next 9 am
    const id = (ip: string, at: Date) => visitorId(ip, PHONE_UA, null, at);
    assert.equal(id('203.0.113.5', nine), id('203.0.113.5', tenPm), 'same Regina day, same id (10 pm Regina is already the next day in UTC)');
    assert.notEqual(id('203.0.113.5', nine), id('203.0.113.5', nextDay), 'a new id each day');
    assert.notEqual(id('203.0.113.5', nine), id('203.0.113.6', nine), 'another address is another visitor');
    assert.notEqual(visitorId('203.0.113.5', PHONE_UA, null, nine), visitorId('203.0.113.5', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', null, nine), 'another browser is another visitor');
    assert.equal(visitorId('203.0.113.5', PHONE_UA, USER, nine), `u:${USER}`, 'signed in: the account');
});

test("one visitor's summary is worked out from their events like the database does for a rider", async () => {
    const { summarizeEvents } = await import('../src/models/services/UsageEvents');
    const ev = (at: string, kind: string, session: string | null, detail: Record<string, unknown> = {}) => ({ at, kind, page: '/map', device: 'Mobile', session, detail });
    const s = summarizeEvents([
        ev('2026-11-07T15:00:00Z', 'page_view', 'a'), ev('2026-11-07T15:04:00Z', 'place_searched', 'a', { place: 'Lakeview' }),
        ev('2026-11-07T15:10:00Z', 'place_searched', 'a', { place: 'Lakeview' }), ev('2026-11-07T15:11:00Z', 'trip_started', 'a', { rank: 0 }),
        ev('2026-11-07T20:00:00Z', 'page_view', 'b'),   // looked once and left
        ev('2026-11-07T20:01:00Z', 'place_searched', null, { place: '' }),
    ], [['places', 'place_searched', 'place'], ['chosenRank', 'trip_started', 'rank']]);
    assert.equal(s.kinds.find(k => k.kind === 'place_searched')?.events, 3);
    assert.deepEqual(s.sessions, { sessions: 2, avg_minutes: 5.5, median_minutes: 5.5, avg_pages: 1, bounce_rate: 50 });
    assert.deepEqual(s.top.places, [{ value: 'Lakeview', events: 2, visitors: 1 }], 'empty values are not counted');
    assert.deepEqual(s.top.chosenRank, [{ value: '0', events: 1, visitors: 1 }], 'the recommended option (rank 0) still counts');
    assert.deepEqual(s.hours.find(h => h.events === 4), { weekday: 6, hour: 9, events: 4 }, 'Regina time: Saturday 9 am');
    assert.deepEqual(s.devices, [{ device: 'Mobile', visitors: 1 }]);
});

test('turning texts on and verifying a phone are recorded by the server, not the app', async () => {
    answer = profileWith({ mobile_number: '+13065550111', mobile_verified: true });
    assert.equal((await api('POST', '/api/sms/opt-in', { token: T.user })).status, 200);
    await settle();   // recorded without making the rider wait
    const row = usageWrites()[0]?.body[0];
    assert.equal(row?.kind, 'sms_opt_in');
    assert.equal(row?.user_id, USER);
    calls.length = 0;
    assert.equal((await api('POST', '/api/sms/opt-out', { token: T.user })).status, 200);
    await settle();
    assert.equal(usageWrites()[0]?.body[0]?.kind, 'sms_opt_out');
});

test('the usage page counts in the database by Regina day, and compares with the period before', async () => {
    answer = (method, url, body) => {
        if (!url.startsWith('/rest/v1/rpc/')) return undefined;
        const fn = url.split('/rpc/')[1].split('?')[0];
        const thisPeriod = body?.p_from === '2026-11-01T06:00:00.000Z' || new Date(body?.p_from).getTime() > Date.now() - 8 * 86_400_000;
        if (fn === 'usage_days') return thisPeriod
            ? [{ day: new Date().toISOString().slice(0, 10), visitors: 40, riders: 6, page_views: 900, searches: 30, trips: 9 }]
            : [{ day: '2026-01-01', visitors: 20, riders: 3, page_views: 400, searches: 10, trips: 9 }];
        if (fn === 'usage_kinds') return [{ kind: 'page_view', events: 900, visitors: 40 }, { kind: 'place_searched', events: 30, visitors: 25 }, { kind: 'suggestions_shown', events: 28, visitors: 20 }, { kind: 'trip_started', events: 9, visitors: 8 }, { kind: 'trip_texts_on', events: 2, visitors: 2 }];
        if (fn === 'usage_top' && body.p_kind === 'page_view') return [{ value: '/map', events: 700, visitors: 35 }, { value: '/', events: 200, visitors: 30 }];
        if (fn === 'usage_top' && body.p_kind === 'place_searched') return [{ value: 'Cornwall Centre', events: 12, visitors: 9 }];
        return [];
    };
    const r = await api('GET', '/api/admin/usage?days=7', { token: T.admin });
    assert.equal(r.status, 200);
    assert.equal(r.json.setup, true);
    assert.deepEqual(r.json.totals, { visitors: 40, riders: 6, pageViews: 900, searches: 30, trips: 9 });
    assert.deepEqual(r.json.previous, { visitors: 20, riders: 3, pageViews: 400, searches: 10, trips: 9 });
    assert.equal(r.json.daily.length, 7, 'every day in the range, quiet ones included');
    assert.deepEqual(r.json.funnel.map((f: any) => f.visitors), [35, 25, 20, 8, 2], 'map opened → searched → saw options → trip → texts');
    assert.deepEqual(r.json.top.places, [{ value: 'Cornwall Centre', events: 12, visitors: 9 }]);
    // The range is whole Regina days: 7 days ending tonight at Regina midnight (06:00 UTC)
    const days = calls.find(c => c.url.startsWith('/rest/v1/rpc/usage_days'))!.body;
    assert.match(days.p_from, /T06:00:00\.000Z$/);
    assert.equal((new Date(days.p_to).getTime() - new Date(days.p_from).getTime()) / 86_400_000, 7);
    for (const c of calls.filter(c => c.url.startsWith('/rest/v1/rpc/'))) assert.equal(c.auth, 'service-key');
});

test('the usage page checks its range, and says when tracking is not set up', async () => {
    for (const bad of ['0', '91', 'x', '7.5']) assert.equal((await api('GET', `/api/admin/usage?days=${bad}`, { token: T.admin })).status, 400, bad);
    answer = (method, url) => url.startsWith('/rest/v1/rpc/') ? [404, { code: 'PGRST202', message: 'Could not find the function public.usage_days' }] : undefined;
    const r = await api('GET', '/api/admin/usage', { token: T.admin });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { setup: false });
});

test('looking at one rider\'s activity is recorded', async () => {
    answer = (method, url) => url.startsWith('/rest/v1/usage_events') && method === 'GET'
        ? [{ at: '2026-11-07T15:00:00Z', kind: 'place_searched', page: '/map', device: 'Mobile', detail: { place: 'Cornwall Centre' } }] : undefined;
    const r = await api('GET', `/api/admin/users/${OTHER}/activity`, { token: T.admin });
    assert.equal(r.status, 200);
    assert.equal(r.json.events[0].detail.place, 'Cornwall Centre');
    const query = calls.find(c => c.method === 'GET' && c.url.startsWith('/rest/v1/usage_events'))!;
    assert.match(query.url, new RegExp(`user_id=eq\\.${OTHER}`), 'only that rider');
    await settle();
    assert.ok(events.recent().some(e => e.type === 'personal_data_viewed' && e.message.includes(OTHER) && e.userId === ADMIN), 'recorded against the admin who looked');
    assert.equal((await api('GET', '/api/admin/users/not-a-uuid/activity', { token: T.admin })).status, 400);
});

test('the admin home trend is counted in the database, not read row by row', async () => {
    answer = (method, url) => url.startsWith('/rest/v1/rpc/usage_days') ? [{ day: new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10), visitors: 5, riders: 1, page_views: 50, searches: 4, trips: 2 }] : undefined;
    const r = await api('GET', '/api/admin/overview', { token: T.admin });
    assert.equal(r.status, 200);
    assert.equal(r.json.trend.length, 7);
    assert.deepEqual(Object.keys(r.json.trend[0]).sort(), ['day', 'searches', 'trips', 'visitors']);
    assert.ok(!calls.some(c => c.url.startsWith('/rest/v1/feature_events')), 'the old row-by-row counter is gone');
    assert.equal(r.json.usageReady, true);
});

test('"On the app now" includes riders who only have the app open, from the 60-second heartbeat', async () => {
    const ip = freshIp(), older = new Date(Date.now() - 3 * 60_000).toISOString();
    await api('POST', '/api/analytics/heartbeat', { ip, headers: { 'User-Agent': PHONE_UA }, body: { page: '/map' } });   // signed out, just watching buses
    await api('POST', '/api/analytics/heartbeat', { token: T.user, headers: { 'User-Agent': PHONE_UA }, body: { page: '/map' } });
    await api('POST', '/api/analytics/heartbeat', { headers: { 'User-Agent': 'Googlebot/2.1' }, body: { page: '/map' } });
    answer = (method, url) => url.startsWith('/rest/v1/rpc/usage_now')
        ? [{ visitor: `u:${USER}`, user_id: USER, last_at: older, last_kind: 'place_searched', last_page: '/map', device: 'Mobile', events: 4 }] : undefined;
    const r = await api('GET', '/api/admin/usage/now', { token: T.admin });
    assert.equal(r.status, 200);
    const { visitorId } = await import('../src/models/services/UsageEvents');
    const anon = r.json.visitors.find((v: any) => v.visitor === visitorId(ip, PHONE_UA, null).slice(2));
    assert.ok(anon, 'the signed-out rider is listed though they did nothing but keep the map open');
    assert.deepEqual([anon.kind, anon.page, anon.device, anon.userId], ['still_here', '/map', 'Mobile', null]);
    const rider = r.json.visitors.filter((v: any) => v.userId === USER);
    assert.equal(rider.length, 1, 'one line per rider, not one for the action and one for the heartbeat');
    assert.equal(rider[0].kind, 'still_here', 'the heartbeat is newer than their last action');
    assert.ok(Date.parse(rider[0].at) > Date.parse(older));
    assert.ok(!r.json.visitors.some((v: any) => v.device === 'Desktop' && v.kind === 'still_here' && v.visitor?.startsWith?.('a:')), 'crawlers are not people');
});

/* ── deeper admin insights (script 012): view-only admins, reports, notes, texts, speed and errors ── */

test('a view-only admin can look at every admin page but change nothing', async () => {
    for (const p of ['/api/admin/overview', '/api/admin/usage', '/api/admin/usage/now', '/api/admin/reports', '/api/admin/activity', `/api/admin/users/${USER}`, `/api/admin/users/${OTHER}/activity`, '/api/admin/security', '/api/admin/sms/stats', '/api/analytics/summary'])
        assert.ok(![401, 403].includes((await api('GET', p, { token: T.viewer })).status), `${p} is let through`);
    const changes: [string, string, unknown?][] = [
        ['DELETE', `/api/admin/users/${OTHER}`], ['PATCH', `/api/admin/users/${OTHER}`, { role: 'admin' }], ['PATCH', `/api/admin/users/${OTHER}`, { full_name: 'X' }],
        ['POST', '/api/admin/fac/set', { userId: OTHER, feature: 'weekly_planner', enabled: false }], ['POST', '/api/admin/security/handled', { ids: [1] }],
        ['POST', '/api/admin/sms/outage', { reason: 'x' }], ['POST', `/api/admin/users/${OTHER}/notes`, { note: 'hello' }], ['DELETE', '/api/admin/notes/1'],
        ['POST', '/api/admin/reports/handled', { ids: [1] }], ['PATCH', '/api/admin/routes/4', { hidden: true }],
    ];
    for (const [method, p, body] of changes) assert.equal((await api(method, p, { token: T.viewer, body })).status, 403, `${method} ${p}`);
    // reads go out as HEAD (counts) and POST /rpc (database functions); a change is anything else
    const changed = backendWrites().filter(c => c.method !== 'HEAD' && !c.url.startsWith('/rest/v1/rpc/') && !/^\/rest\/v1\/(usage_events|visitor_sessions)/.test(c.url));   // their own visit is still counted
    assert.deepEqual(changed.map(c => `${c.method} ${c.url.split('?')[0]}`), [], 'nothing was changed');
});

test('a view-only admin needs two-step sign-in, renewed every 12 hours, like an admin', async () => {
    assert.equal((await api('GET', '/api/admin/overview', { token: T.viewerNoTwoStep })).status, 403);
    assert.equal((await api('GET', '/api/admin/overview', { token: T.viewerDayOldCode })).status, 403);
    assert.equal((await api('GET', '/api/admin/overview', { token: T.user })).status, 403, 'a rider is still refused');
});

test('granting view-only access needs a fresh code, and an admin cannot make themselves view-only', async () => {
    assert.equal((await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.adminStaleCode, body: { role: 'viewer' } })).json?.code, 'fresh_two_step_required');
    assert.equal((await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.admin, body: { role: 'viewer' } })).status, 200);
    const write = calls.find(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/profiles'));
    assert.equal(write?.body.role, 'viewer');
    assert.equal((await api('PATCH', `/api/admin/users/${ADMIN}`, { token: T.admin, body: { role: 'viewer' } })).status, 400, 'no demoting yourself');
    assert.equal((await api('PATCH', `/api/admin/users/${OTHER}`, { token: T.admin, body: { role: 'owner' } })).status, 400);
});

const reportWrites = () => calls.filter(c => c.method === 'POST' && c.url.startsWith('/rest/v1/rider_reports'));

test('a rider can report a problem, signed in or not, and only clean fields are kept', async () => {
    const r = await api('POST', '/api/analytics/report', { headers: { 'User-Agent': PHONE_UA }, body: { kind: 'bus_no_show', stop: '1234', route: '4>15', bus: '2407', note: '  Waited 20 min  ', shown: 'Due in 2 min', page: '/map', userId: OTHER } });
    assert.equal(r.status, 200);
    const row = reportWrites()[0];
    assert.equal(row.auth, 'service-key');
    assert.deepEqual({ ...row.body, visitor: undefined }, { user_id: null, visitor: undefined, kind: 'bus_no_show', stop: '1234', route: '4>15', bus: '2407', note: 'Waited 20 min', context: { page: '/map', shown: 'Due in 2 min', device: 'Mobile' } });
    assert.match(row.body.visitor, /^a:/, 'signed out: anonymous, whatever the body says');
    calls.length = 0;
    await api('POST', '/api/analytics/report', { token: T.user, body: { kind: 'app_problem' } });
    assert.equal(reportWrites()[0].body.user_id, USER, 'signed in: from the login token');
});

test('a bad report is refused before reaching the database, and reports are rate limited', async () => {
    for (const bad of [{ kind: 'spam' }, { kind: 'other', stop: '12a' }, { kind: 'other', route: '4; drop' }, { kind: 'other', bus: '-1' }, { kind: 'other', note: 'x'.repeat(501) }, { kind: 'other', note: 5 }, { kind: 'other', shown: 'x'.repeat(81) }, {}])
        assert.equal((await api('POST', '/api/analytics/report', { body: bad })).status, 400, JSON.stringify(bad).slice(0, 60));
    assert.equal(reportWrites().length, 0);
    const ip = freshIp();
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await api('POST', '/api/analytics/report', { ip, body: { kind: 'other' } })).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429], 'five a minute from one address');
});

test('the reports inbox lists open reports, marks them handled, and records who did', async () => {
    answer = (method, url) => url.startsWith('/rest/v1/rider_reports') && method === 'GET'
        ? [{ id: 7, at: '2026-11-07T15:00:00Z', user_id: USER, visitor: `u:${USER}`, kind: 'bus_no_show', stop: '1234', route: '4', bus: null, note: 'late', context: {}, handled_at: null, handled_by: null }]
        : url.startsWith('/rest/v1/rider_reports') && method === 'PATCH' ? [{ id: 7 }] : undefined;
    const r = await api('GET', '/api/admin/reports', { token: T.admin });
    assert.equal(r.status, 200);
    assert.equal(r.json.reports[0].who, `user-${USER.slice(0, 4)}@example.com`, 'named by email');
    assert.match(calls.find(c => c.method === 'GET' && c.url.startsWith('/rest/v1/rider_reports'))!.url, /handled_at=is\.null/);
    for (const bad of [[], ['7'], [0], Array(301).fill(1)]) assert.equal((await api('POST', '/api/admin/reports/handled', { token: T.admin, body: { ids: bad } })).status, 400);
    assert.equal((await api('POST', '/api/admin/reports/handled', { token: T.admin, body: { ids: [7] } })).status, 200);
    const update = calls.find(c => c.method === 'PATCH' && c.url.startsWith('/rest/v1/rider_reports'))!;
    assert.equal(update.body.handled_by, ADMIN);
    await settle();
    assert.ok(events.recent().some(e => e.type === 'reports_handled' && e.userId === ADMIN));
    answer = (method, url) => url.startsWith('/rest/v1/rider_reports') ? [404, { code: 'PGRST205', message: 'no table' }] : undefined;
    assert.deepEqual((await api('GET', '/api/admin/reports', { token: T.admin })).json, { setup: false, reports: [] }, 'before script 012');
});

test('admins can keep notes on an account; each one is recorded against that account', async () => {
    answer = (method, url) => url.startsWith('/rest/v1/admin_notes') && method === 'POST' ? [{ id: 3, at: '2026-11-08T15:00:00Z' }]
        : url.startsWith('/rest/v1/admin_notes') && method === 'DELETE' ? [{ user_id: OTHER }] : undefined;
    for (const note of ['', '   ', 'x'.repeat(1001), 7]) assert.equal((await api('POST', `/api/admin/users/${OTHER}/notes`, { token: T.admin, body: { note } })).status, 400);
    assert.equal((await api('POST', `/api/admin/users/${OTHER}/notes`, { token: T.admin, body: { note: '  Called 5 Nov  ', author: OTHER } })).status, 200);
    const insert = calls.find(c => c.method === 'POST' && c.url.startsWith('/rest/v1/admin_notes'))!;
    assert.deepEqual(insert.body, { user_id: OTHER, author: ADMIN, note: 'Called 5 Nov' }, 'the author is the signed-in admin, never the body');
    assert.equal((await api('DELETE', '/api/admin/notes/3', { token: T.admin })).status, 200);
    assert.equal((await api('DELETE', '/api/admin/notes/abc', { token: T.admin })).status, 400);
    await settle();
    const logged = calls.filter(c => c.method === 'POST' && c.url.startsWith('/rest/v1/security_events')).map(c => c.body).flat();
    assert.ok(logged.some((e: any) => e.type === 'note_added' && e.target_user === OTHER));
    assert.ok(logged.some((e: any) => e.type === 'note_deleted' && e.target_user === OTHER));
});

test('one rider in depth: texts, saved things and notes come with their activity', async () => {
    answer = (method, url) => {
        if (method !== 'GET') return undefined;
        if (url.startsWith('/rest/v1/messages')) return [{ kind: 'leave_now', status: 'failed', error_code: 30003, segments: 1, created_at: '2026-11-07T15:00:00Z' }];
        if (url.startsWith('/rest/v1/weekly_schedules')) return [{ day_of_week: 1, enabled: true, depart_by: '08:00:00', arrive_by: null, route_num: '4' }];
        if (url.startsWith('/rest/v1/admin_notes')) return [{ id: 1, at: '2026-11-07T15:00:00Z', note: 'Called', author: ADMIN }];
        return undefined;
    };
    const r = await api('GET', `/api/admin/users/${OTHER}/activity`, { token: T.admin });
    assert.equal(r.status, 200);
    assert.equal(r.json.texts[0].error_code, 30003);
    assert.equal(r.json.saved.weekly[0].route_num, '4');
    assert.equal(r.json.notes[0].author, `admin-${ADMIN.slice(0, 4)}@example.com`, 'the author is named, not an id');
    for (const c of calls.filter(c => c.method === 'GET' && /\/rest\/v1\/(messages|weekly_schedules|admin_notes|saved_destinations)/.test(c.url)))
        assert.match(c.url, new RegExp(`user_id=eq\\.${OTHER}`), `${c.url.split('?')[0]}: only that rider`);
});

test('the text message numbers fill every day, add up the cost, and count riders through setup', async () => {
    answer = (method, url, body) => {
        if (url.startsWith('/rest/v1/rpc/sms_daily')) return [{ day: body.p_to.slice(0, 10) === new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) ? '' : '', sent: 0 }].slice(0, 0).concat([{ day: new Date(new Date(body.p_to).getTime() - 18 * 3_600_000).toISOString().slice(0, 10), sent: 10, delivered: 8, failed: 2, dry_run: 0, segments: 12, cost: 0.0948 }] as any);
        if (url.startsWith('/rest/v1/rpc/sms_failures')) return [{ error_code: 30003, failed: 2 }];
        if (url.startsWith('/rest/v1/rpc/usage_kinds')) return [{ kind: 'phone_code_sent', events: 9, visitors: 6 }, { kind: 'phone_verified', events: 5, visitors: 5 }, { kind: 'sms_opt_in', events: 4, visitors: 4 }];
        return undefined;
    };
    const r = await api('GET', '/api/admin/sms/stats?days=7', { token: T.admin });
    assert.equal(r.status, 200);
    assert.equal(r.json.daily.length, 7);
    assert.deepEqual(r.json.total, { sent: 10, delivered: 8, failed: 2, segments: 12, cost: 0.0948 });
    assert.equal(r.json.daily[6].sent, 10, 'today is the last day');
    assert.deepEqual(r.json.verification.map((v: any) => v.riders), [6, 5, 4, 0]);
    assert.deepEqual(r.json.failures, [{ error_code: 30003, failed: 2 }]);
    assert.equal((await api('GET', '/api/admin/sms/stats?days=0', { token: T.admin })).status, 400);
});

test('a custom date range is whole Regina days, up to a year', async () => {
    const r = await api('GET', '/api/admin/usage?from=2026-10-01&to=2026-10-31', { token: T.admin });
    assert.equal(r.status, 200);
    const asked = calls.filter(c => c.url.startsWith('/rest/v1/rpc/usage_days')).map(c => c.body);
    assert.ok(asked.some(q => q.p_from === '2026-10-01T06:00:00.000Z' && q.p_to === '2026-11-01T06:00:00.000Z'), 'from Regina midnight, the last day included');
    assert.ok(asked.some(q => q.p_from === '2026-08-31T06:00:00.000Z' && q.p_to === '2026-10-01T06:00:00.000Z'), 'compared with the 31 days before');
    for (const bad of ['from=2026-10-31&to=2026-10-01', 'from=2025-01-01&to=2026-10-01', 'from=2026-10-01', 'from=yesterday&to=today'])
        assert.equal((await api('GET', `/api/admin/usage?${bad}`, { token: T.admin })).status, 400, bad);
});

test('who is on now and the search map come from the database, and check their input', async () => {
    (await import('../src/models/services/UsageEvents')).forgetPresence();   // earlier tests' heartbeats; this one is about the database rows
    answer = (method, url) => url.startsWith('/rest/v1/rpc/usage_now') ? [{ visitor: `u:${USER}`, user_id: USER, last_at: '2026-11-08T15:00:00Z', last_kind: 'stop_opened', last_page: '/map', device: 'Mobile', events: '4' }, { visitor: 'a:abcdefghijklmnopqrstuv', user_id: null, last_at: '2026-11-08T15:01:00Z', last_kind: 'page_view', last_page: '/', device: 'Desktop', events: 1 }]
        : url.startsWith('/rest/v1/rpc/usage_points') ? [{ lat: '50.449', lng: '-104.611', events: '12', label: 'Cornwall Centre' }] : undefined;
    const now = await api('GET', '/api/admin/usage/now', { token: T.admin });
    assert.deepEqual(now.json.visitors.map((v: any) => v.who), ['Visitor abcdef', `user-${USER.slice(0, 4)}@example.com`], 'newest first; signed-out riders stay anonymous');
    assert.equal(now.json.visitors[1].events, 4);
    const pts = await api('GET', '/api/admin/usage/points?days=30', { token: T.admin });
    assert.deepEqual(pts.json.points, [{ lat: 50.449, lng: -104.611, events: 12, label: 'Cornwall Centre' }]);
    assert.equal((await api('GET', '/api/admin/usage/points?kind=page_view', { token: T.admin })).status, 400);
    assert.equal((await api('GET', '/api/admin/usage/points?days=500', { token: T.admin })).status, 400);
});

test('the activity log filters by kind, admin and account on the server', async () => {
    await api('GET', `/api/admin/activity?type=note_added&admin=${ADMIN}&target=${OTHER}`, { token: T.admin });
    const q = decodeURIComponent(calls.find(c => c.method === 'GET' && c.url.startsWith('/rest/v1/security_events'))!.url);
    assert.match(q, /type=in\.\(note_added\)/);
    assert.match(q, new RegExp(`user_id=eq\\.${ADMIN}`));
    assert.match(q, new RegExp(`target_user\\.eq\\.${OTHER}`));
    for (const bad of ['type=auth_failed', 'admin=x', `target=${OTHER},role.eq.admin`]) assert.equal((await api('GET', `/api/admin/activity?${bad}`, { token: T.admin })).status, 400, bad);
});

test('visits, speed and errors are kept, with nothing personal in the errors', async () => {
    await api('POST', '/api/analytics/events', { body: { events: [
        { kind: 'session_start', session: 'visit_abc12345', detail: { browser: 'Safari', os: 'iOS', screen: '390x844', lang: 'en-CA', source: 'openregina.ca', installed: 'yes', connection: '4g', ip: '1.2.3.4' } },
        { kind: 'vitals', session: 'bad session!', detail: { name: 'LCP', value: 2104.56789, rating: 'good' } },
        { kind: 'vitals', detail: { name: 'XYZ', value: -5 } },
        { kind: 'timing', detail: { what: 'map_load', ms: 812 } },
        { kind: 'app_error', detail: { message: `Failed for rider@example.com, user ${OTHER}, phone +1 306-555-0111, ?token=abc123`, where: 'MapView' } },
        { kind: 'api_error', detail: { endpoint: `/api/admin/users/${OTHER}/activity?days=7`, status: 500 } },
        { kind: 'api_error', detail: { endpoint: '/api/stops/1234/predictions', status: 0 } },
    ] } });
    const rows = usageWrites().flatMap(c => c.body);
    assert.equal(rows[0].session, 'visit_abc12345');
    assert.equal(rows[0].detail.ip, undefined, 'fields not on the list are dropped');
    assert.equal(rows[0].detail.source, 'openregina.ca');
    assert.equal(rows[1].session, null, 'a malformed visit id is not stored');
    assert.deepEqual(rows[1].detail, { name: 'LCP', value: 2104.568, rating: 'good' });
    assert.deepEqual(rows[2].detail, {}, 'an unknown measurement and a negative value are dropped');
    assert.deepEqual(rows[3].detail, { what: 'map_load', ms: 812 });
    const msg = rows[4].detail.message as string;
    for (const leak of ['rider@example.com', OTHER, '306-555-0111', 'abc123']) assert.ok(!msg.includes(leak), `no ${leak} in "${msg}"`);
    assert.equal(rows[5].detail.endpoint, '/api/admin/users/:id/activity', 'no account id or query string');
    assert.equal(rows[6].detail.endpoint, '/api/stops/:n/predictions');
});

test('usage alerts: a real drop or a run of failed texts, not a quiet night', async () => {
    const { isUsageDrop, isSmsTrouble, digestText } = await import('../src/models/services/UsageAlerts');
    assert.equal(isUsageDrop(5, 100), true, 'a twentieth of last week');
    assert.equal(isUsageDrop(40, 100), false);
    assert.equal(isUsageDrop(0, 20), false, 'too few last week to tell (3 am)');
    assert.equal(isSmsTrouble(20, 8), true);
    assert.equal(isSmsTrouble(20, 4), false);
    assert.equal(isSmsTrouble(5, 5), false, 'too few to tell');
    const text = digestText({ week: { visitors: 120, riders: 20, searches: 300, trips: 80 }, before: { visitors: 100, riders: 20, searches: 0, trips: 100 }, places: [{ value: 'Cornwall Centre', events: 40 }],
        unmet: [{ place: 'Costco East', looked: 12, no_options: 5, over_hour: 3, trips: 1 }], openReports: 2, texts: { sent: 50, failed: 1, cost: 0.47 }, signups: 4 });
    for (const bit of ['120', '+20%', '−20%', 'Cornwall Centre', 'Costco East', 'Open rider reports: 2', '$0.47']) assert.ok(text.includes(bit), `digest mentions ${bit}`);
});

test('deleting an account also deletes problem reports and notes, and does not stop at a table not set up yet', async () => {
    const signedIn = { access_token: T.user, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, user: { id: USER, aud: 'authenticated', email: 'user@example.com' } };
    answer = (method, url, body) => {
        if (url.startsWith('/auth/v1/token')) return signedIn;
        if (method === 'DELETE' && url.startsWith('/rest/v1/usage_events')) return [404, { code: 'PGRST205', message: 'Could not find the table public.usage_events' }];
        return undefined;
    };
    const r = await api('DELETE', '/api/auth/account', { token: T.user, body: { password: 'correct-password' } });
    assert.equal(r.status, 200, r.text);
    const deleted = calls.filter(c => c.method === 'DELETE' && c.url.startsWith('/rest/v1/')).map(c => c.url.split('?')[0].replace('/rest/v1/', ''));
    for (const t of ['rider_reports', 'admin_notes', 'profiles']) assert.ok(deleted.includes(t), t);
    answer = (method, url) => method === 'DELETE' && url.startsWith('/rest/v1/rider_reports') ? [500, { code: 'XX000', message: 'disk full' }] : url.startsWith('/auth/v1/token') ? signedIn : undefined;
    assert.equal((await api('DELETE', '/api/auth/account', { token: T.user, body: { password: 'correct-password' } })).status, 500, 'a real failure still stops it');
});
