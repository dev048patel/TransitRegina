/**
 * RiderProfile.tsx — Transit Regina  [VIEW — MVC]
 * One signed-in rider's use of the app over the last 90 days, for support and understanding riders: a summary,
 * their places, routes and stops, when they ride, texts sent to them, what they saved, admin notes, and a timeline.
 * Shown only after an admin asks for it; the server records each look.
 */
import { useMemo, useState } from 'react';
import type { PersonActivity } from '../../controllers/admin/usePersonController';
import { USAGE_LABEL, WEEKDAYS, describeUsage } from '../../models/data/usageLabels';
import { btn, when } from '../components/admin/ui';

const n = (v: number | null | undefined, d = 0) => v === null || v === undefined ? '—' : v.toLocaleString('en-CA', { maximumFractionDigits: d });
/* What a failed text's code means (Twilio error codes riders' texts hit most) */
const SMS_ERROR: Record<number, string> = { 30003: 'phone unreachable', 30004: 'blocked by the rider', 30005: 'unknown number', 30006: 'landline or unreachable carrier', 30007: 'filtered by the carrier', 30008: 'unknown error', 21610: 'rider replied STOP' };
const reginaDay = (iso: string) => new Date(new Date(iso).getTime() - 6 * 3_600_000).toISOString().slice(0, 10);

function Mini({ title, rows, render }: { title: string; rows: { value: string; events: number }[] | undefined; render?: (v: string) => string }) {
    return (
        <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{title}</div>
            {rows && rows.length ? (
                <ul className="text-sm space-y-0.5">{rows.slice(0, 5).map(r => <li key={r.value} className="flex justify-between gap-2"><span className="text-slate-900 truncate">{render ? render(r.value) : r.value}</span><span className="text-slate-500 tabular-nums">{r.events}</span></li>)}</ul>
            ) : <p className="text-sm text-slate-400">None</p>}
        </div>
    );
}

