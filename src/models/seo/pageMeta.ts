/*
 What search engines and link previews learn about each page: title, description, canonical address,
 social preview and structured data (JSON-LD).

 The same description is used twice, so the two always agree (Google asks that the canonical in the
 HTML and after JavaScript runs never differ):
 - at build time, scripts/prerender.tsx writes it into each page's HTML (headTags);
 - in the browser, usePageMeta updates the document as people move around the app (applyPageMeta).
*/
import { SITE } from '../data/legal';
import { FOUNDERS } from '../data/siteFacts';
import { formatTime } from '../lib/clockTime';
import type { RouteInfo, StopInfo } from '../services/TransitDirectory';

export const SITE_URL = 'https://transitregina.ca';
const OG_IMAGE = `${SITE_URL}/og-logo.jpg`;

export interface PageMeta {
    /** Path only, e.g. "/routes/4-hillsdale-walsh-acres" */
    path: string;
    title: string;
    description: string;
    /** Keep out of search results (sign-in, profile, error pages) */
    noindex?: boolean;
    /** Origins the page needs straight away, connected to early: the map's Google Maps script and images
        (fetched without CORS, so the hint has no crossorigin either) */
    preconnect?: string[];
    jsonLd?: object[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const crumbs = (items: [string, string][]) => ({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE_URL + path })),
});

/* ── Who is behind the site: one entity each, shared by every page through its @id ── */
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const ORG_ID = `${SITE_URL}/#org`;
export const personId = (slug: string) => `${SITE_URL}/connect/${slug}#person`;
const ref = (id: string) => ({ '@id': id });
const REGINA = { '@type': 'City', name: 'Regina', containedInPlace: { '@type': 'AdministrativeArea', name: 'Saskatchewan' } };
const NOT_AFFILIATED = 'An independent project, not affiliated with, endorsed by or operated by the City of Regina or Regina Transit.';
const LANG = 'en-CA';
/** The page itself, as part of the site */
const webPage = (type: string, path: string, name: string, extra: object = {}) => ({
    '@context': 'https://schema.org', '@type': type, '@id': `${SITE_URL}${path}#page`, url: SITE_URL + path, name,
    isPartOf: ref(WEBSITE_ID), inLanguage: LANG, ...extra,
});
const person = (p: { slug: string; name: string; linkedin: string; github: string }) => ({
    '@type': 'Person', '@id': personId(p.slug), name: p.name, url: `${SITE_URL}/connect/${p.slug}`, sameAs: [p.linkedin, p.github],
});

/** The first title that fits in a search result (about 60 characters), else the last one */
const fit = (texts: string[], max = 60) => texts.find(t => t.length <= max) ?? texts[texts.length - 1];
/** The same for descriptions (about 155 characters) */
const fitDescription = (texts: string[]) => fit(texts, 155);

/* ── Pages ── */
export const HOME_META: PageMeta = {
    path: '/',
    title: 'Regina Bus Tracker: Live Map & Trip Planner | Transit Regina',
    description: 'See every Regina bus live on the map, check when your bus is coming at any stop, and plan trips with transfers. Free, unofficial and built in Regina.',
    jsonLd: [{
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite', '@id': WEBSITE_ID, url: `${SITE_URL}/`, name: SITE.brand, alternateName: 'TransitR',
                description: 'Unofficial real-time bus tracker and trip planner for Regina, Saskatchewan.', inLanguage: LANG, publisher: ref(ORG_ID),
            },
            {
                '@type': 'Organization', '@id': ORG_ID, name: SITE.brand, url: `${SITE_URL}/`, logo: `${SITE_URL}/logo512.png`,
                description: 'Unofficial real-time bus tracker and trip planner for Regina, Saskatchewan, built by two University of Regina students.',
                disambiguatingDescription: NOT_AFFILIATED, email: SITE.CONTACT_EMAIL, areaServed: REGINA,
                founder: [ref(personId(FOUNDERS.dev.slug)), ref(personId(FOUNDERS.nirjar.slug))],
            },
            person(FOUNDERS.dev),
            person(FOUNDERS.nirjar),
            {
                '@type': 'WebApplication', '@id': `${SITE_URL}/#app`, name: SITE.brand, url: `${SITE_URL}/map`,
                applicationCategory: 'TravelApplication', operatingSystem: 'Any (web browser)', inLanguage: LANG,
                description: `Unofficial real-time bus tracker and trip planner for Regina, Saskatchewan. ${NOT_AFFILIATED}`,
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'CAD' },
                spatialCoverage: REGINA, publisher: ref(ORG_ID),
                creator: [ref(personId(FOUNDERS.dev.slug)), ref(personId(FOUNDERS.nirjar.slug))],
            },
        ],
    }],
};

