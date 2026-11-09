/**
 * VisitorPage.tsx — Transit Regina  [VIEW — MVC]
 * One signed-out visitor: a summary and every action they took. Their anonymous id changes every Regina day,
 * so this covers one day at most, and two people on the same network and browser share one id.
 */
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useVisitorController } from '../../controllers/admin/useVisitorController';
import { Card, PageHeader } from '../components/admin/ui';
import RiderProfile from './RiderProfile';

const none = () => { };

export default function VisitorPage() {
    const { id = '' } = useParams();
    const { activity, error } = useVisitorController(id);

    return (
        <div>
            <Link to="/admin/insights" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={16} /> Insights</Link>
            <PageHeader title={`Visitor ${id.slice(0, 6)}`} subtitle="Not signed in. Their anonymous id changes every day, so this shows one day at most. No address is stored." />
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">Could not load this visitor: {error}</p>}
            <Card title="App activity">
                {!activity ? (!error && <p className="px-5 py-5 text-sm text-slate-500">Loading…</p>)
                    : !activity.setup ? <p className="px-5 py-5 text-sm text-amber-900">Usage tracking is not set up yet (docs/security/011_usage_analytics.sql).</p>
                        : <RiderProfile a={activity} isAdmin={false} noteDraft="" setNoteDraft={none} addNote={none} deleteNote={none} />}
            </Card>
        </div>
    );
}
