/**
 * useSmsStatsController.ts — Transit Regina  [MVC Controller]
 * Text message numbers for the admin Insights page: sent, delivered, failed, cost, and how riders get set up.
 */
import { useState, useEffect } from 'react';
import { apiGet } from '../../models/lib/apiClient';

export interface SmsStats {
    setup: boolean; days?: number;
    daily?: { day: string; sent: number; delivered: number; failed: number; dry_run: number; segments: number; cost: number }[];
    total?: { sent: number; delivered: number; failed: number; segments: number; cost: number };
    optedInNow?: number;
    failures?: { error_code: number; failed: number }[];
    verification?: { label: string; riders: number }[];
}

export function useSmsStatsController(days = 30) {
    const [data, setData] = useState<SmsStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        apiGet(`/api/admin/sms/stats?days=${days}`).then(r => r.json()).then(d => { if (live) { setData(d); setError(null); } }).catch(e => { if (live) setError((e as Error).message); });
        return () => { live = false; };
    }, [days]);
    return { data, error };
}
