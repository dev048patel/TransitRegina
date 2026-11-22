/* The timetable sections of the stop and route pages: when buses are scheduled, from the City of
   Regina's GTFS timetable. The full times are in the page's HTML (pre-rendered), so they answer
   "route 4 schedule" or "first bus at stop 0742" without the app. In the browser the stop page adds
   the next scheduled buses from now, and says so plainly when service is suspended. */
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Clock } from 'lucide-react';
import type { RouteInfo, StopInfo } from '../../models/services/TransitDirectory';
import {
    DAY_LABEL, DAY_TYPES, SCHEDULE, busiestStop, dayWord, departuresAt, everyText, formatDate, formatTime, frequency, nextDepartures,
    reginaToday, serviceOn, stopHours, upcomingExceptions, type DayType, type RouteTimetable,
} from '../../models/services/TimetableService';
import { stopName } from '../../models/services/TransitDirectory';
import { SITE } from '../../models/data/legal';

const CITY_UPDATES_URL = SITE.serviceUpdatesUrl;

interface TimetableState {
    tables: Record<string, RouteTimetable | undefined>;
    failed: boolean;
    now: Date | null;
    suspended: boolean;
}

/* ── Shared ── */
function Times({ times }: { times: number[] }) {
    return (
        <ol className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 font-mono text-sm text-slate-700 sm:grid-cols-6">
            {times.map(t => <li key={t}>{formatTime(t)}</li>)}
        </ol>
    );
}

