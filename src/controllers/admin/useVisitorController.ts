/**
 * useVisitorController.ts — Transit Regina  [MVC Controller]
 * Everything one signed-out visitor did (GET /api/admin/visitors/:id), in the same shape as a rider's activity.
 */
import { useEffect, useState } from 'react';
import { apiGet } from '../../models/lib/apiClient';
import type { PersonActivity } from './usePersonController';

export function useVisitorController(id: string) {
    const [activity, setActivity] = useState<PersonActivity | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        setActivity(null); setError(null);
        apiGet(`/api/admin/visitors/${encodeURIComponent(id)}`).then(r => r.json()).then(setActivity).catch(e => setError((e as Error).message));
    }, [id]);
    return { activity, error };
}
