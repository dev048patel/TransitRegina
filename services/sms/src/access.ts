/**
 * Text alerts need an admin's approval (docs/security/013_sms_approval.sql in the main repo). Approval is a row in
 * public.feature_access (feature "sms_alerts", enabled true), which riders can read but never write. No row, or
 * enabled false (declined or switched off by an admin), means the rider gets no texts.
 */
import { app, inChunks, must } from './db';

export const SMS_FEATURE = 'sms_alerts';

/** The riders among `ids` who may NOT get texts: not approved, declined or switched off */
export async function smsRevoked(ids: string[]): Promise<Set<string>> {
    const unique = [...new Set(ids)];
    const rows = await inChunks(unique, async chunk =>
        must(await app().from('feature_access').select('user_id').eq('feature', SMS_FEATURE).eq('enabled', true).in('user_id', chunk), 'reading feature_access') as { user_id: string }[]);
    const approved = new Set(rows.map(r => r.user_id));
    return new Set(unique.filter(id => !approved.has(id)));
}
