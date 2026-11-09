/**
 * UsageAlerts — the admin panel tells admins when something is wrong, and sends a weekly summary, so nobody has to
 * keep checking it. Emails go to ALERT_EMAILS through SecurityEventService.
 *
 *  - every 5 minutes (server.ts): usage in the last hour far below the same hour last week (usually an outage),
 *    and many text messages failing
 *  - Monday 8 am Regina: last week in numbers, what riders searched for, where buses served them badly, open reports
 * The bus feed and database are already watched by HealthService.
 */
import { serviceDb } from '../lib/serverDb';
import { SecurityEventService } from './SecurityEventService';
import { startOfReginaDay } from './ReginaTime';

const HOUR = 3_600_000, WEEK = 7 * 24 * HOUR;
/** Below this many actions in last week's hour, a drop means nothing (a quiet hour, not an outage) */
const MIN_BASELINE = 30;
const ALERT_EVERY_MS = 3 * HOUR;   // the same alert at most once every 3 hours
const lastSent = new Map<string, number>();

/** Usage fell to under a third of the same hour last week, when last week was busy enough to compare */
export function isUsageDrop(lastHour: number, sameHourLastWeek: number): boolean {
    return sameHourLastWeek >= MIN_BASELINE && lastHour < sameHourLastWeek / 3;
}

/** More than 30% of at least 10 recent texts failed */
export function isSmsTrouble(sent: number, failed: number): boolean {
    return sent >= 10 && failed / sent > 0.3;
}

async function countEvents(from: number, to: number): Promise<number | null> {
    const { count, error } = await serviceDb().from('usage_events').select('*', { count: 'exact', head: true })
        .gte('at', new Date(from).toISOString()).lt('at', new Date(to).toISOString());
    return error ? null : count ?? 0;
}

async function alertOnce(key: string, subject: string, text: string): Promise<void> {
    if (Date.now() - (lastSent.get(key) ?? 0) < ALERT_EVERY_MS) return;
    lastSent.set(key, Date.now());
    void SecurityEventService.record({ type: key, severity: 'warning', message: subject });
    await SecurityEventService.email(`[Transit Regina] ${subject}`, text);
}

/** The every-5-minutes check */
export async function checkUsage(now = Date.now()): Promise<void> {
    const [lastHour, lastWeek] = await Promise.all([countEvents(now - HOUR, now), countEvents(now - WEEK - HOUR, now - WEEK)]);
    if (lastHour !== null && lastWeek !== null && isUsageDrop(lastHour, lastWeek)) {
        await alertOnce('usage_drop', `Usage dropped: ${lastHour} actions in the last hour, ${lastWeek} at this time last week`,
            [`Riders did ${lastHour} things in the app in the last hour. At the same time last week it was ${lastWeek}.`,
                'A drop this big usually means something is broken: the map, the bus feed, or the last deploy.',
                '', 'Check the site, then the Security page in the admin panel.'].join('\n'));
    }
    const { data } = await serviceDb().rpc('sms_daily', { p_from: new Date(now - HOUR).toISOString(), p_to: new Date(now).toISOString() });
    const totals = ((data ?? []) as { sent: number; failed: number }[]).reduce((t, d) => ({ sent: t.sent + Number(d.sent), failed: t.failed + Number(d.failed) }), { sent: 0, failed: 0 });
    if (isSmsTrouble(totals.sent, totals.failed)) {
        await alertOnce('sms_failures', `${totals.failed} of ${totals.sent} text messages failed in the last hour`,
            [`${totals.failed} of the ${totals.sent} texts sent in the last hour did not arrive.`, 'The failure reasons are on the text-message part of the admin Security page.'].join('\n'));
    }
}

export interface DigestData {
    week: { visitors: number; riders: number; searches: number; trips: number };
    before: { visitors: number; riders: number; searches: number; trips: number };
    places: { value: string; events: number }[];
    unmet: { place: string; looked: number; no_options: number; over_hour: number; trips: number }[];
    openReports: number;
    texts: { sent: number; failed: number; cost: number } | null;
    signups: number;
}

