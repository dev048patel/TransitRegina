/* The admin Insights drill-downs: who did what, worked out from usage rows (UsageExplorer), and the new actions recorded */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actorOf, cleanSearch, isAdminPage, perHour, summarizeItem, summarizePeople, type ExploreRow } from '../src/models/services/UsageExplorer';
// UsageEvents opens a database client when loaded: give it an address (nothing is ever sent to it here)
process.env.VITE_SUPABASE_URL ??= 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-key';
process.env.VITE_SUPABASE_ANON_KEY ??= 'test-key';

const RIDER = '22222222-2222-4222-8222-222222222222';
const row = (at: string, kind: string, who: 'rider' | 'anon1' | 'anon2', detail: Record<string, unknown> = {}, extra: Partial<ExploreRow> = {}): ExploreRow => ({
    at, kind, page: '/map', device: who === 'rider' ? 'Mobile' : 'Desktop', detail,
    visitor: who === 'rider' ? `u:${RIDER}` : who === 'anon1' ? 'a:AAAAAAAAAAAAAAAAAAAAAA' : 'a:BBBBBBBBBBBBBBBBBBBBBB',
    user_id: who === 'rider' ? RIDER : null, who: who === 'rider' ? 'rider@example.com' : null, ...extra,
});

test('a signed-in rider is named by their account, a signed-out one stays anonymous', () => {
    assert.deepEqual(actorOf(row('2026-11-10T15:00:00Z', 'bus_opened', 'rider')), { key: `u:${RIDER}`, who: 'rider@example.com', userId: RIDER, visitor: null });
    assert.deepEqual(actorOf(row('2026-11-10T15:00:00Z', 'bus_opened', 'anon1')), { key: 'a:AAAAAAAAAAAAAAAAAAAAAA', who: 'Visitor AAAAAA', userId: null, visitor: 'AAAAAAAAAAAAAAAAAAAAAA' });
    assert.equal(actorOf({ ...row('2026-11-10T15:00:00Z', 'bus_opened', 'rider'), who: null }).who, 'A deleted account');
});

test('an item counts times and people, splits signed-in from anonymous, and lists who did it most', () => {
    const rows = [
        row('2026-11-10T15:00:00Z', 'bus_opened', 'rider', { bus: '512' }),
        row('2026-11-10T16:00:00Z', 'bus_opened', 'rider', { bus: '512' }),
        row('2026-11-11T02:30:00Z', 'bus_opened', 'anon1', { bus: '512' }),
    ];
    const s = summarizeItem(rows, ['2026-11-09', '2026-11-10']);
    assert.deepEqual(s.totals, { events: 3, people: 2, signedIn: 1, anonymous: 1 });
    assert.equal(s.people[0].who, 'rider@example.com');
    assert.equal(s.people[0].events, 2);
    assert.equal(s.people[0].first, '2026-11-10T15:00:00Z');
    assert.equal(s.people[0].last, '2026-11-10T16:00:00Z');
    // Regina days (UTC-6): 02:30 UTC on the 11th is still the evening of the 10th in Regina
    assert.deepEqual(s.daily, [{ day: '2026-11-09', events: 0, people: 0 }, { day: '2026-11-10', events: 3, people: 2 }]);
    assert.deepEqual(s.hours.find(h => h.hour === 20), { weekday: 2, hour: 20, events: 1 }, 'Tue 8:30 pm Regina');
    assert.deepEqual(s.devices, [{ device: 'Mobile', visitors: 1 }, { device: 'Desktop', visitors: 1 }]);
    assert.deepEqual(s.points, [], 'no places on a bus');
});

test('the places of an item are grouped by their ~100 m area, with how many people', () => {
    const at = { place: 'Cornwall Centre', lat: 50.449, lng: -104.611 };
    const s = summarizeItem([row('2026-11-10T15:00:00Z', 'place_searched', 'rider', at), row('2026-11-10T15:05:00Z', 'place_searched', 'anon1', at), row('2026-11-10T15:06:00Z', 'place_searched', 'anon1', at)], ['2026-11-10']);
    assert.deepEqual(s.points, [{ lat: 50.449, lng: -104.611, label: 'Cornwall Centre', events: 3, people: 2 }]);
});

