/**
 * Usage.tsx — Transit Regina  [VIEW — MVC]
 * What riders do in the app: how many, what they search for, which routes, stops and buses they look at, how far
 * they get towards a bus, when, and on what. Every number is counted in the database by Regina day.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useUsageController, change } from '../../controllers/admin/useUsageController';
import { ErrorsCard, EventText, Heatmap, NowCard, PersonName, RangePicker, RetentionCard, SearchMap, SessionTiles, TopList, UnmetCard, usePlacePicker } from './UsageSections';
import { Card, PageHeader, when } from '../components/admin/ui';
import { hourLabel } from '../../models/data/usageLabels';

const BLUE = '#1a73e8', ORANGE = '#e37400';   // validated pair: distinct for colour-blind readers too
// Charts don't animate: the page refreshes every minute, and replaying the animation each time is distracting
const dayLabel = (key: string, days: number) => new Date(key + 'T12:00:00Z').toLocaleDateString('en-CA', days <= 7 ? { weekday: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' });
const n = (v: number) => v.toLocaleString('en-CA');

/** A total, and how it moved against the period before */
function Total({ label, value, before, hint }: { label: string; value: number; before: number; hint: string }) {
    const c = change(value, before);
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{n(value)}</div>
            <div className="text-xs mt-1 text-slate-500">
                <span className={c.up === null ? '' : c.up ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>{c.up === true ? '▲ ' : c.up === false ? '▼ ' : ''}{c.text}</span> vs the period before
            </div>
            <p className="text-[11px] leading-snug text-slate-500 mt-2">{hint}</p>
        </div>
    );
}

