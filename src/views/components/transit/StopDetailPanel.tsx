/* StopDetailPanel — departure board showing all routes & predictions for a selected stop.
   Compact on every device: a floating card (top right on desktop, under the navbar on phones), each route a
   plain row with a colour bar, the next three departures shown and the rest one tap away. */
import React, { useState } from 'react';
import { StopDetailPanelProps } from '../../../models/components/StopDetailPanelProps';
import { useStopDetailController, RouteGroup } from '../../../controllers/useStopDetailController';
import { directionOfStop, STOP_DIRECTION_ARROW, STOP_DIRECTION_LABEL } from '../../../models/transit/StopDirection';

/** Departures shown per route before "more" */
const SHOWN = 3;

export default function StopDetailPanel({ stop, onClose }: StopDetailPanelProps) {
    const { routeGroups, loading, error, lastRefreshed, handleRefresh } = useStopDetailController(stop.STOP_ID);
    const direction = directionOfStop(stop);

    return (
        <div className="stop-detail-panel t-panel" style={panelStyle}>
            {/* Header: name, then stop number · direction · when it was updated */}
            <div className="t-panel-header" style={headerStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stop.STOP_NAME}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '11px', color: '#5f6368', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <span style={chipStyle}>Stop #{stop.STOP_ID}</span>
                        {direction && (
                            <span
                                title={`Buses at this stop travel ${STOP_DIRECTION_LABEL[direction].toLowerCase()}`}
                                style={{ ...chipStyle, fontWeight: 600, color: '#1a73e8', backgroundColor: '#e8f0fe' }}
                            >
                                {STOP_DIRECTION_ARROW[direction]} {STOP_DIRECTION_LABEL[direction]}
                            </span>
                        )}
                        {lastRefreshed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>· updated {formatTimeAgo(lastRefreshed)}</span>}
                    </div>
                </div>
                <button onClick={handleRefresh} disabled={loading} title="Refresh departures" aria-label="Refresh departures"
                    style={{ ...iconBtnStyle, border: '1px solid var(--t-border)', opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                    <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>↻</span>
                </button>
                <button onClick={onClose} title="Close" aria-label="Close" style={iconBtnStyle}>✕</button>
            </div>

            {/* Departures */}
            <div style={contentStyle}>
                {loading && routeGroups.length === 0 && (
                    <div style={statusStyle}><div style={spinnerStyle} /> Loading departures…</div>
                )}

                {error && (
                    <div style={errorStyle}>
                        {error}
                        <button onClick={handleRefresh} style={{ marginLeft: '8px', background: 'none', border: '1px solid #d93025', borderRadius: '6px', padding: '2px 10px', cursor: 'pointer', fontSize: '12px', color: '#d93025', fontWeight: 600 }}>
                            Retry
                        </button>
                    </div>
                )}

                {!loading && !error && routeGroups.length === 0 && (
                    <div style={statusStyle}>No departures predicted for this stop right now</div>
                )}

                {routeGroups.map((group, i) => (
                    <RouteRow key={group.routeId} group={group} isNearest={i === 0 && group.hasLiveData} />
                ))}
            </div>

            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @media (min-width: 641px) {
                    .stop-detail-panel { top: 58px !important; right: 10px !important; width: 360px !important; max-height: calc(100dvh - 72px) !important; }
                }
                @media (max-width: 640px) {
                    .stop-detail-panel { top: 56px !important; left: 8px !important; right: 8px !important; max-height: 42dvh !important; }
                }
            `}</style>
        </div>
    );
}

function RouteRow({ group, isNearest }: { group: RouteGroup; isNearest: boolean }) {
    const [showAll, setShowAll] = useState(false);
    const shown = showAll ? group.predictions : group.predictions.slice(0, SHOWN);
    const hidden = group.predictions.length - shown.length;

    return (
        <div style={{ borderLeft: `3px solid ${group.routeColor}`, padding: '4px 0 4px 8px', margin: '2px 0', opacity: group.hasLiveData ? 1 : 0.7 }}>
            {/* Route: number, line name, LIVE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ backgroundColor: group.routeColor, color: 'white', padding: '1px 7px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                    {group.routeId}
                </span>
                <span style={{ color: '#202124', fontSize: '13px', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.lineName || `Route ${group.routeId}`}
                </span>
                {group.hasLiveData && (
                    <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: 700, color: '#137333', backgroundColor: '#e6f4ea', padding: '1px 6px', borderRadius: '6px', flexShrink: 0 }}>
                        LIVE
                    </span>
                )}
            </div>

            {group.predictions.length === 0 && (
                <div style={{ fontSize: '12px', color: '#80868b', marginTop: '2px' }}>No upcoming buses on this route</div>
            )}

            {shown.map((pred, i) => {
                const isNext = i === 0 && isNearest;
                return (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '2px 6px', marginTop: i === 0 ? '3px' : 0,
                        borderRadius: '6px', backgroundColor: isNext ? 'var(--t-accent-soft)' : 'transparent',
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        <span style={{ minWidth: '50px', fontSize: '13px', fontWeight: 700, color: pred.minutesAway <= 3 ? '#137333' : '#202124' }}>
                            {pred.minutesAway <= 0 ? 'NOW' : `${pred.minutesAway} min`}
                        </span>
                        <span style={{ minWidth: '58px', fontSize: '12px', color: '#5f6368' }}>{pred.predTime.trim()}</span>
                        <span style={{ flex: 1, fontSize: '11px', color: pred.isLive ? 'var(--t-primary)' : '#9aa0a6', fontWeight: pred.isLive ? 500 : 400 }}>
                            {pred.busId ? `Bus #${pred.busId}` : 'Scheduled'}
                        </span>
                        {pred.isLastStop && (
                            <span style={{ backgroundColor: '#d93025', color: 'white', fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '6px' }}>LAST</span>
                        )}
                    </div>
                );
            })}

            {(hidden > 0 || showAll) && group.predictions.length > SHOWN && (
                <button onClick={() => setShowAll(v => !v)} style={{ border: 'none', background: 'none', padding: '1px 6px', fontSize: '11px', fontWeight: 600, color: 'var(--t-primary)', cursor: 'pointer' }}>
                    {showAll ? 'Show less' : `${hidden} more`}
                </button>
            )}
        </div>
    );
}

