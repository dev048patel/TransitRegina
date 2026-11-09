/**
 * Usage.tsx — Transit Regina  [VIEW — MVC]
 * What riders do in the app: how many, what they search for, which routes, stops and buses they look at, how far
 * they get towards a bus, when, and on what. Every number is counted in the database by Regina day.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useUsageController, change, RANGES, type UsageTop } from '../../controllers/admin/useUsageController';
import { CsvButton, ErrorsCard, NowCard, RetentionCard, SearchMap, SessionTiles, SpeedCard, UnmetCard } from './UsageSections';
import { USAGE_LABEL, WEEKDAYS, describeUsage } from '../../models/data/usageLabels';
import { Card, PageHeader, when } from '../components/admin/ui';

const BLUE = '#1a73e8', ORANGE = '#e37400';   // validated pair: distinct for colour-blind readers too
// Charts don't animate: the page refreshes every minute, and replaying the animation each time is distracting
const dayLabel = (key: string, days: number) => new Date(key + 'T12:00:00Z').toLocaleDateString('en-CA', days <= 7 ? { weekday: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' });
const n = (v: number) => v.toLocaleString('en-CA');

/** A total, and how it moved against the period before */
function Total({ label, value, before, hint }: { label: string; value: number; before: number; hint: string }) {
    const c = change(value, before);
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4" title={hint}>
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{n(value)}</div>
            <div className="text-xs mt-1 text-slate-500">
                <span className={c.up === null ? '' : c.up ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>{c.up === true ? '▲ ' : c.up === false ? '▼ ' : ''}{c.text}</span> vs the period before
            </div>
        </div>
    );
}

