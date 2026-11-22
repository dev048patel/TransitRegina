/*
 build-transit-data — regenerates the app's static transit data from the City of Regina GTFS feed.

 1. Download the GTFS feed from Open Regina (https://openregina.ca, Transit) and unzip it into
    data/google_transit/ (git ignores that folder).
 2. npm run build:transit-data          (or: node scripts/build-transit-data.mjs <feed folder>)

 Writes to src/models/data/:
   transitStops.ts             every stop in stops.txt
   transitRoutes.ts            every route in routes.txt
   transitShapes.json          each route's paths, one line per shape its trips follow
   gtfsStopRoutes.json         stop → route → the directions whose trips call there
   gtfsStopSequences.json      route → direction → stop order of that direction's longest trip
   gtfsDirectionalShapes.json  route → direction → the path that trip follows
   gtfsSchedule.json           the timetable's dates and holidays, each stop's first and last bus, transfers

 And to public/timetables/<route>.json: every scheduled departure, by direction, day type and stop.
 The stop and route pages load them (src/models/services/TimetableService.ts); the build pre-renders them.

 Stops and routes already in the app keep their OBJECTID, ROUTE_ID and file order, so a rerun
 only shows what the city actually changed.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feedDir = path.resolve(root, process.argv[2] ?? 'data/google_transit');
const outDir = path.join(root, 'src/models/data');

// The generated files, so the run can tell whether the data actually changed (see transitDataDate.ts below).
// Line endings don't count: on Windows, git checks them out with CRLF and this script writes LF.
// gtfsSchedule.json has a version that changes with any timetable in public/timetables/, so it stands for them.
const generatedFiles = ['transitStops.ts', 'transitRoutes.ts', 'transitShapes.json', 'gtfsStopRoutes.json', 'gtfsStopSequences.json', 'gtfsDirectionalShapes.json', 'gtfsSchedule.json'];
const readGenerated = () => generatedFiles.map(f => { try { return fs.readFileSync(path.join(outDir, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } });
const generatedBefore = readGenerated();

if (!fs.existsSync(path.join(feedDir, 'stops.txt'))) {
    console.error(`No GTFS feed in ${feedDir}. Unzip the Open Regina GTFS download there, or pass its folder.`);
    process.exit(1);
}

// ── GTFS reading ───────────────────────────────────────────────────────────

/** "25:10:00" → 1510: minutes after midnight of the service day */
const toMinutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function splitCsvLine(line) {
    const cells = [];
    let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoted) {
            if (c !== '"') cell += c;
            else if (line[i + 1] === '"') { cell += '"'; i++; }
            else quoted = false;
        } else if (c === '"') quoted = true;
        else if (c === ',') { cells.push(cell); cell = ''; }
        else cell += c;
    }
    cells.push(cell);
    return cells;
}

function readFeedFile(name) {
    const lines = fs.readFileSync(path.join(feedDir, name), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const header = splitCsvLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
        const cells = splitCsvLine(line);
        return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
    });
}

const feedStops = readFeedFile('stops.txt');
const feedRoutes = readFeedFile('routes.txt');
const feedTrips = readFeedFile('trips.txt');

const shapePoints = new Map(); // shape_id → [lat, lng][] in sequence order
for (const p of readFeedFile('shapes.txt')) {
    if (!shapePoints.has(p.shape_id)) shapePoints.set(p.shape_id, []);
    shapePoints.get(p.shape_id).push([Number(p.shape_pt_sequence), Number(p.shape_pt_lat), Number(p.shape_pt_lon)]);
}
for (const [id, points] of shapePoints) {
    shapePoints.set(id, points.sort((a, b) => a[0] - b[0]).map(([, lat, lng]) => [lat, lng]));
}

const tripStops = new Map(); // trip_id → stop IDs in calling order
const tripTimes = new Map(); // trip_id → [sequence, stop ID, departure minutes, pickup type][] (for the timetables)
for (const st of readFeedFile('stop_times.txt')) {
    if (!tripStops.has(st.trip_id)) tripStops.set(st.trip_id, []);
    tripStops.get(st.trip_id).push([Number(st.stop_sequence), st.stop_id]);
    const time = st.departure_time || st.arrival_time;
    if (time) (tripTimes.get(st.trip_id) ?? tripTimes.set(st.trip_id, []).get(st.trip_id)).push([Number(st.stop_sequence), st.stop_id, toMinutes(time), st.pickup_type]);
}
for (const [id, calls] of tripStops) tripStops.set(id, calls.sort((a, b) => a[0] - b[0]).map(([, stopId]) => stopId));

