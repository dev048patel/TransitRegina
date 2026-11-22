/* What search engines read about the site: titles, structured data, and the pre-rendered text of the
   pages whose screens only run in a browser (homepage, team pages). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, Routes, Route } from 'react-router';
import { ROUTES, SERVED_STOPS, stopInfo, type StopInfo } from '../src/models/services/TransitDirectory';
import { FOUNDERS, ROUTE_LINKS, STOP_COUNT } from '../src/models/data/siteFacts';
import { TEAM } from '../src/models/data/team';
import { heroContent, stats } from '../src/models/data/mock/landingMockData';
import { HOME_META, MAP_META, STATIC_META, ORG_ID, WEBSITE_ID, personId, routeMeta, routesIndexMeta, stopCrumbs, stopMeta, teamMeta, type PageMeta } from '../src/models/seo/pageMeta';
import { StopPage } from '../src/views/directory/DirectoryPages';
import { connectSnapshot, homeSnapshot, teamSnapshot } from '../scripts/snapshots';

const stops = SERVED_STOPS.map(s => stopInfo(s.STOP_ID)).filter((s): s is StopInfo => !!s);
const pages: PageMeta[] = [
    HOME_META, MAP_META, routesIndexMeta(ROUTES), ...ROUTES.map(routeMeta), ...stops.map(stopMeta),
    ...Object.values(STATIC_META), ...TEAM.map(teamMeta),
];
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const h1s = (html: string) => [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => text(m[1]));

/* ── The small copies of the transit data and the team ── */
test('the homepage route list and stop count match the transit data (after build:transit-data, copy these into siteFacts.ts)', () => {
    const routes = ROUTES.map(r => ({ num: r.num, name: r.name, slug: r.slug, color: r.color, textColor: r.textColor }));
    assert.deepEqual(ROUTE_LINKS, routes, `ROUTE_LINKS should be:\n${JSON.stringify(routes, null, 1)}`);
    assert.equal(STOP_COUNT, stops.length, `STOP_COUNT should be ${stops.length}`);
});

test('each founder has one name and one set of profiles, on the team pages and in the structured data', () => {
    for (const f of Object.values(FOUNDERS)) {
        const p = TEAM.find(t => t.slug === f.slug)!;
        assert.equal(p.name, f.name);
        assert.equal(p.linkedin, f.linkedin);
        assert.equal(p.github, f.github);
    }
    for (const file of ['src/models/data/team.ts', 'src/models/data/legal.ts', 'index.html']) assert.ok(!fs.readFileSync(file, 'utf8').includes('Dev Paresh'), file);
});

test('the homepage counts are the real ones', () => {
    assert.equal(stats.find(s => /stops/i.test(s.label))?.value, STOP_COUNT.toLocaleString('en-CA'));
    assert.equal(stats.find(s => /routes/i.test(s.label))?.value, String(ROUTES.length));
});

/* ── Titles and descriptions ── */
test('every title fits in a search result (60 characters) and every description too (160)', () => {
    const long = pages.filter(p => p.title.length > 60).map(p => `${p.title.length} ${p.title}`);
    assert.deepEqual(long, []);
    const longDescriptions = pages.filter(p => p.description.length > 160).map(p => `${p.description.length} ${p.path}`);
    assert.deepEqual(longDescriptions, []);
});

test('titles and descriptions are all different', () => {
    const indexed = pages.filter(p => !p.noindex);
    assert.equal(new Set(indexed.map(p => p.title)).size, indexed.length);
    assert.equal(new Set(indexed.map(p => p.description)).size, indexed.length);
});

test('a team page description is a whole sentence, not the pitch cut off', () => {
    for (const p of TEAM) assert.match(teamMeta(p).description, /\.$/);
});

test('a stop served by one route says "route", not "routes"', () => {
    const one = stops.find(s => new Set(s.routes.map(r => r.route.num)).size === 1)!;
    const num = one.routes[0].route.num;
    assert.match(stopMeta(one).description, new RegExp(`: route ${num}\\b`));
    const h = React.createElement;
    const html = renderToString(h(StaticRouter, { location: `/stops/${one.slug}` }, h(Routes, null, h(Route, { path: '/stops/:slug', element: h(StopPage) }))));
    assert.ok(text(html).includes(`· route ${num}`), 'the page says "route N"');
    assert.ok(!text(html).includes(`routes ${num} `));
});

/* ── Structured data ── */
const nodes = (p: PageMeta) => (p.jsonLd ?? []).flatMap((j: any) => (j['@graph'] ?? [j]).flatMap((n: any) => [n, n.mainEntity].filter(Boolean)));