/** A ranked list: value, times, distinct riders */
function TopList({ title, rows, valueLabel, render, empty = 'Nothing yet.' }: { title: string; rows: UsageTop[]; valueLabel: string; render?: (v: string) => React.ReactNode; empty?: string }) {
    return (
        <Card title={title} action={<CsvButton name={title.toLowerCase().replace(/[^a-z0-9]+/g, '-')} rows={rows as unknown as Record<string, unknown>[]} />}>
            {rows.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">{empty}</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500"><th className="px-5 py-2 font-medium">{valueLabel}</th><th className="px-3 py-2 font-medium text-right">Times</th><th className="px-5 py-2 font-medium text-right">Riders</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(r => (
                            <tr key={r.value}><td className="px-5 py-2 text-slate-900 break-words">{render ? render(r.value) : r.value}</td><td className="px-3 py-2 text-right tabular-nums">{n(r.events)}</td><td className="px-5 py-2 text-right tabular-nums text-slate-600">{n(r.visitors)}</td></tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Card>
    );
}

/** Busiest times: one hue, light (quiet) to dark (busy); every cell names its numbers on hover */
function Heatmap({ hours }: { hours: { weekday: number; hour: number; events: number }[] }) {
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
                                return <td key={h} title={`${WEEKDAYS[d]} ${h}:00–${h}:59 (Regina): ${n(v)} actions`} className="w-5 h-5 rounded" style={{ backgroundColor: shade(v) }} />;
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500">Quiet {STEPS.map(c => <span key={c} className="w-4 h-3 rounded inline-block" style={{ backgroundColor: c }} />)} Busy</div>
        </div>
    );
}

export default function Usage() {
    const { days, setDays, custom, setCustom, data, error, loading, now, points, mapReady } = useUsageController();
    const today = new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);   // Regina date
    const [draft, setDraft] = React.useState<{ from: string; to: string }>({ from: today, to: today });
    const ready = data?.setup ? data : null;

    return (
        <div>
            <PageHeader
                title="Usage"
                subtitle={ready ? `What riders do in the app · Regina days · updated every minute` : 'What riders do in the app'}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                            {RANGES.map(r => (
                                <button key={r.days} onClick={() => setDays(r.days)} aria-pressed={!custom && days === r.days}
                                    className={'px-3 py-1.5 text-xs font-semibold rounded-md ' + (!custom && days === r.days ? 'bg-[#003DA5] text-white' : 'text-slate-600 hover:bg-slate-50')}>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        {/* Any range of Regina days, up to a year */}
                        <form onSubmit={e => { e.preventDefault(); if (draft.from <= draft.to) setCustom(draft); }} className={'inline-flex items-center gap-1 rounded-lg border bg-white px-1.5 py-0.5 text-xs ' + (custom ? 'border-[#003DA5]' : 'border-slate-200')}>
                            <input type="date" aria-label="From" value={draft.from} max={today} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} className="px-1 py-1 text-xs" />
                            <span className="text-slate-400">to</span>
                            <input type="date" aria-label="To" value={draft.to} max={today} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} className="px-1 py-1 text-xs" />
                            <button type="submit" disabled={!draft.from || !draft.to || draft.from > draft.to} className="px-2 py-1 font-semibold text-[#003DA5] disabled:text-slate-400">Show</button>
                        </form>
                    </div>
                }
            />
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Could not load usage: {error}</p>}
            {data && !data.setup && (
                <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                    Usage tracking is not set up yet. Run <code>docs/security/011_usage_analytics.sql</code> in the Supabase SQL editor, then this page fills in as riders use the app.
                </p>
            )}
            {loading && !data && <p className="text-sm text-slate-500">Loading…</p>}

            <div className="mb-6"><NowCard now={now} /></div>

            {ready && (
                <div className="space-y-6">
                    {/* Totals against the period before */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <Total label="Visitors" value={ready.totals.visitors} before={ready.previous.visitors} hint="Each visitor counted once per day: the account when signed in, otherwise an anonymous id that changes daily. Over several days this is the sum of daily visitors." />
                        <Total label="Signed-in riders" value={ready.totals.riders} before={ready.previous.riders} hint="Accounts that did anything, counted once per day" />
                        <Total label="Pages opened" value={ready.totals.pageViews} before={ready.previous.pageViews} hint="Every page opened inside the app" />
                        <Total label="Place searches" value={ready.totals.searches} before={ready.previous.searches} hint="Places picked from the search box" />
                        <Total label="Trips started" value={ready.totals.trips} before={ready.previous.trips} hint="Times a rider pressed Start trip" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                        <Card title="Visitors per day">
                            <div className="h-64 p-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={ready.daily.map(d => ({ ...d, label: dayLabel(d.day, days) }))} barCategoryGap={2}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={36} />
                                        <Tooltip cursor={{ fill: '#f1f5f9' }} />
                                        <Bar dataKey="visitors" name="Visitors" fill={BLUE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                        <Card title="Searches and trips per day">
                            <div className="h-64 p-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={ready.daily.map(d => ({ ...d, label: dayLabel(d.day, days) }))}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={36} />
                                        <Tooltip />
                                        <Legend formatter={v => <span style={{ color: '#334155' }}>{v}</span>} />
                                        <Line dataKey="searches" name="Place searches" stroke={BLUE} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                                        <Line dataKey="trips" name="Trips started" stroke={ORANGE} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </div>

                    {ready.deeper ? <SessionTiles s={ready.sessions} /> : (
                        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">Visits, speed, unmet demand and returning riders need <code>docs/security/012_admin_insights.sql</code>.</p>
                    )}

                    {/* Getting to a bus: how far riders get */}
                    <Card title="Getting to a bus">
                        <div className="px-5 py-4 space-y-2">
                            {ready.funnel.map((step, i) => {
                                const first = ready.funnel[0].visitors || 1, pct = Math.round((step.visitors / first) * 100);
                                return (
                                    <div key={step.label} className="grid grid-cols-[11rem_1fr_6rem] items-center gap-3 text-sm">
                                        <span className="text-slate-700">{i + 1}. {step.label}</span>
                                        <div className="h-5 bg-slate-100 rounded" title={`${n(step.visitors)} riders`}>
                                            <div className="h-5 rounded" style={{ width: `${Math.max(step.visitors ? 1 : 0, Math.min(100, (step.visitors / first) * 100))}%`, backgroundColor: BLUE }} />
                                        </div>
                                        <span className="tabular-nums text-right text-slate-900">{n(step.visitors)} <span className="text-slate-500 text-xs">{i ? `${pct}%` : ''}</span></span>
                                    </div>
                                );
                            })}
                            <p className="text-xs text-slate-500 pt-1">Riders who did each step at least once in this period; percentages are of those who opened the map.</p>
                        </div>
                    </Card>

                    {ready.deeper && (
                        <div className="grid grid-cols-1 gap-4">
                            <UnmetCard rows={ready.unmet} />
                            <SearchMap points={points} ready={mapReady} />
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                        <TopList title="What riders searched for" valueLabel="Place" rows={ready.top.places} />
                        <TopList title="Where riders started trips to" valueLabel="Destination" rows={ready.top.tripDestinations} />
                        <TopList title="Routes riders picked" valueLabel="Route" rows={ready.top.routes} render={v => `Route ${v}`} />
                        <TopList title="Buses riders tapped, by route" valueLabel="Route" rows={ready.top.busRoutes} render={v => `Route ${v}`} />
                        <TopList title="Buses riders tapped" valueLabel="Bus" rows={ready.top.buses} render={v => `Bus #${v}`} />
                        <TopList title="Stop boards opened" valueLabel="Stop" rows={ready.top.stops} />
                        <TopList title="Routes riders rode (trips started)" valueLabel="Route" rows={ready.top.tripRoutes} render={v => `Route ${v.replace(/>/g, ' › ')}`} />
                        <TopList title="Places picked on the map" valueLabel="Place" rows={ready.top.tappedPlaces} />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                        <Card title="Busiest times (Regina)"><Heatmap hours={ready.hours} /></Card>
                        <Card title="Every feature">
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-xs text-slate-500"><th className="px-5 py-2 font-medium">What riders did</th><th className="px-3 py-2 font-medium text-right">Times</th><th className="px-5 py-2 font-medium text-right">Riders</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {ready.kinds.map(k => <tr key={k.kind}><td className="px-5 py-2 text-slate-900">{USAGE_LABEL[k.kind] ?? k.kind}</td><td className="px-3 py-2 text-right tabular-nums">{n(k.events)}</td><td className="px-5 py-2 text-right tabular-nums text-slate-600">{n(k.visitors)}</td></tr>)}
                                    {ready.kinds.length === 0 && <tr><td colSpan={3} className="px-5 py-6 text-slate-500">Nothing yet.</td></tr>}
                                </tbody>
                            </table>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                        <Card title="Devices">
                            <div className="px-5 py-4 space-y-2">
                                {ready.devices.map(d => {
                                    const total = ready.devices.reduce((s, x) => s + x.visitors, 0) || 1;
                                    return (
                                        <div key={d.device} className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3 text-sm" title={`${n(d.visitors)} visitors`}>
                                            <span className="text-slate-700">{d.device}</span>
                                            <div className="h-4 bg-slate-100 rounded"><div className="h-4 rounded" style={{ width: `${(d.visitors / total) * 100}%`, backgroundColor: BLUE }} /></div>
                                            <span className="tabular-nums text-right">{Math.round((d.visitors / total) * 100)}%</span>
                                        </div>
                                    );
                                })}
                                {ready.devices.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
                            </div>
                        </Card>
                        <TopList title="Pages opened" valueLabel="Page" rows={ready.top.pages} />
                        <div className="space-y-4">
                            <TopList title="Location question" valueLabel="Answer" rows={ready.top.location} render={v => v === 'allowed' ? 'Allowed' : 'Declined'} />
                            <TopList title="Planner panels opened" valueLabel="Panel" rows={ready.top.menus} render={v => ({ trip_planner: 'Trip Planner', saved: 'Saved Locations', weekly: 'Weekly Commute' } as Record<string, string>)[v] ?? v} />
                            <TopList title="Map characters chosen" valueLabel="Character" rows={ready.top.characters} render={v => v.charAt(0).toUpperCase() + v.slice(1)} />
                        </div>
                    </div>

                    {ready.deeper && (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                            <SpeedCard vitals={ready.vitals} timings={ready.timings} />
                            <ErrorsCard errors={ready.top.errors} places={ready.top.errorPlaces} api={ready.top.apiErrors} />
                        </div>
                    )}
                    {ready.deeper && <RetentionCard rows={ready.retention} />}

                    {/* Who riders are: where they came from and what they use (no personal data) */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                        <TopList title="Where riders came from" valueLabel="Source" rows={ready.top.sources} render={v => v === 'direct' ? 'Typed the address or a bookmark' : v} />
                        <TopList title="Browsers" valueLabel="Browser" rows={ready.top.browsers} />
                        <TopList title="Systems" valueLabel="System" rows={ready.top.systems} />
                        <TopList title="Screen sizes" valueLabel="Screen" rows={ready.top.screens} />
                        <TopList title="Installed as an app" valueLabel="Installed" rows={ready.top.installed} render={v => v === 'yes' ? 'Yes, from the home screen' : 'No, in the browser'} />
                        <TopList title="Connection" valueLabel="Network" rows={ready.top.connections} render={v => v.toUpperCase()} />
                        <TopList title="Languages" valueLabel="Language" rows={ready.top.languages} />
                        <TopList title="Campaigns" valueLabel="Campaign" rows={ready.top.campaigns} empty="No links with a campaign yet." />
                        <TopList title="Location problems" valueLabel="Problem" rows={ready.top.locationProblems} empty="None." />
                    </div>

                    {/* How riders choose */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                        <TopList title="Which bus option riders took" valueLabel="Option" rows={ready.top.chosenRank} render={v => v === '0' ? 'The recommended one' : `Option ${Number(v) + 1}`} />
                        <TopList title="Options riders opened to read" valueLabel="Option" rows={ready.top.expandedRank} render={v => `Option ${Number(v) + 1}`} />
                        <TopList title="Problems riders reported" valueLabel="Problem" rows={ready.top.reports} render={v => ({ bus_no_show: "Bus didn't come", wrong_time: 'Wrong time', stop_problem: 'Stop problem', app_problem: 'App problem', other: 'Other' } as Record<string, string>)[v] ?? v} />
                    </div>

                    <Card title="Latest activity" action={<span className="text-xs text-slate-500">newest first · signed-out riders are anonymous</span>}>
                        <ul className="divide-y divide-slate-100">
                            {ready.latest.map((e, i) => (
                                <li key={e.at + i} className="px-5 py-2.5 text-sm flex flex-wrap gap-x-3 gap-y-0.5">
                                    <span className="text-slate-500 tabular-nums w-32 flex-none">{when(e.at)}</span>
                                    <span className="text-slate-900 flex-1 min-w-[12rem]">{describeUsage(e.kind, e.detail, e.page)}</span>
                                    <span className="text-slate-500">{e.userId || e.visitor ? <Link to={e.userId ? `/admin/people/${e.userId}` : `/admin/insights/visitors/${e.visitor}`} className="text-[#003DA5] hover:underline">{e.who}</Link> : e.who}{e.device ? ` · ${e.device}` : ''}</span>
                                </li>
                            ))}
                            {ready.latest.length === 0 && <li className="px-5 py-8 text-sm text-slate-500 text-center">No activity yet.</li>}
                        </ul>
                    </Card>

                    <p className="text-xs text-slate-500">
                        How these are counted: every number is counted in the database, by Regina day. A visitor is the account when signed in,
                        otherwise an anonymous id that changes every day (no address is stored), so a visitor on several days is counted on each.
                        Searches record the place picked, never what was typed. Crawlers are left out. Events are kept 90 days.
                    </p>
                </div>
            )}
        </div>
    );
}
