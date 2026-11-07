/* Walking paths on Regina's OpenStreetMap walking graph (data/walk-graph.json): they follow sidewalks and paths
   around what a straight line would cross. Run: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalkRouteService, haversine } from '../src/models/services/WalkRouteService';

const LEGISLATURE = { lat: 50.4320, lng: -104.6050 }, ALBERT_ST = { lat: 50.4330, lng: -104.6175 };   // Wascana Lake between
const WAREHOUSE = { lat: 50.4560, lng: -104.6150 }, DOWNTOWN = { lat: 50.4495, lng: -104.6125 };      // the rail yard between
const RIDDELL = { lat: 50.4170, lng: -104.5885 }, KRAMER = { lat: 50.4140, lng: -104.5960 };           // U of R campus

test('a walk across Wascana Lake goes around it, not through the water', () => {
    const r = WalkRouteService.route(LEGISLATURE, ALBERT_ST);
    assert.ok(r, 'a path is found');
    const straight = haversine(LEGISLATURE, ALBERT_ST);
    assert.ok(r.meters > straight * 1.5, `${r.meters} m walked for ${Math.round(straight)} m as the crow flies`);
});

test('a walk across the rail yard uses a crossing', () => {
    const r = WalkRouteService.route(WAREHOUSE, DOWNTOWN);
    assert.ok(r);
    assert.ok(r.meters > haversine(WAREHOUSE, DOWNTOWN) * 1.3, `${r.meters} m`);
});

test('the path starts and ends exactly at the two points and has no jumps', () => {
    const r = WalkRouteService.route(RIDDELL, KRAMER)!;
    assert.deepEqual(r.path[0], RIDDELL);
    assert.deepEqual(r.path[r.path.length - 1], KRAMER);
    for (let i = 1; i < r.path.length; i++) assert.ok(haversine(r.path[i - 1], r.path[i]) < 600, `gap at point ${i}`);
    // meters is the length of the path drawn
    const drawn = r.path.slice(1).reduce((m, p, i) => m + haversine(r.path[i], p), 0);
    assert.ok(Math.abs(drawn - r.meters) <= 1);
});

test('walking there and back is about the same distance', () => {
    const there = WalkRouteService.route(RIDDELL, KRAMER)!, back = WalkRouteService.route(KRAMER, RIDDELL)!;
    assert.ok(Math.abs(there.meters - back.meters) / there.meters < 0.05, `${there.meters} m vs ${back.meters} m`);
});

test('no path for a point far from any walkable way, or for points too far apart', () => {
    assert.equal(WalkRouteService.route({ lat: 50.37, lng: -104.80 }, DOWNTOWN), null);   // farmland at the map's corner
    assert.equal(WalkRouteService.route({ lat: 50.40, lng: -104.70 }, { lat: 50.50, lng: -104.50 }), null);   // ~18 km
});

test('a path takes a few milliseconds', () => {
    WalkRouteService.route(RIDDELL, KRAMER);   // loads the graph
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) WalkRouteService.route(LEGISLATURE, ALBERT_ST);
    assert.ok(performance.now() - t0 < 1000, 'twenty walks in under a second');
});
