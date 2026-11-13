/**
 * UsageSections.tsx — Transit Regina  [VIEW — MVC]
 * The deeper parts of the admin Usage page: who is on now, visits, errors, unmet demand, the search map and
 * returning riders. Pure rendering; the data comes from useUsageController.
 */
import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NowVisitor, SearchPoint, Unmet, Usage, UsageTop } from '../../controllers/admin/useUsageController';
import { downloadCsv, RANGES } from '../../controllers/admin/useUsageController';
import { personLink, type Actor, type ExploreEvent } from '../../controllers/admin/useExploreController';
import { KIND_TOPIC, USAGE_LABEL, WEEKDAYS, describeUsage, topicLink } from '../../models/data/usageLabels';
import { MapModel } from '../../models/MapModel';
import { Card } from '../components/admin/ui';

const BLUE = '#1a73e8', ORANGE = '#e37400', AQUA = '#1baf7a';   // validated together (dataviz validator); legend + tooltips name every series
const n = (v: number | null | undefined, digits = 0) => v === null || v === undefined ? '—' : v.toLocaleString('en-CA', { maximumFractionDigits: digits });
const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };

/** A small download link for a table */
export function CsvButton({ name, rows }: { name: string; rows: Record<string, unknown>[] }) {
    if (!rows.length) return null;
    return <button onClick={() => downloadCsv(name, rows)} className="text-xs font-semibold text-[#003DA5] hover:underline">CSV</button>;
}

/** Who is on the app right now (last 5 minutes): signed-in riders by name, signed-out ones anonymous */
export function NowCard({ now }: { now: { setup: boolean; visitors: NowVisitor[] } | null }) {
    const list = now?.visitors ?? [];
    const signedIn = list.filter(v => v.userId).length;
    return (
        <Card title="On the app now" about="People using the app right now (active in the last 5 minutes, with the app on screen). Click a name to see what they did." action={<span className="text-xs text-slate-500">updates every 30 s</span>}>
            {!now ? <p className="px-5 py-4 text-sm text-slate-500">Loading…</p> : !now.setup ? <p className="px-5 py-4 text-sm text-slate-500">Not set up yet.</p> : (
                <>
                    <div className="px-5 pt-3 pb-1 text-sm text-slate-700"><b className="text-2xl text-slate-900 tabular-nums">{list.length}</b> people · {signedIn} signed in</div>
                    <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                        {list.slice(0, 40).map((v, i) => (
                            <li key={v.at + i} className="px-5 py-2 text-sm flex flex-wrap gap-x-3">
                                <span className="w-20 flex-none text-slate-500 tabular-nums">{ago(v.at)}</span>
                                <span className="flex-1 min-w-[10rem] text-slate-900">{USAGE_LABEL[v.kind] ?? v.kind}{v.page ? <span className="text-slate-500"> · {v.page}</span> : null}</span>
                                <span className="text-slate-500">{v.userId || v.visitor ? <Link to={v.userId ? `/admin/people/${v.userId}` : `/admin/insights/visitors/${v.visitor}`} className="text-[#003DA5] hover:underline">{v.who}</Link> : v.who}{v.device ? ` · ${v.device}` : ''}</span>
                            </li>
                        ))}
                        {list.length === 0 && <li className="px-5 py-6 text-sm text-slate-500 text-center">Nobody right now.</li>}
                    </ul>
                </>
            )}
        </Card>
    );
}

/** Visits: how many, how long, how many pages, how many left after one look */
export function SessionTiles({ s }: { s: Usage['sessions'] }) {
    const tiles = [
        ['Visits', n(s?.sessions), 'Each time someone opened the app. A visit ends after 30 minutes without activity.'],
        ['Typical visit', s?.median_minutes !== null && s?.median_minutes !== undefined ? `${n(s.median_minutes, 1)} min` : '—', 'How long a visit usually lasts. Short is fine: checking a bus should be quick.'],
        ['Left without doing anything', s?.bounce_rate !== null && s?.bounce_rate !== undefined ? `${n(s.bounce_rate, 1)}%` : '—', 'Visits where people opened the app and left without searching or tapping. High means the app is confusing or slow.'],
    ] as const;
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {tiles.map(([label, value, hint]) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-xs font-medium text-slate-500">{label}</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
                    <p className="text-[11px] leading-snug text-slate-500 mt-2">{hint}</p>
                </div>
            ))}
        </div>
    );
}

