/**
 * apiClient.ts
 *
 * Thin wrapper around fetch that automatically attaches the current user's
 * Supabase JWT as a Bearer token. Every backend route protected by
 * requireAuth or requireAdmin must be called through this — never raw fetch.
 */

import { supabase } from './supabase';

const BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
}

async function checkOk(res: Response, headers: Record<string, string>): Promise<Response> {
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
        // The server refused a login this browser still holds (ended on another device, suspended, or
        // expired): drop it here too, so the page shows signed-out instead of retrying with it
        if (res.status === 401 && body.error === 'Sign in required' && headers['Authorization']) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        // `code` lets callers react to specific refusals (e.g. "enter your authenticator code again")
        throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { code: body.code, status: res.status });
    }
    return res;
}

export async function apiGet(path: string): Promise<Response> {
    const headers = await authHeaders();
    return checkOk(await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers,
    }), headers);
}

export async function apiPost(path: string, body?: unknown): Promise<Response> {
    const headers = await authHeaders();
    return checkOk(await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    }), headers);
}

export async function apiPatch(path: string, body?: unknown): Promise<Response> {
    const headers = await authHeaders();
    return checkOk(await fetch(`${BASE_URL}${path}`, {
        method: 'PATCH',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    }), headers);
}

export async function apiDelete(path: string, body?: unknown): Promise<Response> {
    const headers = await authHeaders();
    return checkOk(await fetch(`${BASE_URL}${path}`, {
        method: 'DELETE',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    }), headers);
}
