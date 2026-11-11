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

/* One email to one rider, through Resend (the admins' alerts go through SecurityEventService) */
type RiderMailer = (to: string, subject: string, text: string) => Promise<void>;
const resendOne: RiderMailer = async (to, subject, text) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.ALERT_FROM ?? 'Transit Regina Alerts <alerts@transitregina.ca>', to: [to], subject, text }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
};
let riderMailer: RiderMailer = resendOne;

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

    /** The rider asks for text alerts. Asking is their consent; texts start when an admin approves. Emails the admins once. */
    async request(userId: string, who: string): Promise<void> {
        const { data, error } = await serviceDb().from('sms_access_requests').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }).select('user_id');
        if (error) throw new Error(error.message);
        const { error: consentErr } = await serviceDb().from('profiles').update({ sms_consent_at: new Date().toISOString() }).eq('id', userId);
        if (consentErr) throw new Error(consentErr.message);
        if (!data?.length) return;   // already waiting: the admins were told the first time
        await SecurityEventService.email(`[Transit Regina] Text alert request from ${who}`,
            [`${who} asked for text alerts and is waiting for approval.`, '', 'Approve or decline it on the People page of the admin panel.'].join('\n'));
    },

    /** Who is waiting, oldest first */
    async pending(): Promise<{ userId: string; requestedAt: string; name: string | null; email: string | null; phone: string | null }[]> {
        const { data, error } = await serviceDb().from('sms_access_requests').select('user_id, requested_at').order('requested_at');
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        const ids = (data ?? []).map(r => r.user_id as string);
        const { data: people } = ids.length ? await serviceDb().from('profiles').select('id, full_name, email, mobile_number').in('id', ids) : { data: [] };
        const byId = new Map((people ?? []).map(p => [p.id as string, p]));
        return (data ?? []).map(r => {
            const p = byId.get(r.user_id as string);
            return { userId: r.user_id as string, requestedAt: r.requested_at as string, name: p?.full_name ?? null, email: p?.email ?? null, phone: p?.mobile_number ?? null };
        });
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
            const name = (p.full_name as string | null)?.split(' ')[0] || 'there';
            const phone = p.mobile_number ? ` to ${String(p.mobile_number).replace(/^\+1/, '').replace(/(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')}` : '';
            try {
                await riderMailer(p.email as string, 'Your text alerts are approved',
                    [`Hi ${name},`, '', `Your request for text alerts has been accepted. We'll text your bus times${phone} for the commutes you save in Transit Regina.`,
                        '', 'Reply STOP to any text to turn them off, or turn them off on your profile page.', '', 'Transit Regina'].join('\n'));
            } catch (err) { console.error('[SMS access] Approval email failed:', (err as Error).message); }   // approved either way
        }
        return { hadRequest };
    },

    /** Test hook: null puts Resend back */
    _setMailer(fn: RiderMailer | null) { riderMailer = fn ?? resendOne; },
};