test('the homepage says who runs the site and that it is not the City', () => {
    const home = nodes(HOME_META);
    const site = home.find(n => n['@type'] === 'WebSite');
    const org = home.find(n => n['@type'] === 'Organization');
    assert.equal(site?.['@id'], WEBSITE_ID);
    assert.equal(site?.publisher?.['@id'], ORG_ID);
    assert.equal(org?.['@id'], ORG_ID);
    assert.match(org?.disambiguatingDescription, /not affiliated with.*City of Regina.*Regina Transit/);
    assert.deepEqual(org?.founder.map((f: any) => f['@id']).sort(), TEAM.map(t => personId(t.slug)).sort());
});

test('every @id a page points at is described somewhere on the site', () => {
    const defined = new Set(pages.flatMap(nodes).map(n => n['@id']).filter(Boolean));
    const refs = JSON.stringify(pages.map(p => p.jsonLd)).match(/"@id":"[^"]+"/g)!.map(r => r.slice(7, -1));
    for (const r of refs) assert.ok(defined.has(r), r);
});

test('each person is the same on the homepage and their own page', () => {
    for (const p of TEAM) {
        const own = nodes(teamMeta(p)).find(n => n['@type'] === 'Person');
        const onHome = nodes(HOME_META).find(n => n['@id'] === personId(p.slug));
        assert.equal(own?.['@id'], personId(p.slug));
        assert.equal(own?.name, onHome?.name);
        assert.deepEqual(own?.sameAs, onHome?.sameAs);
        assert.equal(nodes(teamMeta(p))[0]['@type'], 'ProfilePage');
    }
});

test('/about is an AboutPage about the organisation, and /routes lists every route', () => {
    const about = nodes(STATIC_META['/about'])[0];
    assert.equal(about['@type'], 'AboutPage');
    assert.equal(about.about['@id'], ORG_ID);
    const list = nodes(routesIndexMeta(ROUTES)).find(n => n['@type'] === 'ItemList');
    assert.equal(list.itemListElement.length, ROUTES.length);
    assert.equal(list.itemListElement[0].url, `https://transitregina.ca/routes/${ROUTES[0].slug}`);
});

test("a stop page is a WebPage about the BusStop, and its trail ends with the stop's name", () => {
    const s = stops[0];
    const page = nodes(stopMeta(s)).find(n => n['@type'] === 'WebPage');
    assert.equal(page.mainEntity['@type'], 'BusStop');
    assert.equal(page.mainEntity.identifier, s.id);
    const trail = (stopMeta(s).jsonLd![0] as any).itemListElement;
    assert.equal(trail.at(-1).name, s.name);
    assert.equal(trail.at(-1).item, `https://transitregina.ca/stops/${s.slug}`);
    assert.equal(trail.at(-2).item, `https://transitregina.ca/routes/${s.routes[0].route.slug}`);
    assert.deepEqual(stopCrumbs(s).map(c => c[0]), trail.map((t: any) => t.name));
});

/* ── Pre-rendered text ── */
test('the pre-rendered homepage has the same headline as the app and links to every route', () => {
    const html = homeSnapshot();
    assert.deepEqual(h1s(html), [heroContent.headline]);
    assert.equal(heroContent.headline.toLowerCase().startsWith('regina bus tracker'), true);
    for (const r of ROUTES) assert.ok(html.includes(`href="/routes/${r.slug}"`), r.num);
    // and the app's homepage shows the route links too
    assert.match(fs.readFileSync('src/views/landing/LandingPage.tsx', 'utf8'), /<RouteLinks routes=\{routes\} \/>/);
});

test('each team page is pre-rendered with its name as the one H1 and the portfolio text', () => {
    for (const p of TEAM) {
        const html = teamSnapshot(p);
        assert.deepEqual(h1s(html), [p.name]);
        assert.ok(text(html).split(' ').length > 200, `${p.slug}: ${text(html).split(' ').length} words`);
        assert.ok(html.includes(`href="${p.linkedin}"`) && html.includes(`href="${p.github}"`));
        assert.ok(!/<script/i.test(html));
    }
    const connect = connectSnapshot();
    assert.equal(h1s(connect).length, 1);
    for (const p of TEAM) assert.ok(connect.includes(`href="/connect/${p.slug}"`));
});

test('the About page explains how the live data and timetables work, and links to both founders', async () => {
    const about = JSON.stringify((await import('../src/models/data/legal')).LEGAL_PAGES.about);
    for (const p of TEAM) assert.ok(about.includes(`](/connect/${p.slug})`), p.slug);
    assert.match(about, /How the live map works/);
    assert.match(about, /How the timetables work/);
});
