/* ArriveByPlanCard — the scheduled trips that get the rider there by the time they picked (pure view).
   Every way of making the trip is listed; each can be previewed on the map: the walk to the stop, the
   buses, and the walk to the destination. */
import React from 'react';
import { ArrowLeft, ChevronDown, Map as MapIcon } from 'lucide-react';
import transitColors from '../../../models/data/transitColors';
import type { ArriveByPlan, JourneyKind, PlannedJourney } from '../../../models/services/ArriveByClient';

const routeColor = (route: string) => transitColors.find(c => c.route_id === parseInt(route))?.colour ?? '#1a73e8';

const KIND_LABEL: Record<JourneyKind, string> = {
    best: '★ Latest bus that gets you there',
    other: 'Another way',
    earlier: 'Earlier bus, in case you miss it',
};

function Steps({ journey }: { journey: PlannedJourney }) {
    const [openStops, setOpenStops] = React.useState<Set<number>>(new Set());
    const toggleStops = (i: number) => setOpenStops(prev => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
    });
    return (
        <>
            {/* When to set off, and when they get there */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <div style={timeBoxStyle}>
                    <div style={timeLabelStyle}>Leave at</div>
                    <div style={timeValueStyle}>{journey.leave}</div>
                </div>
                <div style={timeBoxStyle}>
                    <div style={timeLabelStyle}>Arrive at</div>
                    <div style={timeValueStyle}>{journey.arrive}</div>
                </div>
            </div>

            {journey.legs.map((leg, i) => (
                <React.Fragment key={i}>
                    <div style={stepStyle}>
                        <span style={dotStyle(i === 0 ? '#34a853' : '#e37400')} />
                        <span>
                            {i > 0 && leg.boardStop.id === journey.legs[i - 1].alightStop.id
                                ? <>Change buses at <strong>{leg.boardStop.name}</strong></>
                                : <>{i === 0 ? 'Walk' : 'Change buses: walk'} {leg.walkBeforeMin} min to <strong>{leg.boardStop.name}</strong></>}
                            <span style={{ color: '#80868b' }}> · Stop #{leg.boardStop.id}</span>
                        </span>
                    </div>
                    <div style={stepStyle}>
                        <span style={dotStyle(routeColor(leg.route))} />
                        <span>
                            <strong>{leg.board}</strong> · Board{' '}
                            <span style={{ ...badgeStyle, backgroundColor: routeColor(leg.route) }}>Route {leg.route}</span>
                            {leg.headsign && <span style={{ color: '#5f6368' }}> towards {leg.headsign}</span>}
                        </span>
                    </div>
                    <div style={{ ...stepStyle, paddingLeft: '20px', color: '#5f6368', fontSize: '12px', flexDirection: 'column', gap: '2px' }}>
                        <span>
                            Ride {leg.rideMin} min
                            {leg.stopsBetween.length > 0 && (
                                <>
                                    {' · '}
                                    <button type="button" onClick={() => toggleStops(i)} aria-expanded={openStops.has(i)} style={linkBtnStyle}>
                                        {openStops.has(i) ? '▾' : '▸'} {leg.stopsBetween.length} stop{leg.stopsBetween.length !== 1 ? 's' : ''} on the way
                                    </button>
                                </>
                            )}
                        </span>
                        {openStops.has(i) && (
                            <ol style={{ margin: '2px 0 0', paddingLeft: '16px', fontSize: '11.5px', color: '#5f6368' }}>
                                {leg.stopsBetween.map((name, si) => <li key={si}>{name}</li>)}
                            </ol>
                        )}
                    </div>
                    <div style={stepStyle}>
                        <span style={dotStyle('#ea4335')} />
                        <span><strong>{leg.alight}</strong> · Get off at <strong>{leg.alightStop.name}</strong></span>
                    </div>
                </React.Fragment>
            ))}
            <div style={stepStyle}>
                <span style={dotStyle('#1a73e8')} />
                <span>Walk {journey.walkAfterMin} min to your destination · <strong>{journey.arrive}</strong></span>
            </div>
        </>
    );
}

function RouteBadges({ journey }: { journey: PlannedJourney }) {
    return (
        <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {journey.legs.map((leg, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span aria-hidden style={{ color: '#9aa0a6', fontSize: '11px' }}>›</span>}
                    <span style={{ ...badgeStyle, backgroundColor: routeColor(leg.route) }}>Route {leg.route}</span>
                </React.Fragment>
            ))}
            <span style={{ fontSize: '11px', color: '#5f6368', whiteSpace: 'nowrap' }}>
                {journey.legs.length === 1 ? 'Direct' : `${journey.legs.length - 1} transfer${journey.legs.length > 2 ? 's' : ''}`} · {journey.totalMin} min
            </span>
        </span>
    );
}

