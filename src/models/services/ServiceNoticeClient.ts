/**
 * ServiceNoticeClient — Transit Regina  [MODEL]
 * Reads the notice an admin sets on the Service page (GET /api/service-notice), for the banner on every
 * page and the message on the map. One request serves every component that asks within 30 seconds.
 * A failed request means "no notice": a notice must never break a page.
 */
import { apiGet } from '../lib/apiClient';

export interface PublicServiceNotice {
    active: boolean;
    suspended?: boolean;
    message?: string;
    linkUrl?: string | null;
    updatedAt?: string | null;
}

export const CITY_UPDATES_URL = 'https://www.regina.ca/transportation-roads-parking/transit/service-updates/';
const FRESH_MS = 30_000;
const NONE: PublicServiceNotice = { active: false };

let last: { at: number; value: PublicServiceNotice } | null = null;
let inFlight: Promise<PublicServiceNotice> | null = null;

export function fetchServiceNotice(now = Date.now()): Promise<PublicServiceNotice> {
    if (last && now - last.at < FRESH_MS) return Promise.resolve(last.value);
    if (inFlight) return inFlight;
    inFlight = apiGet('/api/service-notice')
        .then(r => r.json() as Promise<PublicServiceNotice>)
        .then(v => (v && typeof v.active === 'boolean' ? v : NONE))
        .catch(() => last?.value ?? NONE)
        .then(v => { last = { at: Date.now(), value: v }; return v; })
        .finally(() => { inFlight = null; });
    return inFlight;
}
