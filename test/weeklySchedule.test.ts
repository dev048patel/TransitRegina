/* Weekly commute rules: what is saved, what "Apply to weekdays" replaces, reading old rows */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyConflicts, applyToWeekdays, blankWeek, clockToHhmm, hhmmToClock, legacyTripKeys, rowsToSave, samePlans,
    tripHomeFor, tripKey, weekFromRows, type DbWeeklySchedule,
} from '../src/models/transit/WeeklySchedule';

const row = (o: Partial<DbWeeklySchedule>): DbWeeklySchedule => ({
    id: 'r', user_id: 'u', day_of_week: 1, from_dest_id: 'home', to_dest_id: 'work', arrive_by: '08:30',
    depart_by: '07:52', route_num: '4', route_total_minutes: 38, enabled: true, created_at: '', ...o,
});

test('rows saved before the trip home existed are read as the trip there', () => {
    const week = weekFromRows([row({ trip: undefined, route_list: undefined })]);
    const mon = week[tripKey(1, 0)];
    assert.equal(mon.fromId, 'home');
    assert.deepEqual(mon.routeList, ['4'], 'the one bus it knew');
    assert.equal(week[tripKey(1, 1)].fromId, null, 'no trip home');
});

test('reads the trip home and every bus of a pinned trip', () => {
    const week = weekFromRows([row({ trip: 1, day_of_week: 6, from_dest_id: 'work', to_dest_id: 'home', route_list: ['18', '4'] })]);
    assert.deepEqual(week[tripKey(6, 1)].routeList, ['18', '4']);
    assert.equal(week[tripKey(6, 1)].toId, 'home');
});

test('saves the trips set up and the ones already stored, not the empty days', () => {
    const week = blankWeek();
    week[tripKey(1, 0)] = { ...week[tripKey(1, 0)], fromId: 'home', toId: 'work' };
    const rows = rowsToSave(week, new Set([tripKey(3, 1)]));
    assert.deepEqual(rows.map(r => [r.day, r.trip]), [[1, 0], [3, 1]], 'Monday there, and the stored Wednesday trip home (now cleared)');
});

test('apply to weekdays replaces Mon–Fri only, and asks for each day set up differently', () => {
    let week = blankWeek();
    week[tripKey(1, 0)] = { ...week[tripKey(1, 0)], fromId: 'home', toId: 'work', arriveBy: '08:30', departBy: '07:52', routeList: ['4'], routeNum: '4', enabled: true };
    week[tripKey(3, 0)] = { ...week[tripKey(3, 0)], fromId: 'home', toId: 'gym' };
    week[tripKey(4, 0)] = { ...week[tripKey(1, 0)] };
    assert.deepEqual(applyConflicts(week, 1, 0), [3], 'Thursday is already the same');

    week = applyToWeekdays(week, 1, 0);
    for (const d of [2, 3, 4, 5]) {
        const p = week[tripKey(d, 0)];
        assert.equal(p.toId, 'work');
        assert.equal(p.enabled, true, 'reminders are copied too');
        assert.equal(p.departBy, null, 'each day gets its own leave time from the timetable');
        assert.deepEqual(p.routeList, ['4']);
    }
    assert.equal(week[tripKey(6, 0)].fromId, null, 'Saturday untouched');
    assert.equal(week[tripKey(1, 0)].departBy, '07:52', 'the source day keeps its leave time');
});

test('a trip home is the trip there reversed', () => {
    const home = tripHomeFor({ ...blankWeek()[tripKey(1, 0)], fromId: 'home', toId: 'work', enabled: true });
    assert.equal(home.fromId, 'work');
    assert.equal(home.toId, 'home');
    assert.equal(home.arriveBy, '17:00');
    assert.equal(home.enabled, true);
});

test('unsaved changes: a copy is the same, any saved field changed is not', () => {
    const a = blankWeek(), b = blankWeek();
    assert.ok(samePlans(a, b));
    b[tripKey(2, 1)] = { ...b[tripKey(2, 1)], arriveBy: '17:30' };
    assert.ok(!samePlans(a, b));
});

test('clock conversions', () => {
    assert.equal(clockToHhmm('7:42 AM'), '07:42');
    assert.equal(clockToHhmm('12:05 PM'), '12:05');
    assert.equal(clockToHhmm('12:05 AM'), '00:05');
    assert.equal(clockToHhmm('5:10 PM'), '17:10');
    assert.equal(clockToHhmm('soon'), null);
    assert.equal(hhmmToClock('17:10'), '5:10 PM');
    assert.equal(hhmmToClock('00:05:00'), '12:05 AM');
    assert.equal(hhmmToClock(null), '');
});

test('trips saved before timetable leave times are found for a re-check, set-up ones only', () => {
    const keys = legacyTripKeys([
        row({ day_of_week: 1 }),                                                        // old: no buses saved
        row({ day_of_week: 2, route_list: ['7'] }),                                     // 7:52 + 38 min lands exactly on 8:30: an estimate
        row({ day_of_week: 3, trip: 1, route_list: [] }),                               // old trip home
        row({ day_of_week: 4, from_dest_id: null }),                                    // not set up
        row({ day_of_week: 5, route_list: ['7'], depart_by: '14:29', arrive_by: '15:00', route_total_minutes: 31 }), // old estimate, re-saved with its bus
        row({ day_of_week: 6, route_list: ['7'], depart_by: '14:13', arrive_by: '15:00', route_total_minutes: 21 }), // timetable: arrives 2:34
        row({ day_of_week: 0, route_list: ['9'], depart_by: null }),                    // no leave time
    ]);
    assert.deepEqual(keys, [tripKey(1, 0), tripKey(2, 0), tripKey(3, 1), tripKey(5, 0), tripKey(0, 0)]);
});
