/*
 Pre-render: runs after `vite build` (see the "build" script) and writes a real HTML page for every
 public address, so search engines can read each page without running JavaScript.

 For every page it writes the right title, description, canonical address, social preview and
 structured data into the head. The directory pages (every route and stop) and the About, Privacy and
 Terms pages also get their full content in the body, rendered from the same React components the
 app uses, so what search engines read is exactly what people see. The homepage and the team pages get
 the same words from the same data as plain HTML (scripts/snapshots.ts), as their screens only run in a
 browser. The app then starts as usual and takes over the page.

 Files are written as build/<path>.html; vercel.json's cleanUrls serves them at /<path>.
 It also writes build/sitemap.xml listing every page. A page's lastmod is the day its content last
 changed: the transit data for the route and stop pages (TRANSIT_DATA_DATE, set by build:transit-data),
 the policy date for Privacy and Terms. Pages with no such date get none, rather than the build date,
 which would claim every page changed on every deploy and teach search engines to ignore lastmod.

 The app-only pages (sign-in, profile, admin: PRIVATE_PREFIXES in pageMeta.ts) get a noindex page each, so
 they open directly. Everything else that isn't a file here gets build/404.html with a real 404 status
 (Vercel serves it), instead of the homepage, which made unknown addresses look like copies of it.
*/
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, Routes, Route } from 'react-router';
import { RoutesIndexPage, RoutePage, StopPage } from '../src/views/directory/DirectoryPages';
import LegalPage from '../src/views/LegalPage';
import { ROUTES, SERVED_STOPS, stopInfo } from '../src/models/services/TransitDirectory';
import { HOME_META, MAP_META, PRIVATE_PREFIXES, STATIC_META, SITE_URL, headTags, metaForPath, routeMeta, routesIndexMeta, stopMeta, teamMeta, type PageMeta } from '../src/models/seo/pageMeta';
import { connectSnapshot, homeSnapshot, teamSnapshot } from './snapshots';
import { primeTimetable, type RouteTimetable } from '../src/models/services/TimetableService';
import { TEAM } from '../src/models/data/team';
import { TRANSIT_DATA_DATE } from '../src/models/data/transitDataDate';
import { SITE } from '../src/models/data/legal';

const out = path.resolve(process.cwd(), 'build');   // run from the project root, as npm scripts are
const template = fs.readFileSync(path.join(out, 'index.html'), 'utf8');

/* The app's own HTML, minus the head tags each page sets for itself */
const base = template
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/g, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/g, '')
    .replace(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/g, '');
if (!base.includes('<div id="root"></div>')) throw new Error('prerender: <div id="root"></div> not found in build/index.html');

/* Every route's timetable (public/timetables, copied into build/ by Vite), so the route and stop pages'
   HTML has the full times; in the browser the pages load these files themselves */
for (const r of ROUTES) {
    const file = path.join(out, 'timetables', `${r.num}.json`);
    if (!fs.existsSync(file)) throw new Error(`prerender: no timetable for route ${r.num} (${file}); run npm run build:transit-data`);
    primeTimetable(JSON.parse(fs.readFileSync(file, 'utf8')) as RouteTimetable);
}

const routes = (
    <Routes>
        <Route path="/routes" element={<RoutesIndexPage />} />
        <Route path="/routes/:slug" element={<RoutePage />} />
        <Route path="/stops/:slug" element={<StopPage />} />
        <Route path="/about" element={<LegalPage page="about" />} />
        <Route path="/privacy" element={<LegalPage page="privacy" />} />
        <Route path="/terms" element={<LegalPage page="terms" />} />
    </Routes>
);
const render = (url: string) => renderToString(<StaticRouter location={url}>{routes}</StaticRouter>);

const written: PageMeta[] = [];
function write(meta: PageMeta, body = '') {
    const html = base
        .replace('</head>', `    ${headTags(meta)}\n  </head>`)
        .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    const file = meta.path === '/' ? path.join(out, 'index.html') : path.join(out, `${meta.path}.html`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    if (!meta.noindex) written.push(meta);
}

const started = Date.now();
write(HOME_META, homeSnapshot());
write(MAP_META);
write(routesIndexMeta(ROUTES), render('/routes'));
for (const r of ROUTES) write(routeMeta(r), render(`/routes/${r.slug}`));
let stops = 0;
for (const s of SERVED_STOPS) {
    const info = stopInfo(s.STOP_ID);
    if (!info) continue;
    write(stopMeta(info), render(`/stops/${info.slug}`));
    stops++;
}
for (const p of ['/about', '/privacy', '/terms']) write(STATIC_META[p], render(p));
write(STATIC_META['/connect'], connectSnapshot());
for (const person of TEAM) write(teamMeta(person), teamSnapshot(person));

/* The app-only pages: just the app, kept out of search results (vercel.json sends /admin/* to /admin) */
for (const p of PRIVATE_PREFIXES) write(metaForPath(p)!);

/* Any other address: build/404.html, which Vercel serves with a 404 status. The app still starts and
   shows its own "not found" page; this text is for crawlers and browsers without JavaScript. */
write({ ...HOME_META, path: '/404', title: 'Page not found | Transit Regina', noindex: true, jsonLd: [] },
    `<main data-prerender style="max-width:44rem;margin:0 auto;padding:3rem 1.25rem;font-family:Inter,system-ui,sans-serif">
<h1>Page not found</h1>
<p>The page you're looking for doesn't exist or has moved.</p>
<p><a href="/map">Open the live map</a> · <a href="/routes">All Regina bus routes</a> · <a href="/">Homepage</a></p>
</main>`);

/* The sitemap: every page, with when its content last changed where we know it */
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const policyDate = new Date(SITE.policyDate);   // "October 17, 2026", read as local midnight
if (Number.isNaN(policyDate.getTime())) throw new Error(`prerender: can't read SITE.policyDate "${SITE.policyDate}"`);
const lastmod = (p: string): string | null =>
    p === '/routes' || p.startsWith('/routes/') || p.startsWith('/stops/') ? TRANSIT_DATA_DATE
        : p === '/privacy' || p === '/terms' ? isoDate(policyDate)
            : null;
const priority = (p: string) => (p === '/' ? '1.0' : p === '/routes' ? '0.9' : p.startsWith('/routes/') ? '0.8' : p.startsWith('/stops/') ? '0.6' : '0.5');
fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${written.map(m => `  <url><loc>${SITE_URL}${m.path === '/' ? '/' : m.path}</loc>${lastmod(m.path) ? `<lastmod>${lastmod(m.path)}</lastmod>` : ''}<priority>${priority(m.path)}</priority></url>`).join('\n')}
</urlset>
`);

console.log(`prerender: ${written.length} pages (${ROUTES.length} routes, ${stops} stops) and sitemap.xml in ${((Date.now() - started) / 1000).toFixed(1)}s`);
