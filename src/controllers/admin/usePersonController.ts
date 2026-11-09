/**
 * usePersonController.ts — Transit Regina  [MVC Controller]
 * Everything about one person, and the actions an admin can take on them.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../models/lib/supabase';
import { apiGet, apiPatch, apiDelete, apiPost } from '../../models/lib/apiClient';
import { FEATURES, FeatureKey } from '../../models/admin/FeatureAccessTypes';
import type { ConfirmRequest } from '../../views/components/admin/ui';

export interface Person {
    profile: { id: string; full_name: string | null; email: string | null; role: string; account_status: string; mobile_number: string | null; mobile_verified: boolean | null; sms_opted_in: boolean | null; created_at: string; last_active: string | null };
    features: { feature: string; enabled: boolean }[];
    sessions: { browser: string; os: string; device: string; first_seen: string; last_seen: string; page_views: number }[];
    history: { type: string; severity: string; message: string; admin: string; created_at: string }[];
}

export interface PersonEvent { at: string; kind: string; page: string | null; device: string | null; session?: string | null; detail: Record<string, unknown> }
type Top = { value: string; events: number; visitors: number };
/** Everything about one rider's use of the app (GET /api/admin/users/:id/activity) */
export interface PersonActivity {
    setup: boolean; deeper?: boolean;
    events: PersonEvent[];
    summary?: {
        kinds: { kind: string; events: number }[];
        sessions: { sessions: number; avg_minutes: number | null; median_minutes: number | null; avg_pages: number | null; bounce_rate: number | null } | null;
        hours: { weekday: number; hour: number; events: number }[];
        devices: { device: string; visitors: number }[];
        top: Record<string, Top[]>;
    };
    texts?: { kind: string; status: string; error_code: number | null; segments: number; created_at: string }[] | null;
    saved?: { places: number | null; weekly: { day_of_week: number; enabled: boolean; depart_by: string | null; arrive_by: string | null; route_num: string | null }[] | null };
    notes?: { id: number; at: string; note: string; author: string }[] | null;
}

/** Enter the authenticator code again; the login token is refreshed with a new "code entered at" time. */
export async function verifyTwoStepCode(code: string): Promise<void> {
    const { data, error } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp[0];
    if (error || !factor) throw new Error('Two-step sign-in is not set up on this account');
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (verifyErr) throw new Error('That code is not right, or it has expired. Try the newest code.');
}

export function usePersonController(id: string) {
    const navigate = useNavigate();
    const [person, setPerson] = useState<Person | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
    const [name, setName] = useState('');

    const load = useCallback(async () => {
        try { const p: Person = await (await apiGet(`/api/admin/users/${id}`)).json(); setPerson(p); setName(p.profile.full_name ?? ''); setError(null); }
        catch (e) { setError((e as Error).message); }
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const p = person?.profile;
    const who = p?.email || p?.full_name || 'this person';
    const patch = (fields: Record<string, unknown>) => async (reason: string) => { await apiPatch(`/api/admin/users/${id}`, { ...fields, reason }); await load(); };

    // A feature is on unless a row says otherwise
    const featureOn = (key: FeatureKey) => person?.features.find(f => f.feature === key)?.enabled ?? true;
    const toggleFeature = async (key: FeatureKey) => {
        try { await apiPost('/api/admin/fac/set', { userId: id, feature: key, enabled: !featureOn(key) }); await load(); }
        catch (e) { setError((e as Error).message); }
    };
    const saveName = async () => {
        try { await apiPatch(`/api/admin/users/${id}`, { full_name: name.trim() }); await load(); }
        catch (e) { setError((e as Error).message); }
    };

    // How much each action asks for scales with how much damage it could do
    const ask = {
        suspend: () => setConfirm({ title: `Suspend ${who}?`, body: 'They will be signed out and unable to sign in until an admin reactivates them.', confirmLabel: 'Suspend', danger: true, askReason: true, run: patch({ account_status: 'suspended' }) }),
        reactivate: () => setConfirm({ title: `Reactivate ${who}?`, body: 'They will be able to sign in again.', confirmLabel: 'Reactivate', run: patch({ account_status: 'active' }) }),
        makeAdmin: () => setConfirm({ title: `Make ${who} an admin?`, body: 'Admins can see every rider, change accounts and delete users. Only do this for people who run Transit Regina.', confirmLabel: 'Make admin', danger: true, askReason: true, typeToConfirm: p?.email ?? 'admin', run: patch({ role: 'admin' }) }),
        makeViewer: () => setConfirm({ title: `Make ${who} a view-only admin?`, body: 'View-only admins can see the whole admin panel, including riders\' details and activity, but cannot change anything. They sign in with two steps like admins.', confirmLabel: 'Make view-only admin', danger: true, askReason: true, typeToConfirm: p?.email ?? 'viewer', run: patch({ role: 'viewer' }) }),
        removeViewer: () => setConfirm({ title: `Remove view-only access from ${who}?`, body: 'They will keep their rider account but lose the admin panel.', confirmLabel: 'Remove access', danger: true, askReason: true, run: patch({ role: 'user' }) }),
        removeAdmin: () => setConfirm({ title: `Remove admin rights from ${who}?`, body: 'They will keep their rider account but lose the admin panel.', confirmLabel: 'Remove admin', danger: true, askReason: true, run: patch({ role: 'user' }) }),
        remove: () => setConfirm({
            title: `Delete ${who}?`, body: 'This permanently deletes the account and everything saved in it. It cannot be undone.', confirmLabel: 'Delete permanently', danger: true, askReason: true, typeToConfirm: p?.email ?? 'delete',
            run: async (reason) => { await apiDelete(`/api/admin/users/${id}`, { reason }); navigate('/admin/people', { replace: true }); },
        }),
    };

    // What this rider did in the app. Personal data: only loaded when the admin asks, and the server records it.
    const [activity, setActivity] = useState<PersonActivity | null>(null);
    const [activityError, setActivityError] = useState<string | null>(null);
    const showActivity = useCallback(async () => {
        try { setActivity(await (await apiGet(`/api/admin/users/${id}/activity`)).json()); setActivityError(null); }
        catch (e) { setActivityError((e as Error).message); }
    }, [id]);
    useEffect(() => { setActivity(null); setActivityError(null); }, [id]);

    // Private admin notes on the account
    const [noteDraft, setNoteDraft] = useState('');
    const addNote = useCallback(async () => {
        if (!noteDraft.trim()) return;
        try { await apiPost(`/api/admin/users/${id}/notes`, { note: noteDraft.trim() }); setNoteDraft(''); await showActivity(); }
        catch (e) { setActivityError((e as Error).message); }
    }, [id, noteDraft, showActivity]);
    const deleteNote = useCallback(async (noteId: number) => {
        try { await apiDelete(`/api/admin/notes/${noteId}`); await showActivity(); }
        catch (e) { setActivityError((e as Error).message); }
    }, [showActivity]);

    return { person, error, confirm, closeConfirm: () => setConfirm(null), ask, name, setName, saveName, featureOn, toggleFeature, features: FEATURES,
        activity, activityError, showActivity, noteDraft, setNoteDraft: (v: string) => setNoteDraft(v.slice(0, 1000)), addNote, deleteNote };
}
