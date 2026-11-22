/*
 indexnow — tells Bing and the other IndexNow search engines which pages changed, so they recrawl them
 soon instead of whenever they next pass by. Google doesn't use IndexNow; it reads the sitemap.

 Run it after a deploy is live:
   npm run indexnow                  pages whose lastmod is today (Regina time)
   npm run indexnow -- --since 2026-11-21
   npm run indexnow -- --all         every page in the sitemaps (the first time, or after a big change)
   add --dry-run to list the pages without sending anything

 It reads the live sitemaps, so it sends what is actually deployed. The key is the file
 public/<key>.txt, which the site serves so the search engines can check the request is ours; the key
 is public by design (https://www.indexnow.org/documentation).
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://transitregina.ca';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const sinceArg = args[args.indexOf('--since') + 1];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Regina', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const since = args.includes('--since') ? sinceArg : today;
if (!all && !/^\d{4}-\d{2}-\d{2}$/.test(since ?? '')) { console.error('--since needs a date: YYYY-MM-DD'); process.exit(1); }

const keyFile = fs.readdirSync(path.join(root, 'public')).find(f => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('No IndexNow key file (public/<32 hex characters>.txt).'); process.exit(1); }
const key = keyFile.slice(0, -4);

const get = async url => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.text();
};
const tags = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => m[1]);

// The key file must be live first, or the engines refuse the request
const served = await get(`${SITE}/${keyFile}`).catch(() => '');
if (served.trim() !== key) { console.error(`${SITE}/${keyFile} isn't live yet: deploy first.`); process.exit(1); }

const index = await get(`${SITE}/sitemap.xml`);
const sitemaps = index.includes('<sitemapindex') ? tags(index, 'loc') : [`${SITE}/sitemap.xml`];
const urls = [];
for (const sm of sitemaps) {
    const xml = await get(sm);
    for (const entry of tags(xml, 'url')) {
        const loc = tags(entry, 'loc')[0];
        const lastmod = tags(entry, 'lastmod')[0];
        if (all || (lastmod && lastmod >= since)) urls.push(loc);
    }
}

console.log(`${urls.length} page${urls.length === 1 ? '' : 's'} ${all ? 'in the sitemaps' : `changed since ${since}`}.`);
if (!urls.length) process.exit(0);
if (dryRun) { urls.slice(0, 20).forEach(u => console.log(`  ${u}`)); if (urls.length > 20) console.log(`  … and ${urls.length - 20} more`); process.exit(0); }

// Up to 10,000 addresses per request
for (let i = 0; i < urls.length; i += 10_000) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls.slice(i, i + 10_000) }),
    });
    // 200 and 202 both mean accepted
    console.log(res.ok ? `Sent ${Math.min(10_000, urls.length - i)} (HTTP ${res.status}).` : `Refused: HTTP ${res.status} ${await res.text()}`);
    if (!res.ok) process.exit(1);
}