const pct = (now: number, before: number) => before === 0 ? (now ? 'new' : 'no change') : `${now >= before ? '+' : '−'}${Math.abs(Math.round(((now - before) / before) * 100))}%`;

/** The Monday email, as plain text */
export function digestText(d: DigestData): string {
    const lines = [
        'Last week on Transit Regina (Monday to Sunday, Regina time)', '',
        `Visitors: ${d.week.visitors} (${pct(d.week.visitors, d.before.visitors)} vs the week before)`,
        `Signed-in riders: ${d.week.riders} (${pct(d.week.riders, d.before.riders)})`,
        `Place searches: ${d.week.searches} (${pct(d.week.searches, d.before.searches)})`,
        `Trips started: ${d.week.trips} (${pct(d.week.trips, d.before.trips)})`,
        `New accounts: ${d.signups}`, '',
        'Most searched places:', ...(d.places.length ? d.places.map((p, i) => `  ${i + 1}. ${p.value} (${p.events})`) : ['  none yet']), '',
        'Where buses served riders badly:',
        ...(d.unmet.length ? d.unmet.map(u => `  ${u.place}: looked ${u.looked} times, no bus ${u.no_options}, over an hour ${u.over_hour}, trips started ${u.trips}`) : ['  nothing stood out']), '',
        ...(d.texts ? [`Text messages: ${d.texts.sent} sent, ${d.texts.failed} failed, $${d.texts.cost.toFixed(2)}`] : []),
        `Open rider reports: ${d.openReports}${d.openReports ? ' (see Reports in the admin panel)' : ''}`,
        '', 'Full numbers: the Insights page in the admin panel.',
    ];
    return lines.join('\n');
}

/** Monday 8 am: gathers last week and emails it */
export async function sendWeeklyDigest(): Promise<void> {
    const db = serviceDb();
    const week = { p_from: startOfReginaDay(-7).toISOString(), p_to: startOfReginaDay(0).toISOString() };
    const before = { p_from: startOfReginaDay(-14).toISOString(), p_to: week.p_from };
    const [days, prev, places, unmet, reports, texts, signups] = await Promise.all([
        db.rpc('usage_days', week), db.rpc('usage_days', before), db.rpc('usage_top', { ...week, p_kind: 'place_searched', p_key: 'place', p_limit: 5 }),
        db.rpc('usage_unmet', { ...week, p_limit: 3 }), db.from('rider_reports').select('*', { count: 'exact', head: true }).is('handled_at', null),
        db.rpc('sms_daily', week), db.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', week.p_from).lt('created_at', week.p_to),
    ]);
    if (days.error) { console.error('[Digest] Usage not available:', days.error.message); return; }
    type Week = DigestData['week'];
    const sum = (rows: unknown): Week => ((rows ?? []) as Record<string, number>[]).reduce<Week>((t, d) => ({ visitors: t.visitors + Number(d.visitors), riders: t.riders + Number(d.riders), searches: t.searches + Number(d.searches), trips: t.trips + Number(d.trips) }), { visitors: 0, riders: 0, searches: 0, trips: 0 });
    type Texts = NonNullable<DigestData['texts']>;
    const t = texts.error ? null : ((texts.data ?? []) as Record<string, number>[]).reduce<Texts>((a, d) => ({ sent: a.sent + Number(d.sent), failed: a.failed + Number(d.failed), cost: a.cost + Number(d.cost) }), { sent: 0, failed: 0, cost: 0 });
    const data: DigestData = {
        week: sum(days.data), before: sum(prev.data),
        places: ((places.data ?? []) as { value: string; events: number }[]).map(p => ({ value: p.value, events: Number(p.events) })),
        unmet: ((unmet.data ?? []) as DigestData['unmet']).filter(u => Number(u.no_options) + Number(u.over_hour) > 0),
        openReports: reports.count ?? 0, texts: t, signups: signups.count ?? 0,
    };
    await SecurityEventService.email(`[Transit Regina] Last week: ${data.week.visitors} visitors, ${data.week.trips} trips`, digestText(data));
}
