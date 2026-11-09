/*
  Visits (Supabase-backed): one row per visitor per Regina day, for "who is on the site now" and the Visitors page.

  - Frontend sends POST /beacon on page load and POST /heartbeat every 60s → keeps today's row alive
  - A row not seen for 30 min is "inactive"

  A visitor is the account when signed in, otherwise an anonymous id that changes daily (see UsageEvents.visitorId).
  It used to be address + browser kept forever: everyone on one Wi-Fi with the same phone was one visitor, a
  returning rider never counted again, and one rider's visits could show on another rider's account.

  Data persists in the `visitor_sessions` Supabase table; what riders do is in `usage_events`.
*/

import { serviceDb } from '../../models/lib/serverDb';
import { visitorId } from '../../models/services/UsageEvents';
import { reginaDateKey } from '../../models/services/ReginaTime';

// ─── UA Lookup Tables ──────────────────────────────
const BROWSER_CODES: [string, string][] = [
    ['Firefox/', 'Firefox'],
    ['Edg/', 'Edge'],
    ['OPR/', 'Opera'],
    ['Opera', 'Opera'],
    ['Chrome/', 'Chrome'],
    ['Safari/', 'Safari'],
    ['MSIE', 'Internet Explorer'],
    ['Trident/', 'Internet Explorer'],
];

const OS_CODES: [string, string][] = [
    ['iPhone', 'iOS (iPhone)'],
    ['iPad', 'iOS (iPad)'],
    ['Android', 'Android'],
    ['CrOS', 'Chrome OS'],
    ['Windows NT 10', 'Windows 10/11'],
    ['Windows NT', 'Windows'],
    ['Mac OS X', 'macOS'],
    ['Linux', 'Linux'],
];

const DEVICE_CODES: [string, string][] = [
    ['iPhone', 'Mobile'],
    ['Mobile', 'Mobile'],
    ['iPad', 'Tablet'],
    ['Tablet', 'Tablet'],
    ['Bot', 'Bot/Crawler'],
    ['bot', 'Bot/Crawler'],
    ['Crawler', 'Bot/Crawler'],
    ['Spider', 'Bot/Crawler'],
];


function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
    const browser = BROWSER_CODES.find(([code]) => ua.includes(code))?.[1] ?? 'Unknown';
    const os = OS_CODES.find(([code]) => ua.includes(code))?.[1] ?? 'Unknown';
    const device = DEVICE_CODES.find(([code]) => ua.includes(code))?.[1] ?? 'Desktop';
    return { browser, os, device };
}

// ─── Session Types ─────────────────────────────────
export interface VisitorSession {
    sessionId: string;
    ip: string;
    browser: string;
    os: string;
    device: string;
    firstSeen: string;
    lastSeen: string;
    status: 'active' | 'inactive';
    pagesVisited: string[];
    pageViews: number;
    userId: string | null;
    email: string | null;
    fullName: string | null;
}

// ─── Helpers ──────────────────────────────────────
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// One record per visitor per Regina day. Built from the parsed browser/system/device, not the raw text the caller
// sends, so nobody can create unlimited records by changing that text.
function createFingerprint(ip: string, userAgent: string, userId?: string): string {
    const { browser, os, device } = parseUserAgent(userAgent);
    return `${visitorId(ip, `${browser}/${os}/${device}`, userId)}|${reginaDateKey(Date.now())}`;
}

/** Map a DB row to the VisitorSession shape the frontend expects. */
function rowToSession(row: any): VisitorSession {
    return {
        sessionId: row.session_id,
        ip: row.ip,
        browser: row.browser,
        os: row.os,
        device: row.device,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        status: row.status,
        pagesVisited: row.pages_visited ?? [],
        pageViews: row.page_views,
        userId: row.user_id ?? null,
        email: row.email ?? null,
        fullName: row.full_name ?? null,
    };
}

// ─── Public API ────────────────────────────────────

