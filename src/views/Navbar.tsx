/* Navbar — top navigation bar with search autocomplete, route selector, admin link, profile, and saved locations */
import React from 'react';
import { Link } from 'react-router-dom';
import { Route } from '../models/transit/Route';
import { useAuth } from '../models/context/AuthContext';
import { useFeatureAccess } from '../models/context/FeatureAccessContext';
import { useNavbarController } from '../controllers/useNavbarController';
import { useSavedDestinationsController } from '../controllers/useSavedDestinationsController';
import { useTripScheduleController } from '../controllers/useTripScheduleController';
import { useWeeklyPlannerController } from '../controllers/useWeeklyPlannerController';
import SavedLocationsPanel from './SavedLocationsPanel';
import TripSchedulePanel from './TripSchedulePanel';
import WeeklyPlannerPanel from './WeeklyPlannerPanel';
import logo from '../New-Image.jpeg';

interface NavbarProps {
    onPlaceSelect?: (place: any) => void;
    /** Called when the search box is cleared, so the map can drop the selected place. */
    onClearPlace?: () => void;
    routes?: Route[];
    selectedRoute?: string | null;
    onRouteSelect?: (routeNum: string | null) => void;
}

// Renders the top navbar with search, route filter, admin link, profile, and saved locations
export default function Navbar({ onPlaceSelect, onClearPlace, routes, selectedRoute, onRouteSelect }: NavbarProps) {
    const { isAdmin } = useAuth();
    const { hasFeature } = useFeatureAccess();
    const { ready, value, status, data, showResults, handleInput, handleClear, handleSelect, handleFocus } = useNavbarController(onPlaceSelect, onClearPlace);
    const saved = useSavedDestinationsController();
    const tplan = useTripScheduleController();
    const weplan = useWeeklyPlannerController();

    // Mutual panel exclusion helpers
    const openSaved = () => { tplan.handleClose(); weplan.handleClose(); saved.handleOpen(); };
    const openTplan = () => { saved.handleClose(); weplan.handleClose(); tplan.handleOpen(); };
    const openWeplan = () => { saved.handleClose(); tplan.handleClose(); weplan.handleOpen(); };

    return (
        <nav className="navbar-root">
            {/* Top row — always visible */}
            <div className="navbar-top-row">
                {/* Logo — links to landing page */}
                <Link to="/" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <img
                        src={logo}
                        alt="Transit Regina"
                        className="navbar-logo"
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            objectFit: 'cover',
                            boxShadow: '0 2px 8px rgba(0,61,165,0.15)',
                        }}
                    />
                </Link>

                {/* Search bar */}
                <div className="navbar-search" style={{ flex: 1, maxWidth: '500px', position: 'relative' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'var(--t-chip)',
                        borderRadius: '24px',
                        padding: '7px 14px',
                        gap: '8px',
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2" style={{ flexShrink: 0 }}>
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        <input
                            type="text"
                            placeholder="Search places"
                            value={value}
                            onChange={handleInput}
                            onFocus={handleFocus}
                            disabled={!ready}
                            style={{
                                border: 'none',
                                backgroundColor: 'transparent',
                                outline: 'none',
                                fontSize: '16px',
                                width: '100%',
                                color: '#202124',
                            }}
                        />
                        {value && (
                            <button
                                type="button"
                                onClick={handleClear}
                                aria-label="Clear search"
                                title="Clear search"
                                style={{
                                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    width: '24px', height: '24px', border: 'none', borderRadius: '50%',
                                    backgroundColor: '#dadce0', color: '#3c4043', cursor: 'pointer', padding: 0,
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                                    <path d="M6 6l12 12M18 6L6 18" />
                                </svg>
                            </button>
                        )}
                        {!ready && (
                            <div style={{
                                width: '16px',
                                height: '16px',
                                border: '2px solid #f1f3f4',
                                borderTop: '2px solid var(--t-primary)',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                flexShrink: 0,
                            }} />
                        )}
                    </div>

                    {/* Autocomplete Results Dropdown */}
                    {showResults && status === 'OK' && data.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            marginTop: '8px',
                            backgroundColor: 'var(--t-surface)',
                            borderRadius: '12px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                            maxHeight: '300px',
                            overflowY: 'auto',
                            zIndex: 1002,
                        }}>
                            {data.map((suggestion) => {
                                const {
                                    place_id,
                                    structured_formatting: { main_text, secondary_text },
                                } = suggestion;

                                return (
                                    <div
                                        key={place_id}
                                        onClick={() => handleSelect(suggestion.description, place_id)}
                                        style={{
                                            padding: '10px 14px',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid #f1f3f4',
                                            transition: 'background-color 0.2s',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--t-surface-2)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--t-surface)'}
                                    >
                                        <div style={{ fontWeight: '500', color: '#202124', fontSize: '14px' }}>
                                            {main_text}
                                        </div>
                                        {secondary_text && (
                                            <div style={{ fontSize: '12px', color: '#5f6368', marginTop: '3px' }}>
                                                {secondary_text}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Desktop actions — hidden on mobile */}
                <div className="navbar-desktop-actions">
                    {/* Route Selector Dropdown */}
                    {routes && onRouteSelect && (
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                            <select
                                className="navbar-route-select"
                                value={selectedRoute || ''}
                                onChange={(e) => onRouteSelect(e.target.value || null)}
                                style={{
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    padding: '7px 34px 7px 12px',
                                    backgroundColor: selectedRoute ? 'var(--t-primary-soft)' : 'var(--t-chip)',
                                    border: selectedRoute ? '2px solid var(--t-primary)' : '1px solid #dadce0',
                                    borderRadius: '20px',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    color: selectedRoute ? 'var(--t-primary)' : '#5f6368',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    minWidth: '160px',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <option value="">🚌 Select Route</option>
                                {[...routes]
                                    .sort((a, b) => parseInt(a.ROUTE_NUM) - parseInt(b.ROUTE_NUM))
                                    .map(route => (
                                        <option key={route.ROUTE_ID} value={route.ROUTE_NUM}>
                                            Route {route.ROUTE_NUM} — {route.ROUTE_NAME}
                                        </option>
                                    ))
                                }
                            </select>
                            {selectedRoute ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRouteSelect(null); }}
                                    style={{
                                        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                        width: '20px', height: '20px', borderRadius: '50%', border: 'none',
                                        backgroundColor: 'var(--t-primary)', color: 'white', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '12px', fontWeight: '700', lineHeight: 1, padding: 0,
                                        transition: 'background-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d32f2f'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--t-primary)'}
                                    title="Clear route selection"
                                >
                                    ✕
                                </button>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            )}
                        </div>
                    )}

                    {/* Admin link */}
                    {isAdmin && (
                        <Link to="/admin" style={{ textDecoration: 'none' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '5px',
                                padding: '7px 12px', backgroundColor: '#003DA5', color: 'white',
                                borderRadius: '20px', fontSize: '13px', fontWeight: '600',
                                cursor: 'pointer', transition: 'background-color 0.2s', whiteSpace: 'nowrap',
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                                    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                                </svg>
                                <span>Admin</span>
                            </div>
                        </Link>
                    )}

                    {/* Weekly Commute Button */}
                    {hasFeature('weekly_planner') && <div
                        onClick={weplan.isOpen ? weplan.handleClose : openWeplan}
                        title="My Weekly Commute"
                        style={{
                            width: '34px', height: '34px', borderRadius: '50%',
                            backgroundColor: weplan.isOpen ? 'var(--t-accent-soft)' : 'var(--t-chip)',
                            border: weplan.isOpen ? '2px solid var(--t-accent)' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: weplan.isOpen ? 'var(--t-accent)' : '#5f6368',
                            transition: 'all 0.2s', flexShrink: 0,
                        }}
                        onMouseEnter={e => { if (!weplan.isOpen) { e.currentTarget.style.backgroundColor = 'var(--t-accent-soft)'; e.currentTarget.style.color = 'var(--t-accent)'; } }}
                        onMouseLeave={e => { if (!weplan.isOpen) { e.currentTarget.style.backgroundColor = 'var(--t-chip)'; e.currentTarget.style.color = '#5f6368'; } }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" />
                            <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                        </svg>
                    </div>}

                    {/* Trip Planner Button */}
                    {hasFeature('trip_planner') && <div
                        onClick={tplan.isOpen ? tplan.handleClose : openTplan}
                        title="Trip Planner"
                        style={{
                            width: '34px', height: '34px', borderRadius: '50%',
                            backgroundColor: tplan.isOpen ? 'var(--t-accent-soft)' : 'var(--t-chip)',
                            border: tplan.isOpen ? '2px solid var(--t-accent)' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: tplan.isOpen ? 'var(--t-accent)' : '#5f6368',
                            transition: 'all 0.2s', flexShrink: 0,
                        }}
                        onMouseEnter={e => { if (!tplan.isOpen) { e.currentTarget.style.backgroundColor = 'var(--t-accent-soft)'; e.currentTarget.style.color = 'var(--t-accent)'; } }}
                        onMouseLeave={e => { if (!tplan.isOpen) { e.currentTarget.style.backgroundColor = 'var(--t-chip)'; e.currentTarget.style.color = '#5f6368'; } }}
                    >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                    </div>}

                    {/* Saved Locations Button */}
                    {hasFeature('saved_locations') && <div
                        onClick={saved.isOpen ? saved.handleClose : openSaved}
                        title="Saved Locations"
                        style={{
                            width: '34px', height: '34px', borderRadius: '50%',
                            backgroundColor: saved.isOpen ? 'var(--t-accent-soft)' : 'var(--t-chip)',
                            border: saved.isOpen ? '2px solid var(--t-accent)' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: saved.isOpen ? 'var(--t-accent)' : '#5f6368',
                            transition: 'all 0.2s', flexShrink: 0,
                        }}
                        onMouseEnter={e => { if (!saved.isOpen) { e.currentTarget.style.backgroundColor = 'var(--t-accent-soft)'; e.currentTarget.style.color = 'var(--t-accent)'; } }}
                        onMouseLeave={e => { if (!saved.isOpen) { e.currentTarget.style.backgroundColor = 'var(--t-chip)'; e.currentTarget.style.color = '#5f6368'; } }}
                    >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill={saved.isOpen ? 'var(--t-accent)' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                        </svg>
                    </div>}

                    {/* Profile Icon */}
                    <Link to="/profile" style={{ textDecoration: 'none', flexShrink: 0 }}>
                        <div style={{
                            width: '34px', height: '34px', borderRadius: '50%',
                            backgroundColor: 'var(--t-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'white', transition: 'box-shadow 0.2s',
                            boxShadow: '0 2px 6px rgba(26,115,232,0.3)',
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                        </div>
                    </Link>
                </div>

                {/* Mobile actions — every icon on the bar, no menu */}
                <div className="navbar-mobile-actions">
                    {/* Route picker (mobile): a round chip; the native picker opens over it */}
                    {routes && onRouteSelect && (
                        <label
                            className="navbar-chip"
                            title="Select route"
                            style={{
                                position: 'relative',
                                backgroundColor: selectedRoute ? 'var(--t-primary)' : 'var(--t-chip)',
                                color: selectedRoute ? 'white' : '#5f6368',
                                fontSize: '12px', fontWeight: 700,
                            }}
                        >
                            {selectedRoute ?? (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="4" y="3" width="16" height="15" rx="3" /><line x1="4" y1="11" x2="20" y2="11" />
                                    <circle cx="8" cy="15" r="1" /><circle cx="16" cy="15" r="1" /><line x1="7" y1="18" x2="7" y2="21" /><line x1="17" y1="18" x2="17" y2="21" />
                                </svg>
                            )}
                            <select
                                aria-label="Select route"
                                value={selectedRoute || ''}
                                onChange={(e) => onRouteSelect(e.target.value || null)}
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: '16px' }}
                            >
                                <option value="">{selectedRoute ? 'All routes (clear)' : 'Select route'}</option>
                                {[...routes]
                                    .sort((a, b) => parseInt(a.ROUTE_NUM) - parseInt(b.ROUTE_NUM))
                                    .map(route => (
                                        <option key={route.ROUTE_ID} value={route.ROUTE_NUM}>
                                            Route {route.ROUTE_NUM} — {route.ROUTE_NAME}
                                        </option>
                                    ))
                                }
                            </select>
                        </label>
                    )}

                    {/* Admin (mobile) */}
                    {isAdmin && (
                        <Link to="/admin" className="navbar-chip" title="Admin dashboard" aria-label="Admin dashboard" style={{ backgroundColor: '#003DA5', color: 'white' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        </Link>
                    )}

                    {/* Weekly Commute Button (mobile) */}
                    {hasFeature('weekly_planner') && <div
                        onClick={weplan.isOpen ? weplan.handleClose : openWeplan}
                        style={{
                            width: 'var(--nav-chip)', height: 'var(--nav-chip)', borderRadius: '50%',
                            backgroundColor: weplan.isOpen ? 'var(--t-accent-soft)' : 'var(--t-chip)',
                            border: weplan.isOpen ? '2px solid var(--t-accent)' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: weplan.isOpen ? 'var(--t-accent)' : '#5f6368', flexShrink: 0,
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" />
                            <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                        </svg>
                    </div>}

                    {/* Trip Planner Button (mobile) */}
                    {hasFeature('trip_planner') && <div
                        onClick={tplan.isOpen ? tplan.handleClose : openTplan}
                        style={{
                            width: 'var(--nav-chip)', height: 'var(--nav-chip)', borderRadius: '50%',
                            backgroundColor: tplan.isOpen ? 'var(--t-accent-soft)' : 'var(--t-chip)',
                            border: tplan.isOpen ? '2px solid var(--t-accent)' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: tplan.isOpen ? 'var(--t-accent)' : '#5f6368', flexShrink: 0,
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                    </div>}

                    {/* Saved Locations Button (mobile) */}
                    {hasFeature('saved_locations') && <div
                        onClick={saved.isOpen ? saved.handleClose : openSaved}
                        style={{
                            width: 'var(--nav-chip)', height: 'var(--nav-chip)', borderRadius: '50%',
                            backgroundColor: saved.isOpen ? 'var(--t-accent-soft)' : 'var(--t-chip)',
                            border: saved.isOpen ? '2px solid var(--t-accent)' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: saved.isOpen ? 'var(--t-accent)' : '#5f6368',
                            flexShrink: 0,
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill={saved.isOpen ? 'var(--t-accent)' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                        </svg>
                    </div>}

                    <Link to="/profile" style={{ textDecoration: 'none', flexShrink: 0 }}>
                        <div style={{
                            width: 'var(--nav-chip)', height: 'var(--nav-chip)', borderRadius: '50%',
                            backgroundColor: 'var(--t-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white',
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                        </div>
                    </Link>
                </div>
            </div>

            {/* Weekly Commute Panel */}
            {weplan.isOpen && <WeeklyPlannerPanel ctrl={weplan} />}

            {/* Trip Planner Panel */}
            {tplan.isOpen && <TripSchedulePanel ctrl={tplan} onPreviewLocation={onPlaceSelect} />}

            {/* Saved Locations Panel */}
            {saved.isOpen && <SavedLocationsPanel ctrl={saved} onGoNow={onPlaceSelect} />}

            {/* Responsive CSS */}
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .navbar-root {
                    --nav-chip: 30px;
                    position: fixed;
                    top: 0; left: 0; right: 0;
                    background-color: var(--t-surface);
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    z-index: 1001;
                    max-width: 100vw;
                }

                .navbar-top-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 16px;
                    height: 52px;
                    gap: 8px;
                }

                .navbar-desktop-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                }

                .navbar-mobile-actions {
                    display: none;
                    align-items: center;
                    gap: 6px;
                    flex-shrink: 0;
                }

                .navbar-chip {
                    width: var(--nav-chip); height: var(--nav-chip);
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0; cursor: pointer; text-decoration: none; overflow: hidden;
                }

                /* ── Mobile: <= 640px ── */
                @media (max-width: 640px) {
                    .navbar-desktop-actions { display: none; }
                    .navbar-mobile-actions { display: flex; gap: 4px; }
                    /* Search shrinks to make room for the icons; the text stays 16px so phones don't zoom in */
                    .navbar-search { margin: 0 2px !important; min-width: 0; }
                    .navbar-search > div { padding: 6px 10px !important; gap: 6px !important; }
                    .navbar-search input { min-width: 0; }
                    .navbar-search input::placeholder { font-size: 14px; }
                    .navbar-logo { width: 30px !important; height: 30px !important; border-radius: 8px !important; }
                    .navbar-top-row { height: 48px; padding: 0 8px; gap: 6px; }
                }
            `}</style>
        </nav>
    );
}
