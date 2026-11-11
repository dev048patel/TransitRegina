/**
 * useSmsRequestsController.ts — Transit Regina  [MVC Controller]
 * Riders waiting for text alert approval, and the admin's decision (approving emails the rider).
 */
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../models/lib/apiClient';

export interface SmsRequest { userId: string; requestedAt: string; name: string | null; email: string | null; phone: string | null }

export function useSmsRequestsController() {
    const [requests, setRequests] = useState<SmsRequest[] | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');

    const load = useCallback(async () => {
        try { setRequests(((await (await apiGet('/api/admin/sms/requests')).json()) as { requests: SmsRequest[] }).requests); setError(''); }
        catch (e) { setError((e as Error).message); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const decide = useCallback(async (userId: string, approve: boolean) => {
        setBusy(userId);
        try { await apiPost(`/api/admin/sms/requests/${userId}`, { approve }); setRequests(r => r?.filter(x => x.userId !== userId) ?? null); setError(''); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(''); }
    }, []);

    return { requests, error, busy, decide };
}
