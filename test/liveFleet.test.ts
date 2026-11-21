/* Today's buses for the admin Service page: when a route or a bus counts as inactive */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LiveFleetService, ROUTE_NUMS } from '../src/models/services/LiveFleetService';
import transitStops from '../src/models/data/transitStops';
import stopSequences from '../src/models/data/gtfsStopSequences.json';

const MIN = 60_000;
const T0 = Date.parse('2026-11-21T15:00:00Z');   // 9:00 AM in Regina
const at = (m: number) => T0 + m * MIN;

/* Route 9: its first stop (a route end) and a stop in the middle of the route */
const seq = Object.values((stopSequences as Record<string, Record<string, string[]>>)['9'])[0];
const where = (id: string) => { const s = transitStops.find(x => x.STOP_ID === id)!; return { lat: Number(s.LAT), lng: Number(s.LON) }; };
const END = where(seq[0]), MIDDLE = where(seq[Math.floor(seq.length / 2)]);
const bus = (bus_id: number, route: number | string, p: { lat: number; lng: number }) => ({ bus_id, route_num: route, line_name: 'Albert Park', heading: 0, speed: 0, ...p });
const routeOf = (snap: ReturnType<typeof LiveFleetService.snapshot>, r: string) => snap.routes.find(x => x.route === r)!;
const busOf = (snap: ReturnType<typeof LiveFleetService.snapshot>, id: number) => snap.buses.find(x => x.busId === id)!;

beforeEach(() => LiveFleetService._reset());

test('the Service page lists all 22 routes', () => {
    assert.equal(ROUTE_NUMS.length, 22);
    assert.equal(LiveFleetService.snapshot(at(0)).routes.length, 22);
});

test('a route is live while a bus is on it, and inactive after 5 minutes with none', () => {
    LiveFleetService.record([bus(650, 9, MIDDLE)], at(0));
    assert.equal(routeOf(LiveFleetService.snapshot(at(0)), '9').status, 'live');
    assert.equal(routeOf(LiveFleetService.snapshot(at(0)), '9').buses, 1);
    for (let m = 1; m <= 4; m++) LiveFleetService.record([], at(m));
    assert.equal(routeOf(LiveFleetService.snapshot(at(4)), '9').status, 'live', 'under 5 minutes is not yet inactive');
    LiveFleetService.record([], at(5));
    const r = routeOf(LiveFleetService.snapshot(at(5)), '9');
    assert.equal(r.status, 'inactive');
    assert.equal(r.inactiveSince, new Date(at(0)).toISOString(), 'inactive since the last bus was seen');
});

test('a route never seen is "checking" for the first 5 minutes of tracking, then inactive', () => {
    LiveFleetService.record([], at(0));
    assert.equal(routeOf(LiveFleetService.snapshot(at(2)), '18').status, 'checking');
    LiveFleetService.record([], at(5));
    const r = routeOf(LiveFleetService.snapshot(at(5)), '18');
    assert.equal(r.status, 'inactive');
    assert.equal(r.lastSeenAt, null, 'no bus seen today');
});

test('a bus missing from the feed for 5 minutes is inactive (missing)', () => {
    LiveFleetService.record([bus(650, 9, MIDDLE), bus(651, 9, END)], at(0));
    for (let m = 1; m <= 5; m++) LiveFleetService.record([bus(651, 9, { lat: END.lat + m * 0.001, lng: END.lng })], at(m));
    const snap = LiveFleetService.snapshot(at(5));
    assert.equal(busOf(snap, 650).status, 'missing');
    assert.equal(busOf(snap, 650).inactive, true);
    assert.equal(busOf(snap, 651).status, 'moving');
    assert.equal(snap.buses[0].busId, 650, 'inactive buses first');
    assert.equal(routeOf(snap, '9').status, 'live', 'the route still has a bus');
});

test('a bus standing still for 5 minutes mid-route is inactive (stopped); at a route end it is a layover', () => {
    for (let m = 0; m <= 5; m++) LiveFleetService.record([bus(650, 9, MIDDLE), bus(651, 9, END)], at(m));
    const snap = LiveFleetService.snapshot(at(5));
    assert.equal(busOf(snap, 650).status, 'stopped');
    assert.equal(busOf(snap, 650).inactive, true);
    assert.equal(busOf(snap, 651).status, 'layover');
    assert.equal(busOf(snap, 651).inactive, false);
    assert.equal(routeOf(snap, '9').stopped, 1);
    // A few metres of GPS wander is still standing still
    LiveFleetService.record([bus(650, 9, { lat: MIDDLE.lat + 0.0001, lng: MIDDLE.lng })], at(6));
    assert.equal(busOf(LiveFleetService.snapshot(at(6)), 650).status, 'stopped');
    // Moving off again makes it active
    LiveFleetService.record([bus(650, 9, { lat: MIDDLE.lat + 0.01, lng: MIDDLE.lng })], at(7));
    assert.equal(busOf(LiveFleetService.snapshot(at(7)), 650).status, 'moving');
});

test('an off-route bus does not make any route live and is never "stopped"', () => {
    for (let m = 0; m <= 6; m++) LiveFleetService.record([bus(627, 0, MIDDLE)], at(m));
    const snap = LiveFleetService.snapshot(at(6));
    assert.equal(busOf(snap, 627).status, 'moving');
    assert.ok(snap.routes.every(r => r.status !== 'live'));
});

test('while the feed is down nothing goes missing, and the page says the feed is down', () => {
    LiveFleetService.record([bus(650, 9, MIDDLE)], at(0));
    const snap = LiveFleetService.snapshot(at(20));   // no answer for 20 minutes
    assert.equal(snap.feedOk, false);
    assert.equal(busOf(snap, 650).status, 'moving');
    assert.equal(routeOf(snap, '9').status, 'live');
});

test('a new day starts fresh', () => {
    LiveFleetService.record([bus(650, 9, MIDDLE)], at(0));
    const tomorrow = at(24 * 60);
    LiveFleetService.record([], tomorrow);
    const snap = LiveFleetService.snapshot(tomorrow);
    assert.equal(snap.buses.length, 0);
    assert.equal(routeOf(snap, '9').lastSeenAt, null);
});
