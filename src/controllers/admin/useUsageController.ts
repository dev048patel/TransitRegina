/**
 * useUsageController.ts — Transit Regina  [MVC Controller]
 * The admin Usage page: what riders do, over the chosen number of Regina days. Refreshes every minute.
 */
import { useState, useEffect, useCallback } from 'react';
import { useLoadScript } from '@react-google-maps/api';
import { apiGet } from '../../models/lib/apiClient';
import { MapModel } from '../../models/MapModel';

export interface UsageTop { value: string; events: number; visitors: number }
export interface UsageTotals { visitors: number; riders: number; pageViews: number; searches: number; trips: number }
export interface Metric { name: string; samples: number; p50: number; p75: number; p90: number }
export interface Unmet { place: string; looked: number; riders: number; no_options: number; over_hour: number; avg_best_minutes: number | null; trips: number; took_bus_pct: number | null }
export interface Usage {
    setup: boolean;
    /** false until docs/security/012_admin_insights.sql has been run: sessions, speed, unmet demand and returning riders */
    deeper: boolean;
    days: number; from: string; to: string;
    totals: UsageTotals; previous: UsageTotals;
    daily: { day: string; visitors: number; riders: number; pageViews: number; searches: number; trips: number }[];
    kinds: { kind: string; events: number; visitors: number }[];
    funnel: { label: string; visitors: number }[];
    hours: { weekday: number; hour: number; events: number }[];
    devices: { device: string; visitors: number }[];
    top: Record<'places' | 'tappedPlaces' | 'tripDestinations' | 'tripRoutes' | 'routes' | 'busRoutes' | 'buses' | 'stops' | 'pages' | 'characters' | 'menus' | 'location'
        | 'locationProblems' | 'sources' | 'campaigns' | 'browsers' | 'systems' | 'screens' | 'languages' | 'installed' | 'connections' | 'versions'
        | 'errors' | 'errorPlaces' | 'apiErrors' | 'chosenRank' | 'expandedRank' | 'reports', UsageTop[]>;
    sessions: { sessions: number; avg_minutes: number | null; median_minutes: number | null; avg_pages: number | null; bounce_rate: number | null } | null;
    vitals: Metric[]; timings: Metric[]; unmet: Unmet[];
    retention: { week: string; riders: number; returning_riders: number; new_riders: number }[];
    latest: { at: string; kind: string; page: string | null; device: string | null; detail: Record<string, unknown>; who: string; userId: string | null; visitor: string | null }[];
}

export interface NowVisitor { who: string; userId: string | null; visitor: string | null; at: string; kind: string; page: string | null; device: string | null; events: number }
export interface SearchPoint { lat: number; lng: number; events: number; label: string }

export const RANGES = [{ days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }];
const REFRESH_MS = 60_000, NOW_REFRESH_MS = 30_000;

export function useUsageController() {
    const [days, setDaysState] = useState(7);
    /** A custom range (Regina dates, inclusive), used instead of `days` when set */
    const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
    const [data, setData] = useState<Usage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState<{ setup: boolean; visitors: NowVisitor[] } | null>(null);
    const [points, setPoints] = useState<SearchPoint[]>([]);
    const query = custom ? `from=${custom.from}&to=${custom.to}` : `days=${days}`;

    const load = useCallback(async () => {
        try {
            const [usage, map] = await Promise.all([apiGet(`/api/admin/usage?${query}`).then(r => r.json()), apiGet(`/api/admin/usage/points?${query}`).then(r => r.json()).catch(() => ({ points: [] }))]);
            setData(usage); setPoints(map.points ?? []); setError(null);
        }
        catch (e) { setError((e as Error).message); }
        finally { setLoading(false); }
    }, [query]);
    useEffect(() => {
        setLoading(true);
        load();
        const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);

    // Who is on the app right now: its own, faster refresh
    const loadNow = useCallback(async () => { try { setNow(await (await apiGet('/api/admin/usage/now')).json()); } catch { /* keeps the last list */ } }, []);
    useEffect(() => { loadNow(); const id = setInterval(() => { if (!document.hidden) loadNow(); }, NOW_REFRESH_MS); return () => clearInterval(id); }, [loadNow]);

    // The search map uses the same Google Maps loader settings as the rider map (two different settings would fail)
    const { isLoaded: mapReady } = useLoadScript({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '', libraries: MapModel.libraries });

    const setDays = (d: number) => { setCustom(null); setDaysState(d); };
    return { days, setDays, custom, setCustom, data, error, loading, now, points, mapReady };
}

/** Downloads rows as a CSV file (opens in Excel or Google Sheets) */
export function downloadCsv(name: string, rows: Record<string, unknown>[]): void {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const cell = (v: unknown) => { const t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${name}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** "+12%", "−5%", "new" or "no change" against the period before */
export function change(now: number, before: number): { text: string; up: boolean | null } {
    if (now === before) return { text: 'no change', up: null };
    if (before === 0) return { text: 'new', up: true };
    const pct = Math.round(((now - before) / before) * 100);
    return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, up: pct > 0 };
}
