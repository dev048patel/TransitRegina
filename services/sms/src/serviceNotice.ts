/**
 * "Standard bus service is suspended", set by an admin on the main site's Service page and saved in
 * public.service_notice (main repo docs/security/service_notice_001.sql). While it is on, the planner
 * plans nothing and the sender holds every alert: a "leave now" for a bus that isn't running would
 * send a rider out to wait for nothing. The main API tells riders once when the suspension starts.
 *
 * Read at most every READ_EVERY_MS. No table yet means no suspension; a failed read keeps the last
 * value read (none yet: not suspended).
 */
import { app } from './db';

const READ_EVERY_MS = 15_000;
const NOT_SET_UP = /PGRST205|42P01|does not exist|schema cache/i;

let last: { at: number; suspended: boolean } | null = null;
let warnedMissing = false;

export async function serviceSuspended(now = Date.now()): Promise<boolean> {
    if (last && now - last.at < READ_EVERY_MS) return last.suspended;
    const { data, error } = await app().from('service_notice').select('suspended').maybeSingle();
    if (error) {
        if (NOT_SET_UP.test(`${error.code} ${error.message}`)) {
            if (!warnedMissing) console.warn('[SMS] public.service_notice does not exist yet (main repo docs/security/service_notice_001.sql): service is taken as running.');
            warnedMissing = true;
            last = { at: now, suspended: false };
            return false;
        }
        console.error('[SMS] Reading the service notice failed:', error.message);
        return last?.suspended ?? false;
    }
    last = { at: now, suspended: (data as { suspended?: boolean } | null)?.suspended === true };
    return last.suspended;
}

/** Tests: read the row again on the next call */
export function _clearServiceNotice(): void { last = null; }
