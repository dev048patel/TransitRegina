/**
 * AdminHome.tsx — Transit Regina  [VIEW — MVC]
 * The first thing an admin sees: does anything need attention, how busy is the app right now,
 * and what have admins done recently.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAdminHomeController } from '../../controllers/admin/useAdminHomeController';
import { Card, PageHeader, Stat, when } from '../components/admin/ui';

const weekday = (key: string) => new Date(key + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'short', timeZone: 'UTC' });

export default function AdminHome() {
    const { data, error } = useAdminHomeController();

    return (
        <div>
            <PageHeader title="Home" subtitle={data ? `Live — updated ${new Date(data.at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Loading…'} />
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Could not load the overview: {error}</p>}

            {/* Needs attention — only shown when something does */}
            {data && (data.attention.length ? (
                <div className="space-y-2 mb-6">
                    {data.attention.map(a => (
                        <Link key={a.text} to={a.link} className={'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium ' +
                            (a.level === 'critical' ? 'bg-red-50 border-red-200 text-red-900 hover:bg-red-100' : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100')}>
                            {a.level === 'critical' ? <XCircle size={18} className="mt-0.5 flex-none" /> : <AlertTriangle size={18} className="mt-0.5 flex-none" />}
                            <span className="flex-1">{a.text}</span><span className="text-xs underline">Open</span>
                        </Link>
                    ))}
                </div>
            ) : (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm font-medium px-4 py-3 mb-6">
                    <CheckCircle2 size={18} /> Everything is working. Nothing needs your attention.
                </p>
            ))}

            {/* Right now */}
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Right now</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <Stat live label="People on the site" value={data?.live.activeNow ?? '–'} sub="active in the last 5 minutes" />
                <Stat live label="Signed-in riders" value={data?.live.signedInNow ?? '–'} sub="active in the last 5 minutes" />
                <Stat live label="Buses reporting" value={data?.live.buses ?? '–'} sub={data?.live.buses === null ? 'bus feed not answering' : 'from the live feed'} />
            </div>

            {/* Today */}
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Today (Regina time)</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Stat label="Visitors" value={data?.today.visitors ?? '–'} />
                <Stat label="Place searches" value={data?.today.searches ?? '–'} />
                <Stat label="Trips started" value={data?.today.trips ?? '–'} />
                <Stat label="New sign-ups" value={data?.today.signups ?? '–'} sub={data ? `${data.totals.signupsWeek} this week · ${data.totals.users} accounts in total` : undefined} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card title="Last 7 days" className="xl:col-span-2" action={<Link to="/admin/insights" className="text-xs font-semibold text-[#003DA5] hover:underline">Full usage</Link>}>
                    {data && !data.usageReady && <p className="mx-4 mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Run docs/security/011_usage_analytics.sql to fill this chart.</p>}
                    <div className="h-72 p-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={(data?.trend ?? []).map(t => ({ ...t, label: weekday(t.day) }))}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={32} />
                                <Tooltip />
                                <Legend formatter={v => <span style={{ color: '#334155' }}>{v}</span>} />
                                <Bar dataKey="searches" name="Place searches" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="trips" name="Trips started" fill="#e37400" radius={[4, 4, 0, 0]} />
                                <Line dataKey="visitors" name="Visitors" stroke="#334155" strokeWidth={2} dot={{ r: 3 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card title="Recent admin activity" action={<Link to="/admin/activity" className="text-xs font-semibold text-[#003DA5] hover:underline">See all</Link>}>
                    <ul className="divide-y divide-slate-100">
                        {(data?.recent ?? []).map((r, i) => (
                            <li key={r.created_at + i} className="px-5 py-3 text-sm">
                                <div className="text-slate-900">{r.message}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{r.admin} · {when(r.created_at)}</div>
                            </li>
                        ))}
                        {data && data.recent.length === 0 && <li className="px-5 py-8 text-sm text-slate-500 text-center">No admin actions yet.</li>}
                    </ul>
                </Card>
            </div>
        </div>
    );
}
