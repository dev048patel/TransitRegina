/**
 * useServiceNoticeController.ts — Transit Regina  [MVC Controller]
 * The current service notice (for example "standard bus service is suspended"), checked when the page
 * opens, every 2 minutes, and when the rider comes back to the tab. null until the first answer.
 */
import { useEffect, useState } from 'react';
import { fetchServiceNotice, type PublicServiceNotice } from '../models/services/ServiceNoticeClient';

const EVERY_MS = 2 * 60_000;

export function useServiceNoticeController(): PublicServiceNotice | null {
    const [notice, setNotice] = useState<PublicServiceNotice | null>(null);
    useEffect(() => {
        let alive = true;
        const load = () => { fetchServiceNotice().then(n => { if (alive) setNotice(n); }); };
        load();
        const id = setInterval(load, EVERY_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, []);
    return notice;
}
