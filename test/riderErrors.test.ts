/* The fixes for errors seen on riders' devices (admin "Errors on riders' devices") */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldReloadForUpdate } from '../src/models/lib/staleVersion';

/* ── A tab from before a release: reload once to get the new one, never in a loop ── */
const memory = () => { const m = new Map<string, string>(); return () => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }); };

test('a tab that can no longer load the release reloads once', () => {
    const store = memory();
    assert.equal(shouldReloadForUpdate(store, 1_000_000), true);
});

test('it does not reload again straight after reloading (the new release is missing the file too)', () => {
    const store = memory();
    shouldReloadForUpdate(store, 1_000_000);
    assert.equal(shouldReloadForUpdate(store, 1_005_000), false);
});

test('a later release, a while after, reloads again', () => {
    const store = memory();
    shouldReloadForUpdate(store, 1_000_000);
    assert.equal(shouldReloadForUpdate(store, 1_000_000 + 60_000), true);
});

test('with storage blocked it never reloads, so it can never loop', () => {
    assert.equal(shouldReloadForUpdate(() => { throw new Error('SecurityError'); }, 1_000_000), false);
    const full = () => ({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } });
    assert.equal(shouldReloadForUpdate(full, 1_000_000), false);
});

/* ── vercel.json: what each address is served ── */
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    rewrites: { source: string; destination: string }[]; redirects: { source: string; destination: string; has?: unknown }[];
};
// Vercel matches the whole path; these sources are also plain regular expressions
const servedTheApp = (path: string) => vercel.rewrites.some(r => r.destination === '/index' && new RegExp(`^${r.source}$`).test(path));

test('a script file from an old release is a real "not found", not the app page (which browsers refuse to run)', () => {
    assert.equal(servedTheApp('/assets/MapPage-DKr_C6xJ.js'), false);
    assert.equal(servedTheApp('/assets/LandingPage-DJCSSPyM.js'), false);
});

test('every page address still opens the app', () => {
    for (const path of ['/', '/map', '/profile', '/admin/insights', '/login', '/no-such-page']) assert.equal(servedTheApp(path), true, path);
});

test('the retired route and stop pages still go to the homepage', () => {
    for (const source of ['/routes', '/routes/:path*', '/stops/:path*']) {
        assert.ok(vercel.redirects.some(r => r.source === source && r.destination === '/' && !r.has), source);
    }
});
