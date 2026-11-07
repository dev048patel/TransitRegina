/*
 build-walk-graph — turns OpenStreetMap's walkable ways in Regina into the walking graph the backend routes on
 (src/models/services/WalkRouteService.ts), so walks to and from stops follow sidewalks, paths and crossings
 instead of a straight line through buildings.

 1. Download Regina's walkable ways from the Overpass API into data/osm/regina-walk.osm.json (git ignores it).
    The query (the map's area, src/models/MapModel.ts):

      [out:json][timeout:300];
      (
        way["highway"~"^(footway|path|pedestrian|steps|living_street|residential|service|unclassified|road|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|track|cycleway|corridor|bridleway)$"](50.36,-104.81,50.53,-104.36);
        way["highway"~"^(trunk|trunk_link)$"]["foot"~"^(yes|designated|permissive)$"](50.36,-104.81,50.53,-104.36);
      );
      out body;
      >;
      out skel qt;

    e.g. curl --data-urlencode "data@query.overpassql" -o data/osm/regina-walk.osm.json https://overpass-api.de/api/interpreter
 2. npm run build:walk-graph        (or: node scripts/build-walk-graph.mjs <osm json>)

 Writes data/walk-graph.json (committed). Map data © OpenStreetMap contributors, under the Open Database
 License (ODbL, https://opendatacommons.org/licenses/odbl/); the graph is a derived database under the same licence.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.resolve(root, process.argv[2] ?? 'data/osm/regina-walk.osm.json');
const output = path.join(root, 'data/walk-graph.json');

if (!fs.existsSync(input)) {
    console.error(`No OpenStreetMap download at ${input}. See the top of this script for the query.`);
    process.exit(1);
}
const osm = JSON.parse(fs.readFileSync(input, 'utf8'));

// ── Which ways a person can walk, and how willingly ─────────────────────────

const ARTERIAL = /^(primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|trunk|trunk_link)$/;
const FOOT_OK = new Set(['yes', 'designated', 'permissive', 'destination', 'customers']);
const NO_ENTRY = new Set(['no', 'private']);

/** null = not walkable. Otherwise the cost factor: walking 1 m of it "costs" this many metres when choosing a path. */
function walkCost(tags) {
    const hw = tags.highway;
    if (tags.foot) {
        if (tags.foot === 'no' || tags.foot === 'use_sidepath' || tags.foot === 'private') return null;
    } else if (NO_ENTRY.has(tags.access)) return null;
    if ((hw === 'trunk' || hw === 'trunk_link') && !FOOT_OK.has(tags.foot)) return null;
    if (tags.area === 'yes' && hw !== 'pedestrian') return null;
    if (ARTERIAL.test(hw)) {
        // A busy road: use its sidewalk (mapped as its own footway) when there is one, the road edge only to connect
        const sw = tags.sidewalk ?? tags['sidewalk:both'];
        if (sw === 'separate') return 2;
        if (sw === 'no' || sw === 'none') return 3;
        if (sw === 'both' || sw === 'left' || sw === 'right' || sw === 'yes') return 1;
        return 1.3;
    }
    if (hw === 'service') return tags.service === 'parking_aisle' || tags.service === 'driveway' ? 1.15 : 1.05;
    if (hw === 'track') return 1.2;
    if (hw === 'steps') return 1.2;
    return 1;
}

// ── Nodes and ways ─────────────────────────────────────────────────────────

const coord = new Map();
for (const e of osm.elements) if (e.type === 'node') coord.set(e.id, [e.lat, e.lon]);

const ways = [];
for (const e of osm.elements) {
    if (e.type !== 'way' || !e.tags?.highway) continue;
    const cost = walkCost(e.tags);
    if (cost == null) continue;
    const nodes = e.nodes.filter(id => coord.has(id));
    if (nodes.length >= 2) ways.push({ nodes, cost });
}

// A graph node is wherever a way ends or two ways meet; the points in between are only shape
const uses = new Map();
for (const w of ways) w.nodes.forEach((id, i) => {
    const end = i === 0 || i === w.nodes.length - 1;
    uses.set(id, (uses.get(id) ?? 0) + (end ? 2 : 1));
});
const isJunction = id => uses.get(id) >= 2;

const R = 6371008.8, rad = Math.PI / 180;
function metres([lat1, lng1], [lat2, lng2]) {
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Split every way at its junctions into edges
const edges = [];   // { a, b (OSM ids), shape (OSM ids between), m, cost }
for (const w of ways) {
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
        if (!isJunction(w.nodes[i]) && i !== w.nodes.length - 1) continue;
        const seq = w.nodes.slice(start, i + 1);
        let m = 0;
        for (let k = 1; k < seq.length; k++) m += metres(coord.get(seq[k - 1]), coord.get(seq[k]));
        if (seq[0] !== seq[seq.length - 1] && m > 0) edges.push({ a: seq[0], b: seq[seq.length - 1], shape: seq.slice(1, -1), m, cost: w.cost });
        start = i;
    }
}

// ── Keep the largest connected network ─────────────────────────────────────
// Scraps not joined to the rest (a footway mapped alone in a parking lot) would trap a walk that starts there.

const adj = new Map();
for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b); adj.get(e.b).push(e.a);
}
const component = new Map();
let best = -1, bestSize = 0, next = 0;
for (const id of adj.keys()) {
    if (component.has(id)) continue;
    const c = next++, stack = [id];
    let size = 0;
    component.set(id, c);
    while (stack.length) {
        const n = stack.pop(); size++;
        for (const m of adj.get(n)) if (!component.has(m)) { component.set(m, c); stack.push(m); }
    }
    if (size > bestSize) { bestSize = size; best = c; }
}
const kept = edges.filter(e => component.get(e.a) === best);

// ── Write it compactly: coordinates as 1e-5 degree integers (about 1 m) ─────

const E5 = 1e5, q = v => Math.round(v * E5);
const index = new Map(), nodes = [];
const nodeIndex = id => {
    let i = index.get(id);
    if (i === undefined) { i = index.size; index.set(id, i); const [lat, lng] = coord.get(id); nodes.push(q(lat), q(lng)); }
    return i;
};
// edge: [from node, to node, length in decimetres, cost factor ×100, ...shape as lat,lng pairs]
const out = kept.map(e => [nodeIndex(e.a), nodeIndex(e.b), Math.round(e.m * 10), Math.round(e.cost * 100),
    ...e.shape.flatMap(id => coord.get(id).map(q))]);

const graph = {
    format: 'walk-graph/1',
    source: `OpenStreetMap via Overpass API, data as of ${osm.osm3s?.timestamp_osm_base ?? 'unknown'}`,
    license: 'Map data © OpenStreetMap contributors, Open Database License (ODbL) https://opendatacommons.org/licenses/odbl/',
    scale: E5,
    nodes,
    edges: out,
};
fs.writeFileSync(output, JSON.stringify(graph));

const km = kept.reduce((s, e) => s + e.m, 0) / 1000;
console.log(`walk graph: ${index.size} junctions, ${kept.length} edges, ${km.toFixed(0)} km walkable ` +
    `(dropped ${edges.length - kept.length} edges outside the main network) → ${path.relative(root, output)} ` +
    `(${(fs.statSync(output).size / 1e6).toFixed(1)} MB)`);