/*
  Called when the frontend sends a beacon (page load).
  Creates a new session or reactivates an existing one.
*/
export async function registerSession(ip: string, userAgent: string, page?: string, userId?: string): Promise<string> {
    const sessionId = createFingerprint(ip, userAgent, userId);
    const { browser, os, device } = parseUserAgent(userAgent);
    const now = new Date().toISOString();

    // Check if session already exists
    const { data: existing } = await serviceDb()
        .from('visitor_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

    if (existing) {
        // User returned — reactivate session
        const pages: string[] = existing.pages_visited ?? [];
        if (page && !pages.includes(page) && pages.length < 50) pages.push(page);

        const updateData: any = {
            last_seen: now,
            status: 'active',
            page_views: existing.page_views + 1,
            pages_visited: pages,
        };
        // Link user_id if authenticated and not yet linked
        if (userId && !existing.user_id) updateData.user_id = userId;

        await serviceDb()
            .from('visitor_sessions')
            .update(updateData)
            .eq('session_id', sessionId);
    } else {
        // Brand new visitor
        await serviceDb()
            .from('visitor_sessions')
            .insert({
                session_id: sessionId,
                ip,
                browser,
                os,
                device,
                first_seen: now,
                last_seen: now,
                status: 'active',
                pages_visited: page ? [page] : ['/'],
                page_views: 1,
                ...(userId ? { user_id: userId } : {}),
            });
    }

    return sessionId;
}

/*
  Called every 60s by the frontend heartbeat.
  Keeps the session alive and optionally updates the current page.
*/
export async function heartbeat(ip: string, userAgent: string, page?: string, userId?: string): Promise<boolean> {
    const sessionId = createFingerprint(ip, userAgent, userId);

    const { data: session } = await serviceDb()
        .from('visitor_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

    if (!session) {
        // Session doesn't exist yet — create it via beacon
        await registerSession(ip, userAgent, page, userId);
        return true;
    }

    const pages: string[] = session.pages_visited ?? [];
    if (page && !pages.includes(page) && pages.length < 50) pages.push(page);

    const updateData: any = {
        last_seen: new Date().toISOString(),
        status: 'active',
        pages_visited: pages,
    };
    // Link user_id if authenticated and not yet linked
    if (userId && !session.user_id) updateData.user_id = userId;

    await serviceDb()
        .from('visitor_sessions')
        .update(updateData)
        .eq('session_id', sessionId);

    return true;
}

/*
  Marks sessions as inactive if no heartbeat received in 30 minutes.
*/
async function expireStaleSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString();

    await serviceDb()
        .from('visitor_sessions')
        .update({ status: 'inactive' })
        .eq('status', 'active')
        .lt('last_seen', cutoff);
}

/*
  Returns visitor sessions, optionally filtered by date range.
*/
export async function getVisitorRecords(from?: string, to?: string): Promise<VisitorSession[]> {
    await expireStaleSessions();

    // Join with profiles to get email and full_name for authenticated visitors
    let query = serviceDb()
        .from('visitor_sessions')
        .select('*, profiles:user_id(email, full_name)')
        .order('last_seen', { ascending: false });

    if (from) {
        query = query.gte('first_seen', new Date(from).toISOString());
    }
    if (to) {
        // Add 1 day so selecting "Feb 12" includes the whole day
        const toDate = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString();
        query = query.lt('first_seen', toDate);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching visitor records:', error);
        return [];
    }

    return (data ?? []).map((row: any) => {
        const profile = row.profiles;
        return {
            ...rowToSession(row),
            email: profile?.email ?? null,
            fullName: profile?.full_name ?? null,
        };
    });
}

/** A date range as Regina days ("2026-11-07" = that whole day in Regina); no dates = the last 24 hours */
function rangeOf(from?: string, to?: string): { from: string; to: string } {
    const day = (d: string, plusDays = 0) => new Date(new Date(`${d}T00:00:00-06:00`).getTime() + plusDays * 86_400_000).toISOString();
    if (!from && !to) return { from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString() };
    return { from: from ? day(from) : new Date(0).toISOString(), to: to ? day(to, 1) : new Date(Date.now() + 60_000).toISOString() };
}

/*
  Returns aggregated analytics summary.
*/
export async function getAnalyticsSummary(from?: string, to?: string) {
    await expireStaleSessions();

    // Total visitors (all time)
    const { count: totalVisitors } = await serviceDb()
        .from('visitor_sessions')
        .select('*', { count: 'exact', head: true });

    // Active now
    const { count: activeNow } = await serviceDb()
        .from('visitor_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

    // Build filtered query for date range
    let filteredQuery = serviceDb().from('visitor_sessions').select('*');

    if (from || to) {
        if (from) filteredQuery = filteredQuery.gte('first_seen', new Date(from).toISOString());
        if (to) {
            const toDate = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString();
            filteredQuery = filteredQuery.lt('first_seen', toDate);
        }
    } else {
        // Default: last 24h for breakdowns
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        filteredQuery = filteredQuery.gte('last_seen', oneDayAgo);
    }

    // Breakdowns are counted in the database (script 011): reading rows through the API stops at 1,000
    const range = rangeOf(from, to);
    const exact = await serviceDb().rpc('visit_breakdown', { p_from: range.from, p_to: range.to });
    const pages = await serviceDb().rpc('usage_top', { p_from: range.from, p_to: range.to, p_kind: 'page_view', p_key: 'path', p_limit: 10 });
    const { count: visitsInRange } = await serviceDb().from('visitor_sessions').select('*', { count: 'exact', head: true }).gte('first_seen', range.from).lt('first_seen', range.to);
    const { data: viewDays } = await serviceDb().rpc('usage_days', { p_from: range.from, p_to: range.to });

    let browsers: Record<string, number> = {}, operatingSystems: Record<string, number> = {}, devices: Record<string, number> = {};
    let topPages: { path: string; count: number }[] = [], totalPageViews = 0, visitorsInRange = visitsInRange ?? 0;
    if (!exact.error && exact.data) {
        for (const r of exact.data as { field: string; value: string; visits: number }[]) {
            const into = r.field === 'browser' ? browsers : r.field === 'os' ? operatingSystems : devices;
            into[r.value] = Number(r.visits);
        }
        topPages = ((pages.data ?? []) as { value: string; events: number }[]).map(p => ({ path: p.value, count: Number(p.events) }));
        totalPageViews = ((viewDays ?? []) as { page_views: number }[]).reduce((sum, d) => sum + Number(d.page_views), 0);
    } else {
        // Script 011 not run yet: the old way, over at most the 1,000 rows the API returns
        const { data: filtered } = await filteredQuery;
        const sessions = (filtered ?? []).map(rowToSession);
        sessions.forEach(s => { browsers[s.browser] = (browsers[s.browser] || 0) + 1; operatingSystems[s.os] = (operatingSystems[s.os] || 0) + 1; devices[s.device] = (devices[s.device] || 0) + 1; });
        const paths: Record<string, number> = {};
        sessions.forEach(s => s.pagesVisited.forEach(p => { paths[p] = (paths[p] || 0) + 1; }));
        topPages = Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, count]) => ({ path, count }));
        totalPageViews = sessions.reduce((sum, s) => sum + s.pageViews, 0);
        visitorsInRange = sessions.length;
    }

    return {
        totalVisitors: totalVisitors ?? 0,
        visitorsInRange,
        activeNow: activeNow ?? 0,
        totalPageViews,
        browsers: Object.entries(browsers).map(([name, count]) => ({ name, count })),
        operatingSystems: Object.entries(operatingSystems).map(([name, count]) => ({ name, count })),
        devices: Object.entries(devices).map(([name, count]) => ({ name, count })),
        topPages,
    };
}
