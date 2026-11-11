/**
 * SmsAccessService — who may get text alerts.
 *
 * Text alerts need an admin's approval (docs/security/013_sms_approval.sql). A rider verifies their phone and asks;
 * the admins get an email and approve or decline on the admin panel (People, or Person → Features → "Text Alerts").
 * Approval is a feature_access row (feature "sms_alerts", enabled true); declined or switched off is enabled false;
 * no row is not approved. Riders can read that row but only the backend writes it. The SMS service
 * (services/sms/src/access.ts) checks the same row before it plans or sends anything.
 */
import { serviceDb } from '../lib/serverDb';
import type { FeatureKey } from '../admin/FeatureAccessTypes';
import { SecurityEventService } from './SecurityEventService';
import { riderEmail, sendRiderEmail } from './RiderEmail';
import { SITE } from '../data/legal';
import { formatPhone, toStoredPhone } from '../lib/phone';

export const SMS_FEATURE: FeatureKey = 'sms_alerts';

/** The people among `ids` who may NOT get texts: not approved, declined or switched off. Throws if it can't tell. */
export async function smsRevokedIds(ids: string[]): Promise<Set<string>> {
    const unique = [...new Set(ids)];
    const approved = new Set<string>();
    for (let i = 0; i < unique.length; i += 150) {
        const { data, error } = await serviceDb().from('feature_access').select('user_id')
            .eq('feature', SMS_FEATURE).eq('enabled', true).in('user_id', unique.slice(i, i + 150));
        if (error) throw new Error(`Could not read text alert access: ${error.message}`);
        for (const r of data ?? []) approved.add(r.user_id as string);
    }
    return new Set(unique.filter(id => !approved.has(id)));
}

export type SmsAccess = 'approved' | 'pending' | 'declined' | 'none';

/** One rider on the admin "Text alerts" page. `at`: when they asked (waiting) or when an admin decided. */
export interface SmsRider {
    userId: string; at: string; name: string | null; email: string | null; phone: string | null;
    phoneVerified: boolean; textsOn: boolean; accountStatus: string; joined: string | null; lastActive: string | null;
    decidedBy: string | null; commutes: { day: number; arriveBy: string | null; departBy: string | null }[];
}

/* Rider emails: the shared design and sender (RiderEmail). Swappable for tests. */
type RiderMailer = (to: string, subject: string, body: { html: string; text: string }) => Promise<void>;
let riderMailer: RiderMailer = sendRiderEmail;
const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || 'there';

/* The two emails a rider gets about text alerts */
export const REQUEST_SUBJECT = 'We got your request for text alerts', APPROVED_SUBJECT = 'Your account is ready for text alerts';

export const requestReceivedEmail = (name: string | null) => riderEmail({
    preview: 'Our team will review it soon. You don\'t need to do anything else.',
    heading: 'Your request is in!',
    greeting: `Hi ${firstName(name)},`,
    paragraphs: ['Thanks for asking for text alerts. Our team will review your request soon, and we\'ll email you as soon as it\'s approved. You don\'t need to do anything else.'],
    button: { label: 'View my profile', url: `${SITE.url}/profile` },
    list: { title: 'What happens next:', items: [
        { icon: '👀', title: 'We review it', text: 'Our team looks at your request soon.' },
        { icon: '📬', title: 'You hear back', text: 'We email you as soon as it\'s approved.' },
        { icon: '🚌', title: 'Texts start', text: 'We text you when to leave, and when to get off, for the commutes you save.' },
    ] },
    notice: { title: 'Didn\'t ask for this?', text: 'Someone may have used your account. Reply to this email and we\'ll look into it.' },
});

export function approvedEmail(name: string | null, mobile: string | null) {
    const phone = toStoredPhone(mobile) ? ` ${formatPhone(mobile)}` : ' your phone';
    return riderEmail({
        preview: 'Your request was approved. Your account is ready for text alerts. Enjoy!',
        heading: 'Your account is ready for text alerts 🎉',
        greeting: `Hi ${firstName(name)},`,
        paragraphs: ['Good news: your request for text alerts has been accepted, and your account is ready to use them. Enjoy!',
            `We'll text${phone} when it's time to leave for the commutes you save in ${SITE.brand}, and again when it's time to get off the bus.`],
        button: { label: 'Open Transit Regina', url: `${SITE.url}/map` },
        list: { title: 'Make the most of it:', items: [
            { icon: '⏰', title: 'Save your commute', text: 'Add your weekly trip in the app so we know when to text you.' },
            { icon: '🛑', title: 'Stop anytime', text: 'Reply STOP to any text, or turn alerts off on your profile page.' },
            { icon: '💬', title: 'Message rates', text: 'Standard message rates may apply.' },
        ] },
    });
}