export function ScheduleNote({ now }: { now: Date | null }) {
    const today = now ? reginaToday(now) : null;
    const ended = today !== null && today > SCHEDULE.end;
    const special = upcomingExceptions(today ?? undefined);
    return (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${ended ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-600'}`}>
            <p className="flex items-start gap-2">
                <CalendarDays size={16} className="mt-0.5 shrink-0" />
                <span>
                    {ended
                        ? <>This timetable ended on {formatDate(SCHEDULE.end)}, and the City hasn't published the next one yet. Check <a href={CITY_UPDATES_URL}>regina.ca</a> for current times.</>
                        : <>Scheduled times from the City of Regina's timetable (open data), in effect {formatDate(SCHEDULE.start)} to {formatDate(SCHEDULE.end)}. Buses can run early or late; the live map shows where they actually are.</>}
                </span>
            </p>
            {!ended && special.length > 0 && (
                <p className="mt-2">
                    Holidays and other changes: {special.map((e, i) => (
                        <React.Fragment key={e.date}>{i ? '; ' : ''}{formatDate(e.date).replace(/, \d{4}$/, '')}: {e.service ? `${e.service === 'sunday' ? 'Sunday' : e.service === 'saturday' ? 'Saturday' : 'weekday'} service` : 'no service'}</React.Fragment>
                    ))}. Detours and changes: <a href={CITY_UPDATES_URL}>regina.ca service updates</a>.
                </p>
            )}
        </div>
    );
}

function Suspended() {
    return (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>Regular bus service is suspended, so these scheduled buses aren't running. See <a href={CITY_UPDATES_URL} className="text-red-900">regina.ca service updates</a>.</span>
        </p>
    );
}

const dayList = (days: DayType[]) => days.map(d => DAY_LABEL[d].replace(' and holidays', '')).join(', ');

/* ── A stop: next buses, then the full times for each route and direction ── */
export function StopTimetable({ info, state }: { info: StopInfo; state: TimetableState }) {
    const { tables, failed, now, suspended } = state;
    const hours = stopHours(info.id);
    const anyTable = info.routes.some(r => tables[r.route.num]);
    const today = now ? reginaToday(now) : null;

    return (
        <section className="mt-10" aria-labelledby="timetable">
            <h2 id="timetable" className="mb-3 text-xl font-black">Bus times at stop {info.id}</h2>

            {/* First and last bus, from the small summary: there even if the full times don't load */}
            <div className="grid gap-3 sm:grid-cols-3">
                {DAY_TYPES.map(day => (
                    <div key={day} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-sm font-bold text-slate-500">{DAY_LABEL[day]}</div>
                        <div className="mt-1 font-semibold text-slate-900">
                            {hours[day] ? <>First bus {formatTime(hours[day]![0])}, last bus {formatTime(hours[day]![1])}</> : 'No buses'}
                        </div>
                    </div>
                ))}
            </div>

            {now && suspended && <Suspended />}
            {now && !suspended && anyTable && (
                <div className="mt-4 rounded-2xl border border-[#2E7D32]/30 bg-[#2E7D32]/5 px-4 py-3">
                    <h3 className="flex items-center gap-2 font-black text-slate-900"><Clock size={17} className="text-[#2E7D32]" /> Next scheduled buses</h3>
                    <ul className="mt-2 space-y-1 text-sm">
                        {info.routes.map(r => {
                            const t = tables[r.route.num];
                            if (!t || DAY_TYPES.every(day => !departuresAt(t, r.direction, day, info.id).length)) return null;
                            const next = nextDepartures(day => departuresAt(t, r.direction, day, info.id), now);
                            return (
                                <li key={`${r.route.num}-${r.direction}`}>
                                    <span className="font-bold">Route {r.route.num}</span> towards {r.towards}:{' '}
                                    {next.length ? next.map(n => `${formatTime(n.minutes)}${dayWord(n.date, today!)}`).join(', ') : 'none in the next few days'}
                                </li>
                            );
                        })}
                    </ul>
                    <p className="mt-2 text-xs text-slate-500">From the timetable, not live. <a href={`/map?stop=${info.id}`}>Live arrivals</a> show where the buses are now.</p>
                </div>
            )}

            {info.routes.map(r => {
                const t = tables[r.route.num];
                if (!t) return null;
                const days = DAY_TYPES.filter(day => departuresAt(t, r.direction, day, info.id).length);
                const none = DAY_TYPES.filter(day => !days.includes(day));
                // The last stop of the route that way: buses get here, but nobody boards to go on
                if (!days.length) return (
                    <p key={`${r.route.num}-${r.direction}`} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">
                        <Link to={`/routes/${r.route.slug}`}>Route {r.route.num}</Link> buses towards {r.towards} end their trip here.
                    </p>
                );
                return (
                    <div key={`${r.route.num}-${r.direction}`} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                        <h3 className="font-black"><Link to={`/routes/${r.route.slug}`}>Route {r.route.num}</Link> towards {r.towards}</h3>
                        {days.map(day => {
                            const times = departuresAt(t, r.direction, day, info.id);
                            return (
                                <details key={day} className="mt-3" open={day === (today ? serviceOn(today) : 'weekday')}>
                                    <summary className="cursor-pointer font-semibold text-slate-800">
                                        {DAY_LABEL[day]}: {times.length} buses, {formatTime(times[0])} to {formatTime(times[times.length - 1])}
                                    </summary>
                                    <Times times={times} />
                                </details>
                            );
                        })}
                        {none.length > 0 && <p className="mt-3 text-sm text-slate-500">No route {r.route.num} buses here on {dayList(none)}.</p>}
                    </div>
                );
            })}
            {failed && !anyTable && <p className="mt-4 text-sm text-slate-500">The full timetable didn't load. First and last buses are above; <a href={`/map?stop=${info.id}`}>live arrivals</a> are on the map.</p>}

            <ScheduleNote now={now} />
        </section>
    );
}

/* ── A route: when it runs, how often, and every departure from its first stop ── */
export function RouteTimetable({ route, state }: { route: RouteInfo; state: TimetableState }) {
    const { tables, now, suspended, failed } = state;
    const t = tables[route.num];
    const runs = DAY_TYPES.filter(day => route.directions.some(d => Object.keys(t?.directions[d.id]?.[day] ?? {}).length));

    return (
        <section className="mt-10" aria-labelledby="when-it-runs">
            <h2 id="when-it-runs" className="mb-3 text-xl font-black">When route {route.num} runs</h2>
            {t && (
                <p className="text-slate-600">
                    Route {route.num} runs {runs.length === 3 ? 'every day' : dayList(runs)}{runs.length < 3 ? `, with no service on ${dayList(DAY_TYPES.filter(d => !runs.includes(d)))}` : ''}.
                    {' '}Times below are when buses leave the first stop in each direction; each stop page has that stop's own times.
                </p>
            )}
            {now && suspended && <Suspended />}
            {failed && !t && <p className="text-sm text-slate-500">The timetable didn't load. Each stop page has its first and last bus.</p>}

            {t && (
                <div className={`mt-4 grid gap-4 ${route.directions.length > 1 ? 'md:grid-cols-2' : ''}`}>
                    {route.directions.map(d => (
                        <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-black">Towards {stopName(d.to)}</h3>
                            {DAY_TYPES.map(day => {
                                const fromId = t.directions[d.id]?.[day]?.[d.from.STOP_ID] ? d.from.STOP_ID : busiestStop(t, d.id, day);
                                if (!fromId) return <p key={day} className="mt-3 text-sm text-slate-500">{DAY_LABEL[day]}: no service</p>;
                                const times = departuresAt(t, d.id, day, fromId);
                                const from = fromId === d.from.STOP_ID ? d.from : d.stops.find(s => s.STOP_ID === fromId);
                                const bands = frequency(times);
                                return (
                                    <details key={day} className="mt-3" open={day === 'weekday'}>
                                        <summary className="cursor-pointer font-semibold text-slate-800">
                                            {DAY_LABEL[day]}: first bus {formatTime(times[0])}, last bus {formatTime(times[times.length - 1])}
                                        </summary>
                                        <ul className="mt-2 text-sm text-slate-600">
                                            {bands.map(b => <li key={b.label}>{b.label}: {b.every ? everyText(b.every) : 'one bus'}</li>)}
                                        </ul>
                                        <p className="mt-2 text-sm text-slate-500">Leaves {from ? stopName(from) : `stop ${fromId}`} (stop {fromId}) at:</p>
                                        <Times times={times} />
                                    </details>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
            <ScheduleNote now={now} />
        </section>
    );
}
