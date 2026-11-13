/**
 * useExploreController.ts — Transit Regina  [MVC Controller]
 * The Insights drill-downs: one item in depth (who, when, where), everyone who used the app, and every action.
 * The period being looked at lives in the address (?days=7, or ?from=…&to=…), so it carries from page to page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLoadScript } from '@react-google-maps/api';
import { apiGet } from '../../models/lib/apiClient';
import { MapModel } from '../../models/MapModel';

/** Who did something: a signed-in rider (userId) or an anonymous visitor (an id that changes every day) */
export interface Actor { key: string; who: string; userId: string | null; visitor: string | null }
export interface ExploreEvent extends Actor { at: string; kind: string; page: string | null; device: string | null; detail: Record<string, unknown> }
export interface ItemPerson extends Actor { events: number; first: string; last: string; device: string | null }
export interface ItemPoint { lat: number; lng: number; label: string; events: number; people: number }
export interface Item {
    setup: boolean; topic: string; value: string; kind: string; days: number; capped: boolean;
    totals: { events: number; people: number; signedIn: number; anonymous: number };
    daily: { day: string; events: number; people: number }[];
    hourly: { hour: number; events: number; people: number }[];
    hours: { weekday: number; hour: number; events: number }[];
    devices: { device: string; visitors: number }[];
    people: ItemPerson[]; points: ItemPoint[]; events: ExploreEvent[];
}
export interface Rider extends Actor {
    events: number; actions: number; searches: number; trips: number; stops: number; buses: number; routes: number; errors: number;
    visits: number; first: string; last: string; device: string | null; topPlace: string | null;
}

/** Where an admin reads everything one person did */
export const personLink = (a: Pick<Actor, 'userId' | 'visitor'>) => a.userId ? `/admin/people/${a.userId}` : a.visitor ? `/admin/insights/visitors/${a.visitor}` : null;

/** The period in the address. Default: the last 7 days. */
export function useRange() {
    const [params, setParams] = useSearchParams();
    const from = params.get('from'), to = params.get('to');
    const custom = useMemo(() => from && to ? { from, to } : null, [from, to]);
    const days = [1, 7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;
    const query = custom ? `from=${custom.from}&to=${custom.to}` : `days=${days}`;
    const setDays = useCallback((d: number) => setParams(p => { p.delete('from'); p.delete('to'); p.set('days', String(d)); return p; }, { replace: true }), [setParams]);
    const setCustom = useCallback((c: { from: string; to: string }) => setParams(p => { p.delete('days'); p.set('from', c.from); p.set('to', c.to); return p; }, { replace: true }), [setParams]);
    return { days, custom, query, setDays, setCustom };
}

/** The maps loader, with the same settings as the rider map (two different settings would fail) */
export const useAdminMap = () => useLoadScript({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '', libraries: MapModel.libraries }).isLoaded;

/** Loads a JSON answer whenever `url` changes; `reload` asks again */
function useJson<T>(url: string | null) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        if (!url) return;
        setLoading(true);
        try { setData(await (await apiGet(url)).json()); setError(null); }
        catch (e) { setError((e as Error).message); }
        finally { setLoading(false); }
    }, [url]);
    useEffect(() => { setData(null); load(); }, [load]);
    return { data, error, loading, reload: load };
}

/** One item (a place, route, bus, stop…): who did it, when, on what, and where */
export function useItemController(topic: string, value: string) {
    const range = useRange();
    const res = useJson<Item>(`/api/admin/usage/item?topic=${encodeURIComponent(topic)}&value=${encodeURIComponent(value)}&${range.query}`);
    const [show, setShow] = useState<'all' | 'signed' | 'anonymous'>('all');
    const people = useMemo(() => (res.data?.people ?? []).filter(p => show === 'all' || (show === 'signed') === !!p.userId), [res.data, show]);
    return { range, ...res, people, show, setShow, mapReady: useAdminMap() };
}

export type RiderSort = 'actions' | 'searches' | 'trips' | 'stops' | 'buses' | 'visits' | 'errors' | 'last';
/** Everyone who used the app in the period, with what each did */
export function useRidersController() {
    const range = useRange();
    const res = useJson<{ setup: boolean; days: number; capped: boolean; people: Rider[] }>(`/api/admin/usage/people?${range.query}`);
    const [show, setShow] = useState<'all' | 'signed' | 'anonymous'>('all');
    const [find, setFind] = useState('');
    const [sort, setSort] = useState<RiderSort>('actions');
    const riders = useMemo(() => {
        const words = find.trim().toLowerCase();
        return (res.data?.people ?? [])
            .filter(p => show === 'all' || (show === 'signed') === !!p.userId)
            .filter(p => !words || p.who.toLowerCase().includes(words) || (p.topPlace ?? '').toLowerCase().includes(words))
            .sort((a, b) => sort === 'last' ? b.last.localeCompare(a.last) : (b[sort] - a[sort]) || b.last.localeCompare(a.last));
    }, [res.data, show, find, sort]);
    return { range, ...res, riders, show, setShow, find, setFind, sort, setSort };
}

/** Every action, newest first, 100 at a time, filtered */
export function useActivityController() {
    const range = useRange();
    const [kind, setKind] = useState('');
    const [who, setWho] = useState<'all' | 'signed' | 'anonymous'>('all');
    const [words, setWords] = useState('');
    const [events, setEvents] = useState<ExploreEvent[]>([]);
    const [next, setNext] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const base = `/api/admin/usage/events?${range.query}&who=${who}${kind ? `&kind=${kind}` : ''}${words ? `&q=${encodeURIComponent(words)}` : ''}`;

    const load = useCallback(async (before: string | null) => {
        setLoading(true);
        try {
            const r = await (await apiGet(before ? `${base}&before=${encodeURIComponent(before)}` : base)).json() as { events: ExploreEvent[]; next: string | null };
            setEvents(prev => before ? [...prev, ...r.events] : r.events);
            setNext(r.next); setError(null);
        } catch (e) { setError((e as Error).message); }
        finally { setLoading(false); }
    }, [base]);
    useEffect(() => { setEvents([]); load(null); }, [load]);

    return { range, kind, setKind, who, setWho, words, setWords, events, next, loading, error, loadMore: () => next && load(next), refresh: () => load(null) };
}
