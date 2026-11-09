/* ReportProblem — a small "Report a problem" link that opens a compact form: four quick choices, an optional note,
   Send. Used on the stop board and the trip panel; what it is about is filled in from where it sits. */
import { Flag } from 'lucide-react';
import { useReportController, REPORT_CHOICES, type ReportContext } from '../../../controllers/useReportController';

export default function ReportProblem({ context }: { context: ReportContext }) {
    const r = useReportController(context);

    if (!r.open) {
        return (
            <button type="button" onClick={() => r.setOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'none', padding: '4px 0', fontSize: '11px', color: '#5f6368', cursor: 'pointer' }}>
                <Flag size={12} aria-hidden /> Report a problem
            </button>
        );
    }
    if (r.state === 'sent') {
        return (
            <div role="status" style={{ fontSize: '12px', color: '#137333', padding: '6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Thanks, we got it. <button type="button" onClick={r.reset} style={{ border: 'none', background: 'none', padding: 0, fontSize: '12px', color: 'var(--t-primary)', fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
        );
    }
    return (
        <div role="group" aria-label="Report a problem" style={{ borderTop: '1px solid var(--t-border-soft)', paddingTop: '6px', marginTop: '4px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {REPORT_CHOICES.map(c => (
                    <button key={c.kind} type="button" onClick={() => r.setKind(c.kind)} aria-pressed={r.kind === c.kind}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '10px', cursor: 'pointer',
                            border: r.kind === c.kind ? '1.5px solid var(--t-primary)' : '1px solid var(--t-border)',
                            background: r.kind === c.kind ? 'var(--t-primary-soft)' : 'var(--t-surface)', color: '#202124', fontWeight: r.kind === c.kind ? 600 : 400 }}>
                        {c.label}
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                <input value={r.note} onChange={e => r.setNote(e.target.value)} placeholder="Anything else? (optional)" aria-label="More about the problem" maxLength={500}
                    style={{ flex: 1, minWidth: 0, fontSize: '16px', padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--t-border)' }} />
                <button type="button" onClick={r.send} disabled={!r.kind || r.state === 'sending'}
                    style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '8px', border: 'none', cursor: r.kind ? 'pointer' : 'not-allowed',
                        background: r.kind ? 'var(--t-primary)' : '#dadce0', color: 'white' }}>
                    {r.state === 'sending' ? 'Sending…' : 'Send'}
                </button>
                <button type="button" onClick={r.reset} aria-label="Cancel" style={{ border: 'none', background: 'none', fontSize: '13px', color: '#5f6368', cursor: 'pointer', padding: '0 4px' }}>✕</button>
            </div>
            {r.error && <p role="alert" style={{ fontSize: '11px', color: '#d93025', margin: '4px 0 0' }}>{r.error}</p>}
        </div>
    );
}