// ── Trip patterns ──────────────────────────────────────────────────────────

const routeNumById = new Map(feedRoutes.map(r => [r.route_id, r.route_short_name]));

// "routeNum-dir" → patterns (distinct stop lists), each with its trip count and the shapes those trips follow
const patternsByDirection = new Map();
const shapeTripsByRoute = new Map(); // routeNum → shape_id → trip count
for (const trip of feedTrips) {
    const stops = tripStops.get(trip.trip_id);
    const routeNum = routeNumById.get(trip.route_id);
    if (!stops || !routeNum) continue;

    const key = `${routeNum}-${trip.direction_id}`;
    if (!patternsByDirection.has(key)) patternsByDirection.set(key, new Map());
    const patterns = patternsByDirection.get(key);
    const patternKey = stops.join('>');
    if (!patterns.has(patternKey)) patterns.set(patternKey, { stops, trips: 0, shapeTrips: new Map() });
    const pattern = patterns.get(patternKey);
    pattern.trips++;
    pattern.shapeTrips.set(trip.shape_id, (pattern.shapeTrips.get(trip.shape_id) ?? 0) + 1);

    if (!shapeTripsByRoute.has(routeNum)) shapeTripsByRoute.set(routeNum, new Map());
    const shapes = shapeTripsByRoute.get(routeNum);
    shapes.set(trip.shape_id, (shapes.get(trip.shape_id) ?? 0) + 1);
}