export const SmsAccessService = {
    /** Where one rider stands */
    async status(userId: string): Promise<SmsAccess> {
        const db = serviceDb();
        const [row, req] = await Promise.all([
            db.from('feature_access').select('enabled').eq('user_id', userId).eq('feature', SMS_FEATURE).maybeSingle(),
            db.from('sms_access_requests').select('user_id').eq('user_id', userId).maybeSingle(),
        ]);
        if (row.error) throw new Error(row.error.message);
        if (row.data?.enabled === true) return 'approved';
        if (row.data?.enabled === false) return 'declined';
        if (req.error) throw new Error(req.error.message);
        return req.data ? 'pending' : 'none';
    },

    /** The rider asks for text alerts. Asking is their consent; texts start when an admin approves.
     *  The first time, the admins get an email and so does the rider (so they know it went through). */
    async request(userId: string, rider: { name: string | null; email: string | null }): Promise<void> {
        const { data, error } = await serviceDb().from('sms_access_requests').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }).select('user_id');
        if (error) throw new Error(error.message);
        const { error: consentErr } = await serviceDb().from('profiles').update({ sms_consent_at: new Date().toISOString() }).eq('id', userId);
        if (consentErr) throw new Error(consentErr.message);
        if (!data?.length) return;   // already waiting: everyone was told the first time
        const who = [rider.name, rider.email].filter(Boolean).join(', ') || 'A rider';
        if (rider.email) {
            try {
                await riderMailer(rider.email, REQUEST_SUBJECT, requestReceivedEmail(rider.name));
            } catch (err) { console.error('[SMS access] Request email failed:', (err as Error).message); }   // the request still stands
        }
        await SecurityEventService.email(`[Transit Regina] Text alert request from ${who}`,
            [`${who} asked for text alerts and is waiting for approval.`, '', 'Approve or decline it on the Text alerts page of the admin panel.'].join('\n'));
    },

    /**
     * Everything the admin "Text alerts" page shows: who is waiting (with what an admin needs to decide: when they
     * joined, last used the app, their phone and their saved commutes), who is approved and who was declined.
     */
    async overview(): Promise<{ pending: SmsRider[]; approved: SmsRider[]; declined: SmsRider[] }> {
        const db = serviceDb();
        const [reqs, decided] = await Promise.all([
            db.from('sms_access_requests').select('user_id, requested_at').order('requested_at'),
            db.from('feature_access').select('user_id, enabled, updated_at, updated_by').eq('feature', SMS_FEATURE).order('updated_at', { ascending: false }).limit(1000),
        ]);
        if (reqs.error) throw Object.assign(new Error(reqs.error.message), { code: reqs.error.code });
        if (decided.error) throw new Error(decided.error.message);
        const ids = [...new Set([...(reqs.data ?? []), ...(decided.data ?? [])].flatMap(r => [r.user_id as string, ...('updated_by' in r && r.updated_by ? [r.updated_by as string] : [])]))];
        const waitingIds = (reqs.data ?? []).map(r => r.user_id as string);
        const [people, commutes] = await Promise.all([
            ids.length ? db.from('profiles').select('id, full_name, email, mobile_number, mobile_verified, sms_opted_in, account_status, created_at, last_active').in('id', ids) : Promise.resolve({ data: [], error: null }),
            waitingIds.length ? db.from('weekly_schedules').select('user_id, day_of_week, enabled, arrive_by, depart_by').in('user_id', waitingIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (people.error) throw new Error(people.error.message);
        const byId = new Map(((people.data ?? []) as Record<string, unknown>[]).map(p => [p.id as string, p]));
        const rider = (userId: string, at: string, by?: string | null): SmsRider => {
            const p = byId.get(userId) ?? {}, admin = by ? byId.get(by) : null;
            return {
                userId, at, name: (p.full_name as string) ?? null, email: (p.email as string) ?? null, phone: (p.mobile_number as string) ?? null,
                phoneVerified: !!p.mobile_verified, textsOn: !!p.sms_opted_in, accountStatus: (p.account_status as string) ?? 'active',
                joined: (p.created_at as string) ?? null, lastActive: (p.last_active as string) ?? null,
                decidedBy: admin ? ((admin.full_name as string) || (admin.email as string) || null) : null,
                commutes: ((commutes.data ?? []) as { user_id: string; day_of_week: number; enabled: boolean; arrive_by: string | null; depart_by: string | null }[])
                    .filter(c => c.user_id === userId && c.enabled).map(c => ({ day: c.day_of_week, arriveBy: c.arrive_by?.slice(0, 5) ?? null, departBy: c.depart_by?.slice(0, 5) ?? null })),
            };
        };
        const rows = (decided.data ?? []) as { user_id: string; enabled: boolean; updated_at: string; updated_by: string | null }[];
        return {
            pending: (reqs.data ?? []).map(r => rider(r.user_id as string, r.requested_at as string)),
            approved: rows.filter(r => r.enabled).map(r => rider(r.user_id, r.updated_at, r.updated_by)),
            declined: rows.filter(r => !r.enabled).map(r => rider(r.user_id, r.updated_at, r.updated_by)),
        };
    },

    /**
     * An admin approves or declines (or switches text alerts on or off on the Features page, which comes here too).
     * Approving a rider who asked turns their texts on and emails them; approving someone who never asked only allows
     * it, since they haven't agreed to texts. Returns whether the rider had asked.
     */
    async decide(userId: string, approve: boolean, adminId: string): Promise<{ hadRequest: boolean }> {
        const db = serviceDb();
        const { data: removed, error: reqErr } = await db.from('sms_access_requests').delete().eq('user_id', userId).select('user_id');
        if (reqErr && !['42P01', 'PGRST205'].includes(reqErr.code ?? '')) throw new Error(reqErr.message);
        const hadRequest = !!removed?.length;
        const { error } = await db.from('feature_access')
            .upsert({ user_id: userId, feature: SMS_FEATURE, enabled: approve, updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,feature' });
        if (error) throw new Error(error.message);
        if (!approve || !hadRequest) return { hadRequest };

        const { data: p, error: pErr } = await db.from('profiles').update({ sms_opted_in: true }).eq('id', userId).eq('mobile_verified', true).select('email, full_name, mobile_number').maybeSingle();
        if (pErr) throw new Error(pErr.message);
        if (p?.email) {
            try {
                await riderMailer(p.email as string, APPROVED_SUBJECT, approvedEmail(p.full_name as string | null, p.mobile_number as string | null));
            } catch (err) { console.error('[SMS access] Approval email failed:', (err as Error).message); }   // approved either way
        }
        return { hadRequest };
    },

    /** Test hook: null puts Resend back */
    _setMailer(fn: RiderMailer | null) { riderMailer = fn ?? sendRiderEmail; },
};