/** What went wrong on riders' devices: crashes and failed requests */
export function ErrorsCard({ errors, places, api, query = '' }: { errors: UsageTop[]; places: UsageTop[]; api: UsageTop[]; query?: string }) {
    const total = errors.reduce((s, e) => s + e.events, 0) + api.reduce((s, e) => s + e.events, 0);
    return (
        <Card title="Errors on riders' devices" about="Things that broke in the app on people's phones and computers. Anything here is a bug to fix." action={<CsvButton name="errors" rows={[...errors.map(e => ({ type: 'crash', ...e })), ...api.map(e => ({ type: 'request', ...e }))]} />}>
            {total === 0 ? <p className="px-5 py-6 text-sm text-emerald-800">No errors recorded in this period.</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500"><th className="px-5 py-2 font-medium">What went wrong</th><th className="px-3 py-2 font-medium text-right">Times</th><th className="px-5 py-2 font-medium text-right">Riders</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {errors.map(e => <tr key={'e' + e.value}><td className="px-5 py-2 text-slate-900 break-words"><span className="text-xs font-semibold text-red-700 mr-1">Crash</span><Link to={topicLink('errors', e.value, query)} className="hover:text-[#003DA5] hover:underline">{e.value}</Link></td><td className="px-3 py-2 text-right tabular-nums">{n(e.events)}</td><td className="px-5 py-2 text-right tabular-nums text-slate-600">{n(e.visitors)}</td></tr>)}
                        {api.map(e => <tr key={'a' + e.value}><td className="px-5 py-2 text-slate-900 break-words"><span className="text-xs font-semibold text-amber-800 mr-1">Request failed</span><Link to={topicLink('apiErrors', e.value, query)} className="hover:text-[#003DA5] hover:underline">{e.value}</Link></td><td className="px-3 py-2 text-right tabular-nums">{n(e.events)}</td><td className="px-5 py-2 text-right tabular-nums text-slate-600">{n(e.visitors)}</td></tr>)}
                    </tbody>
                </table>
            )}
            {places.length > 0 && <p className="px-5 py-2 text-xs text-slate-500 border-t border-slate-100">Where in the code: {places.slice(0, 5).map(p => `${p.value} (${p.events})`).join(', ')}</p>}
        </Card>
    );
}