/** /routes, with every route listed */
export function routesIndexMeta(routes: RouteInfo[]): PageMeta {
    return {
        path: '/routes',
        title: 'All Regina Bus Routes: Live Maps & Stops | Transit Regina',
        description: 'Every Regina bus route with a map, every stop in order both ways, and the routes you can change to. Tap any route to see its buses live.',
        jsonLd: [
            crumbs([['Home', '/'], ['Bus routes', '/routes']]),
            webPage('CollectionPage', '/routes', 'Regina bus routes', {
                mainEntity: {
                    '@type': 'ItemList', numberOfItems: routes.length,
                    itemListElement: routes.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/routes/${r.slug}`, name: `Route ${r.num} ${r.name}` })),
                },
            }),
        ],
    };
}

export const MAP_META: PageMeta = {
    path: '/map',
    title: 'Live Regina Bus Map: Where Is My Bus? | Transit Regina',
    description: 'Every Regina bus on one live map, updated every few seconds. Tap a stop for its next departures, or plan a trip with transfers.',
    // The map is the app itself, with no text of its own for search engines to read; the homepage and
    // /routes are the pages to send people to for "Regina bus map"
    noindex: true,
    preconnect: ['https://maps.googleapis.com', 'https://maps.gstatic.com'],
};

export function routeMeta(r: RouteInfo): PageMeta {
    const path = `/routes/${r.slug}`;
    const short = r.name.split(' – ')[0];
    const ends = r.directions[0] ? ` between ${r.name.replace(' – ', ' and ')}` : '';
    return {
        path,
        title: fit([
            `Route ${r.num} ${r.name}: Live Map & Stops | Transit Regina`,
            `Route ${r.num} ${r.name}: Live Bus Map | Transit Regina`,
            `Route ${r.num} ${r.name} | Transit Regina`,
            `Route ${r.num} ${short}: Live Map & Stops | Transit Regina`,
            `Route ${r.num} ${short} | Transit Regina`,
        ]),
        description: fitDescription([
            `Route ${r.num}${ends}: when it runs and how often, the timetable, all ${r.stopCount} stops in order both ways, and the buses live on the map.`,
            `Regina bus route ${r.num}: when it runs and how often, the timetable, all ${r.stopCount} stops in order both ways, and the buses live on the map.`,
            `Regina bus route ${r.num}: timetable, all ${r.stopCount} stops in order and the buses live on the map.`,
        ]),
        jsonLd: [
            crumbs([['Home', '/'], ['Bus routes', '/routes'], [`Route ${r.num} ${r.name}`, path]]),
            webPage('WebPage', path, `Route ${r.num} ${r.name}`, {
                mainEntity: {
                    '@type': 'Service', name: `Regina bus route ${r.num} ${r.name}`, serviceType: 'Public bus route', areaServed: REGINA,
                    description: `Regina bus route ${r.num}${ends}, with ${r.stopCount} stops.`,
                },
            }),
        ],
    };
}

const DIRECTION_SHORT: Record<string, string> = { Northbound: 'NB', Southbound: 'SB', Eastbound: 'EB', Westbound: 'WB' };

export function stopMeta(s: StopInfo): PageMeta {
    const path = `/stops/${s.slug}`;
    const nums = s.routes.map(r => r.route.num).filter((n, i, a) => a.indexOf(n) === i);
    const served = nums.length ? `route${nums.length > 1 ? 's' : ''} ${nums.join(', ')}` : '';
    const dir = s.direction ? ` (${s.direction})` : '';
    const dirShort = s.direction ? ` (${DIRECTION_SHORT[s.direction] ?? s.direction})` : '';
    const dirWords = s.direction ? `, ${s.direction.toLowerCase()}` : '';
    const towards = s.routes.length === 1 ? ` towards ${s.routes[0].towards}` : '';
    const weekday = s.hours.weekday ? ` Weekdays ${formatTime(s.hours.weekday[0])} to ${formatTime(s.hours.weekday[1])}.` : '';
    return {
        path,
        title: fit([
            `Bus Stop ${s.id}: ${s.name}${dir} | Transit Regina`,
            `Stop ${s.id}: ${s.name}${dir} | Transit Regina`,
            `Stop ${s.id}: ${s.name}${dirShort} | Transit Regina`,
            `Stop ${s.id}: ${s.name}${dirShort}, Regina`,
            `Stop ${s.id}: ${s.name}${dirShort}`,
        ]),
        // What the page has: the routes, the hours, the full timetable and a link to live arrivals
        description: fitDescription([
            `Regina bus stop ${s.id}, ${s.name}${dirWords}${served ? `: ${served}${towards}` : ''}.${weekday} Full timetable and live arrivals.`,
            `Regina bus stop ${s.id}, ${s.name}${dirWords}${served ? `: ${served}` : ''}.${weekday} Full timetable and live arrivals.`,
            `Regina bus stop ${s.id}, ${s.name}${served ? `: ${served}` : ''}.${weekday} Timetable and live arrivals.`,
            `Regina bus stop ${s.id}, ${s.name}${served ? `: ${served}` : ''}.${weekday}`,
        ]),
        jsonLd: [
            crumbs(stopCrumbs(s).map(([name, p]) => [name, p ?? path] as [string, string])),
            webPage('WebPage', path, `Bus stop ${s.id}: ${s.name}`, {
                mainEntity: {
                    '@type': 'BusStop', name: s.name, identifier: s.id, url: SITE_URL + path,
                    description: `Regina bus stop ${s.id} at ${s.name}${dirWords}${served ? `, served by ${served}` : ''}.`,
                    geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng },
                    address: { '@type': 'PostalAddress', addressLocality: 'Regina', addressRegion: 'SK', addressCountry: 'CA' },
                    containedInPlace: REGINA,
                },
            }),
        ],
    };
}

/** A stop's trail, which the page shows too: Home > Bus routes > its first route > the stop (by name) */
export function stopCrumbs(s: StopInfo): [string, string?][] {
    const first = s.routes[0]?.route;
    return [['Home', '/'], ['Bus routes', '/routes'], ...(first ? [[`Route ${first.num}`, `/routes/${first.slug}`] as [string, string]] : []), [s.name]];
}

/** Pages whose content lives elsewhere (legal text, portfolios); these just need the right head */
export const STATIC_META: Record<string, PageMeta> = {
    '/about': {
        path: '/about', title: 'About Transit Regina: an Unofficial Regina Bus Tracker',
        description: 'Who runs Transit Regina, where its data comes from (City of Regina open data and the TransitLive feed) and how it differs from official Regina Transit.',
        jsonLd: [webPage('AboutPage', '/about', 'About Transit Regina', { about: ref(ORG_ID) })],
    },
    '/privacy': { path: '/privacy', title: 'Privacy Policy | Transit Regina', description: 'What Transit Regina collects, why, how long it is kept, and how to delete it. Plain-language privacy policy under Canadian law.' },
    '/terms': { path: '/terms', title: 'Terms of Use | Transit Regina', description: 'The terms for using Transit Regina, an unofficial Regina bus tracker: estimates only, no warranty, fair use.' },
    '/connect': {
        path: '/connect', title: 'Meet the Team Behind Transit Regina',
        description: `Transit Regina was built by ${FOUNDERS.dev.name} and ${FOUNDERS.nirjar.name}, computer science students at the University of Regina. See what each of them built.`,
        jsonLd: [webPage('WebPage', '/connect', 'The team behind Transit Regina', {
            about: ref(ORG_ID), mentions: [ref(personId(FOUNDERS.dev.slug)), ref(personId(FOUNDERS.nirjar.slug))],
        })],
    },
};

/** Portfolio pages */
export function teamMeta(p: { slug: string; name: string; title: string; focus: string; linkedin: string; github: string }): PageMeta {
    const path = `/connect/${p.slug}`;
    const first = p.name.split(' ')[0];
    return {
        path,
        title: fit([`${p.name}: ${p.title} of Transit Regina | Portfolio`, `${p.name}, ${p.title} of Transit Regina`]),
        // A whole sentence written for search results, not the page's pitch cut off part way
        description: fitDescription([
            `${p.name} is the ${p.title.toLowerCase()} of Transit Regina, the unofficial Regina bus tracker. ${p.focus}: what ${first} built, other projects and experience.`,
            `${p.name} is the ${p.title.toLowerCase()} of Transit Regina, the unofficial Regina bus tracker: what ${first} built, other projects and experience.`,
        ]),
        jsonLd: [webPage('ProfilePage', path, `${p.name} | Transit Regina`, {
            mainEntity: {
                ...person(p), jobTitle: `${p.title}, Transit Regina`, worksFor: ref(ORG_ID),
                alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of Regina' },
            },
        })],
    };
}

/* Pages that are part of the app, not the site: kept out of search results.
   scripts/prerender.tsx writes a noindex page for each, so they open while any other unknown address
   gets a real 404; vercel.json sends everything under /admin/ to the /admin page. */
export const PRIVATE_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/profile', '/two-step', '/admin'];

/** The head for pages that do not set their own (the directory pages and "not found" do) */
export function metaForPath(pathname: string, team: Parameters<typeof teamMeta>[0][] = []): PageMeta | null {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return HOME_META;
    if (path === '/map') return MAP_META;
    if (STATIC_META[path]) return STATIC_META[path];
    const person = path.startsWith('/connect/') ? team.find(t => `/connect/${t.slug}` === path) : undefined;
    if (person) return teamMeta(person);
    if (PRIVATE_PREFIXES.some(p => path === p || path.startsWith(p + '/'))) {
        return { path, title: 'Transit Regina', description: HOME_META.description, noindex: true };
    }
    return null;
}

/* ── Writing the head ── */
/** The head tags for a page, as HTML (used at build time) */
export function headTags(m: PageMeta): string {
    const url = SITE_URL + m.path;
    return [
        `<title>${esc(m.title)}</title>`,
        `<meta name="description" content="${esc(m.description)}" />`,
        `<link rel="canonical" href="${url}" />`,
        m.noindex ? '<meta name="robots" content="noindex" />' : '',
        ...(m.preconnect ?? []).map(o => `<link rel="preconnect" href="${esc(o)}" />`),
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${esc(SITE.brand)}" />`,
        `<meta property="og:url" content="${url}" />`,
        `<meta property="og:title" content="${esc(m.title)}" />`,
        `<meta property="og:description" content="${esc(m.description)}" />`,
        `<meta property="og:image" content="${OG_IMAGE}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:image:alt" content="Transit Regina: unofficial live bus tracker for Regina" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        ...(m.jsonLd ?? []).map(j => `<script type="application/ld+json" data-page-ld>${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
    ].filter(Boolean).join('\n    ');
}

/** Updates the document's head for a page (used in the browser) */
export function applyPageMeta(doc: Document, m: PageMeta) {
    doc.title = m.title;
    const set = (selector: string, make: () => HTMLElement, attr: string, value: string) => {
        let el = doc.head.querySelector(selector) as HTMLElement | null;
        if (!el) { el = make(); doc.head.appendChild(el); }
        el.setAttribute(attr, value);
    };
    const meta = (key: 'name' | 'property', name: string) => () => { const el = doc.createElement('meta'); el.setAttribute(key, name); return el; };
    const url = SITE_URL + m.path;
    set('meta[name="description"]', meta('name', 'description'), 'content', m.description);
    set('link[rel="canonical"]', () => { const el = doc.createElement('link'); el.setAttribute('rel', 'canonical'); return el; }, 'href', url);
    set('meta[property="og:url"]', meta('property', 'og:url'), 'content', url);
    set('meta[property="og:title"]', meta('property', 'og:title'), 'content', m.title);
    set('meta[property="og:description"]', meta('property', 'og:description'), 'content', m.description);
    const robots = doc.head.querySelector('meta[name="robots"]');
    if (m.noindex) set('meta[name="robots"]', meta('name', 'robots'), 'content', 'noindex');
    else robots?.remove();
    doc.head.querySelectorAll('script[data-page-ld]').forEach(el => el.remove());
    for (const j of m.jsonLd ?? []) {
        const el = doc.createElement('script');
        el.type = 'application/ld+json';
        el.dataset.pageLd = '';
        el.textContent = JSON.stringify(j);
        doc.head.appendChild(el);
    }
}
