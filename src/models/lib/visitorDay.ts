/* visitorDay — a random code for today, so a signed-out rider counts as one visitor all day even when their
   network changes (home Wi-Fi in the morning, mobile data in the afternoon). Sent as the X-Visitor-Day header with
   analytics calls; the server turns it into the day's anonymous id (UsageEvents.visitorId) and never stores it.

   A new code every Regina day, so days can't be linked. Nothing personal in it. If storage is blocked, no code is
   sent and the server falls back to address + browser. */

const KEY = 'transit-regina:visitor-day';

/** Today in Regina (UTC-6 all year, no daylight saving), like "2026-11-16" */
const reginaToday = () => new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);

let cached: { day: string; code: string } | null = null;

/** Today's code, made on first use each day; null when the browser won't keep it */
export function visitorDayCode(): string | null {
    const day = reginaToday();
    if (cached?.day === day) return cached.code;
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { day?: string; code?: string } | null;
        if (saved?.day === day && typeof saved.code === 'string' && /^[A-Za-z0-9_-]{16,40}$/.test(saved.code)) return (cached = { day, code: saved.code }).code;
        const code = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32).padEnd(16, '0');
        localStorage.setItem(KEY, JSON.stringify({ day, code }));
        return (cached = { day, code }).code;
    } catch {
        return null;   // private mode or storage blocked: the server uses address + browser instead
    }
}

/** The header to send with analytics calls (empty when there is no code) */
export function visitorDayHeader(): Record<string, string> {
    const code = typeof window === 'undefined' ? null : visitorDayCode();
    return code ? { 'X-Visitor-Day': code } : {};
}
