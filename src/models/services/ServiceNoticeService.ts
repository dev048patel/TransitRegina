/**
 * ServiceNoticeService — the sitewide service notice, and "standard bus service is suspended".
 *
 * One row in public.service_notice (docs/security/service_notice_001.sql), set by an admin on the
 * Service page. Riders see it on every page and on the map (GET /api/service-notice). While
 * `suspended` is on:
 *
 *   - the main API's commute reminders (legacy "Leave by" text and web push, server.ts) are held
 *   - the SMS service plans nothing and holds its texts (it reads the same row)
 *   - each rider with a saved commute is told once: one email, and one text if they get text alerts
 *
 * "Once" means once per suspension (started_at): saving again while suspended only reaches riders
 * not told yet, so a save after a failed email run is a retry. Switching suspended off and on again
 * starts a new suspension, and riders are told again.
 */
import { serviceDb, hasServiceKey } from '../lib/serverDb';
import { SITE } from '../data/legal';
import { riderEmail, sendRiderBatch, type BatchEmail } from './RiderEmail';
import { smsRevokedIds } from './SmsAccessService';
import { TwilioService } from './TwilioService';

export interface ServiceNotice {
    active: boolean;
    suspended: boolean;
    message: string;
    linkUrl: string | null;
    startedAt: string | null;
    updatedAt: string | null;
}

export const NO_NOTICE: ServiceNotice = { active: false, suspended: false, message: '', linkUrl: null, startedAt: null, updatedAt: null };
export const CITY_UPDATES_URL = 'https://www.regina.ca/transportation-roads-parking/transit/service-updates/';
export const MAX_MESSAGE = 400;

/** The one text a rider gets when a suspension starts: one GSM-7 segment (160 characters) */
export const SUSPENSION_TEXT = 'Transit Regina: City bus service is suspended, so your commute reminders are paused. They restart on their own when buses run again.';

const CACHE_MS = 20_000;
const CHUNK = 100;   // Resend's batch limit, and ids per `in` filter
const NOT_SET_UP = /PGRST205|42P01|does not exist|schema cache/i;

interface Row { active: boolean; suspended: boolean; message: string | null; link_url: string | null; started_at: string | null; updated_at: string | null }
const fromRow = (r: Row | null): ServiceNotice => r ? {
    active: !!r.active || !!r.suspended,   // a suspension is always shown
    suspended: !!r.suspended,
    message: r.message ?? '',
    linkUrl: r.link_url ?? null,
    startedAt: r.started_at ?? null,
    updatedAt: r.updated_at ?? null,
} : NO_NOTICE;

let cached: { at: number; value: ServiceNotice } | null = null;
let warnedMissing = false;

type Mailer = (emails: BatchEmail[]) => Promise<void>;
type Texter = (riders: { id: string; phone: string }[], text: string) => Promise<number>;
let mailer: Mailer = sendRiderBatch;

/** Through whichever path sends riders' commute texts today: the legacy Twilio sender, or the SMS service */
const defaultTexter: Texter = async (riders, text) => {
    if (!riders.length) return 0;
    if (process.env.LEGACY_SMS_REMINDERS !== 'false' && TwilioService.isConfigured()) {
        void TwilioService.sendBatch(riders.map(r => ({ phone: r.phone, body: text })));   // 100 ms apart: don't hold the admin's request
        return riders.length;
    }
    const url = process.env.SMS_SERVICE_URL, token = process.env.SMS_SERVICE_TOKEN;
    if (!url || !token) return 0;
    // The SMS service checks again who may get texts, and keeps to its dry run and pilot numbers
    const r = await fetch(`${url.replace(/\/+$/, '')}/internal/broadcast`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: riders.map(x => x.id), message: text }), signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) throw new Error(`The SMS service answered ${r.status}`);
    return ((await r.json().catch(() => ({}))) as { sent?: number }).sent ?? 0;
};
let texter: Texter = defaultTexter;

export function suspensionEmail(notice: ServiceNotice): { subject: string; text: string; html: string } {
    return {
        subject: 'Regina bus service is suspended: your commute reminders are paused',
        ...riderEmail({
            preview: "Standard bus service isn't running, so we've paused your commute reminders.",
            heading: 'Bus service is suspended',
            paragraphs: [
                ...(notice.message ? [notice.message] : []),
                "While standard bus service is suspended, we won't send commute reminders (texts or notifications) for buses that aren't running.",
                `${SITE.brand} is an independent project, not the City of Regina. The City's service updates page has the latest official information.`,
            ],
            button: { label: 'City service updates', url: notice.linkUrl ?? CITY_UPDATES_URL },
            notice: { title: "You don't need to do anything.", text: 'Your reminders start again on their own once buses are running.' },
        }),
    };
}

