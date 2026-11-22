/* What lets search engines and our own dashboards watch the site: robots.txt, the IndexNow key, speed data */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('robots.txt points to the sitemap, keeps admin out and says how the content may be used', () => {
    const robots = fs.readFileSync('public/robots.txt', 'utf8');
    assert.match(robots, /^Sitemap: https:\/\/transitregina\.ca\/sitemap\.xml$/m);
    assert.match(robots, /^Disallow: \/admin$/m);
    assert.match(robots, /^Content-Signal: search=yes, ai-input=yes$/m);
});

test('there is one IndexNow key file, and it holds its own name', () => {
    const keys = fs.readdirSync('public').filter(f => /^[0-9a-f]{32}\.txt$/.test(f));
    assert.equal(keys.length, 1, keys.join(', '));
    assert.equal(fs.readFileSync(`public/${keys[0]}`, 'utf8').trim(), keys[0].slice(0, -4));
});

test("riders' page speed is measured with INP, which replaced FID", () => {
    const tracker = fs.readFileSync('src/models/services/UsageTracker.ts', 'utf8');
    assert.match(tracker, /onINP\(report\)/);
    assert.doesNotMatch(tracker, /getFID|onFID/);
});
