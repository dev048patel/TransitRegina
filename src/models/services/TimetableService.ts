/*
 TimetableService
 The scheduled times from the City of Regina GTFS feed, for the stop and route pages: every departure
 by route, direction, day type and stop; the next scheduled buses; how often a route runs.

 Each route's departures are a file of their own (public/timetables/<route>.json, written by
 scripts/build-transit-data.mjs) that the pages load when they open, so the rest of the app never
 downloads them. The pre-render puts them in the cache first (primeTimetable), so the pages' HTML has
 the full timetable. gtfsSchedule.json, which is small, holds the dates, the holidays, each stop's
 first and last bus and the transfers.

 Times are minutes after midnight of the service day. A bus after midnight belongs to the day before,
 as in GTFS, so 1,450 is 12:10 AM the next morning.
*/
import scheduleData from '../data/gtfsSchedule.json';

export type DayType = 'weekday' | 'saturday' | 'sunday';
export const DAY_TYPES: DayType[] = ['weekday', 'saturday', 'sunday'];
export const DAY_LABEL: Record<DayType, string> = { weekday: 'Monday to Friday', saturday: 'Saturday', sunday: 'Sunday and holidays' };

/** One route's departures: direction → day type → stop → minutes */
export interface RouteTimetable {
    route: string;
    directions: Record<string, Partial<Record<DayType, Record<string, number[]>>>>;
}

interface Schedule {
    version: string;
    /** First and last day the timetable is in effect, "YYYY-MM-DD" */
    start: string;
    end: string;
    /** Days that don't run their usual service; null means no service */
    exceptions: { date: string; service: DayType | null }[];
    hours: Record<string, Partial<Record<DayType, [number, number]>>>;
    transfers: Record<string, string[]>;
}
export const SCHEDULE = scheduleData as unknown as Schedule;

/* ── Loading ── */
const cache = new Map<string, RouteTimetable>();
const loading = new Map<string, Promise<RouteTimetable | null>>();

export const cachedTimetable = (route: string) => cache.get(route);
/** Used by the pre-render, which reads the files itself */
export function primeTimetable(t: RouteTimetable) { cache.set(t.route, t); }

/** A route's departures; null if the file can't be loaded (the page then shows first and last bus only) */
export function loadTimetable(route: string): Promise<RouteTimetable | null> {
    const have = cache.get(route);
    if (have) return Promise.resolve(have);
    const pending = loading.get(route);
    if (pending) return pending;
    const p = fetch(`/timetables/${encodeURIComponent(route)}.json?v=${SCHEDULE.version}`)
        .then(r => (r.ok ? r.json() as Promise<RouteTimetable> : null))
        .then(t => { if (t) cache.set(route, t); return t; })
        .catch(() => null)
        .finally(() => loading.delete(route));
    loading.set(route, p);
    return p;
}

/* ── Reading the times ── */
export const stopHours = (stopId: string): Partial<Record<DayType, [number, number]>> => SCHEDULE.hours[stopId] ?? {};
export const transfersAt = (stopId: string) => SCHEDULE.transfers[stopId] ?? [];
export const departuresAt = (t: RouteTimetable | undefined, direction: string, day: DayType, stopId: string) => t?.directions[direction]?.[day]?.[stopId] ?? [];

export { formatTime } from '../lib/clockTime';

/** "2027-01-09" → "January 9, 2027" */
export function formatDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Holidays and other days with different service, from today on (all of them when today is unknown) */
export const upcomingExceptions = (today?: string) => SCHEDULE.exceptions.filter(e => !today || e.date >= today);

/* ── Regina time ── */
const reginaParts = (now: Date) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Regina', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
};
const addDays = (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Which timetable a date runs: its day of the week, a holiday's service, or none outside the timetable's dates */
export function serviceOn(iso: string): DayType | null {
    if (iso < SCHEDULE.start || iso > SCHEDULE.end) return null;
    const exception = SCHEDULE.exceptions.find(e => e.date === iso);
    if (exception) return exception.service;
    const [y, m, d] = iso.split('-').map(Number);
    const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return day === 0 ? 'sunday' : day === 6 ? 'saturday' : 'weekday';
}

export const reginaToday = (now: Date) => reginaParts(now).date;

/** How to say which day a departure is on, seen from today: "", " tomorrow", " Monday" */
export function dayWord(date: string, today: string): string {
    if (date <= today) return '';
    if (date === addDays(today, 1)) return ' tomorrow';
    const [y, m, d] = date.split('-').map(Number);
    return ' ' + new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA', { weekday: 'long', timeZone: 'UTC' });
}

/**
 * The next scheduled departures from a stop, from the time given (Regina time). Looks at the rest of
 * yesterday's service day (buses after midnight), today's, and up to four days on, so a route with no
 * Sunday or holiday buses still shows when it runs next.
 */
export function nextDepartures(times: (day: DayType) => number[], now: Date, count = 3): { minutes: number; date: string }[] {
    const { date, minutes } = reginaParts(now);
    const found: { minutes: number; date: string; at: number }[] = [];
    for (const offset of [-1, 0, 1, 2, 3, 4]) {
        const day = addDays(date, offset);
        const service = serviceOn(day);
        if (!service) continue;
        for (const m of times(service)) {
            const at = m + offset * 1440;   // minutes after today's midnight
            if (at >= minutes) found.push({ minutes: m, date: day, at });
        }
    }
    return found.sort((a, b) => a.at - b.at).slice(0, count).map(({ minutes: m, date: d }) => ({ minutes: m, date: d }));
}

/* ── How often ── */
const BANDS: { label: string; from: number; to: number }[] = [
    { label: 'Before 9 AM', from: 0, to: 9 * 60 },
    { label: '9 AM to 3 PM', from: 9 * 60, to: 15 * 60 },
    { label: '3 PM to 6 PM', from: 15 * 60, to: 18 * 60 },
    { label: 'After 6 PM', from: 18 * 60, to: 48 * 60 },
];

/** How often buses leave in each part of the day: the usual (median) gap between them, in minutes */
export function frequency(times: number[]): { label: string; every: number | null; buses: number }[] {
    return BANDS.map(b => {
        const inBand = times.filter(t => t >= b.from && t < b.to);
        const gaps = inBand.slice(1).map((t, i) => t - inBand[i]).sort((x, y) => x - y);
        return { label: b.label, every: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null, buses: inBand.length };
    }).filter(b => b.buses > 0);
}

/** "every 30 min" / "every hour" / "about every 1 h 15 min" */
export function everyText(minutes: number): string {
    if (minutes < 60) return `every ${minutes} min`;
    if (minutes === 60) return 'every hour';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return `every ${h} h${m ? ` ${m} min` : ''}`;
}

/** The stop in a direction with the most departures that day: where to read a route's timetable from */
export function busiestStop(t: RouteTimetable | undefined, direction: string, day: DayType): string | null {
    const byStop = t?.directions[direction]?.[day];
    if (!byStop) return null;
    return Object.entries(byStop).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? null;
}