export default function Usage() {
    const { days, setDays, custom, setCustom, query, data, error, loading, now, points, mapReady } = useUsageController();
    const pickPlace = usePlacePicker(query);
    const ready = data?.setup ? data : null;

    return (
        <div>
            <PageHeader
                title="Usage"
                subtitle={ready ? `What riders do in the app · Regina days · updated every minute` : 'What riders do in the app'}
                actions={<RangePicker days={days} custom={custom} setDays={setDays} setCustom={setCustom} />}
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
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <Total label="Visitors" value={ready.totals.visitors} before={ready.previous.visitors} hint="People who used the app. Each person counts once a day, so over a week this adds up each day's visitors." />
                        <Total label="Signed-in riders" value={ready.totals.riders} before={ready.previous.riders} hint="Visitors who were signed in to an account. The rest used the app without signing in." />
                        <Total label="Place searches" value={ready.totals.searches} before={ready.previous.searches} hint="Times someone searched for where they want to go. This is the main thing people come to do." />
                        <Total label="Trips started" value={ready.totals.trips} before={ready.previous.trips} hint="Times someone picked a bus and pressed Start trip. More trips per search means the bus options were good." />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                        <Card title={ready.hourly ? 'Visitors per hour' : 'Visitors per day'} about={ready.hourly ? 'How many people used the app in each hour of the day (Regina time).' : 'How many people used the app each day. Look for growth, and for dips on days with service changes.'}>
                            <div className="h-64 p-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={ready.hourly ? ready.hourly.map(h => ({ visitors: h.people, label: hourLabel(h.hour) })) : ready.daily.map(d => ({ ...d, label: dayLabel(d.day, days) }))} barCategoryGap={2}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={36} />
                                        <Tooltip cursor={{ fill: '#f1f5f9' }} />
                                        <Bar dataKey="visitors" name="Visitors" fill={BLUE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                        <Card title={ready.hourly ? 'Searches and trips per hour' : 'Searches and trips per day'} about="Blue is people searching for a place, orange is people starting a trip. When the lines are close, most searches end in a bus ride.">
                            <div className="h-64 p-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={ready.hourly ? ready.hourly.map(h => ({ searches: h.searches, trips: h.trips, label: hourLabel(h.hour) })) : ready.daily.map(d => ({ ...d, label: dayLabel(d.day, days) }))}>
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
                        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">Visits, unmet demand and returning riders need <code>docs/security/012_admin_insights.sql</code>.</p>
                    )}

                    {/* Getting to a bus: how far riders get */}
                    <Card title="Getting to a bus" about="Each step a rider takes to catch a bus, and how many got that far. A big drop between two steps shows where people give up.">
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
                            <p className="text-xs text-slate-500 pt-1">Percentages are of the people who opened the map.</p>
                        </div>
                    </Card>

                    {ready.deeper && (
                        <div className="grid grid-cols-1 gap-4">
                            <UnmetCard rows={ready.unmet} />
                            <SearchMap points={points} ready={mapReady} onPick={pickPlace} />
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                        <TopList topic="places" query={query} title="What riders searched for" about="The places people wanted to get to most. Click one to see who searched for it, when and on what." valueLabel="Place" rows={ready.top.places} />
                        <TopList topic="tripDestinations" query={query} title="Where riders started trips to" about="Places people actually took a bus to after searching. Compare with the list beside it: a place searched often but rarely travelled to is badly served." valueLabel="Destination" rows={ready.top.tripDestinations} />
                        <TopList topic="tripRoutes" query={query} title="Routes riders rode" about="The routes in the trips people started. A trip with a transfer shows both routes, like 9 › 4." valueLabel="Route" rows={ready.top.tripRoutes} render={v => `Route ${v.replace(/>/g, ' › ')}`} />
                        <TopList topic="stops" query={query} title="Stops riders checked" about="Stops whose arrival board people opened to see when the next bus comes. Click one to see who checks it and when." valueLabel="Stop" rows={ready.top.stops} />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                        <TopList topic="buses" query={query} title="Buses riders tapped" about="Live buses people tapped on the map to see where they are. Click one to see who followed it." valueLabel="Bus" rows={ready.top.buses ?? []} render={v => `Bus #${v}`} />
                        <TopList topic="routes" query={query} title="Routes riders picked" about="Routes people chose from the route picker to see on the map." valueLabel="Route" rows={ready.top.routes ?? []} render={v => `Route ${v}`} />
                        <TopList topic="busRoutes" query={query} title="Buses tapped, by route" about="Which routes' buses people tap most: the routes riders are waiting on." valueLabel="Route" rows={ready.top.busRoutes ?? []} render={v => `Route ${v}`} />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                        <TopList topic="plannerPlaces" query={query} title="Planned in the Trip Planner" about="Where people planned trips to with the Trip Planner (from one place to another)." valueLabel="Destination" rows={ready.top.plannerPlaces ?? []} />
                        <TopList topic="tappedPlaces" query={query} title="Places picked on the map" about="Places people tapped on the map instead of searching." valueLabel="Place" rows={ready.top.tappedPlaces ?? []} />
                        <TopList topic="pages" query={query} title="Pages opened" about="Which pages of the app people open." valueLabel="Page" rows={ready.top.pages ?? []} />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                        <Card title="Busiest times (Regina time)" about="When people use the app, by day of the week and hour. Darker means busier. Hover a square for the number.">
                            <Heatmap hours={ready.hours} />
                        </Card>
                        <Card title="Phone or computer" about="What people use the app on. Mostly phones means the phone layout matters most.">
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
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                        <TopList topic="chosenRank" query={query} title="Which bus option riders took" about="When the app lists bus options, which one people chose. Mostly the first one means the app's recommendation is good." valueLabel="Option" rows={ready.top.chosenRank} render={v => v === '0' ? 'The recommended one' : `Option ${Number(v) + 1}`} />
                        <TopList topic="location" query={query} title="Sharing their location" about="Whether people let the app use their location. Without it, they have to type where they are." valueLabel="Answer" rows={ready.top.location} render={v => v === 'allowed' ? 'Allowed' : 'Declined'} />
                        <TopList topic="sources" query={query} title="How riders found the app" about="The website people came from. 'Typed the address or a bookmark' means they already knew the app." valueLabel="Source" rows={ready.top.sources} render={v => v === 'direct' ? 'Typed the address or a bookmark' : v} />
                    </div>

                    {ready.deeper && (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                            <RetentionCard rows={ready.retention} />
                            <ErrorsCard errors={ready.top.errors} places={ready.top.errorPlaces} api={ready.top.apiErrors} query={query} />
                        </div>
                    )}

                    <Card title="Latest activity" about="The most recent things people did, newest first. Click a name to see everything that person did, or an action to see everyone who did the same." action={<Link to={`/admin/insights/activity?${query}`} className="text-xs font-semibold text-[#003DA5] hover:underline">See all activity →</Link>}>
                        <ul className="divide-y divide-slate-100">
                            {ready.latest.map((e, i) => (
                                <li key={e.at + i} className="px-5 py-2.5 text-sm flex flex-wrap gap-x-3 gap-y-0.5">
                                    <span className="text-slate-500 tabular-nums w-32 flex-none">{when(e.at)}</span>
                                    <span className="text-slate-900 flex-1 min-w-[12rem]"><EventText e={e} query={query} /></span>
                                    <span className="text-slate-500"><PersonName a={e} />{e.device ? ` · ${e.device}` : ''}</span>
                                </li>
                            ))}
                            {ready.latest.length === 0 && <li className="px-5 py-8 text-sm text-slate-500 text-center">No activity yet.</li>}
                        </ul>
                    </Card>

                    <p className="text-xs text-slate-500">
                        How these are counted: by Regina day. A signed-in rider is counted by their account. Someone not signed in gets an
                        anonymous id that changes every day (no address is stored), so they count again on each day they visit.
                        Searches record the place picked, never what was typed. Crawlers are left out. Activity is kept 90 days.
                    </p>
                </div>
            )}
        </div>
    );
}
