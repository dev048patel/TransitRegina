/**
 * InsightItem.tsx — Transit Regina  [VIEW — MVC]
 * One thing riders did, in depth: a place searched, a route, a bus, a stop, a page, an error…
 * Who did it (signed-in riders by name, others anonymous), when (per day and hour), on what, where (the places
 * involved), and every time it happened. Opened from any ranked list on Insights. Each look is recorded.
 */
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useItemController } from '../../controllers/admin/useExploreController';
import { downloadCsv } from '../../controllers/admin/useUsageController';
import { TOPICS, hourLabel, topicLink } from '../../models/data/usageLabels';
import { Card, PageHeader, Stat, when } from '../components/admin/ui';
import { EventFeed, Heatmap, PersonName, RangePicker, SearchMap } from './UsageSections';

const BLUE = '#1a73e8', ORANGE = '#e37400';
const n = (v: number) => v.toLocaleString('en-CA');
/** Other pages about the same route or place, from a different angle */
const RELATED: string[][] = [['routes', 'busRoutes', 'tripRoutes'], ['places', 'plannerPlaces', 'tappedPlaces', 'tripDestinations']];

export default function InsightItem() {
    const { topic = '' } = useParams();
    const value = useSearchParams()[0].get('value') ?? '';
    const { range, data, error, loading, reload, people, show, setShow, mapReady } = useItemController(topic, value);
    const navigate = useNavigate();
    const about = TOPICS[topic] ?? { name: (v: string) => v, did: 'did this', group: 'Item' };
    const title = about.name(value);
    const related = (RELATED.find(g => g.includes(topic)) ?? []).filter(t => t !== topic && (topic !== 'tripRoutes' || !value.includes('>')));
    const ready = data?.setup ? data : null;

    return (
        <div>
            <Link to={`/admin/insights?${range.query}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={16} /> Insights</Link>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#003DA5] mb-1">{about.group}</div>
            <PageHeader title={title} subtitle={`Everyone who ${about.did}, when, and on what`}
                actions={<RangePicker days={range.days} custom={range.custom} setDays={range.setDays} setCustom={range.setCustom} />} />

            {related.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 -mt-3 mb-6 text-xs">
                    <span className="text-slate-500">Same {topic.toLowerCase().includes('route') ? 'route' : 'place'}, also:</span>
                    {related.map(t => <Link key={t} to={topicLink(t, value, range.query)} className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-[#003DA5] hover:text-[#003DA5]">{TOPICS[t]?.group ?? t}</Link>)}
                </div>
            )}

            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Could not load this: {error} <button onClick={reload} className="underline ml-1">Try again</button></p>}
            {loading && !data && <p className="text-sm text-slate-500">Loading…</p>}
            {data && !data.setup && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">Usage tracking is not set up yet (docs/security/011 and 012).</p>}

            {ready && (
                <div className="space-y-6">
                    {ready.capped && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">This period has more than 5,000 of these: the numbers below count the latest 5,000. Pick a shorter period for exact numbers.</p>}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <Stat label="Times" value={n(ready.totals.events)} sub={`in ${ready.days} day${ready.days === 1 ? '' : 's'}`} />
                        <Stat label="People" value={n(ready.totals.people)} sub="each counted once" />
                        <Stat label="Signed-in riders" value={n(ready.totals.signedIn)} sub="by their account" />
                        <Stat label="Anonymous visitors" value={n(ready.totals.anonymous)} sub="a new id each day" />
                    </div>

                    {ready.totals.events === 0 ? (
                        <Card><p className="px-5 py-10 text-sm text-slate-500 text-center">Nobody {about.did} in this period. Try a longer one.</p></Card>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                                <Card title={ready.days === 1 ? 'Per hour' : 'Per day'} about={`Blue is how many times, orange how many different people${ready.days === 1 ? ', in each hour (Regina time)' : ''}.`}>
                                    <div className="h-64 p-4">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={ready.days === 1 ? ready.hourly.map(h => ({ ...h, label: hourLabel(h.hour) })) : ready.daily.map(d => ({ ...d, label: new Date(d.day + 'T12:00:00Z').toLocaleDateString('en-CA', ready.days <= 7 ? { weekday: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' }) }))} barCategoryGap={2}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={36} />
                                                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                                                <Legend formatter={v => <span style={{ color: '#334155' }}>{v}</span>} />
                                                <Bar dataKey="events" name="Times" fill={BLUE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                                <Bar dataKey="people" name="People" fill={ORANGE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>
                                <Card title="When (Regina time)" about="By day of the week and hour. Darker means more often.">
                                    <Heatmap hours={ready.hours} unit="times" />
                                    <div className="px-5 pb-4 flex flex-wrap gap-2 text-xs">
                                        {ready.devices.map(d => <span key={d.device} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">{d.device}: <b className="tabular-nums">{n(d.visitors)}</b> {d.visitors === 1 ? 'person' : 'people'}</span>)}
                                    </div>
                                </Card>
                            </div>

                            {ready.points.length > 0 && (
                                <SearchMap points={ready.points} ready={mapReady} title="Where" about="The places involved, rounded to about 100 m. Bigger dots mean more often. Click one to open that place."
                                    onPick={p => { if (p.label && p.label !== value) navigate(topicLink('places', p.label, range.query)); }} />
                            )}

                            <Card title={`Who (${n(ready.totals.people)})`} about="Click a name to see everything that person did. Signed-out visitors get a new anonymous id each day, so the same person can appear once per day."
                                action={
                                    <div className="flex items-center gap-3">
                                        <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                                            {(['all', 'signed', 'anonymous'] as const).map(s => (
                                                <button key={s} onClick={() => setShow(s)} aria-pressed={show === s} className={'px-2 py-1 rounded-md font-semibold ' + (show === s ? 'bg-[#003DA5] text-white' : 'text-slate-600')}>{s === 'all' ? 'Everyone' : s === 'signed' ? 'Signed in' : 'Anonymous'}</button>
                                            ))}
                                        </div>
                                        <button onClick={() => downloadCsv(`who-${topic}-${value}`.replace(/[^a-z0-9-]+/gi, '-'), people.map(p => ({ who: p.who, signed_in: !!p.userId, times: p.events, first: p.first, last: p.last, device: p.device })))} className="text-xs font-semibold text-[#003DA5] hover:underline">CSV</button>
                                    </div>
                                }>
                                <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                                    <table className="w-full text-sm whitespace-nowrap">
                                        <thead className="sticky top-0 bg-white"><tr className="text-left text-xs text-slate-500">
                                            <th className="px-5 py-2 font-medium">Person</th><th className="px-3 py-2 font-medium text-right">Times</th>
                                            <th className="px-3 py-2 font-medium">First</th><th className="px-3 py-2 font-medium">Last</th><th className="px-5 py-2 font-medium">Device</th>
                                        </tr></thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {people.map(p => (
                                                <tr key={p.key} className="hover:bg-slate-50">
                                                    <td className="px-5 py-2"><PersonName a={p} /></td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{n(p.events)}</td>
                                                    <td className="px-3 py-2 text-slate-600">{when(p.first)}</td>
                                                    <td className="px-3 py-2 text-slate-600">{when(p.last)}</td>
                                                    <td className="px-5 py-2 text-slate-600">{p.device ?? '—'}</td>
                                                </tr>
                                            ))}
                                            {people.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500">Nobody here.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            <Card title="Every time" about={`Newest first${ready.events.length < ready.totals.events ? `, the latest ${n(ready.events.length)}` : ''}.`}>
                                <div className="max-h-[32rem] overflow-y-auto"><EventFeed events={ready.events} query={range.query} /></div>
                            </Card>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
