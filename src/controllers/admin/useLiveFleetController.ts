/**
 * useLiveFleetController.ts — Transit Regina  [MVC Controller]
 * Which routes and buses are running today, for the admin Service page, refreshed every 30 s:
 * routes with no bus in the live feed for 5 minutes, and buses missing from it or stopped mid-route.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../models/lib/apiClient';

export type BusStatus = 'moving' | 'layover' | 'stopped' | 'missing';
export interface FleetBus { busId: number; route: string; line: string; status: BusStatus; inactive: boolean; lastSeenAt: string; since: string | null; lat: number; lng: number }
export interface FleetRoute { route: string; status: 'live' | 'inactive' | 'checking'; buses: number; stopped: number; lastSeenAt: string | null; inactiveSince: string | null }
export interface FleetSnapshot { day: string; trackingSince: string | null; feedOk: boolean; lastFeedAt: string | null; routes: FleetRoute[]; buses: FleetBus[] }

const EVERY_MS = 30_000;

export function useLiveFleetController() {
    const [fleet, setFleet] = useState<FleetSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try { setFleet(await (await apiGet('/api/admin/service/live')).json()); setError(null); }
        catch (e) { setError((e as Error).message); }
    }, []);
    useEffect(() => {
        load();
        const id = setInterval(load, EVERY_MS);
        return () => clearInterval(id);
    }, [load]);

    const byRoute = useMemo(() => new Map((fleet?.routes ?? []).map(r => [r.route, r])), [fleet]);
    const counts = useMemo(() => {
        const b = fleet?.buses ?? [];
        return {
            routesLive: (fleet?.routes ?? []).filter(r => r.status === 'live').length,
            routesInactive: (fleet?.routes ?? []).filter(r => r.status === 'inactive').length,
            routesTotal: fleet?.routes.length ?? 0,
            moving: b.filter(x => x.status === 'moving' && x.route !== '0').length,
            layover: b.filter(x => x.status === 'layover').length,
            inactive: b.filter(x => x.inactive).length,
            offRoute: b.filter(x => x.route === '0' && x.status !== 'missing').length,
        };
    }, [fleet]);
    const inactiveBuses = useMemo(() => (fleet?.buses ?? []).filter(b => b.inactive), [fleet]);

    return { fleet, error, byRoute, counts, inactiveBuses, reload: load };
}
