/* useReportController — a rider tells us something is wrong ("the bus didn't come"). The stop, route, bus and what
   the app showed come from where they pressed it; the report goes to the admin Reports inbox. */
import { useState, useCallback } from 'react';
import { apiPost } from '../models/lib/apiClient';
import { track } from '../models/services/UsageTracker';

export type ReportKind = 'bus_no_show' | 'wrong_time' | 'stop_problem' | 'app_problem' | 'other';
export const REPORT_CHOICES: { kind: ReportKind; label: string }[] = [
    { kind: 'bus_no_show', label: "The bus didn't come" },
    { kind: 'wrong_time', label: 'The time was wrong' },
    { kind: 'stop_problem', label: 'Problem with this stop' },
    { kind: 'app_problem', label: "The app isn't working" },
];

export interface ReportContext { stop?: string; route?: string; bus?: string; shown?: string }

export function useReportController(context: ReportContext) {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<ReportKind | null>(null);
    const [note, setNote] = useState('');
    const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [error, setError] = useState('');

    const send = useCallback(async () => {
        if (!kind) return;
        setState('sending'); setError('');
        try {
            await apiPost('/api/analytics/report', {
                kind, note: note.trim() || undefined, page: window.location.pathname,
                stop: context.stop || undefined, route: context.route || undefined, bus: context.bus || undefined, shown: context.shown?.slice(0, 80) || undefined,
            });
            track('report_sent', { kind });
            setState('sent');
        } catch (e) {
            setError((e as Error).message || 'Could not send. Try again.');
            setState('error');
        }
    }, [kind, note, context.stop, context.route, context.bus, context.shown]);

    const reset = useCallback(() => { setOpen(false); setKind(null); setNote(''); setState('idle'); setError(''); }, []);
    return { open, setOpen, kind, setKind, note, setNote: (v: string) => setNote(v.slice(0, 500)), state, error, send, reset };
}
