/* WalkPathService — asks the backend for the walking path between two points (POST /api/walk, WalkRouteService),
   so walks to and from stops follow sidewalks and paths instead of a straight line through buildings.
   Answers are kept for the session: a trip asks for the same few walks again whenever it is redrawn. */
import { apiPost } from '../lib/apiClient';
import type { WalkPoint, WalkRoute } from '../transit/WalkRoute';

const MAX_KEPT = 200;
const kept = new Map<string, Promise<WalkRoute | null>>();

/** ~1 m: two requests for the same spot share one answer */
const key = (from: WalkPoint, to: WalkPoint) =>
    [from.lat, from.lng, to.lat, to.lng].map(v => v.toFixed(5)).join(',');

export const WalkPathService = {
    /** The walking path, or null if there is none (too far from any path, or the request failed) */
    route(from: WalkPoint, to: WalkPoint): Promise<WalkRoute | null> {
        const k = key(from, to);
        const known = kept.get(k);
        if (known) return known;
        const answer = apiPost('/api/walk', { from, to })
            .then(r => r.json() as Promise<{ route: WalkRoute | null }>)
            .then(body => body.route)
            .catch(err => {
                kept.delete(k);   // a failed request is tried again next time; "no path" is kept
                console.warn('[Walk] No walking path:', (err as Error).message);
                return null;
            });
        if (kept.size >= MAX_KEPT) kept.delete(kept.keys().next().value!);
        kept.set(k, answer);
        return answer;
    },
};
