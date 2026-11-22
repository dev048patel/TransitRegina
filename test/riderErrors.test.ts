/* The fixes for errors seen on riders' devices (admin "Errors on riders' devices") */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldReloadForUpdate } from '../src/models/lib/staleVersion';
import { PRIVATE_PREFIXES } from '../src/models/seo/pageMeta';

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
// Pages are files written by scripts/prerender.tsx (cleanUrls serves build/x.html at /x); the few
// rewrites cover app addresses with no file of their own. Anything else gets build/404.html, a real 404.
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    rewrites: { source: string; destination: string }[]; redirects: { source: string; destination: string; has?: unknown }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
};
// Vercel matches the whole path; these sources are also plain regular expressions
const rewrittenTo = (path: string) => vercel.rewrites.find(r => new RegExp(`^${r.source}$`).test(path))?.destination;

test('a script file from an old release is a real "not found", not the app page (which browsers refuse to run)', () => {
    assert.equal(rewrittenTo('/assets/MapPage-DKr_C6xJ.js'), undefined);
    assert.equal(rewrittenTo('/assets/LandingPage-DJCSSPyM.js'), undefined);
});

test('an unknown address is a real 404, not a copy of the homepage', () => {
    for (const path of ['/no-such-page', '/stops/999999', '/routes/99-nowhere', '/connect/nobody']) assert.equal(rewrittenTo(path), undefined, path);
});

test('every admin address opens the admin page', () => {
    for (const path of ['/admin/insights', '/admin/people/123', '/admin/insights/visitors/abc']) assert.equal(rewrittenTo(path), '/admin', path);
});

test('every address the app has is a pre-rendered page, so none of them is a 404', () => {
    const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const paths = [...app.matchAll(/<Route\s+path="(\/[^"]*)"/g)].map(m => m[1]);
    assert.ok(paths.length > 10, 'read the routes from App.tsx');
    // What scripts/prerender.tsx writes, plus /landing, which vercel.json redirects
    const prerendered = ['/', '/map', '/routes', '/routes/:slug', '/stops/:slug', '/about', '/privacy', '/terms', '/connect', '/connect/:slug', ...PRIVATE_PREFIXES];
    for (const p of paths) assert.ok(prerendered.includes(p) || vercel.redirects.some(r => r.source === p), `${p} has no page: add it to scripts/prerender.tsx`);
});

test('the route and stop pages are served, not redirected or rewritten', () => {
    assert.ok(!vercel.redirects.some(r => /^\/(routes|stops)/.test(r.source)));
    for (const path of ['/routes', '/routes/1-dieppe-westerra-broad-north', '/stops/some-stop']) assert.equal(rewrittenTo(path), undefined, path);
});

test('built scripts and styles are cached for a year (their names change with every release)', () => {
    const assets = vercel.headers.find(h => h.source === '/assets/(.*)');
    assert.equal(assets?.headers.find(h => h.key === 'Cache-Control')?.value, 'public, max-age=31536000, immutable');
});
