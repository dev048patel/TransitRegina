/**
 * useTimetableController.ts — Transit Regina  [MVC Controller]
 * The timetables the stop and route pages show: the routes' departures (loaded when the page opens,
 * already there when the page is pre-rendered), the time now in Regina for the "next scheduled buses",
 * and whether the admin has said bus service is suspended.
 *
 * The service notice client is loaded only in the browser (it needs the app's settings), so the
 * pre-render, which runs in plain Node, never imports it.
 *
 * `now` is null when the page is pre-rendered and for the first moment in the browser, so the HTML
 * search engines read holds the timetable itself, never times that were "next" on the day it was built.
 */
import { useEffect, useState } from 'react';
import { cachedTimetable, loadTimetable, type RouteTimetable } from '../models/services/TimetableService';

const TICK_MS = 30_000;

export function useTimetableController(routes: string[]) {
    const key = routes.join(',');
    const [tables, setTables] = useState<Record<string, RouteTimetable | undefined>>(() =>
        Object.fromEntries(routes.map(r => [r, cachedTimetable(r)])));
    const [failed, setFailed] = useState(false);
    const [now, setNow] = useState<Date | null>(null);
    const [suspended, setSuspended] = useState(false);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        Promise.all(routes.map(r => loadTimetable(r))).then(loaded => {
            if (!alive) return;
            setTables(Object.fromEntries(routes.map((r, i) => [r, loaded[i] ?? undefined])));
            setFailed(loaded.some(t => !t));
        });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    useEffect(() => {
        let alive = true;
        const tick = () => {
            setNow(new Date());
            // The notice client keeps its answer for 30 seconds, so this asks the server at most that often
            import('../models/services/ServiceNoticeClient')
                .then(m => m.fetchServiceNotice())
                .then(n => { if (alive) setSuspended(!!(n.active && n.suspended)); })
                .catch(() => { /* no notice: show the timetable as usual */ });
        };
        tick();
        const id = setInterval(tick, TICK_MS);
        return () => { alive = false; clearInterval(id); };
    }, []);

    return { tables, failed, now, suspended };
}