/** One way of making the trip: a summary, its steps on a tap, and a preview on the map */
function Option({ journey, first, onPreview }: { journey: PlannedJourney; first: boolean; onPreview: () => void }) {
    // On phones every option starts closed so several fit on screen; desktop opens the best one
    const [open, setOpen] = React.useState(() => first && !window.matchMedia('(max-width: 640px)').matches);
    return (
        <div style={{ ...optionStyle, ...(first ? {} : { borderTop: '1px solid var(--t-border-soft)' }) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', minWidth: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: journey.kind === 'best' ? '#137333' : '#5f6368' }}>
                        {KIND_LABEL[journey.kind]}
                    </span>
                    <RouteBadges journey={journey} />
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', color: '#202124', flexShrink: 0 }}>
                    <div>Leave <strong>{journey.leave}</strong></div>
                    <div style={{ color: '#5f6368' }}>Arrive {journey.arrive}</div>
                </span>
            </div>
            {open && <div style={{ marginTop: '10px' }}><Steps journey={journey} /></div>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={stepsBtnStyle}>
                    <ChevronDown size={15} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
                    {open ? 'Hide steps' : 'Show steps'}
                </button>
                <button type="button" onClick={onPreview} style={previewBtnStyle}>
                    <MapIcon size={14} aria-hidden /> Preview on map
                </button>
            </div>
        </div>
    );
}

interface ArriveByPlanCardProps {
    plan: ArriveByPlan | null;
    loading: boolean;
    error: string | null;
    /** The journey drawn on the map, or null for the list of options */
    previewing: PlannedJourney | null;
    onPreview: (journey: PlannedJourney) => void;
    onEndPreview: () => void;
}

export default function ArriveByPlanCard({ plan, loading, error, previewing, onPreview, onEndPreview }: ArriveByPlanCardProps) {
    if (loading) return <div style={noteStyle}>Finding the buses that get you there in time…</div>;
    if (error) return <div style={{ ...noteStyle, color: '#d93025' }}>{error}</div>;
    if (!plan) return null;

    const when = `${plan.day === 'tomorrow' ? 'Tomorrow' : 'Today'}, arrive by ${plan.arriveBy}`;
    const scheduleNote = (
        <div style={{ fontSize: '11px', color: '#80868b', marginTop: '10px' }}>
            Times are from the published schedule. Buses can run a few minutes early or late.
        </div>
    );

    // One trip on the map: its steps here, and the way back to every option
    if (previewing) {
        return (
            <div className="t-card" style={cardStyle}>
                <button type="button" onClick={onEndPreview} style={{ ...stepsBtnStyle, marginLeft: '-6px' }}>
                    <ArrowLeft size={15} aria-hidden /> All options
                </button>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t-accent)', margin: '2px 0 8px' }}>🗺️ Shown on the map · {when}</div>
                <div style={{ marginBottom: '10px' }}><RouteBadges journey={previewing} /></div>
                <Steps journey={previewing} />
                {scheduleNote}
            </div>
        );
    }

    const preview = (journey: PlannedJourney) => (
        <button type="button" onClick={() => onPreview(journey)} style={{ ...previewBtnStyle, marginTop: '10px' }}>
            <MapIcon size={14} aria-hidden /> Preview on map
        </button>
    );

    return (
        <div className="t-card" style={cardStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t-accent)', marginBottom: '4px' }}>
                🗓️ {when} · Scheduled bus times
            </div>

            {plan.status === 'planned' && (
                <>
                    <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '2px' }}>
                        {plan.journeys.length === 1 ? '1 way' : `${plan.journeys.length} ways`} to get there
                    </div>
                    {plan.journeys.map((journey, i) => (
                        <Option key={i} journey={journey} first={i === 0} onPreview={() => onPreview(journey)} />
                    ))}
                </>
            )}

            {plan.status === 'partial' && (
                <>
                    <div style={{ ...warnStyle, margin: '6px 0 10px' }}>
                        No bus goes all the way in time. This gets you within {(plan.remainingMetres / 1000).toFixed(1)} km.
                    </div>
                    <Steps journey={plan.journey} />
                    {preview(plan.journey)}
                </>
            )}

            {plan.status === 'no_service' && (
                plan.earliest ? (
                    <>
                        <div style={{ ...warnStyle, margin: '6px 0 10px' }}>
                            No bus gets you there by {plan.arriveBy}. The earliest you can arrive is {plan.earliest.arrive}:
                        </div>
                        <Steps journey={plan.earliest} />
                        {preview(plan.earliest)}
                    </>
                ) : (
                    <div style={{ ...warnStyle, marginTop: '6px' }}>No buses run between here and your destination around that time.</div>
                )
            )}

            {scheduleNote}
        </div>
    );
}

const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--t-surface)', borderRadius: '12px', padding: '12px 14px', margin: '6px 4px',
    border: '1px solid var(--t-border-soft)', borderLeft: '4px solid var(--t-accent)',
};
const optionStyle: React.CSSProperties = { padding: '10px 0 6px' };
const timeBoxStyle: React.CSSProperties = {
    flex: 1, backgroundColor: 'var(--t-accent-soft)', borderRadius: '10px', padding: '8px 10px',
};
const timeLabelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--t-accent)' };
const timeValueStyle: React.CSSProperties = { fontSize: '18px', fontWeight: 800, color: 'var(--t-accent-dark)' };
const stepStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '5px 0', fontSize: '13px', color: '#202124', lineHeight: 1.45,
};
const dotStyle = (color: string): React.CSSProperties => ({
    width: '10px', height: '10px', borderRadius: '50%', border: `2.5px solid ${color}`, flexShrink: 0, marginTop: '4px',
});
const badgeStyle: React.CSSProperties = {
    color: 'white', fontWeight: 700, fontSize: '12px', padding: '1px 8px', borderRadius: '8px', whiteSpace: 'nowrap',
};
const warnStyle: React.CSSProperties = {
    fontSize: '13px', color: '#b06000', backgroundColor: '#fef7e0', borderRadius: '8px', padding: '8px 10px',
};
const noteStyle: React.CSSProperties = { padding: '20px', textAlign: 'center', fontSize: '13px', color: '#5f6368' };
const linkBtnStyle: React.CSSProperties = {
    border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--t-primary)', fontWeight: 600, cursor: 'pointer',
};
const stepsBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '4px', height: '32px', padding: '0 6px',
    border: 'none', background: 'transparent', color: 'var(--t-primary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
};
const previewBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px',
    border: '1.5px solid var(--t-primary)', borderRadius: '16px', background: 'transparent', color: 'var(--t-primary)',
    fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};
