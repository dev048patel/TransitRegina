/**
 * UsageSections.tsx — Transit Regina  [VIEW — MVC]
 * The deeper parts of the admin Usage page: who is on now, visits, errors, unmet demand, the search map and
 * returning riders. Pure rendering; the data comes from useUsageController.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Circle, GoogleMap } from '@react-google-maps/api';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NowVisitor, SearchPoint, Unmet, Usage, UsageTop } from '../../controllers/admin/useUsageController';
import { downloadCsv } from '../../controllers/admin/useUsageController';
import { USAGE_LABEL } from '../../models/data/usageLabels';
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
export function ErrorsCard({ errors, places, api }: { errors: UsageTop[]; places: UsageTop[]; api: UsageTop[] }) {
    const total = errors.reduce((s, e) => s + e.events, 0) + api.reduce((s, e) => s + e.events, 0);
    return (
        <Card title="Errors on riders' devices" about="Things that broke in the app on people's phones and computers. Anything here is a bug to fix." action={<CsvButton name="errors" rows={[...errors.map(e => ({ type: 'crash', ...e })), ...api.map(e => ({ type: 'request', ...e }))]} />}>
            {total === 0 ? <p className="px-5 py-6 text-sm text-emerald-800">No errors recorded in this period.</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500"><th className="px-5 py-2 font-medium">What went wrong</th><th className="px-3 py-2 font-medium text-right">Times</th><th className="px-5 py-2 font-medium text-right">Riders</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {errors.map(e => <tr key={'e' + e.value}><td className="px-5 py-2 text-slate-900 break-words"><span className="text-xs font-semibold text-red-700 mr-1">Crash</span>{e.value}</td><td className="px-3 py-2 text-right tabular-nums">{n(e.events)}</td><td className="px-5 py-2 text-right tabular-nums text-slate-600">{n(e.visitors)}</td></tr>)}
                        {api.map(e => <tr key={'a' + e.value}><td className="px-5 py-2 text-slate-900 break-words"><span className="text-xs font-semibold text-amber-800 mr-1">Request failed</span>{e.value}</td><td className="px-3 py-2 text-right tabular-nums">{n(e.events)}</td><td className="px-5 py-2 text-right tabular-nums text-slate-600">{n(e.visitors)}</td></tr>)}
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

/** Where riders search: a circle per place (rounded to ~100 m), bigger for more searches */
export function SearchMap({ points, ready }: { points: SearchPoint[]; ready: boolean }) {
    const [hover, setHover] = useState<SearchPoint | null>(null);
    const max = Math.max(1, ...points.map(p => p.events));
    return (
        <Card title="Where riders search" about="Where the places people searched for are. Bigger circles mean more searches. Hover a circle for the place." action={<span className="text-xs text-slate-500">{points.length} places</span>}>
            <div className="relative h-80">
                {!ready ? <p className="p-5 text-sm text-slate-500">Loading the map…</p> : (
                    <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={MapModel.center} zoom={11}
                        options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false }}>
                        {points.map(p => (
                            <Circle key={`${p.lat},${p.lng}`} center={{ lat: p.lat, lng: p.lng }} radius={120 + 600 * Math.sqrt(p.events / max)}
                                options={{ fillColor: BLUE, fillOpacity: 0.35, strokeColor: BLUE, strokeOpacity: 0.8, strokeWeight: 1 }}
                                onMouseOver={() => setHover(p)} onMouseOut={() => setHover(null)} onClick={() => setHover(p)} />
                        ))}
                    </GoogleMap>
                )}
                {hover && <div className="absolute top-2 left-2 bg-white/95 border border-slate-200 rounded-lg px-3 py-1.5 text-sm shadow">{hover.label || 'A place'}: <b>{n(hover.events)}</b> searches</div>}
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