export const ServiceNoticeService = {
    /** The current notice. A missing table (script not run yet) or a failed read means no notice. */
    async get(now = Date.now()): Promise<ServiceNotice> {
        if (cached && now - cached.at < CACHE_MS) return cached.value;
        if (!hasServiceKey()) return NO_NOTICE;
        const { data, error } = await serviceDb().from('service_notice')
            .select('active, suspended, message, link_url, started_at, updated_at').maybeSingle();
        if (error) {
            if (NOT_SET_UP.test(`${error.code} ${error.message}`)) {
                if (!warnedMissing) console.warn('[Service notice] public.service_notice does not exist yet (run docs/security/service_notice_001.sql).');
                warnedMissing = true;
            } else console.error('[Service notice] Read failed:', error.message);
            return cached?.value ?? NO_NOTICE;   // the last value read, if any
        }
        cached = { at: now, value: fromRow(data as Row | null) };
        return cached.value;
    },

    /** Is standard bus service suspended? Commute reminders are held while it is. */
    async isSuspended(): Promise<boolean> {
        return (await ServiceNoticeService.get()).suspended;
    },

    /**
     * Saves the notice. A suspension that starts here gets a new started_at, so its riders are told
     * once; one already running keeps its started_at.
     */
    async save(next: { active: boolean; suspended: boolean; message: string; linkUrl: string | null }, by: string, now = Date.now()):
        Promise<{ notice: ServiceNotice; before: ServiceNotice; suspensionStarted: boolean }> {
        const { data: prev, error: readErr } = await serviceDb().from('service_notice')
            .select('active, suspended, message, link_url, started_at, updated_at').maybeSingle();
        if (readErr) throw new Error(readErr.message);
        const before = fromRow(prev as Row | null);
        const suspensionStarted = next.suspended && !(before.suspended && before.startedAt);
        const stamp = new Date(now).toISOString();
        const row = {
            id: true,
            active: next.active || next.suspended,
            suspended: next.suspended,
            message: next.message,
            link_url: next.linkUrl,
            started_at: next.suspended ? (suspensionStarted ? stamp : before.startedAt) : null,
            updated_at: stamp,
            updated_by: by,
        };
        const { error } = await serviceDb().from('service_notice').upsert(row);
        if (error) throw new Error(error.message);
        cached = null;
        return { notice: fromRow(row), before, suspensionStarted };
    },

    /**
     * Tells each rider with a saved commute, once per suspension: an email, and a text if they get
     * text alerts. Riders already told are left out, so calling it again only reaches the rest.
     */
    async tellRiders(notice: ServiceNotice): Promise<{ riders: number; emailed: number; texted: number; failed: number }> {
        const out = { riders: 0, emailed: 0, texted: 0, failed: 0 };
        if (!notice.suspended || !notice.startedAt) return out;
        const { data: schedules, error } = await serviceDb().from('weekly_schedules').select('user_id').eq('enabled', true);
        if (error) throw new Error(`Could not read commutes: ${error.message}`);
        const ids = [...new Set((schedules ?? []).map(s => s.user_id as string))];
        if (!ids.length) return out;

        const people: { id: string; email: string | null; mobile_number: string | null; sms_opted_in: boolean | null; mobile_verified: boolean | null; account_status: string | null }[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
            const { data, error: e } = await serviceDb().from('profiles')
                .select('id, email, mobile_number, sms_opted_in, mobile_verified, account_status').in('id', ids.slice(i, i + CHUNK));
            if (e) throw new Error(`Could not read riders: ${e.message}`);
            people.push(...(data ?? []));
        }
        const active = people.filter(p => (p.account_status ?? 'active') === 'active');
        out.riders = active.length;
        const revoked = await smsRevokedIds(active.map(p => p.id)).catch(() => null);   // not knowing who may get texts: no texts
        const { subject, text, html } = suspensionEmail(notice);
        const toText: { id: string; phone: string }[] = [];

        for (let i = 0; i < active.length; i += CHUNK) {
            const chunk = active.slice(i, i + CHUNK);
            // The "told" row first: a rider already told (a retry, a second save) is left out
            const { data: fresh, error: e } = await serviceDb().from('service_notice_told')
                .upsert(chunk.map(p => ({ user_id: p.id, started_at: notice.startedAt })), { onConflict: 'user_id,started_at', ignoreDuplicates: true }).select('user_id');
            if (e) throw new Error(`Could not record who was told: ${e.message}`);
            const freshIds = new Set((fresh ?? []).map(f => f.user_id as string));
            const told = chunk.filter(p => freshIds.has(p.id));
            if (!told.length) continue;
            const withEmail = told.filter(p => p.email);
            try {
                if (withEmail.length) await mailer(withEmail.map(p => ({ to: p.email as string, subject, text, html })));
                out.emailed += withEmail.length;
            } catch (err) {
                // Resend refused the whole batch: free these riders, so the next save tries them again
                await serviceDb().from('service_notice_told').delete().eq('started_at', notice.startedAt).in('user_id', told.map(p => p.id));
                out.failed += told.length;
                console.error('[Service notice] Rider emails failed:', (err as Error).message);
                continue;
            }
            for (const p of told) {
                if (revoked && !revoked.has(p.id) && p.sms_opted_in && p.mobile_verified && p.mobile_number) toText.push({ id: p.id, phone: p.mobile_number });
            }
        }
        try { out.texted = await texter(toText, SUSPENSION_TEXT); }
        catch (err) { console.error('[Service notice] Rider texts failed:', (err as Error).message); }
        return out;
    },

    /** Forget the last value read, so the next get() reads the table (the admin panel, and tests) */
    clearCache() { cached = null; },
    /** Test hooks: null puts the real sender back */
    _setMailer(fn: Mailer | null) { mailer = fn ?? sendRiderBatch; },
    _setTexter(fn: Texter | null) { texter = fn ?? defaultTexter; },
};