export default function RiderProfile({ a, isAdmin, noteDraft, setNoteDraft, addNote, deleteNote }: {
    a: PersonActivity; isAdmin: boolean; noteDraft: string; setNoteDraft: (v: string) => void; addNote: () => void; deleteNote: (id: number) => void;
}) {
    const [kind, setKind] = useState('all');
    const s = a.summary;
    const count = (k: string) => s?.kinds.find(x => x.kind === k)?.events ?? 0;
    const events = useMemo(() => a.events.filter(e => kind === 'all' || e.kind === kind), [a.events, kind]);
    const byDay = useMemo(() => {
        const days: { day: string; items: typeof events }[] = [];
        for (const e of events) { const d = reginaDay(e.at); if (days[days.length - 1]?.day !== d) days.push({ day: d, items: [] }); days[days.length - 1].items.push(e); }
        return days;
    }, [events]);
    const busiestHour = s?.hours.length ? s.hours.reduce((m, h) => h.events > m.events ? h : m) : null;
    const kinds = useMemo(() => [...new Set(a.events.map(e => e.kind))].sort(), [a.events]);

    return (
        <div className="divide-y divide-slate-100">
            {s && (
                <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[['Visits', n(s.sessions?.sessions)], ['Typical visit', s.sessions?.median_minutes !== null && s.sessions?.median_minutes !== undefined ? `${n(s.sessions.median_minutes, 1)} min` : '—'],
                        ['Place searches', n(count('place_searched'))], ['Trips started', n(count('trip_started'))],
                        ['Stop boards', n(count('stop_opened'))], ['Buses tapped', n(count('bus_opened'))],
                        ['Usually rides', busiestHour ? `${WEEKDAYS[busiestHour.weekday]} ${busiestHour.hour}:00` : '—'], ['Devices', s.devices.map(d => d.device).join(', ') || '—']]
                        .map(([label, value]) => <div key={label}><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-semibold text-slate-900 tabular-nums">{value}</div></div>)}
                </div>
            )}
            {s && (
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Mini title="Searched for" rows={s.top.places} />
                    <Mini title="Trips to" rows={s.top.tripDestinations} />
                    <Mini title="Routes" rows={[...(s.top.tripRoutes ?? []), ...(s.top.routes ?? [])].reduce<{ value: string; events: number }[]>((acc, r) => { const f = acc.find(x => x.value === r.value); if (f) f.events += r.events; else acc.push({ value: r.value, events: r.events }); return acc; }, []).sort((x, y) => y.events - x.events)} render={v => `Route ${v.replace(/>/g, ' › ')}`} />
                    <Mini title="Stops" rows={s.top.stops} />
                    <Mini title="Browsers and systems" rows={[...(s.top.browsers ?? []), ...(s.top.systems ?? [])]} />
                    <Mini title="Errors they hit" rows={s.top.errors} />
                </div>
            )}

            {a.saved && (
                <div className="px-5 py-3 text-sm text-slate-700">
                    <span className="font-semibold">Saved:</span> {a.saved.places === null ? '—' : `${a.saved.places} place${a.saved.places === 1 ? '' : 's'}`}
                    {a.saved.weekly && a.saved.weekly.filter(w => w.enabled).length > 0 && <> · weekly commute on {a.saved.weekly.filter(w => w.enabled).map(w => `${WEEKDAYS[w.day_of_week]}${w.depart_by ? ` ${w.depart_by.slice(0, 5)}` : ''}${w.route_num ? ` (route ${w.route_num})` : ''}`).join(', ')}</>}
                </div>
            )}

            {a.texts && (
                <div className="px-5 py-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Texts sent to them</div>
                    {a.texts.length ? (
                        <ul className="text-sm space-y-0.5 max-h-40 overflow-y-auto">{a.texts.map((t, i) => (
                            <li key={t.created_at + i} className="flex flex-wrap gap-x-3"><span className="text-slate-500 tabular-nums w-32">{when(t.created_at)}</span><span className="text-slate-900">{t.kind}</span>
                                <span className={t.status === 'delivered' ? 'text-emerald-700' : ['failed', 'undelivered'].includes(t.status) ? 'text-red-700 font-semibold' : 'text-slate-500'}>{t.status}{t.error_code ? `: ${SMS_ERROR[t.error_code] ?? `error ${t.error_code}`}` : ''}</span></li>
                        ))}</ul>
                    ) : <p className="text-sm text-slate-400">None</p>}
                </div>
            )}

            {a.notes !== undefined && (
                <div className="px-5 py-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Admin notes</div>
                    {a.notes === null ? <p className="text-sm text-slate-400">Notes are not set up yet (script 012).</p> : (
                        <>
                            <ul className="text-sm space-y-1">{a.notes.map(note => (
                                <li key={note.id} className="flex gap-2"><span className="flex-1 text-slate-900 break-words">{note.note} <span className="text-xs text-slate-500">· {note.author}, {when(note.at)}</span></span>
                                    {isAdmin && <button onClick={() => deleteNote(note.id)} aria-label="Delete note" className="text-xs text-slate-400 hover:text-red-700">✕</button>}</li>
                            ))}{a.notes.length === 0 && <li className="text-slate-400">None yet.</li>}</ul>
                            {isAdmin && (
                                <form onSubmit={e => { e.preventDefault(); addNote(); }} className="flex gap-2 mt-2">
                                    <input value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="e.g. Called 5 Nov, number changed" aria-label="New note" className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
                                    <button type="submit" disabled={!noteDraft.trim()} className={btn.plain}>Add note</button>
                                </form>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* The timeline: newest first, by Regina day, filterable */}
            <div className="px-5 py-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Timeline · latest {a.events.length}</span>
                <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Show only" className="text-xs border border-slate-200 rounded-lg px-2 py-1">
                    <option value="all">Everything</option>
                    {kinds.map(k => <option key={k} value={k}>{USAGE_LABEL[k] ?? k}</option>)}
                </select>
            </div>
            <div className="max-h-[32rem] overflow-y-auto">
                {byDay.map(d => (
                    <div key={d.day}>
                        <div className="sticky top-0 bg-slate-50 px-5 py-1 text-xs font-semibold text-slate-600">{new Date(d.day + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</div>
                        <ul className="divide-y divide-slate-100">{d.items.map((e, i) => (
                            <li key={e.at + i} className="px-5 py-2 text-sm flex flex-wrap gap-x-3">
                                <span className="text-slate-500 tabular-nums w-16 flex-none">{new Date(e.at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Regina' })}</span>
                                <span className="text-slate-900 flex-1 min-w-[12rem]">{describeUsage(e.kind, e.detail, e.page)}</span>
                                {e.device && <span className="text-slate-500">{e.device}</span>}
                            </li>
                        ))}</ul>
                    </div>
                ))}
                {events.length === 0 && <p className="px-5 py-6 text-sm text-slate-500 text-center">No activity recorded.</p>}
            </div>
        </div>
    );
}
