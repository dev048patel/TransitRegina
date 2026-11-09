/**
 * SmsStats.tsx — Transit Regina  [VIEW — MVC]
 * Text messages over the last 30 days: how many went out, arrived, failed and cost, why they failed,
 * and how far riders get in setting texts up.
 */
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSmsStatsController } from '../../controllers/admin/useSmsStatsController';
import { Card } from '../components/admin/ui';

const BLUE = '#1a73e8', ORANGE = '#e37400';
const ERROR: Record<number, string> = { 30003: 'Phone unreachable', 30004: 'Blocked by the rider', 30005: 'Unknown number', 30006: 'Landline or unreachable carrier', 30007: 'Filtered by the carrier', 30008: 'Unknown error', 21610: 'Rider replied STOP' };

export default function SmsStats() {
    const { data, error } = useSmsStatsController(30);
    if (error) return <p role="alert" className="text-sm text-red-700">Could not load text message numbers: {error}</p>;
    if (!data) return null;
    if (!data.setup) return <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">Text message numbers need <code>docs/security/012_admin_insights.sql</code>.</p>;
    const t = data.total!;
    const rate = t.sent ? Math.round((t.delivered / t.sent) * 1000) / 10 : null;
    const chart = data.daily!.map(d => ({ day: new Date(d.day + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }), Delivered: d.delivered, Failed: d.failed }));
    const tiles: [string, string, string][] = [
        ['Texts sent', t.sent.toLocaleString(), 'Bus alerts sent to riders by text.'],
        ['Delivered', rate === null ? '—' : `${rate}%`, 'Share that reached the phone. Below about 95% is worth checking.'],
        ['Failed', t.failed.toLocaleString(), 'Texts that never arrived. "Why texts failed" says why.'],
        ['Cost', `$${t.cost.toFixed(2)}`, 'What Twilio charged for these texts.'],
        ['Riders with texts on', (data.optedInNow ?? 0).toLocaleString(), 'Riders who have turned on text alerts right now.'],
    ];
    return (
        <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Text messages · last 30 days</h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {tiles.map(([label, value, hint]) => <div key={label} className="bg-white rounded-xl border border-slate-200 p-4"><div className="text-xs font-medium text-slate-500">{label}</div><div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div><p className="text-[11px] leading-snug text-slate-500 mt-2">{hint}</p></div>)}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                <Card title="Texts per day" about="Texts sent each day. Blue arrived, orange failed. A sudden orange spike usually means a carrier or Twilio problem." className="xl:col-span-2">
                    <div className="h-64 p-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chart}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={32} />
                                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                                <Legend formatter={v => <span style={{ color: '#334155' }}>{v}</span>} />
                                <Bar dataKey="Delivered" stackId="s" fill={BLUE} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                                <Bar dataKey="Failed" stackId="s" fill={ORANGE} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
                <div className="space-y-4">
                    <Card title="Why texts failed" about="The reasons phone carriers gave for texts that didn't arrive.">
                        <ul className="divide-y divide-slate-100 text-sm">
                            {data.failures!.map(f => <li key={f.error_code} className="px-5 py-2 flex justify-between gap-2"><span className="text-slate-900">{ERROR[f.error_code] ?? `Error ${f.error_code}`}</span><span className="tabular-nums text-slate-600">{f.failed}</span></li>)}
                            {data.failures!.length === 0 && <li className="px-5 py-4 text-slate-500">No failures.</li>}
                        </ul>
                    </Card>
                    <Card title="Setting up texts (riders)" about="How far riders got in turning on text alerts. A big drop between steps shows where they get stuck.">
                        <ul className="divide-y divide-slate-100 text-sm">
                            {data.verification!.map(v => <li key={v.label} className="px-5 py-2 flex justify-between gap-2"><span className="text-slate-900">{v.label}</span><span className="tabular-nums text-slate-600">{v.riders}</span></li>)}
                        </ul>
                    </Card>
                </div>
            </div>
        </section>
    );
}
