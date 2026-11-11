/**
 * ActivityLog.tsx — Transit Regina  [VIEW — MVC]
 * Who did what, and when: every admin action, newest first.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet } from '../../models/lib/apiClient';
import { Badge, Card, EVENT_LABEL, PageHeader, when } from '../components/admin/ui';

interface Entry { type: string; severity: 'info' | 'warning' | 'critical'; message: string; admin: string; user_id: string | null; ip: string | null; created_at: string; }
/* Looking at someone's activity and marking events or reports handled: kept in the log, hidden unless asked for,
   so the changes admins made stand out */
const ROUTINE = new Set(['personal_data_viewed', 'events_handled', 'reports_handled']);
const ACTIONS = ['user_deleted', 'role_changed', 'status_changed', 'user_updated', 'feature_access_changed', 'route_changed', 'sms_broadcast', 'sms_outage_declared', 'sms_settings_changed', 'personal_data_viewed', 'events_handled', 'note_added', 'note_deleted', 'reports_handled'];

export default function ActivityLog() {
    const [rows, setRows] = useState<Entry[] | null>(null);
    const [error, setError] = useState('');
    const [q, setQ] = useState('');
    const [showRoutine, setShowRoutine] = useState(false);
    // Kind, admin and account filter on the server (it keeps 500 at most); the text search filters what came back
    const [params, setParams] = useSearchParams();
    const kind = params.get('type') ?? 'all', admin = params.get('admin') ?? '', account = params.get('account') ?? '';
    const set = (k: string, v: string) => setParams(p => { if (v && v !== 'all') p.set(k, v); else p.delete(k); return p; }, { replace: true });
    const [admins, setAdmins] = useState<Map<string, string>>(new Map());
    useEffect(() => {
        const qs = new URLSearchParams({ limit: '500' });
        if (kind !== 'all') qs.set('type', kind);
        if (admin) qs.set('admin', admin);
        if (account) qs.set('target', account);
        apiGet(`/api/admin/activity?${qs}`).then(r => r.json()).then((list: Entry[]) => {
            setRows(list); setError('');
            setAdmins(prev => { const next = new Map(prev); for (const r of list) if (r.user_id) next.set(r.user_id, r.admin); return next; });
        }).catch(e => setError(e.message));
    }, [kind, admin, account]);

    const routineOn = showRoutine || ROUTINE.has(kind);   // picking a routine kind in the filter shows it
    const shown = useMemo(() => (rows ?? []).filter(r => (routineOn || !ROUTINE.has(r.type)) && (!q || `${r.message} ${r.admin}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, routineOn]);
    const hidden = (rows ?? []).length - shown.length;

    return (
        <div>
            <PageHeader title="Activity log" subtitle="Changes admins made, newest first. Kept for 90 days." />
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Could not load the log: {error}</p>}
            <div className="flex flex-wrap gap-3 mb-4">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by admin, email or text" aria-label="Search the activity log"
                    className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#003DA5]/30" />
                <select value={kind} onChange={e => set('type', e.target.value)} aria-label="Kind of action" className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="all">All actions</option>
                    {ACTIONS.map(k => <option key={k} value={k}>{EVENT_LABEL[k]}</option>)}
                </select>
                <select value={admin} onChange={e => set('admin', e.target.value)} aria-label="Admin" className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="">Every admin</option>
                    {[...admins].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 mb-3 cursor-pointer">
                <input type="checkbox" checked={routineOn} disabled={ROUTINE.has(kind)} onChange={e => setShowRoutine(e.target.checked)} />
                Also show routine actions (looking at someone's activity, marking events handled){!routineOn && hidden > 0 ? ` · ${hidden} hidden` : ''}
            </label>
            {account && <p className="text-sm text-slate-700 mb-3">Showing actions on one account. <button onClick={() => set('account', '')} className="font-semibold text-[#003DA5] hover:underline">Show all</button></p>}
            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs text-slate-500 bg-slate-50"><tr><th className="px-5 py-2.5">When</th><th className="px-5 py-2.5">Admin</th><th className="px-5 py-2.5">Action</th><th className="px-5 py-2.5">Details</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {shown.map((r, i) => (
                                <tr key={r.created_at + i}>
                                    <td className="px-5 py-3 whitespace-nowrap text-slate-600">{when(r.created_at)}</td>
                                    <td className="px-5 py-3 whitespace-nowrap font-medium text-slate-900">{r.admin}</td>
                                    <td className="px-5 py-3 whitespace-nowrap"><Badge tone={r.severity === 'critical' ? 'bad' : r.severity === 'warning' ? 'warn' : 'neutral'}>{EVENT_LABEL[r.type] ?? r.type}</Badge></td>
                                    <td className="px-5 py-3 text-slate-700 break-words">{r.message}</td>
                                </tr>
                            ))}
                            {rows && shown.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">Nothing to show.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
