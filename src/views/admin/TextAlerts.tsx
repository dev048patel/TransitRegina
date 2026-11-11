/**
 * TextAlerts.tsx — Transit Regina  [VIEW — MVC]
 * Who may get text alerts. Riders ask from their profile once their phone is verified; here an admin sees what they
 * need to decide and approves (texts turn on, the rider is emailed that their account is ready) or declines.
 * Three tabs, one list each, so nothing else crowds the page. View-only admins see everything but can't decide.
 */
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useTextAlertsController, type SmsRider, type TextAlertTab } from '../../controllers/admin/useTextAlertsController';
import { useAuth } from '../../models/context/AuthContext';
import { formatPhone } from '../../models/lib/phone';
import { WEEKDAYS } from '../../models/data/usageLabels';
import { Badge, Card, PageHeader, btn, when } from '../components/admin/ui';

const TABS: { key: TextAlertTab; label: string; about: string; empty: string }[] = [
    { key: 'pending', label: 'Waiting', about: 'Riders who verified their phone and asked for text alerts, oldest first. Approve to turn their texts on: they get an email saying their account is ready.', empty: 'Nobody is waiting. New requests show up here, and you get an email for each one.' },
    { key: 'approved', label: 'Approved', about: 'Riders who can get text alerts. "Texts on" means they also have them switched on. Switch someone off to stop their texts within seconds.', empty: 'Nobody is approved yet.' },
    { key: 'declined', label: 'Declined', about: 'Riders who were declined or switched off. They can\'t ask again, but you can still approve them here.', empty: 'Nobody has been declined.' },
];

/** "Mon, Wed, Fri · arrive by 8:30" from the rider's saved weekly commute */
function commuteText(c: SmsRider['commutes']): string {
    if (!c.length) return 'No commute saved yet';
    const days = [...c].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7));
    const times = [...new Set(days.map(d => d.arriveBy ? `arrive by ${d.arriveBy}` : d.departBy ? `leave at ${d.departBy}` : ''))].filter(Boolean);
    return `${days.map(d => WEEKDAYS[d.day]).join(', ')}${times.length === 1 ? ` · ${times[0]}` : ''}`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm text-slate-900">{children}</dd></div>;
}

function RiderRow({ r, tab, canDecide, busy, decide }: { r: SmsRider; tab: TextAlertTab; canDecide: boolean; busy: boolean; decide: (r: SmsRider, approve: boolean) => void }) {
    return (
        <li className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link to={`/admin/people/${r.userId}`} className="font-semibold text-[#003DA5] hover:underline">{r.name || r.email || 'A rider'}</Link>
                    {r.name && <div className="text-sm text-slate-600 break-all">{r.email}</div>}
                </div>
                {canDecide && (
                    <div className="flex gap-2">
                        {tab !== 'declined' && <button onClick={() => decide(r, false)} disabled={busy} className={btn.plain}>{tab === 'pending' ? 'Decline' : 'Switch off'}</button>}
                        {tab !== 'approved' && <button onClick={() => decide(r, true)} disabled={busy || !r.phoneVerified} title={r.phoneVerified ? undefined : 'Their phone is not verified'} className={btn.primary}>{busy ? 'Saving…' : 'Approve'}</button>}
                    </div>
                )}
            </div>
            <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
                <Fact label="Phone">{r.phone ? formatPhone(r.phone) : '—'} {r.phone && (r.phoneVerified ? <Badge tone="good">Verified</Badge> : <Badge tone="warn">Not verified</Badge>)}</Fact>
                <Fact label={tab === 'pending' ? 'Asked' : tab === 'approved' ? 'Approved' : 'Declined'}>{when(r.at)}{r.decidedBy ? <span className="text-slate-500"> by {r.decidedBy}</span> : null}</Fact>
                {tab === 'pending'
                    ? <><Fact label="Joined">{when(r.joined)}</Fact><Fact label="Last used the app">{when(r.lastActive)}</Fact></>
                    : <Fact label="Texts">{r.textsOn ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>}</Fact>}
                {tab === 'pending' && <div className="col-span-2 sm:col-span-4"><Fact label="Weekly commute">{commuteText(r.commutes)}</Fact></div>}
                {r.accountStatus !== 'active' && <Fact label="Account"><Badge tone="bad">{r.accountStatus}</Badge></Fact>}
            </dl>
        </li>
    );
}

export default function TextAlerts() {
    const c = useTextAlertsController();
    const { isAdmin } = useAuth();
    const d = c.data, current = TABS.find(t => t.key === c.tab)!;
    const list = d ? d[c.tab] : [];

    return (
        <div>
            <PageHeader title="Text alerts" subtitle="Who can get text alerts. Riders ask from their profile; you approve them here." />
            {c.error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Could not load: {c.error}</p>}
            {d && !d.setup && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">Run <code>docs/security/013_sms_approval.sql</code> in Supabase first.</p>}
            {c.done && <p role="status" className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4"><CheckCircle2 size={18} className="shrink-0" />{c.done}</p>}

            <div role="tablist" aria-label="Text alert riders" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 mb-4">
                {TABS.map(t => (
                    <button key={t.key} role="tab" aria-selected={c.tab === t.key} onClick={() => c.setTab(t.key)}
                        className={'px-4 py-1.5 text-sm font-semibold rounded-md ' + (c.tab === t.key ? 'bg-[#003DA5] text-white' : 'text-slate-600 hover:bg-slate-50')}>
                        {t.label}{d ? <span className={'ml-1.5 tabular-nums ' + (c.tab === t.key ? 'text-white/80' : 'text-slate-400')}>{d[t.key].length}</span> : null}
                    </button>
                ))}
            </div>

            <Card about={current.about}>
                {!d ? <p className="px-5 py-6 text-sm text-slate-500">Loading…</p>
                    : list.length === 0 ? <p className="px-5 py-8 text-sm text-slate-500 text-center">{current.empty}</p>
                        : <ul className="divide-y divide-slate-100 mt-2">{list.map(r => <RiderRow key={r.userId} r={r} tab={c.tab} canDecide={isAdmin} busy={c.busy === r.userId} decide={c.decide} />)}</ul>}
            </Card>
        </div>
    );
}
