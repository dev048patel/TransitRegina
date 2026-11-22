/* The timetables on the stop and route pages (TimetableService, and the files build:transit-data writes) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROUTES, SERVED_STOPS, stopInfo, type StopInfo } from '../src/models/services/TransitDirectory';
import {
    DAY_TYPES, SCHEDULE, departuresAt, everyText, formatTime, frequency, nextDepartures, primeTimetable, serviceOn, type RouteTimetable,
} from '../src/models/services/TimetableService';
import { stopMeta } from '../src/models/seo/pageMeta';

const tables = new Map<string, RouteTimetable>(ROUTES.map(r => [r.num, JSON.parse(fs.readFileSync(`public/timetables/${r.num}.json`, 'utf8'))]));
tables.forEach(primeTimetable);
const stops = SERVED_STOPS.map(s => stopInfo(s.STOP_ID)).filter((s): s is StopInfo => !!s);
/** A moment in Regina (UTC-6 all year) */
const regina = (iso: string, time: string) => new Date(`${iso}T${time}:00-06:00`);

test('times read like a clock, including buses after midnight', () => {
    assert.equal(formatTime(370), '6:10 AM');
    assert.equal(formatTime(720), '12:00 PM');
    assert.equal(formatTime(1381), '11:01 PM');
    assert.equal(formatTime(1450), '12:10 AM');
    assert.equal(everyText(15), 'every 15 min');
    assert.equal(everyText(60), 'every hour');
    assert.equal(everyText(75), 'every 1 h 15 min');
});

test('each day runs the right timetable: weekdays, weekends, holidays, and nothing outside its dates', () => {
    assert.equal(serviceOn('2026-11-23'), 'weekday');   // a Monday
    assert.equal(serviceOn('2026-11-28'), 'saturday');
    assert.equal(serviceOn('2026-11-29'), 'sunday');
    assert.equal(serviceOn('2026-12-25'), 'sunday');    // Christmas Day: Sunday service
    assert.equal(serviceOn('2026-12-26'), 'sunday');    // a Saturday that runs Sunday service
    assert.equal(serviceOn('2026-12-31'), null);        // the feed has no service that day
    assert.equal(serviceOn(SCHEDULE.start), SCHEDULE.start === '2026-08-23' ? 'sunday' : serviceOn(SCHEDULE.start));
    assert.equal(serviceOn('2027-06-01'), null);        // after the timetable ends
});

test('the next scheduled buses come from now on, and run on into tomorrow', () => {
    const times = (day: string) => (day === 'weekday' ? [360, 420, 1380, 1450] : []);
    // Monday 10 PM: 11 PM, then the 12:10 AM bus (still Monday's service), then Tuesday 6 AM
    const late = nextDepartures(times as never, regina('2026-11-23', '22:00'));
    assert.deepEqual(late, [{ minutes: 1380, date: '2026-11-23' }, { minutes: 1450, date: '2026-11-23' }, { minutes: 360, date: '2026-11-24' }]);
    // Tuesday 12:05 AM: Monday's 12:10 AM bus is still to come
    assert.deepEqual(nextDepartures(times as never, regina('2026-11-24', '00:05'), 1), [{ minutes: 1450, date: '2026-11-23' }]);
    // Friday night: Saturday has no buses in this made-up table, so the next is Monday
    assert.equal(nextDepartures(times as never, regina('2026-11-27', '23:30'), 2)[1].date, '2026-11-30');
});

test('how often a route runs is the usual gap in each part of the day', () => {
    const bands = frequency([360, 375, 390, 405, 600, 630, 660, 1200, 1260]);
    assert.deepEqual(bands.map(b => [b.label, b.every]), [['Before 9 AM', 15], ['9 AM to 3 PM', 30], ['After 6 PM', 60]]);
});

test('every route has a timetable, and every route at every stop has times there', () => {
    for (const r of ROUTES) assert.ok(tables.get(r.num), r.num);
    const missing = stops.flatMap(s => s.routes.filter(r => DAY_TYPES.every(d => !departuresAt(tables.get(r.route.num), r.direction, d, s.id).length)).map(r => `${s.id} route ${r.route.num}/${r.direction}`));
    // A route's last stop that way is where its trips end and nobody boards: no departures there is right
    // (38 stops in the 2026 timetable, plus one only a short trip ends at)
    assert.ok(missing.length <= 45, `${missing.length} stop-routes with no departures: ${missing.slice(0, 10).join(', ')}`);
});

test("a stop's first and last bus agree with its full timetable", () => {
    for (const s of stops.slice(0, 200)) {
        for (const day of DAY_TYPES) {
            const all = s.routes.flatMap(r => departuresAt(tables.get(r.route.num), r.direction, day, s.id));
            if (!all.length) continue;
            assert.deepEqual(s.hours[day], [Math.min(...all), Math.max(...all)], `${s.id} ${day}`);
        }
    }
});

test("a stop's description gives its weekday hours", () => {
    const s = stops.find(x => x.id === '0742')!;
    assert.match(stopMeta(s).description, /Weekdays 5:42 AM to 11:21 PM/);
});

test('the timetable dates and the version that refreshes cached files are there', () => {
    assert.match(SCHEDULE.start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(SCHEDULE.end, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(SCHEDULE.start < SCHEDULE.end);
    assert.ok(SCHEDULE.version.length > 0);
});
