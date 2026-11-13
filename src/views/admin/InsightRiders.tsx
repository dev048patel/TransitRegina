/**
 * InsightRiders.tsx — Transit Regina  [VIEW — MVC]
 * Everyone who used the app in the period, busiest first: what each searched, rode, checked and tapped,
 * how often they came and when they were last seen. Click someone to see everything they did. Each look is recorded.
 */
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRidersController, type RiderSort } from '../../controllers/admin/useExploreController';
import { downloadCsv } from '../../controllers/admin/useUsageController';
import { Card, PageHeader, Stat, when } from '../components/admin/ui';
import { InsightsTabs, PersonName, RangePicker } from './UsageSections';

const BLUE = '#1a73e8', AQUA = '#1baf7a', ORANGE = '#e37400';   // validated together (dataviz validator)
const n = (v: number) => v.toLocaleString('en-CA');
const COLUMNS: [Exclude<RiderSort, 'last'>, string, string][] = [
    ['visits', 'Visits', 'Times they opened the app'], ['searches', 'Searches', 'Places searched or planned'], ['trips', 'Trips', 'Trips started'],
    ['stops', 'Stops', 'Stop boards opened'], ['buses', 'Buses', 'Buses tapped'], ['errors', 'Errors', 'Errors they hit'],
];

export default function InsightRiders() {
    const { range, data, error, loading, reload, riders, show, setShow, find, setFind, sort, setSort } = useRidersController();
    const all = data?.people ?? [];
    const signedIn = all.filter(p => p.userId).length;
    const top = riders.slice(0, 10).map(p => ({ name: p.who.length > 30 ? p.who.slice(0, 29) + '…' : p.who, Searches: p.searches, 'Stops and buses': p.stops + p.buses, Trips: p.trips }));

    return (
        <div>
            <InsightsTabs query={range.query} />
            <PageHeader title="Riders" subtitle="Everyone who used the app in this period, and what each did"
                actions={<RangePicker days={range.days} custom={range.custom} setDays={range.setDays} setCustom={range.setCustom} />} />
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Could not load riders: {error} <button onClick={reload} className="underline ml-1">Try again</button></p>}
            {loading && !data && <p className="text-sm text-slate-500">Loading…</p>}
            {data && !data.setup && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">Usage tracking is not set up yet (docs/security/011 and 012).</p>}

            {data?.setup && (
                <div className="space-y-6">
                    {data.capped && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">This period holds more than 20,000 actions: these counts cover the latest 20,000. Pick a shorter period for exact numbers.</p>}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <Stat label="People" value={n(all.length)} sub="who used the app" />
                        <Stat label="Signed-in riders" value={n(signedIn)} sub="by their account" />
                        <Stat label="Anonymous visitors" value={n(all.length - signedIn)} sub="a new id each day" />
                        <Stat label="Did something" value={n(all.filter(p => p.actions > 0).length)} sub="searched, tapped or rode, not just looked" />
                    </div>

                    {top.length > 0 && (
                        <Card title="Most active" about="The ten people at the top of the list below, and what they did most.">
                            <div className="p-4" style={{ height: 40 + top.length * 34 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                                        <YAxis type="category" dataKey="name" width={210} tickLine={false} axisLine={false} fontSize={12} interval={0} />
                                        <Tooltip cursor={{ fill: '#f1f5f9' }} />
                                        <Legend formatter={v => <span style={{ color: '#334155' }}>{v}</span>} />
                                        <Bar dataKey="Searches" stackId="a" fill={BLUE} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                                        <Bar dataKey="Stops and buses" stackId="a" fill={AQUA} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                                        <Bar dataKey="Trips" stackId="a" fill={ORANGE} stroke="#fff" strokeWidth={1} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    )}

                    <Card title={`Everyone (${n(riders.length)})`} about="Click a name to see everything that person did. Click a column heading to sort by it. Signed-out visitors get a new anonymous id each day, so the same person can appear once per day."
                        action={<button onClick={() => downloadCsv('riders', riders.map(p => ({ who: p.who, signed_in: !!p.userId, visits: p.visits, searches: p.searches, trips: p.trips, stops: p.stops, buses: p.buses, routes: p.routes, errors: p.errors, top_place: p.topPlace, first: p.first, last: p.last, device: p.device })))} className="text-xs font-semibold text-[#003DA5] hover:underline">CSV</button>}>
                        <div className="flex flex-wrap items-center gap-3 px-5 pt-3">
                            <input value={find} onChange={e => setFind(e.target.value)} placeholder="Find a name, email or place" aria-label="Find" className="flex-1 min-w-[12rem] px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
                            <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                                {(['all', 'signed', 'anonymous'] as const).map(s => (
                                    <button key={s} onClick={() => setShow(s)} aria-pressed={show === s} className={'px-2 py-1 rounded-md font-semibold ' + (show === s ? 'bg-[#003DA5] text-white' : 'text-slate-600')}>{s === 'all' ? 'Everyone' : s === 'signed' ? 'Signed in' : 'Anonymous'}</button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto mt-3 max-h-[40rem] overflow-y-auto">
                            <table className="w-full text-sm whitespace-nowrap">
                                <thead className="sticky top-0 bg-white z-10"><tr className="text-left text-xs text-slate-500">
                                    <th className="px-5 py-2 font-medium">Person</th>
                                    {COLUMNS.map(([key, label, hint]) => (
                                        <th key={key} className="px-3 py-2 font-medium text-right">
                                            <button onClick={() => setSort(key)} title={hint} className={sort === key ? 'text-[#003DA5] font-semibold' : 'hover:text-slate-800'}>{label}{sort === key ? ' ▾' : ''}</button>
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 font-medium">Most looked-for place</th>
                                    <th className="px-3 py-2 font-medium"><button onClick={() => setSort('last')} className={sort === 'last' ? 'text-[#003DA5] font-semibold' : 'hover:text-slate-800'}>Last seen{sort === 'last' ? ' ▾' : ''}</button></th>
                                    <th className="px-5 py-2 font-medium">Device</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {riders.map(p => (
                                        <tr key={p.key} className="hover:bg-slate-50">
                                            <td className="px-5 py-2"><PersonName a={p} /></td>
                                            {COLUMNS.map(([key]) => <td key={key} className={'px-3 py-2 text-right tabular-nums ' + (p[key] === 0 ? 'text-slate-300' : key === 'errors' ? 'text-red-700 font-semibold' : 'text-slate-900')}>{n(p[key])}</td>)}
                                            <td className="px-3 py-2 text-slate-600 max-w-[16rem] truncate" title={p.topPlace ?? ''}>{p.topPlace ?? '—'}</td>
                                            <td className="px-3 py-2 text-slate-600">{when(p.last)}</td>
                                            <td className="px-5 py-2 text-slate-600">{p.device ?? '—'}</td>
                                        </tr>
                                    ))}
                                    {riders.length === 0 && <tr><td colSpan={COLUMNS.length + 4} className="px-5 py-8 text-center text-slate-500">Nobody matches.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
