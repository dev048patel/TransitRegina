/**
 * useServiceNoticeAdminController.ts — Transit Regina  [MVC Controller]
 * The service notice on the admin Service page: the message riders see on every page and the map, and
 * "standard bus service is suspended", which holds every commute reminder and tells each rider with a
 * saved commute once. Saving asks for confirmation, scaled to what the save does.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPatch } from '../../models/lib/apiClient';
import type { ConfirmRequest } from '../../views/components/admin/ui';

export interface AdminServiceNotice {
    active: boolean;
    suspended: boolean;
    message: string;
    linkUrl: string | null;
    startedAt: string | null;
    updatedAt: string | null;
}
export interface NoticeDraft { active: boolean; suspended: boolean; message: string; linkUrl: string }
interface Told { riders: number; emailed: number; texted: number; failed: number }

export const MAX_NOTICE = 400;

export function useServiceNoticeAdminController() {
    const [saved, setSaved] = useState<AdminServiceNotice | null>(null);
    const [cityUrl, setCityUrl] = useState('');
    const [draft, setDraft] = useState<NoticeDraft>({ active: false, suspended: false, message: '', linkUrl: '' });
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

    const load = useCallback(async () => {
        try {
            const r = await (await apiGet('/api/admin/service-notice')).json() as { notice: AdminServiceNotice; cityUpdatesUrl: string };
            setSaved(r.notice);
            setCityUrl(r.cityUpdatesUrl);
            setDraft({ active: r.notice.active, suspended: r.notice.suspended, message: r.notice.message, linkUrl: r.notice.linkUrl ?? r.cityUpdatesUrl });
            setError(null);
        } catch (e) { setError((e as Error).message); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const update = (patch: Partial<NoticeDraft>) => {
        setResult(null);
        setDraft(d => {
            const next = { ...d, ...patch };
            if (patch.suspended) next.active = true;          // a suspension is always shown
            if (patch.active === false) next.suspended = false;
            return next;
        });
    };

    const message = draft.message.replace(/\s+/g, ' ').trim();
    const dirty = !!saved && (draft.active !== saved.active || draft.suspended !== saved.suspended || message !== saved.message || (draft.linkUrl || null) !== (saved.linkUrl ?? (cityUrl || null)));
    const problem = (draft.active || draft.suspended) && !message ? 'Write the message riders will see.'
        : message.length > MAX_NOTICE ? `Keep the message to ${MAX_NOTICE} characters.`
        : draft.linkUrl && !/^https:\/\//.test(draft.linkUrl) ? 'The link must start with https://' : null;

    const run = async (reason: string) => {
        const r = await (await apiPatch('/api/admin/service-notice', { ...draft, message, linkUrl: draft.linkUrl || null, reason })).json() as { notice: AdminServiceNotice; told: Told | null };
        const t = r.told;
        setResult(t
            ? t.failed < 0 ? 'Saved, but telling riders failed. Save again to retry.'
                : `Saved. ${t.emailed} rider${t.emailed === 1 ? '' : 's'} emailed and ${t.texted} texted this time${t.failed ? `; ${t.failed} could not be emailed (save again to retry)` : ''}. Riders already told are not told again.`
            : 'Saved.');
        await load();
    };

    const askSave = () => {
        if (!saved || problem) return;
        const starting = draft.suspended && !saved.suspended, ending = !draft.suspended && saved.suspended;
        setConfirm(starting ? {
            title: 'Mark standard bus service as suspended?',
            body: 'Every page and the map show your message. Commute reminders (texts and phone notifications) stop straight away, and each rider with a saved commute gets one email, and one text if they get text alerts. Reminders start again when you switch this off.',
            confirmLabel: 'Suspend reminders and tell riders', danger: true, askReason: true, run,
        } : ending ? {
            title: 'Mark bus service as running again?',
            body: draft.active ? 'Commute reminders start again from the next one due. Your notice stays up until you turn it off. Riders are not emailed.' : 'Commute reminders start again from the next one due, and the notice comes down. Riders are not emailed.',
            confirmLabel: 'Resume reminders', askReason: true, run,
        } : {
            title: draft.active ? 'Save the service notice?' : 'Take the service notice down?',
            body: draft.active ? 'Riders see the new wording within a couple of minutes. Nobody is emailed or texted.' : 'It disappears from every page within a couple of minutes.',
            confirmLabel: 'Save', run,
        });
    };

    return { saved, draft, update, dirty, problem, error, result, askSave, confirm, closeConfirm: () => setConfirm(null), cityUrl, length: message.length };
}