test('the riders list counts what each person did, busiest first, with their most looked-for place', () => {
    const people = summarizePeople([
        row('2026-11-10T15:00:00Z', 'session_start', 'anon1', {}, { session: 's1' } as Partial<ExploreRow>),
        row('2026-11-10T15:00:01Z', 'page_view', 'anon1', {}, { session: 's1' } as Partial<ExploreRow>),
        row('2026-11-10T15:00:00Z', 'place_searched', 'rider', { place: 'Cornwall Centre' }, { session: 'v1' } as Partial<ExploreRow>),
        row('2026-11-10T15:01:00Z', 'planner_searched', 'rider', { place: 'U of R' }, { session: 'v1' } as Partial<ExploreRow>),
        row('2026-11-10T15:02:00Z', 'place_searched', 'rider', { place: 'Cornwall Centre' }, { session: 'v2' } as Partial<ExploreRow>),
        row('2026-11-10T15:03:00Z', 'trip_started', 'rider', { place: 'Cornwall Centre', routes: '4' }, { session: 'v2' } as Partial<ExploreRow>),
        row('2026-11-10T15:04:00Z', 'stop_opened', 'rider', { stop: '0742' }, { session: 'v2' } as Partial<ExploreRow>),
        row('2026-11-10T15:05:00Z', 'bus_opened', 'rider', { bus: '512' }, { session: 'v2' } as Partial<ExploreRow>),
        row('2026-11-10T15:06:00Z', 'app_error', 'rider', { message: 'x' }, { session: 'v2' } as Partial<ExploreRow>),
    ]);
    assert.equal(people.length, 2);
    const [rider, anon] = people;
    assert.equal(rider.who, 'rider@example.com', 'the one who did something comes first');
    assert.deepEqual({ searches: rider.searches, trips: rider.trips, stops: rider.stops, buses: rider.buses, errors: rider.errors, visits: rider.visits, topPlace: rider.topPlace },
        { searches: 3, trips: 1, stops: 1, buses: 1, errors: 1, visits: 2, topPlace: 'Cornwall Centre' });
    assert.equal(anon.actions, 0, 'opening the app is not doing something');
    assert.equal(anon.events, 2);
});

test('activity search keeps words only: nothing that could change the database filter', () => {
    assert.equal(cleanSearch('Cornwall Centre'), 'Cornwall Centre');
    assert.equal(cleanSearch('  route   4 '), 'route 4');
    assert.equal(cleanSearch('#0742'), '#0742');
    assert.equal(cleanSearch('x),kind.eq.signed_up,(y'), 'x kind eq signed up y');
    assert.equal(cleanSearch('"*%'), null);
    assert.equal(cleanSearch(42), null);
    assert.equal(cleanSearch('a'.repeat(100))!.length, 40);
});

test('the Trip Planner, arrive-by plans and removing a saved place are recorded, places only to ~100 m', async () => {
    const { cleanEvent } = await import('../src/models/services/UsageEvents');
    assert.deepEqual(cleanEvent('planner_searched', { place: 'U of R', lat: 50.41567, lng: -104.58789, options: 3, best_minutes: 24, typed: 'secret' }),
        { kind: 'planner_searched', detail: { place: 'U of R', lat: 50.416, lng: -104.588, options: 3, best_minutes: 24 } });
    assert.deepEqual(cleanEvent('arrive_by_planned', { status: 'planned', day: 'today', options: 2, minutes: 31 }),
        { kind: 'arrive_by_planned', detail: { status: 'planned', day: 'today', options: 2, minutes: 31 } });
    assert.deepEqual(cleanEvent('arrive_by_planned', { status: 'whatever' }), { kind: 'arrive_by_planned', detail: {} });
    assert.deepEqual(cleanEvent('place_unsaved', { name: 'Home', address: '123 Main St' }), { kind: 'place_unsaved', detail: {} }, 'never what the place was');
});

test('a one-day period is counted per Regina hour: actions, people, searches and trips', () => {
    const hours = perHour([
        row('2026-11-12T14:05:00Z', 'place_searched', 'rider'),   // 8 am Regina
        row('2026-11-12T14:40:00Z', 'trip_started', 'rider'),
        row('2026-11-12T14:50:00Z', 'place_searched', 'anon1'),
        row('2026-11-13T05:59:00Z', 'page_view', 'anon2'),        // 11:59 pm Regina, still the 12th
    ]);
    assert.equal(hours.length, 24, 'every hour, quiet ones included');
    assert.deepEqual(hours[8], { hour: 8, events: 3, people: 2, searches: 2, trips: 1 });
    assert.deepEqual(hours[23], { hour: 23, events: 1, people: 1, searches: 0, trips: 0 });
    assert.equal(hours.reduce((t, h) => t + h.events, 0), 4);
});

test('admins looking at the admin panel are not counted as riders', () => {
    for (const page of ['/admin', '/admin/insights', '/admin/people/x']) assert.equal(isAdminPage({ page }), true, page);
    for (const page of ['/map', '/administrator', '/', null]) assert.equal(isAdminPage({ page }), false, String(page));
});
