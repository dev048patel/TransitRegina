/**
 * useTextAlertsController.ts — Transit Regina  [MVC Controller]
 * The admin "Text alerts" page: riders waiting for approval, approved and declined, and the admin's decision.
 * Approving turns the rider's texts on and emails them that their account is ready (SmsAccessService.decide).
 */
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../models/lib/apiClient';

export interface SmsRider {
    userId: string; at: string; name: string | null; email: string | null; phone: string | null;
    phoneVerified: boolean; textsOn: boolean; accountStatus: string; joined: string | null; lastActive: string | null;
    decidedBy: string | null; commutes: { day: number; arriveBy: string | null; departBy: string | null }[];
}
export type TextAlertTab = 'pending' | 'approved' | 'declined';
interface Overview { setup: boolean; pending: SmsRider[]; approved: SmsRider[]; declined: SmsRider[] }

const load = async (): Promise<Overview> => (await apiGet('/api/admin/sms/requests')).json();

export function useTextAlertsController() {
    const [data, setData] = useState<Overview | null>(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<TextAlertTab>('pending');
    const [busy, setBusy] = useState('');
    const [done, setDone] = useState('');   // "Approved Riley: they've been emailed" after a decision

    const refresh = useCallback(async () => {
        try { setData(await load()); setError(''); } catch (e) { setError((e as Error).message); }
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    const decide = useCallback(async (r: SmsRider, approve: boolean) => {
        setBusy(r.userId); setDone('');
        try {
            await apiPost(`/api/admin/sms/requests/${r.userId}`, { approve });
            const who = r.name || r.email || 'the rider';
            setDone(approve ? `Approved ${who}. Their texts are on and they've been emailed that their account is ready.` : `Declined ${who}. Their texts stay off.`);
            await refresh();
        } catch (e) { setError((e as Error).message); }
        finally { setBusy(''); }
    }, [refresh]);

    return { data, error, tab, setTab, busy, done, decide };
}

/** For the admin menu: how many riders are waiting (refreshed when the admin moves between pages) */
export function useWaitingTextAlerts(pathname: string): number {
    const [n, setN] = useState(0);
    useEffect(() => { load().then(d => setN(d.pending?.length ?? 0)).catch(() => setN(0)); }, [pathname]);
    return n;
}
