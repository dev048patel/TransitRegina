/**
 * useReportsController.ts — Transit Regina  [MVC Controller]
 * The admin Reports inbox: problems riders reported ("the bus didn't come"), open or handled.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../../models/lib/apiClient';

export interface RiderReport {
    id: number; at: string; who: string; user_id: string | null; kind: string;
    stop: string | null; route: string | null; bus: string | null; note: string | null;
    context: { page?: string | null; shown?: string | null; device?: string | null };
    handled_at: string | null;
}

export const REPORT_LABEL: Record<string, string> = {
    bus_no_show: "The bus didn't come", wrong_time: 'The time was wrong', stop_problem: 'Problem with a stop', app_problem: "The app isn't working", other: 'Something else',
};

export function useReportsController() {
    const [handled, setHandled] = useState(false);
    const [data, setData] = useState<{ setup: boolean; reports: RiderReport[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try { setData(await (await apiGet(`/api/admin/reports${handled ? '?handled=1' : ''}`)).json()); setError(null); }
        catch (e) { setError((e as Error).message); }
    }, [handled]);
    useEffect(() => { load(); const id = setInterval(() => { if (!document.hidden) load(); }, 60_000); return () => clearInterval(id); }, [load]);

    const markHandled = useCallback(async (ids: number[]) => {
        try { await apiPost('/api/admin/reports/handled', { ids }); await load(); }
        catch (e) { setError((e as Error).message); }
    }, [load]);

    return { handled, setHandled, data, error, markHandled };
}