function formatTimeAgo(date: Date): string {
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.round(seconds / 60)}m ago`;
}

// -------- Styles --------

const panelStyle: React.CSSProperties = {
    position: 'fixed',
    backgroundColor: 'var(--t-surface)',
    borderRadius: '14px',
    boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
    zIndex: 1500,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 8px 8px 12px',
    backgroundColor: 'var(--t-surface-2)',
    borderBottom: '1px solid var(--t-border-soft)',
};

const chipStyle: React.CSSProperties = {
    backgroundColor: 'var(--t-chip)',
    padding: '1px 6px',
    borderRadius: '5px',
    flexShrink: 0,
};

const iconBtnStyle: React.CSSProperties = {
    width: '28px',
    height: '28px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRadius: '50%',
    fontSize: '15px',
    color: '#5f6368',
    cursor: 'pointer',
    padding: 0,
};

const contentStyle: React.CSSProperties = {
    padding: '4px 10px 6px',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as any,
};

const statusStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 4px',
    fontSize: '13px',
    color: '#5f6368',
};

const spinnerStyle: React.CSSProperties = {
    width: '14px',
    height: '14px',
    border: '2px solid var(--t-border)',
    borderTop: '2px solid var(--t-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    flexShrink: 0,
};

const errorStyle: React.CSSProperties = {
    color: '#d93025',
    fontSize: '12px',
    padding: '6px 10px',
    margin: '4px 0',
    backgroundColor: '#fce8e6',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
};
