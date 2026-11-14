/* Weekly Commute panel (pure view): each day's trip there and trip home, the buses that make it on time
   that weekday, reminders, and a preview of a trip on the map. All logic is in useWeeklyPlannerController. */
import React from 'react';
import { Link } from 'react-router-dom';
import { SavedDestination } from '../models/transit/SavedDestination';
import { DAY_LABELS, DAY_ORDER, DayPlan, TripSlot, hhmmToClock, isSet, tripKey } from '../models/transit/WeeklySchedule';
import type { PlannedJourney } from '../models/services/ArriveByClient';
import transitColors from '../models/data/transitColors';
import { KIND_LABEL, RouteBadges, Steps } from './components/transit/ArriveByPlanCard';
import type { useWeeklyPlannerController } from '../controllers/useWeeklyPlannerController';

type Ctrl = ReturnType<typeof useWeeklyPlannerController>;

const routeColor = (route: string | null | undefined) =>
    (route && transitColors.find(c => c.route_id === parseInt(route))?.colour) || '#2E7D32';

const TRIP_LABEL: Record<TripSlot, string> = { 0: 'Trip there', 1: 'Trip home' };
/** "7:32 AM" → "7:32a", to fit under a day pill */
const shortClock = (hhmm: string | null) => hhmmToClock(hhmm).replace(' AM', 'a').replace(' PM', 'p');

