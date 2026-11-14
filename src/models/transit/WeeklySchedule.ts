/* Weekly commute: for each day of the week, the trip there and (optionally) the trip home.
   Pure data and rules, shared by the Weekly Commute panel and its tests. */

/** 0 = the trip there, 1 = the trip home the same day */
export type TripSlot = 0 | 1;
export const TRIP_SLOTS: TripSlot[] = [0, 1];

export interface DayPlan {
    fromId: string | null;
    toId: string | null;
    arriveBy: string;                 // "HH:MM" target arrival
    departBy: string | null;          // "HH:MM" when to leave, from the bus timetable; null until planned
    routeNum: string | null;          // the first bus of the pinned trip
    routeList: string[] | null;       // every bus of the pinned trip, in order
    routeTotalMinutes: number | null; // leave to arrive
    enabled: boolean;                 // whether to send reminders (texts, push) for this trip
}

export interface DbWeeklySchedule {
    id: string;
    user_id: string;
    day_of_week: number;              // 0=Sun, 1=Mon … 6=Sat
    trip?: number | null;             // 0 = there, 1 = home (missing before docs/security/commute_001_trip_home.sql)
    from_dest_id: string | null;
    to_dest_id: string | null;
    arrive_by: string;
    depart_by: string | null;
    route_num: string | null;
    route_list?: string[] | null;
    route_total_minutes: number | null;
    enabled: boolean;
    created_at: string;
}

export const DAY_LABELS: Record<number, string> = {
    1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun',
};

/** The days in the order the panel shows them, Monday first */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
/** Monday to Friday: what "Apply to weekdays" copies to */
export const WEEKDAY_INDICES = [1, 2, 3, 4, 5];

export const tripKey = (day: number, trip: TripSlot) => `${day}-${trip}`;

export function blankDay(trip: TripSlot = 0): DayPlan {
    return {
        fromId: null, toId: null,
        arriveBy: trip === 0 ? '09:00' : '17:00', departBy: null,
        routeNum: null, routeList: null, routeTotalMinutes: null,
        enabled: false,
    };
}

/** Both ends are picked */
export const isSet = (p: DayPlan) => !!p.fromId && !!p.toId;

/** Only the fields that are saved, so two plans can be compared (unsaved changes) */
export function planFields(p: DayPlan): DayPlan {
    return {
        fromId: p.fromId, toId: p.toId, arriveBy: p.arriveBy, departBy: p.departBy,
        routeNum: p.routeNum, routeList: p.routeList ? [...p.routeList] : null,
        routeTotalMinutes: p.routeTotalMinutes, enabled: p.enabled,
    };
}

export function samePlans(a: Record<string, DayPlan>, b: Record<string, DayPlan>): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        const x = a[k] ? planFields(a[k]) : null, y = b[k] ? planFields(b[k]) : null;
        if (JSON.stringify(x) !== JSON.stringify(y)) return false;
    }
    return true;
}

/** Every day and trip, blank */
export function blankWeek(): Record<string, DayPlan> {
    const week: Record<string, DayPlan> = {};
    for (const d of DAY_ORDER) for (const t of TRIP_SLOTS) week[tripKey(d, t)] = blankDay(t);
    return week;
}

/** The saved rows as a week (rows saved before the trip home existed are the trip there) */
export function weekFromRows(rows: DbWeeklySchedule[]): Record<string, DayPlan> {
    const week = blankWeek();
    for (const row of rows) {
        const trip: TripSlot = row.trip === 1 ? 1 : 0;
        if (!(row.day_of_week in DAY_LABELS)) continue;
        week[tripKey(row.day_of_week, trip)] = {
            fromId: row.from_dest_id,
            toId: row.to_dest_id,
            arriveBy: (row.arrive_by ?? '09:00').slice(0, 5),
            departBy: row.depart_by ? row.depart_by.slice(0, 5) : null,
            routeNum: row.route_num,
            routeList: row.route_list?.length ? row.route_list : row.route_num ? [row.route_num] : null,
            routeTotalMinutes: row.route_total_minutes,
            enabled: row.enabled,
        };
    }
    return week;
}

const minutesOf = (hhmm: string | null | undefined) => {
    const m = hhmm ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Set-up trips whose leave time didn't come from the bus timetable, to plan again: no leave time, no buses
 * saved, or the old estimate (arrive-by minus the trip's length, landing exactly on arrive-by, which can fall
 * when no bus comes). A timetable trip leaves when its bus works out and arrives when that bus gets there,
 * almost never on the minute asked for; if one does, planning it again gives the same trip.
 */
export function legacyTripKeys(rows: DbWeeklySchedule[]): string[] {
    return rows
        .filter(r => {
            if (!r.from_dest_id || !r.to_dest_id || !(r.day_of_week in DAY_LABELS)) return false;
            const leave = minutesOf(r.depart_by), arrive = minutesOf(r.arrive_by);
            const estimate = leave !== null && arrive !== null && r.route_total_minutes != null
                && (leave + r.route_total_minutes) % 1440 === arrive;
            return leave === null || !r.route_list?.length || estimate;
        })
        .map(r => tripKey(r.day_of_week, r.trip === 1 ? 1 : 0));
}

export interface SaveRow extends DayPlan { day: number; trip: TripSlot }

/**
 * The rows to write: every trip already in the database (so a cleared one is cleared there too) and
 * every trip with a place picked. Days never set up aren't written, so they don't fill the table.
 */
export function rowsToSave(week: Record<string, DayPlan>, stored: Set<string>): SaveRow[] {
    const rows: SaveRow[] = [];
    for (const day of DAY_ORDER) for (const trip of TRIP_SLOTS) {
        const k = tripKey(day, trip), p = week[k];
        if (!p) continue;
        if (stored.has(k) || p.fromId || p.toId) rows.push({ ...planFields(p), day, trip });
    }
    return rows;
}

/** The weekdays (Mon–Fri, not `fromDay`) whose same trip is set up differently and would be replaced */
export function applyConflicts(week: Record<string, DayPlan>, fromDay: number, trip: TripSlot): number[] {
    const src = week[tripKey(fromDay, trip)];
    return WEEKDAY_INDICES.filter(d => {
        if (d === fromDay) return false;
        const p = week[tripKey(d, trip)];
        return (p.fromId || p.toId) && (p.fromId !== src.fromId || p.toId !== src.toId || p.arriveBy !== src.arriveBy);
    });
}

/**
 * Copies one day's trip to every weekday. Its leave time is left to be worked out again for each day
 * (departBy null: buses can run differently), keeping the pinned buses as the ones to look for.
 */
export function applyToWeekdays(week: Record<string, DayPlan>, fromDay: number, trip: TripSlot): Record<string, DayPlan> {
    const src = week[tripKey(fromDay, trip)];
    const next = { ...week };
    for (const d of WEEKDAY_INDICES) {
        if (d === fromDay) continue;
        next[tripKey(d, trip)] = { ...planFields(src), departBy: null };
    }
    return next;
}

/** The trip home of a day, ready to fill in: the trip there reversed, arriving in the evening */
export function tripHomeFor(there: DayPlan): DayPlan {
    return { ...blankDay(1), fromId: there.toId, toId: there.fromId, enabled: there.enabled };
}

/** "7:42 AM" (the planner's clock) → "07:42" */
export function clockToHhmm(clock: string): string | null {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(clock.trim());
    if (!m) return null;
    const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** "07:42" → "7:42 AM" */
export function hhmmToClock(hhmm: string | null | undefined): string {
    const m = hhmm ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
    if (!m) return '';
    const h = Number(m[1]);
    return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
