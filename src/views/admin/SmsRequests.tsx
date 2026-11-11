/**
 * SmsRequests.tsx — Transit Regina  [VIEW — MVC]
 * Riders waiting for text alert approval. Approving turns their texts on and emails them; declining keeps them off.
 * Shown only while someone is waiting. View-only admins see the list but can't decide.
 */
import { Link } from 'react-router-dom';
import { useSmsRequestsController } from '../../controllers/admin/useSmsRequestsController';
import { useAuth } from '../../models/context/AuthContext';
import { Card, btn, when } from '../components/admin/ui';

export default function SmsRequests() {
    const { requests, error, busy, decide } = useSmsRequestsController();
    const { isAdmin } = useAuth();
    if (error) return <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Text alert requests: {error}</p>;
    if (!requests?.length) return null;
    return (
        <Card title={`Text alert requests (${requests.length})`} className="mb-4"
            about="These riders verified their phone and asked for text alerts. Approve to turn their texts on (they get an email saying so), or decline to keep texts off.">
            <ul className="divide-y divide-slate-100 mt-2">
                {requests.map(r => (
                    <li key={r.userId} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        <div className="flex-1 min-w-[12rem]">
                            <Link to={`/admin/people/${r.userId}`} className="font-medium text-[#003DA5] hover:underline">{r.name || r.email || 'A rider'}</Link>
                            <div className="text-xs text-slate-500">{[r.name ? r.email : null, r.phone, `asked ${when(r.requestedAt)}`].filter(Boolean).join(' · ')}</div>
                        </div>
                        {isAdmin && (
                            <div className="flex gap-2">
                                <button onClick={() => decide(r.userId, false)} disabled={busy === r.userId} className={btn.plain}>Decline</button>
                                <button onClick={() => decide(r.userId, true)} disabled={busy === r.userId} className={btn.primary}>{busy === r.userId ? 'Saving…' : 'Approve'}</button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </Card>
    );
}
