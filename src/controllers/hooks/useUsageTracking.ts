/* useUsageTracking — what views use to record what riders do (views must not call services directly).
   usePageViews records every page the rider opens inside the app, not only full page loads. */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from '../../models/services/UsageTracker';

export function useUsageTracking() {
    return { track };
}

export function usePageViews(): void {
    const { pathname } = useLocation();
    useEffect(() => { track('page_view', { path: pathname }); }, [pathname]);
}
