/**
 * ServiceNoticeCard.tsx — Transit Regina  [VIEW — MVC]
 * On the admin Service page: the notice riders see on every page and the map, and the switch that marks
 * standard bus service as suspended (holds commute reminders, tells each rider once).
 */
import { Megaphone } from 'lucide-react';
import { useServiceNoticeAdminController, MAX_NOTICE } from '../../controllers/admin/useServiceNoticeAdminController';
import { verifyTwoStepCode } from '../../controllers/admin/usePersonController';
import { Badge, Card, ConfirmDialog, btn, when } from '../components/admin/ui';

function Switch({ on, label, onChange, tone }: { on: boolean; label: string; onChange: (v: boolean) => void; tone: string }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className={'relative w-11 h-6 rounded-full transition flex-none ' + (on ? tone : 'bg-slate-300')}>
            <span className={'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ' + (on ? 'translate-x-5' : '')} />
        </button>
    );
}

export default function ServiceNoticeCard() {
    const { saved, draft, update, dirty, problem, error, result, askSave, confirm, closeConfirm, cityUrl, length } = useServiceNoticeAdminController();
    if (!saved && !error) return null;

    return (
        <Card title="Service notice" className="mb-2" about="Shown along the bottom of every page and on the map. Use it when the City changes or stops bus service."
            action={saved && <Badge tone={saved.suspended ? 'bad' : saved.active ? 'warn' : 'neutral'}>{saved.suspended ? 'Service suspended' : saved.active ? 'Notice up' : 'No notice'}</Badge>}>
            <form className="px-5 py-4 space-y-4 text-sm" onSubmit={e => { e.preventDefault(); askSave(); }}>
                {error && <p role="alert" className="text-red-700">Could not load the notice: {error}. Has <code>docs/security/service_notice_001.sql</code> been run?</p>}
                {saved?.suspended && saved.startedAt && (
                    <p className="text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                        Marked suspended {when(saved.startedAt)}. Commute reminders are held; riders were told once.
                    </p>
                )}
                <label className="block">
                    <span className="font-medium text-slate-900">Message riders see</span>
                    <textarea value={draft.message} onChange={e => update({ message: e.target.value })} rows={3} maxLength={MAX_NOTICE + 50}
                        placeholder="All standard Transit routes are out of service from Monday, November 23, due to an operational safety directive. Paratransit continues."
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#003DA5]/30" />
                    <span className={'text-xs ' + (length > MAX_NOTICE ? 'text-red-700' : 'text-slate-500')}>{length}/{MAX_NOTICE}. Plain text. Riders also see a "City service updates" link.</span>
                </label>
                <label className="block">
                    <span className="font-medium text-slate-900">Link</span>
                    <input value={draft.linkUrl} onChange={e => update({ linkUrl: e.target.value.trim() })} inputMode="url" placeholder={cityUrl}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#003DA5]/30" />
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="font-medium text-slate-900">Show the notice</div>
                            <div className="text-xs text-slate-500">On every page and the map. Nobody is emailed or texted.</div>
                        </div>
                        <Switch on={draft.active} label="Show the notice" onChange={v => update({ active: v })} tone="bg-amber-500" />
                    </div>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="font-medium text-slate-900">Standard bus service is suspended</div>
                            <div className="text-xs text-slate-500">Holds every commute reminder (texts and notifications). Each rider with a saved commute is told once by email, and by text if they get text alerts.</div>
                        </div>
                        <Switch on={draft.suspended} label="Standard bus service is suspended" onChange={v => update({ suspended: v })} tone="bg-red-600" />
                    </div>
                </div>
                {problem && dirty && <p role="alert" className="text-red-700">{problem}</p>}
                {result && <p role="status" className="text-emerald-800">{result}</p>}
                <div className="flex items-center gap-3">
                    <button type="submit" disabled={!dirty || !!problem} className={draft.suspended && !saved?.suspended ? btn.danger : btn.primary}>
                        <Megaphone size={16} /> Save
                    </button>
                    {saved?.updatedAt && <span className="text-xs text-slate-500">Last changed {when(saved.updatedAt)}</span>}
                </div>
            </form>
            <ConfirmDialog request={confirm} onClose={closeConfirm} verifyCode={verifyTwoStepCode} />
        </Card>
    );
}