/* ── Day pill: the day, and when its first trip with reminders on leaves ── */
function DayPill({ label, selected, isToday, there, home, onClick }: {
    label: string; selected: boolean; isToday: boolean; there: DayPlan; home: DayPlan; onClick: () => void;
}) {
    const set = isSet(there) || isSet(home);
    const on = [there, home].find(p => p.enabled && isSet(p));
    const tripCount = [there, home].filter(isSet).length;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={`${label}${isToday ? ' (today)' : ''}${tripCount ? `, ${tripCount} trip${tripCount > 1 ? 's' : ''}` : ', no trips'}${on ? `, leave ${hhmmToClock(on.departBy)}` : ''}`}
            style={{
                flex: 1, minWidth: 0, padding: '6px 2px 7px', borderRadius: '10px',
                border: selected ? '2px solid var(--t-accent)' : '2px solid transparent',
                backgroundColor: selected ? 'var(--t-accent-soft)' : 'var(--t-surface-2)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            }}
        >
            <span style={{ fontSize: '11px', fontWeight: 700, color: selected ? 'var(--t-accent)' : set ? '#424242' : '#9E9E9E', textDecoration: isToday ? 'underline' : undefined, textUnderlineOffset: '3px' }}>
                {label}
            </span>
            <span style={{ fontSize: '9.5px', fontWeight: 600, height: '12px', color: on ? 'var(--t-accent-dark)' : '#BDBDBD', whiteSpace: 'nowrap' }}>
                {on?.departBy ? shortClock(on.departBy) : set ? (on ? '…' : 'off') : ''}
            </span>
        </button>
    );
}

/* ── Location dropdown ── */
function LocationSelect({ label, value, options, excluded, onChange }: {
    label: string; value: string | null; options: SavedDestination[]; excluded: string | null; onChange: (id: string | null) => void;
}) {
    const available = options.filter(d => d.id !== excluded);
    return (
        <label style={{ display: 'block' }}>
            <span style={labelStyle}>{label}</span>
            <select value={value || ''} onChange={e => onChange(e.target.value || null)} style={{ ...selectStyle, color: value ? '#202124' : '#9E9E9E' }}>
                <option value="">Select a saved location…</option>
                {available.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
        </label>
    );
}

/* ── One way of making the trip: pick it (pin) or preview it on the map ── */
function JourneyCard({ journey, pinned, onPin, onPreview }: { journey: PlannedJourney; pinned: boolean; onPin: () => void; onPreview: () => void }) {
    const color = routeColor(journey.legs[0]?.route);
    return (
        <div style={{
            padding: '10px 12px', borderRadius: '10px', marginBottom: '6px',
            border: `1.5px solid ${pinned ? color : 'var(--t-border-soft)'}`, borderLeft: `4px solid ${color}`,
            backgroundColor: pinned ? 'var(--t-surface-2)' : 'var(--t-surface)',
        }}>
            <button type="button" onClick={onPin} aria-pressed={pinned} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
                <span aria-hidden style={{
                    width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                    border: `2px solid ${pinned ? color : '#BDBDBD'}`, backgroundColor: pinned ? color : 'var(--t-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                }}>
                    {pinned && <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--t-surface)' }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: journey.kind === 'best' ? '#137333' : '#757575' }}>{KIND_LABEL[journey.kind]}</span>
                    <RouteBadges journey={journey} />
                    <span style={{ fontSize: '13px', color: '#202124' }}>
                        <strong>Leave {journey.leave}</strong>
                        <span style={{ color: '#757575', fontSize: '12px' }}> → arrive {journey.arrive}</span>
                    </span>
                </span>
            </button>
            <button type="button" onClick={onPreview} style={previewBtnStyle}>
                <MapIcon /> Preview on map
            </button>
        </div>
    );
}

/* ── The rider's week at a glance; a row opens that day and trip ── */
function WeekSummary({ ctrl, placeName }: { ctrl: Ctrl; placeName: (id: string | null) => string }) {
    const rows = DAY_ORDER.flatMap(d => ([0, 1] as TripSlot[]).map(t => ({ d, t, p: ctrl.week[tripKey(d, t)] }))).filter(r => isSet(r.p));
    if (!rows.length) return null;
    return (
        <div>
            <div style={sectionTitleStyle}>Your week</div>
            <div style={{ border: '1px solid var(--t-border-soft)', borderRadius: '10px', overflow: 'hidden' }}>
                {rows.map(({ d, t, p }, i) => (
                    <button
                        key={`${d}-${t}`}
                        type="button"
                        onClick={() => ctrl.select(d, t)}
                        style={{
                            all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', fontSize: '12px',
                            borderTop: i ? '1px solid var(--t-border-soft)' : undefined,
                            backgroundColor: d === ctrl.selectedDay && t === ctrl.selectedTrip ? 'var(--t-accent-soft)' : 'var(--t-surface)',
                            color: p.enabled ? '#202124' : '#9E9E9E',
                        }}
                    >
                        <strong style={{ width: '30px', flexShrink: 0 }}>{DAY_LABELS[d]}</strong>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {placeName(p.fromId)} → {placeName(p.toId)}
                        </span>
                        <span style={{ flexShrink: 0, textAlign: 'right' }}>
                            {p.departBy ? <>Leave <strong>{hhmmToClock(p.departBy)}</strong></> : <em>leave time on save</em>}
                            {p.routeList?.length ? <span style={{ color: '#757575' }}> · {p.routeList.join(' › ')}</span> : null}
                            {!p.enabled && <span> · off</span>}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ── Main panel ── */
export default function WeeklyPlannerPanel({ ctrl }: { ctrl: Ctrl }) {
    const { trip, search, previewing } = ctrl;
    const dayLabel = DAY_LABELS[ctrl.selectedDay];
    const placeName = (id: string | null) => ctrl.savedDests.find(d => d.id === id)?.name ?? '—';
    const ready = ctrl.loaded && !ctrl.loading && ctrl.savedDests.length >= 2;
    const tripHomeEmpty = ctrl.selectedTrip === 1 && !trip.fromId && !trip.toId;

    return (
        <>
            {/* Backdrop — none while a trip is previewed, so the map stays clear and can be moved */}
            {!previewing && (
                <div onClick={ctrl.requestClose} style={{ position: 'fixed', inset: 0, top: '52px', backgroundColor: 'rgba(0,0,0,0.18)', zIndex: 1099 }} />
            )}

            {/* Panel — a short card on phones while a trip is previewed, so the route below it shows (App.css) */}
            <div className={`t-panel t-drawer${previewing ? ' t-drawer--preview' : ''}`} style={{
                position: 'fixed', top: '52px', right: 0, width: 'min(360px, 100vw)', height: 'calc(100dvh - 52px)',
                backgroundColor: 'var(--t-surface)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', zIndex: 1100,
                display: 'flex', flexDirection: 'column', borderRadius: '16px 0 0 0', overflow: 'hidden',
            }}>

                {/* Header */}
                <div className="t-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid var(--t-border-soft)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: 'var(--t-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-accent)' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                            </svg>
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#202124', lineHeight: 1.2 }}>My Weekly Commute</div>
                            <div style={{ fontSize: '11px', color: ctrl.dirty ? '#b06000' : '#9E9E9E', fontWeight: ctrl.dirty ? 600 : 400 }}>
                                {ctrl.dirty ? '● Unsaved changes' : 'Your regular trips, every week'}
                            </div>
                        </div>
                    </div>
                    <button type="button" onClick={ctrl.requestClose} aria-label="Close" style={closeBtnStyle}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Closing with unsaved changes */}
                {ctrl.confirmClose && (
                    <div role="alertdialog" aria-label="Unsaved changes" style={{ ...warnBoxStyle, margin: '10px 14px 0', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>Save your changes before closing?</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={ctrl.saveAndClose} disabled={ctrl.saving} style={smallPrimaryBtn}>{ctrl.saving ? 'Saving…' : 'Save'}</button>
                            <button type="button" onClick={ctrl.discardAndClose} style={smallBtn}>Discard</button>
                            <button type="button" onClick={ctrl.cancelClose} style={smallBtn}>Keep editing</button>
                        </div>
                    </div>
                )}

                {/* Not signed in */}
                {!ctrl.isAuthenticated && (
                    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                        <div style={{ fontSize: '34px', marginBottom: '12px' }}>🗓️</div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#202124', marginBottom: '8px' }}>Plan your weekly commute</div>
                        <div style={{ fontSize: '13px', color: '#757575', marginBottom: '20px', lineHeight: 1.5 }}>Sign in to save your weekly schedule and get departure reminders.</div>
                        <Link to="/login" onClick={ctrl.handleClose} style={{ ...primaryBtnStyle, display: 'inline-block', width: 'auto', padding: '9px 24px', textDecoration: 'none' }}>Sign In</Link>
                    </div>
                )}

                {/* One trip on the map: its steps, and the way back */}
                {ctrl.isAuthenticated && previewing && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                        <button type="button" onClick={ctrl.endPreview} style={backBtnStyle}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                            Back to {dayLabel}
                        </button>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t-accent)', margin: '2px 0 8px' }}>
                            🗺️ Shown on the map · {dayLabel}, {placeName(trip.fromId)} → {placeName(trip.toId)}
                        </div>
                        <div style={{ marginBottom: '10px' }}><RouteBadges journey={previewing} /></div>
                        <Steps journey={previewing} />
                        {!ctrl.isPinned(previewing) && (
                            <button type="button" onClick={() => { ctrl.handlePin(previewing); ctrl.endPreview(); }} style={{ ...primaryBtnStyle, marginTop: '12px' }}>
                                Use this trip on {dayLabel}
                            </button>
                        )}
                    </div>
                )}

                {ctrl.isAuthenticated && !previewing && (
                    <>
                        {/* Days of the week */}
                        <div style={{ padding: '12px 12px', borderBottom: '1px solid var(--t-border-soft)', flexShrink: 0 }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {DAY_ORDER.map(d => (
                                    <DayPill
                                        key={d} label={DAY_LABELS[d]} selected={ctrl.selectedDay === d} isToday={ctrl.today === d}
                                        there={ctrl.week[tripKey(d, 0)]} home={ctrl.week[tripKey(d, 1)]}
                                        onClick={() => ctrl.setSelectedDay(d)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Body — scrollable */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                            {ctrl.loading && (
                                <div style={{ textAlign: 'center', padding: '24px', color: '#9E9E9E', fontSize: '13px' }}>
                                    <div style={spinnerStyle('var(--t-accent)')} />
                                    Loading your schedule…
                                </div>
                            )}

                            {/* Couldn't load: nothing can be saved over the real schedule until it loads */}
                            {!ctrl.loading && ctrl.loadError && (
                                <div role="alert" style={{ ...errorBoxStyle, marginBottom: '14px' }}>
                                    {ctrl.loadError}
                                    <div style={{ marginTop: '8px' }}>
                                        <button type="button" onClick={ctrl.retryLoad} style={smallBtn}>Try again</button>
                                    </div>
                                </div>
                            )}

                            {!ctrl.loading && ctrl.loaded && ctrl.savedDests.length < 2 && (
                                <div style={{ ...warnBoxStyle, marginBottom: '16px' }}>
                                    You need at least <strong>2 saved locations</strong> to set up a commute.{' '}
                                    <Link to="/map" onClick={ctrl.handleClose} style={{ color: 'var(--t-accent)', fontWeight: 600 }}>Add them →</Link>
                                </div>
                            )}

                            {ready && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {/* Trip there / trip home */}
                                    <div role="tablist" aria-label={`${dayLabel} trips`} style={{ display: 'flex', gap: '4px', padding: '3px', backgroundColor: 'var(--t-surface-2)', borderRadius: '10px' }}>
                                        {([0, 1] as TripSlot[]).map(t => {
                                            const active = ctrl.selectedTrip === t;
                                            const p = ctrl.week[tripKey(ctrl.selectedDay, t)];
                                            return (
                                                <button key={t} type="button" role="tab" aria-selected={active} onClick={() => ctrl.setSelectedTrip(t)} style={{
                                                    flex: 1, padding: '7px 6px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                                    backgroundColor: active ? 'var(--t-surface)' : 'transparent',
                                                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                                                    fontSize: '12px', fontWeight: 700, color: active ? 'var(--t-accent-dark)' : '#757575',
                                                }}>
                                                    {TRIP_LABEL[t]}{t === 1 && !isSet(p) ? ' +' : ''}
                                                    {isSet(p) && p.departBy && <span style={{ fontWeight: 500, color: '#757575' }}> · {hhmmToClock(p.departBy)}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {tripHomeEmpty ? (
                                        <div style={{ padding: '16px', borderRadius: '10px', border: '1.5px dashed var(--t-border)', textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#202124', marginBottom: '4px' }}>Coming back on {dayLabel}?</div>
                                            <div style={{ fontSize: '12px', color: '#757575', marginBottom: '12px', lineHeight: 1.45 }}>
                                                {isSet(ctrl.week[tripKey(ctrl.selectedDay, 0)])
                                                    ? <>Add the trip home: {placeName(ctrl.week[tripKey(ctrl.selectedDay, 0)].toId)} → {placeName(ctrl.week[tripKey(ctrl.selectedDay, 0)].fromId)}, with its own reminders.</>
                                                    : <>Add a second trip for the same day, with its own reminders.</>}
                                            </div>
                                            <button type="button" onClick={ctrl.addTripHome} style={{ ...primaryBtnStyle, width: 'auto', padding: '8px 18px' }}>Add trip home</button>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Reminders for this trip */}
                                            <label style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer',
                                                padding: '10px 12px', borderRadius: '10px',
                                                backgroundColor: trip.enabled ? 'var(--t-accent-soft)' : 'var(--t-surface-2)',
                                                border: `1.5px solid ${trip.enabled ? '#A5D6A7' : 'var(--t-border-soft)'}`,
                                            }}>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: trip.enabled ? 'var(--t-accent)' : '#757575' }}>
                                                    {trip.enabled ? '🔔' : '🔕'} Reminders {trip.enabled ? 'on' : 'off'} · {dayLabel} {TRIP_LABEL[ctrl.selectedTrip].toLowerCase()}
                                                </span>
                                                <input type="checkbox" role="switch" checked={trip.enabled} onChange={e => ctrl.setEnabled(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--t-accent)', cursor: 'pointer' }} />
                                            </label>

                                            <LocationSelect label="From" value={trip.fromId} options={ctrl.savedDests} excluded={trip.toId} onChange={id => ctrl.updateTrip({ fromId: id })} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '-6px 0' }}>
                                                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--t-border-soft)' }} />
                                                <button type="button" title="Swap From and To" aria-label="Swap From and To" onClick={ctrl.swapTrip} style={swapBtnStyle}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3" /></svg>
                                                </button>
                                                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--t-border-soft)' }} />
                                            </div>
                                            <LocationSelect label="To" value={trip.toId} options={ctrl.savedDests} excluded={trip.fromId} onChange={id => ctrl.updateTrip({ toId: id })} />

                                            <label style={{ display: 'block' }}>
                                                <span style={labelStyle}>Arrive by</span>
                                                <input type="time" value={trip.arriveBy} onChange={e => e.target.value && ctrl.updateTrip({ arriveBy: e.target.value })} style={{ ...selectStyle, fontSize: '14px', fontWeight: 600, backgroundImage: 'none', padding: '9px 11px' }} />
                                            </label>

                                            <button type="button" onClick={ctrl.handleFindRoutes} disabled={search.calculating || !isSet(trip)} style={{ ...primaryBtnStyle, opacity: search.calculating || !isSet(trip) ? 0.55 : 1, cursor: search.calculating || !isSet(trip) ? 'not-allowed' : 'pointer' }}>
                                                {search.calculating ? <><span style={spinnerStyle('white', 13)} /> Finding buses…</> : `Find buses for ${dayLabel}`}
                                            </button>

                                            {search.error && <div role="alert" style={errorBoxStyle}>{search.error}</div>}
                                            {search.notice && <div style={warnBoxStyle}>{search.notice}</div>}

                                            {/* Every way that gets there in time; the pinned one is saved */}
                                            {search.journeys.length > 0 && (
                                                <div>
                                                    <div style={sectionTitleStyle}>{dayLabel}'s buses · tap one to use it</div>
                                                    {search.journeys.map((j, i) => (
                                                        <JourneyCard key={i} journey={j} pinned={ctrl.isPinned(j)} onPin={() => ctrl.handlePin(j)} onPreview={() => ctrl.preview(j)} />
                                                    ))}
                                                    <div style={{ fontSize: '11px', color: '#80868b' }}>Times are from the published schedule for {dayLabel}s.</div>
                                                </div>
                                            )}

                                            {/* What's saved for this trip, when no search is showing */}
                                            {search.journeys.length === 0 && !search.notice && isSet(trip) && (
                                                trip.departBy ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', backgroundColor: 'var(--t-accent-soft)', borderRadius: '10px', border: '1.5px solid var(--t-accent-border)', fontSize: '12px', color: 'var(--t-accent-dark)' }}>
                                                        <span aria-hidden>✓</span>
                                                        <span>
                                                            Leave <strong>{hhmmToClock(trip.departBy)}</strong>
                                                            {trip.routeList?.length ? <> · Route {trip.routeList.join(' › ')}</> : null}
                                                            {trip.routeTotalMinutes ? <> · ~{trip.routeTotalMinutes} min</> : null}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '12px', color: '#757575', lineHeight: 1.45 }}>
                                                        The leave time will be worked out from {dayLabel}'s bus schedule when you save, or press <strong>Find buses</strong> to choose.
                                                    </div>
                                                )
                                            )}

                                            {(trip.fromId || trip.toId) && (
                                                <button type="button" onClick={ctrl.removeTrip} style={dangerBtnStyle}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                                    </svg>
                                                    Remove {dayLabel}'s {TRIP_LABEL[ctrl.selectedTrip].toLowerCase()}
                                                </button>
                                            )}
                                        </>
                                    )}

                                    {/* Texts: what saving the commute does */}
                                    {ctrl.texts === 'on' && (
                                        <div style={infoBoxStyle}>📱 <strong>Text alerts are on.</strong> On days with reminders on, we'll text you when to leave and when to get off each bus.</div>
                                    )}
                                    {ctrl.texts === 'off' && (
                                        <div style={infoBoxStyle}>
                                            📱 <strong>Get your commute by text.</strong> We can text you when to leave and when to get off, even with the app closed.{' '}
                                            <Link to="/profile" onClick={ctrl.handleClose} style={{ color: 'var(--t-accent)', fontWeight: 600 }}>Turn on text alerts in your profile →</Link>
                                        </div>
                                    )}

                                    {/* Push notifications */}
                                    {ctrl.notifPermission !== 'unsupported' && (
                                        <div style={{ ...infoBoxStyle, borderStyle: 'dashed' }}>
                                            <strong>{ctrl.notifPermission === 'granted' ? '🔔 Phone notifications on' : '🔔 Notifications on this device'}</strong>
                                            <div style={{ marginTop: '2px' }}>
                                                {ctrl.notifPermission === 'granted'
                                                    ? 'You\'ll get a "time to leave" alert 15 min before your bus.'
                                                    : ctrl.notifPermission === 'denied'
                                                        ? 'Blocked in browser settings. Re-enable notifications to get alerts.'
                                                        : 'Allow notifications to get a "time to leave" alert here too.'}
                                            </div>
                                            {ctrl.notifPermission === 'default' && (
                                                <button type="button" onClick={ctrl.handleEnableNotifications} disabled={ctrl.subscribing} style={{ ...smallBtn, marginTop: '8px' }}>
                                                    {ctrl.subscribing ? 'Enabling…' : 'Enable notifications'}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <WeekSummary ctrl={ctrl} placeName={placeName} />
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {ready && (
                            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--t-border-soft)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {ctrl.confirmApply ? (
                                    <div role="alertdialog" aria-label="Replace other days" style={warnBoxStyle}>
                                        This replaces the {TRIP_LABEL[ctrl.selectedTrip].toLowerCase()} on {ctrl.confirmApply.map(d => DAY_LABELS[d]).join(', ')}.
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                            <button type="button" onClick={() => ctrl.handleApplyToAll(true)} style={smallPrimaryBtn}>Replace</button>
                                            <button type="button" onClick={ctrl.cancelApply} style={smallBtn}>Cancel</button>
                                        </div>
                                    </div>
                                ) : isSet(trip) && ctrl.selectedDay >= 1 && ctrl.selectedDay <= 5 && (
                                    <button type="button" onClick={() => ctrl.handleApplyToAll()} style={secondaryBtnStyle}>
                                        Use {dayLabel}'s {TRIP_LABEL[ctrl.selectedTrip].toLowerCase()} every weekday
                                    </button>
                                )}

                                {ctrl.recheckNote && (
                                    <div role="status" style={{ ...infoBoxStyle, backgroundColor: 'var(--t-accent-soft)', borderColor: 'var(--t-accent-border)', color: 'var(--t-accent-dark)' }}>
                                        🕒 {ctrl.recheckNote}
                                    </div>
                                )}
                                {ctrl.saveNotes.length > 0 && (
                                    <div style={warnBoxStyle}>{ctrl.saveNotes.map((n, i) => <div key={i}>{n}</div>)}</div>
                                )}
                                {ctrl.saveError && <div role="alert" style={errorBoxStyle}>{ctrl.saveError}</div>}

                                <button type="button" onClick={() => { void ctrl.handleSave(); }} disabled={ctrl.saving || !ctrl.loaded} style={{
                                    ...primaryBtnStyle, padding: '11px',
                                    backgroundColor: ctrl.saveSuccess ? '#388E3C' : 'var(--t-accent)',
                                    opacity: ctrl.saving ? 0.7 : 1, cursor: ctrl.saving ? 'not-allowed' : 'pointer',
                                }}>
                                    {ctrl.saveSuccess ? '✓ Schedule saved' : ctrl.saving ? <><span style={spinnerStyle('white', 13)} /> Saving…</> : ctrl.dirty ? 'Save changes' : 'Save weekly schedule'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </>
    );
}

const MapIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" /><path d="M8 2v16M16 6v16" />
    </svg>
);

const spinnerStyle = (color: string, size = 18): React.CSSProperties => ({
    display: 'inline-block', width: `${size}px`, height: `${size}px`, borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    border: `2px solid ${color === 'white' ? 'rgba(255,255,255,0.4)' : 'var(--t-border-soft)'}`, borderTopColor: color,
    margin: size === 18 ? '0 auto 8px' : undefined, verticalAlign: 'middle', boxSizing: 'border-box',
});
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 700, color: '#757575', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' };
const sectionTitleStyle: React.CSSProperties = { fontSize: '10px', fontWeight: 700, color: '#9E9E9E', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' };
const selectStyle: React.CSSProperties = {
    width: '100%', padding: '9px 30px 9px 11px', borderRadius: '10px', border: '1.5px solid var(--t-border-soft)', outline: 'none', fontSize: '13px',
    backgroundColor: 'var(--t-surface)', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', boxSizing: 'border-box', color: '#202124',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%239E9E9E' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
};
const primaryBtnStyle: React.CSSProperties = {
    width: '100%', padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: 'var(--t-accent)', color: 'white',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', boxSizing: 'border-box',
};
const secondaryBtnStyle: React.CSSProperties = {
    width: '100%', padding: '8px', borderRadius: '9px', border: '1.5px solid var(--t-border-soft)', backgroundColor: 'var(--t-surface)',
    fontSize: '12px', fontWeight: 600, color: '#424242', cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '8px', border: '1.5px solid var(--t-border)', backgroundColor: 'var(--t-surface)',
    fontSize: '12px', fontWeight: 600, color: '#3c4043', cursor: 'pointer',
};
const smallPrimaryBtn: React.CSSProperties = { ...smallBtn, border: 'none', backgroundColor: 'var(--t-accent)', color: 'white' };
const dangerBtnStyle: React.CSSProperties = {
    width: '100%', padding: '9px', borderRadius: '10px', border: '1.5px solid #f5c2c0', backgroundColor: '#fdecea',
    color: '#c5221f', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxSizing: 'border-box',
};
const backBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '4px', height: '32px', padding: '0 6px', marginLeft: '-6px',
    border: 'none', background: 'transparent', color: 'var(--t-primary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
};
const previewBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px', marginTop: '8px', marginLeft: '26px',
    border: '1.5px solid var(--t-primary)', borderRadius: '15px', background: 'transparent', color: 'var(--t-primary)',
    fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};
const closeBtnStyle: React.CSSProperties = {
    width: '28px', height: '28px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--t-surface-2)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#757575',
};
const swapBtnStyle: React.CSSProperties = {
    width: '26px', height: '26px', borderRadius: '50%', border: '1.5px solid var(--t-border-soft)', backgroundColor: 'var(--t-surface)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#757575', flexShrink: 0,
};
const errorBoxStyle: React.CSSProperties = { padding: '9px 11px', backgroundColor: '#FFEBEE', borderRadius: '8px', fontSize: '12px', color: '#C62828', lineHeight: 1.45 };
const warnBoxStyle: React.CSSProperties = { padding: '9px 11px', backgroundColor: '#fef7e0', borderRadius: '8px', fontSize: '12px', color: '#7a4f01', lineHeight: 1.45, border: '1px solid #fde293' };
const infoBoxStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: '10px', backgroundColor: 'var(--t-surface-2)', border: '1.5px solid var(--t-border-soft)', fontSize: '12px', color: '#424242', lineHeight: 1.45 };