/** Where buses serve riders badly: places riders looked for buses to, worst first */
export function UnmetCard({ rows }: { rows: Unmet[] }) {
    return (
        <Card title="Where riders found no good bus" about="Places people looked up buses to, worst served first: no bus at all, then over an hour, then places people looked at but didn't go. Shows where bus service is missing." action={<CsvButton name="unmet-demand" rows={rows as unknown as Record<string, unknown>[]} />}>
            {rows.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">Nothing yet.</p> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                        <thead><tr className="text-left text-xs text-slate-500">
                            <th className="px-5 py-2 font-medium">Destination</th><th className="px-3 py-2 font-medium text-right" title="Times riders looked at bus options to it">Looked</th>
                            <th className="px-3 py-2 font-medium text-right">Riders</th><th className="px-3 py-2 font-medium text-right" title="Looked and there was no bus at all">No bus</th>
                            <th className="px-3 py-2 font-medium text-right" title="The best option took over an hour">Over 1 h</th><th className="px-3 py-2 font-medium text-right" title="Average minutes of the best option">Best, avg</th>
                            <th className="px-5 py-2 font-medium text-right" title="Trips started there, as a share of times looked">Took the bus</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(u => (
                                <tr key={u.place} className={u.no_options || u.over_hour ? 'bg-red-50/40' : ''}>
                                    <td className="px-5 py-2 text-slate-900 whitespace-normal min-w-[8rem]">{u.place}</td><td className="px-3 py-2 text-right tabular-nums">{n(u.looked)}</td><td className="px-3 py-2 text-right tabular-nums text-slate-600">{n(u.riders)}</td>
                                    <td className={'px-3 py-2 text-right tabular-nums ' + (u.no_options ? 'text-red-700 font-semibold' : '')}>{n(u.no_options)}</td>
                                    <td className={'px-3 py-2 text-right tabular-nums ' + (u.over_hour ? 'text-amber-800 font-semibold' : '')}>{n(u.over_hour)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{u.avg_best_minutes !== null ? `${n(u.avg_best_minutes)} min` : '—'}</td>
                                    <td className="px-5 py-2 text-right tabular-nums">{u.took_bus_pct !== null ? `${n(u.took_bus_pct)}%` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/** Where riders search: a dot per place (rounded to ~100 m), bigger for more searches; a click can open the place.
 *  Dots keep their size on screen at any zoom, and the map fits itself to the places shown. */
export function SearchMap({ points, ready, onPick, title = 'Where riders search', about = 'Where the places people searched for are. Bigger dots mean more searches. Hover a dot for the place, click it to see who searched for it.' }: {
    points: SearchPoint[]; ready: boolean; onPick?: (p: SearchPoint) => void; title?: string; about?: string;
}) {
    const [hover, setHover] = useState<SearchPoint | null>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const max = Math.max(1, ...points.map(p => p.events));
    // Fit to the places, only when the set of places changes (not on every refresh, so a zoom the admin chose stays)
    const where = points.map(p => `${p.lat},${p.lng}`).join('|');
    useEffect(() => {
        if (!map || !points.length) return;
        if (points.length === 1) { map.setCenter({ lat: points[0].lat, lng: points[0].lng }); map.setZoom(15); return; }
        const bounds = new google.maps.LatLngBounds();
        for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng });
        map.fitBounds(bounds, 48);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, where]);
    return (
        <Card title={title} about={about} action={<span className="text-xs text-slate-500">{points.length} place{points.length === 1 ? '' : 's'}</span>}>
            <div className="relative h-96">
                {!ready ? <p className="p-5 text-sm text-slate-500">Loading the map…</p> : (
                    <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={MapModel.center} zoom={12} onLoad={setMap} onUnmount={() => setMap(null)}
                        options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false }}>
                        {points.map(p => (
                            <Marker key={`${p.lat},${p.lng}`} position={{ lat: p.lat, lng: p.lng }} title={`${p.label || 'A place'}: ${p.events}`}
                                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 7 + 13 * Math.sqrt(p.events / max), fillColor: BLUE, fillOpacity: 0.55, strokeColor: '#ffffff', strokeWeight: 2 }}
                                onMouseOver={() => setHover(p)} onMouseOut={() => setHover(null)} onClick={() => onPick ? onPick(p) : setHover(p)} />
                        ))}
                    </GoogleMap>
                )}
                {hover && <div className="absolute top-2 left-2 bg-white/95 border border-slate-200 rounded-lg px-3 py-1.5 text-sm shadow">{hover.label || 'A place'}: <b>{n(hover.events)}</b> {hover.events === 1 ? 'time' : 'times'}</div>}
                {ready && points.length === 0 && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="bg-white/95 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 shadow">No places in this period</span></div>}
            </div>
        </Card>
    );
}

/** Returning riders: signed-in riders each week, and how many were also there the week before */
export function RetentionCard({ rows }: { rows: Usage['retention'] }) {
    const data = rows.map(r => ({ week: new Date(r.week + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }), Returning: r.returning_riders, New: r.new_riders, Other: Math.max(0, r.riders - r.returning_riders - r.new_riders) }));
    return (
        <Card title="Returning riders" about="Signed-in riders each week. Blue came back from the week before, orange are new. Riders who keep coming back are the best sign the app is useful.">
            <div className="h-64 p-4">
                {data.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
                            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={32} />
                            <Tooltip cursor={{ fill: '#f1f5f9' }} />
                            <Legend formatter={v => <span style={{ color: '#334155' }}>{v}</span>} />
                            <Bar dataKey="Returning" stackId="r" fill={BLUE} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                            <Bar dataKey="New" stackId="r" fill={ORANGE} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                            <Bar dataKey="Other" name="Came back after a break" stackId="r" fill={AQUA} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </Card>
    );
}

/* ── Shared by the Insights pages ── */

/** Which period to look at: the last day, week, month or 3 months, or any range of Regina days up to a year */
export function RangePicker({ days, custom, setDays, setCustom }: { days: number; custom: { from: string; to: string } | null; setDays: (d: number) => void; setCustom: (c: { from: string; to: string }) => void }) {
    const today = new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);   // Regina date
    const [draft, setDraft] = useState<{ from: string; to: string }>(custom ?? { from: today, to: today });
    return (
        <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {RANGES.map(r => (
                    <button key={r.days} onClick={() => setDays(r.days)} aria-pressed={!custom && days === r.days}
                        className={'px-3 py-1.5 text-xs font-semibold rounded-md ' + (!custom && days === r.days ? 'bg-[#003DA5] text-white' : 'text-slate-600 hover:bg-slate-50')}>
                        {r.label}
                    </button>
                ))}
            </div>
            <form onSubmit={e => { e.preventDefault(); if (draft.from <= draft.to) setCustom(draft); }} className={'inline-flex items-center gap-1 rounded-lg border bg-white px-1.5 py-0.5 text-xs ' + (custom ? 'border-[#003DA5]' : 'border-slate-200')}>
                <input type="date" aria-label="From" value={draft.from} max={today} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} className="px-1 py-1 text-xs" />
                <span className="text-slate-400">to</span>
                <input type="date" aria-label="To" value={draft.to} max={today} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} className="px-1 py-1 text-xs" />
                <button type="submit" disabled={!draft.from || !draft.to || draft.from > draft.to} className="px-2 py-1 font-semibold text-[#003DA5] disabled:text-slate-400">Show</button>
            </form>
        </div>
    );
}

