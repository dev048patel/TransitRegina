/**
 * Reports.tsx — Transit Regina  [VIEW — MVC]
 * Problems riders reported from the stop board or a trip, with the stop, route and what the app showed.
 */
import { Link } from 'react-router-dom';
import { useReportsController, REPORT_LABEL } from '../../controllers/admin/useReportsController';
import { useAuth } from '../../models/context/AuthContext';
import { Card, PageHeader, when } from '../components/admin/ui';

export default function Reports() {
    const { handled, setHandled, data, error, markHandled } = useReportsController();
    const { isAdmin } = useAuth();
    const reports = data?.reports ?? [];

    return (
        <div>
            <PageHeader title="Reports" subtitle="Problems riders reported from the app"
                actions={
                    <div role="group" aria-label="Which reports" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                        {[{ v: false, label: 'Open' }, { v: true, label: 'Handled' }].map(o => (
                            <button key={o.label} onClick={() => setHandled(o.v)} aria-pressed={handled === o.v}
                                className={'px-3 py-1.5 text-xs font-semibold rounded-md ' + (handled === o.v ? 'bg-[#003DA5] text-white' : 'text-slate-600 hover:bg-slate-50')}>{o.label}</button>
                        ))}
                    </div>
                } />
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Could not load reports: {error}</p>}
            {data && !data.setup && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">Reports are not set up yet. Run <code>docs/security/012_admin_insights.sql</code> in Supabase.</p>}

            {data?.setup && (
                <Card title={`${reports.length} ${handled ? 'handled' : 'open'} report${reports.length === 1 ? '' : 's'}`}
                    action={!handled && isAdmin && reports.length > 0 && <button onClick={() => markHandled(reports.map(r => r.id))} className="text-xs font-semibold text-[#003DA5] hover:underline">Mark all handled</button>}>
                    <ul className="divide-y divide-slate-100">
                        {reports.map(r => (
                            <li key={r.id} className="px-5 py-3 text-sm">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <span className="font-semibold text-slate-900">{REPORT_LABEL[r.kind] ?? r.kind}</span>
                                    {r.stop && <Link to={`/map?stop=${r.stop}`} className="text-[#003DA5] hover:underline">Stop #{r.stop}</Link>}
                                    {r.route && <span className="text-slate-700">Route {r.route.replace(/>/g, ' › ')}</span>}
                                    {r.bus && <span className="text-slate-700">Bus #{r.bus}</span>}
                                    <span className="text-slate-500 ml-auto">{when(r.at)}</span>
                                </div>
                                {r.context?.shown && <div className="text-xs text-slate-500 mt-1">The app showed: {r.context.shown}</div>}
                                {r.note && <p className="text-slate-800 mt-1 break-words">“{r.note}”</p>}
                                <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 mt-1">
                                    <span>{r.user_id ? <Link to={`/admin/people/${r.user_id}`} className="text-[#003DA5] hover:underline">{r.who}</Link> : r.who}{r.context?.device ? ` · ${r.context.device}` : ''}</span>
                                    {!handled && isAdmin && <button onClick={() => markHandled([r.id])} className="font-semibold text-[#003DA5] hover:underline ml-auto">Mark handled</button>}
                                    {handled && r.handled_at && <span className="ml-auto">Handled {when(r.handled_at)}</span>}
                                </div>
                            </li>
                        ))}
                        {reports.length === 0 && <li className="px-5 py-8 text-sm text-slate-500 text-center">{handled ? 'No handled reports yet.' : 'No open reports. Nice.'}</li>}
                    </ul>
                </Card>
            )}
        </div>
    );
}