const mostTrips = counts => [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
const byRouteNum = (a, b) => Number(a) - Number(b);

// Each direction's representative trip is its longest one (most trips breaks a tie): it covers the
// most stops, so the sequence lookups in StopToRouteIndex have to fall back to geometry least often.
const mainPattern = new Map();
for (const [key, patterns] of patternsByDirection) {
    const longest = [...patterns.values()].sort((a, b) => b.stops.length - a.stops.length || b.trips - a.trips)[0];
    mainPattern.set(key, { stops: longest.stops, shapeId: mostTrips(longest.shapeTrips) });
}

// ── What the app has now ───────────────────────────────────────────────────

function readExisting(file) {
    const p = path.join(outDir, file);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

const oldStopsSource = readExisting('transitStops.ts');
const oldStops = [...oldStopsSource.matchAll(/"OBJECTID":\s*(\d+),\s*"STOP_ID":\s*"([^"]+)"/g)]
    .map(m => ({ objectId: Number(m[1]), stopId: m[2] }));

const oldRoutes = [...readExisting('transitRoutes.ts').matchAll(/"ROUTE_NUM":\s*"([^"]+)",\s*"ROUTE_ID":\s*"([^"]+)"/g)]
    .map(m => ({ routeNum: m[1], routeId: m[2] }));

// ── transitStops.ts ────────────────────────────────────────────────────────

const feedStopById = new Map(feedStops.map(s => [s.stop_id, s]));

function toStop(objectId, s) {
    // "Albert St @ 13th Ave (SB)": on Albert St, at 13th Ave (SB). Names without an "@" are all ONSTREET.
    const at = s.stop_name.indexOf(' @ ');
    const direction = s.stop_name.match(/\((NB|SB|EB|WB)\)\s*$/);
    return {
        OBJECTID: objectId,
        STOP_ID: s.stop_id,
        STOP_NAME: s.stop_name,
        LAT: String(Number(s.stop_lat)),
        LON: String(Number(s.stop_lon)),
        ONSTREET: at === -1 ? s.stop_name : s.stop_name.slice(0, at),
        ATSTREET: at === -1 ? '' : s.stop_name.slice(at + 3),
        DIRECTION: direction ? direction[1] : null,
    };
}

let nextObjectId = Math.max(0, ...oldStops.map(s => s.objectId)) + 1;
const keptStops = oldStops.filter(s => feedStopById.has(s.stopId));
const keptStopIds = new Set(keptStops.map(s => s.stopId));
const addedStops = feedStops.filter(s => !keptStopIds.has(s.stop_id));
const stops = [
    ...keptStops.map(s => toStop(s.objectId, feedStopById.get(s.stopId))),
    ...addedStops.map(s => toStop(nextObjectId++, s)),
];

const tsObject = (obj, indent) =>
    `${indent}{\n${Object.entries(obj).map(([k, v]) => `${indent}    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n${indent}}`;

const generatedNote = file => `/*
Generated by scripts/build-transit-data.mjs from the City of Regina GTFS feed (${file}),
published on Open Regina: https://openregina.ca. Rerun the script rather than editing by hand.
*/`;

fs.writeFileSync(path.join(outDir, 'transitStops.ts'), `${generatedNote('stops.txt')}


import { Stop } from '../transit/Stop';

const transitStops: Stop[] = [

${stops.map(s => tsObject(s, '    ')).join(',\n')}
];

export default transitStops;
`);

// ── transitRoutes.ts ───────────────────────────────────────────────────────

// Admin renames and hidden flags (route-overrides.json) are keyed by ROUTE_ID, and the city bumps
// the ID's suffix with every timetable (1-44 → 1-48), so a route the app already has keeps its ID.
const oldRouteIdByNum = new Map(oldRoutes.map(r => [r.routeNum, r.routeId]));
const feedRouteByNum = new Map(feedRoutes.map(r => [r.route_short_name, r]));
const routeOrder = [
    ...oldRoutes.map(r => r.routeNum).filter(n => feedRouteByNum.has(n)),
    ...feedRoutes.map(r => r.route_short_name).filter(n => !oldRouteIdByNum.has(n)),
];

function toRoute(routeNum) {
    const r = feedRouteByNum.get(routeNum);
    const shapes = shapeTripsByRoute.get(routeNum);
    return {
        ROUTE_NAME: r.route_long_name,
        ROUTE_NUM: routeNum,
        ROUTE_ID: oldRouteIdByNum.get(routeNum) ?? r.route_id,
        SHAPE_ID: shapes ? mostTrips(shapes) : '',
        // Colours come from transitColors.ts, which matches what transitlive.com shows riders
        ROUTE_COLO: '',
        ROUTE_TEXT: '',
        SHAPE_LEN: null,
    };
}
const routes = routeOrder.map(toRoute);

fs.writeFileSync(path.join(outDir, 'transitRoutes.ts'), `${generatedNote('routes.txt')}

import { Route } from '../transit/Route';

const transitRoutes: Route[] = [
${routes.map(r => tsObject(r, '    ')).join(',\n')}
];

export default transitRoutes;
`);

// ── transitShapes.json ─────────────────────────────────────────────────────

const features = routes.map(route => {
    const shapeIds = [...(shapeTripsByRoute.get(route.ROUTE_NUM) ?? new Map()).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .filter(id => shapePoints.has(id));
    return {
        type: 'Feature',
        geometry: {
            type: 'MultiLineString',
            coordinates: shapeIds.map(id => shapePoints.get(id).map(([lat, lng]) => [lng, lat])), // GeoJSON is [lng, lat]
        },
        properties: route,
    };
});
fs.writeFileSync(path.join(outDir, 'transitShapes.json'),
    `{"type":"FeatureCollection", "features": [\n${features.map(f => JSON.stringify(f)).join(',\n')}\n]}`);

// ── gtfsStopRoutes.json ────────────────────────────────────────────────────

const stopRoutes = {};
for (const trip of feedTrips) {
    const stopIds = tripStops.get(trip.trip_id);
    const routeNum = routeNumById.get(trip.route_id);
    if (!stopIds || !routeNum) continue;
    for (const stopId of stopIds) {
        stopRoutes[stopId] ??= {};
        stopRoutes[stopId][routeNum] ??= new Set();
        stopRoutes[stopId][routeNum].add(Number(trip.direction_id));
    }
}
const stopRoutesOut = {};
for (const stopId of Object.keys(stopRoutes).sort()) {
    stopRoutesOut[stopId] = {};
    for (const routeNum of Object.keys(stopRoutes[stopId]).sort(byRouteNum)) {
        stopRoutesOut[stopId][routeNum] = [...stopRoutes[stopId][routeNum]].sort();
    }
}
fs.writeFileSync(path.join(outDir, 'gtfsStopRoutes.json'), JSON.stringify(stopRoutesOut, null, 2));

// ── gtfsStopSequences.json and gtfsDirectionalShapes.json ──────────────────

const sequences = {}, directionalShapes = {};
const directionKeys = [...mainPattern.keys()].sort((a, b) => {
    const [ra, da] = a.split('-'), [rb, db] = b.split('-');
    return byRouteNum(ra, rb) || Number(da) - Number(db);
});
for (const key of directionKeys) {
    const [routeNum, dir] = key.split('-');
    const { stops: stopIds, shapeId } = mainPattern.get(key);
    (sequences[routeNum] ??= {})[dir] = stopIds;
    (directionalShapes[routeNum] ??= {})[dir] = shapePoints.get(shapeId) ?? [];
}
fs.writeFileSync(path.join(outDir, 'gtfsStopSequences.json'), JSON.stringify(sequences));
fs.writeFileSync(path.join(outDir, 'gtfsDirectionalShapes.json'), JSON.stringify(directionalShapes));

// ── Timetables: public/timetables/<route>.json and gtfsSchedule.json ───────

// Every scheduled departure, for the "Timetable" sections of the stop and route pages. Each route's
// file is only loaded on those pages, so the rest of the app never downloads ~140,000 times.
// Times are minutes after midnight of the service day; past midnight they go above 1,440, as in GTFS.
const feedCalendar = readFeedFile('calendar.txt');
const feedCalendarDates = fs.existsSync(path.join(feedDir, 'calendar_dates.txt')) ? readFeedFile('calendar_dates.txt') : [];
const DAY_TYPES = ['weekday', 'saturday', 'sunday'];
const dayTypeOfService = new Map(feedCalendar.map(c => [c.service_id,
    c.saturday === '1' ? 'saturday' : c.sunday === '1' ? 'sunday' : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].some(d => c[d] === '1') ? 'weekday' : null]));
const isoDay = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

const tripById = new Map(feedTrips.map(t => [t.trip_id, t]));
// route → direction → day type → stop → departure minutes
const departures = new Map();
const firstLast = new Map(); // stop → day type → [first, last]
for (const [tripId, calls] of tripTimes) {
    const trip = tripById.get(tripId);
    const routeNum = trip && routeNumById.get(trip.route_id);
    const dayType = trip && dayTypeOfService.get(trip.service_id);
    if (!routeNum || !dayType) continue;
    calls.sort((a, b) => a[0] - b[0]);
    // The last call is where the bus ends its trip: nobody can board it there
    for (const [, stopId, minutes, pickup] of calls.slice(0, -1)) {
        if (pickup === '1') continue;   // "no pickup"
        const byDir = departures.get(routeNum) ?? departures.set(routeNum, new Map()).get(routeNum);
        const byDay = byDir.get(trip.direction_id) ?? byDir.set(trip.direction_id, new Map()).get(trip.direction_id);
        const byStop = byDay.get(dayType) ?? byDay.set(dayType, new Map()).get(dayType);
        (byStop.get(stopId) ?? byStop.set(stopId, []).get(stopId)).push(minutes);
        const hours = firstLast.get(stopId) ?? firstLast.set(stopId, {}).get(stopId);
        const [first, last] = hours[dayType] ?? [Infinity, -Infinity];
        hours[dayType] = [Math.min(first, minutes), Math.max(last, minutes)];
    }
}

const timetableDir = path.join(root, 'public', 'timetables');
fs.rmSync(timetableDir, { recursive: true, force: true });
fs.mkdirSync(timetableDir, { recursive: true });
const timetableText = [];
for (const routeNum of [...departures.keys()].sort(byRouteNum)) {
    const directions = {};
    for (const [dir, byDay] of [...departures.get(routeNum)].sort()) {
        directions[dir] = {};
        for (const dayType of DAY_TYPES) {
            const byStop = byDay.get(dayType);
            if (!byStop) continue;
            directions[dir][dayType] = Object.fromEntries([...byStop].sort().map(([stopId, mins]) => [stopId, [...new Set(mins)].sort((a, b) => a - b)]));
        }
    }
    const text = JSON.stringify({ route: routeNum, directions });
    timetableText.push(text);
    fs.writeFileSync(path.join(timetableDir, `${routeNum}.json`), text);
}

// Holidays and other days that don't run their usual service (calendar_dates.txt)
const datesByDay = new Map();
for (const d of feedCalendarDates) {
    const dayType = dayTypeOfService.get(d.service_id);
    if (!dayType) continue;
    const entry = datesByDay.get(d.date) ?? datesByDay.set(d.date, { added: new Set(), removed: new Set() }).get(d.date);
    (d.exception_type === '1' ? entry.added : entry.removed).add(dayType);
}
const usualDayType = date => { const day = new Date(`${isoDay(date)}T12:00:00Z`).getUTCDay(); return day === 0 ? 'sunday' : day === 6 ? 'saturday' : 'weekday'; };
const exceptions = [...datesByDay].sort().map(([date, { added, removed }]) => {
    const runs = new Set([usualDayType(date)]);
    removed.forEach(t => runs.delete(t));
    added.forEach(t => runs.add(t));
    return { date: isoDay(date), service: [...runs][0] ?? null };
}).filter(e => e.service !== usualDayType(e.date.replace(/-/g, '')));

const transfersOut = {};
if (fs.existsSync(path.join(feedDir, 'transfers.txt'))) {
    for (const t of readFeedFile('transfers.txt')) {
        if (t.from_stop_id === t.to_stop_id || t.transfer_type === '3') continue;   // same stop, or "not possible"
        (transfersOut[t.from_stop_id] ??= []).includes(t.to_stop_id) || transfersOut[t.from_stop_id].push(t.to_stop_id);
    }
}

const schedule = {
    // Changes whenever any timetable does, so the app can ask for fresh files after an update
    version: String(timetableText.join('\n').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)),
    start: isoDay(feedCalendar.map(c => c.start_date).sort()[0]),
    end: isoDay(feedCalendar.map(c => c.end_date).sort().at(-1)),
    exceptions,
    hours: Object.fromEntries([...firstLast].sort()),
    transfers: transfersOut,
};
fs.writeFileSync(path.join(outDir, 'gtfsSchedule.json'), JSON.stringify(schedule));

// ── transitDataDate.ts ─────────────────────────────────────────────────────

// The sitemap's lastmod for the route and stop pages. Only moves when the data really changed, so
// rerunning the script on the same feed doesn't tell search engines ~1,400 pages are new.
const generatedAfter = readGenerated();
const dataChanged = generatedAfter.some((s, i) => s !== generatedBefore[i]);
if (dataChanged || !fs.existsSync(path.join(outDir, 'transitDataDate.ts'))) {
    const today = new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local date
    fs.writeFileSync(path.join(outDir, 'transitDataDate.ts'), `/*
Generated by scripts/build-transit-data.mjs: the day the route and stop data last changed.
The sitemap uses it as lastmod for the route and stop pages. Rerun the script rather than editing by hand.
*/
export const TRANSIT_DATA_DATE = '${today}';
`);
}

// ── Report ─────────────────────────────────────────────────────────────────

const stopName = id => feedStopById.get(id)?.stop_name ?? '?';
const removedStops = oldStops.filter(s => !feedStopById.has(s.stopId));
const oldRouteNums = new Set(oldRoutes.map(r => r.routeNum));
console.log(`Feed: ${feedDir}`);
console.log(dataChanged ? "Data changed: transitDataDate.ts set to today (the sitemap's lastmod for route and stop pages)." : 'Data unchanged: transitDataDate.ts left as it was.');
console.log(`Stops: ${stops.length} (${addedStops.length} added, ${removedStops.length} removed)`);
addedStops.forEach(s => console.log(`  + ${s.stop_id} ${s.stop_name}`));
removedStops.forEach(s => console.log(`  - ${s.stopId}`));
console.log(`Routes: ${routes.length} (${routes.filter(r => !oldRouteNums.has(r.ROUTE_NUM)).length} added, ${oldRoutes.filter(r => !feedRouteByNum.has(r.routeNum)).length} removed)`);
console.log(`Stops served: ${Object.keys(stopRoutesOut).length}. Route directions: ${directionKeys.length}.`);
console.log(`Timetables: ${timetableText.length} routes, in effect ${schedule.start} to ${schedule.end}; ${exceptions.length} days with other service (${exceptions.map(e => `${e.date} ${e.service ?? 'none'}`).join(', ')}).`);
for (const key of directionKeys) {
    const [routeNum, dir] = key.split('-');
    const seq = sequences[routeNum][dir];
    console.log(`  route ${routeNum} dir ${dir}: ${seq.length} stops, ${stopName(seq[0])} → ${stopName(seq[seq.length - 1])}`);
}