/** Overview · Activity · Riders, keeping the period */
export function InsightsTabs({ query }: { query: string }) {
    const tabs = [['/admin/insights', 'Overview', 'Totals, trends and what riders look for'], ['/admin/insights/activity', 'Activity', 'Every action, as it happened'], ['/admin/insights/riders', 'Riders', 'Everyone who used the app, and what each did']] as const;
    return (
        <nav aria-label="Insights" className="flex flex-wrap gap-1 mb-6 border-b border-slate-200">
            {tabs.map(([to, label, title]) => (
                <NavLink key={to} to={`${to}?${query}`} end title={title}
                    className={({ isActive }) => '-mb-px px-4 py-2 text-sm font-semibold border-b-2 ' + (isActive ? 'border-[#003DA5] text-[#003DA5]' : 'border-transparent text-slate-500 hover:text-slate-800')}>
                    {label}
                </NavLink>
            ))}
        </nav>
    );
}

/** A person's name, linked to everything they did; anonymous visitors marked as such */
export function PersonName({ a }: { a: Pick<Actor, 'who' | 'userId' | 'visitor'> }) {
    const to = personLink(a);
    const name = to ? <Link to={to} className="text-[#003DA5] hover:underline">{a.who}</Link> : <span>{a.who}</span>;
    return <span className="inline-flex items-center gap-1.5">{name}{!a.userId && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">anon</span>}</span>;
}

/** One action in plain words, linked to the item's page when it has one */
export function EventText({ e, query }: { e: Pick<ExploreEvent, 'kind' | 'detail' | 'page'>; query: string }) {
    const text = describeUsage(e.kind, e.detail, e.page);
    const t = KIND_TOPIC[e.kind], value = t ? e.detail?.[t[1]] : undefined;
    return value === undefined || value === null || value === '' ? <>{text}</> : <Link to={topicLink(t[0], String(value), query)} className="text-slate-900 hover:text-[#003DA5] hover:underline">{text}</Link>;
}

/** Actions, newest first, under a heading for each Regina day */
export function EventFeed({ events, query, showWho = true, empty = 'Nothing recorded.' }: { events: ExploreEvent[]; query: string; showWho?: boolean; empty?: string }) {
    const days: { day: string; items: ExploreEvent[] }[] = [];
    for (const e of events) {
        const day = new Date(new Date(e.at).getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
        if (days[days.length - 1]?.day !== day) days.push({ day, items: [] });
        days[days.length - 1].items.push(e);
    }
    if (!events.length) return <p className="px-5 py-8 text-sm text-slate-500 text-center">{empty}</p>;
    return (
        <div>
            {days.map(d => (
                <div key={d.day}>
                    <div className="sticky top-0 z-10 bg-slate-50 px-5 py-1 text-xs font-semibold text-slate-600 border-y border-slate-100">{new Date(d.day + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</div>
                    <ul className="divide-y divide-slate-100">{d.items.map((e, i) => (
                        <li key={e.at + i} className="px-5 py-2 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <span className="text-slate-500 tabular-nums w-16 flex-none">{new Date(e.at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Regina' })}</span>
                            <span className={'w-2 h-2 rounded-full flex-none translate-y-[-1px] ' + kindDot(e.kind)} aria-hidden="true" />
                            <span className="flex-1 min-w-[12rem]"><EventText e={e} query={query} /></span>
                            {showWho && <span className="text-slate-500"><PersonName a={e} /></span>}
                            {e.device && <span className="text-xs text-slate-400">{e.device}</span>}
                        </li>
                    ))}</ul>
                </div>
            ))}
        </div>
    );
}
/** A colour for each sort of action, so a feed can be scanned: searching, buses and stops, trips, problems, the rest */
function kindDot(kind: string) {
    if (['place_searched', 'planner_searched', 'place_tapped', 'suggestions_shown', 'arrive_by_planned'].includes(kind)) return 'bg-[#1a73e8]';
    if (['route_selected', 'bus_opened', 'stop_opened', 'stop_more', 'stop_refresh'].includes(kind)) return 'bg-[#1baf7a]';
    if (['trip_started', 'trip_stopped', 'trip_texts', 'trip_texts_on'].includes(kind)) return 'bg-[#e37400]';
    if (['app_error', 'api_error', 'location_problem', 'search_no_results', 'report_sent'].includes(kind)) return 'bg-red-500';
    return 'bg-slate-300';
}

/** A ranked list: value, times, distinct riders. With `topic`, each row opens that item's page. */
export function TopList({ title, about, rows, valueLabel, render, topic, query = '', empty = 'Nothing yet.' }: {
    title: string; about: string; rows: UsageTop[]; valueLabel: string; render?: (v: string) => React.ReactNode; topic?: string; query?: string; empty?: string;
}) {
    const max = Math.max(1, ...rows.map(r => r.events));
    return (
        <Card title={title} about={about} action={<CsvButton name={title.toLowerCase().replace(/[^a-z0-9]+/g, '-')} rows={rows as unknown as Record<string, unknown>[]} />}>
            {rows.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">{empty}</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500"><th className="px-5 py-2 font-medium">{valueLabel}</th><th className="px-3 py-2 font-medium text-right">Times</th><th className="px-5 py-2 font-medium text-right">Riders</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(r => (
                            <tr key={r.value} className={topic ? 'hover:bg-slate-50' : ''}>
                                <td className="px-5 py-2 text-slate-900 break-words">
                                    {topic ? <Link to={topicLink(topic, r.value, query)} className="hover:text-[#003DA5] hover:underline">{render ? render(r.value) : r.value}</Link> : render ? render(r.value) : r.value}
                                    {/* how it compares with the top one */}
                                    <div className="h-1 mt-1 rounded bg-slate-100"><div className="h-1 rounded bg-[#1a73e8]/60" style={{ width: `${(r.events / max) * 100}%` }} /></div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums align-top">{n(r.events)}</td>
                                <td className="px-5 py-2 text-right tabular-nums text-slate-600 align-top">{n(r.visitors)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Card>
    );
}

/** Busiest times: one hue, light (quiet) to dark (busy); every cell names its numbers on hover */
export function Heatmap({ hours, unit = 'actions' }: { hours: { weekday: number; hour: number; events: number }[]; unit?: string }) {
    const at = new Map(hours.map(h => [`${h.weekday}-${h.hour}`, h.events]));
    const max = Math.max(1, ...hours.map(h => h.events));
    const STEPS = ['#f1f5f9', '#dbe7fb', '#b3cdf6', '#7aa9f0', '#3f82e6', '#1a5fc4'];
    const shade = (v: number) => v === 0 ? STEPS[0] : STEPS[Math.min(5, 1 + Math.floor((v / max) * 4.999))];
    return (
        <div className="overflow-x-auto px-5 py-4">
            <table className="text-[10px] text-slate-500 border-separate" style={{ borderSpacing: 2 }}>
                <thead><tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} className="font-normal w-5">{h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`) : ''}</th>)}</tr></thead>
                <tbody>
                    {[1, 2, 3, 4, 5, 6, 0].map(d => (
                        <tr key={d}>
                            <th className="font-medium pr-2 text-right">{WEEKDAYS[d]}</th>
                            {Array.from({ length: 24 }, (_, h) => {
                                const v = at.get(`${d}-${h}`) ?? 0;
                                return <td key={h} title={`${WEEKDAYS[d]} ${h}:00–${h}:59 (Regina): ${n(v)} ${unit}`} className="w-5 h-5 rounded" style={{ backgroundColor: shade(v) }} />;
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500">Quiet {STEPS.map(c => <span key={c} className="w-4 h-3 rounded inline-block" style={{ backgroundColor: c }} />)} Busy</div>
        </div>
    );
}

/** Sends the admin to a place's page when a circle on the overview map is clicked */
export function usePlacePicker(query: string) {
    const navigate = useNavigate();
    return (p: SearchPoint) => { if (p.label) navigate(topicLink('places', p.label, query)); };
}

