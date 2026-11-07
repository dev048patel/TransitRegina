/* "Arrive by" planning on the real timetable: the trip it picks gets the rider there in time */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArriveByService } from '../src/models/services/ArriveByService';

// A weekday inside the timetable's dates, 11:15 AM in Regina (UTC−6)
const NOW = new Date('2026-10-23T17:15:00Z');
const HILLSDALE = { lat: 50.4205, lng: -104.6 };
const EAST = { lat: 50.4195, lng: -104.5655 };

/** "1:58 PM" → minutes after midnight */
const minutes = (clock: string) => {
    const [, h, m, ap] = /^(\d+):(\d+) (AM|PM)$/.exec(clock)!;
    return (Number(h) % 12) * 60 + Number(m) + (ap === 'PM' ? 720 : 0);
};

test('plans a real bus that arrives by the chosen time, not the next bus now', () => {
    const plan = ArriveByService.plan(HILLSDALE, EAST, 14 * 60 + 13, NOW);
    assert.equal(plan.status, 'planned');
    if (plan.status !== 'planned') return;
    assert.equal(plan.day, 'today');
    const [journey] = plan.journeys;
    assert.ok(journey.legs.length >= 1);
    assert.ok(minutes(journey.arrive) <= 14 * 60 + 13, `arrives ${journey.arrive}, by 2:13 PM`);
    assert.ok(minutes(journey.legs[0].board) > 13 * 60, `boards ${journey.legs[0].board}: close to the time asked, not now (11:15 AM)`);
    assert.ok(minutes(journey.leave) <= minutes(journey.legs[0].board), 'leaves before the bus comes');
    for (const leg of journey.legs) assert.ok(leg.boardStop.name && leg.alightStop.name && leg.route);
});

test('offers other ways to make the trip: different buses, each arriving in time, none beaten on every count', () => {
    const plan = ArriveByService.plan(HILLSDALE, EAST, 14 * 60 + 13, NOW);
    assert.equal(plan.status, 'planned');
    if (plan.status !== 'planned') return;
    const { journeys } = plan;
    assert.ok(journeys.length > 1 && journeys.length <= 5, `${journeys.length} option(s)`);
    assert.equal(journeys[0].kind, 'best');
    const routes = (j: typeof journeys[number]) => j.legs.map(l => l.route).join('>');
    const others = journeys.filter(j => j.kind === 'other');
    assert.ok(others.length >= 1, 'at least one other set of routes');
    assert.equal(new Set(journeys.filter(j => j.kind !== 'earlier').map(routes)).size, journeys.length - journeys.filter(j => j.kind === 'earlier').length, 'each option is a different set of buses');
    for (const j of journeys) {
        assert.ok(minutes(j.arrive) <= 14 * 60 + 13, `${routes(j)} arrives ${j.arrive}, by 2:13 PM`);
        assert.equal(j.totalMin, minutes(j.arrive) - minutes(j.leave));
        for (const leg of j.legs) {
            assert.ok(Number.isFinite(leg.boardStop.lat) && Number.isFinite(leg.alightStop.lng), 'stops carry their position for the map');
            assert.ok(Array.isArray(leg.stopsBetween));
        }
    }
    for (const j of others) {
        const beaten = journeys.some(k => k !== j && minutes(k.leave) >= minutes(j.leave) && minutes(k.arrive) <= minutes(j.arrive) && k.legs.length <= j.legs.length);
        assert.ok(!beaten, `${routes(j)} is beaten by another option on leave, arrival and buses`);
    }
    // The best one leaves latest of all
    for (const j of journeys) assert.ok(minutes(j.leave) <= minutes(journeys[0].leave) || j.kind === 'best');
});

test('a time that has already passed today plans for tomorrow', () => {
    const plan = ArriveByService.plan(HILLSDALE, EAST, 9 * 60, NOW);
    assert.equal(plan.day, 'tomorrow');
});
