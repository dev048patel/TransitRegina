/**
 * WalkRouteService (backend) — the walking path between two points along Regina's sidewalks, paths, crossings and
 * streets, so a walk to or from a stop is drawn (and timed) along where people can actually walk, not in a straight
 * line through buildings.
 *
 * Routes on data/walk-graph.json, built from OpenStreetMap by scripts/build-walk-graph.mjs
 * (map data © OpenStreetMap contributors, ODbL). Each end is snapped to the nearest walkable way, then A* finds
 * the path of least "cost": length × the way's cost factor, so a busy road with its own sidewalk mapped beside it
 * is avoided in favour of that sidewalk. The distance returned is the real length walked.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { WalkPoint, WalkRoute } from '../transit/WalkRoute';

const GRAPH_FILE = process.env.WALK_GRAPH_FILE || path.resolve(__dirname, '../../../data/walk-graph.json');
/** A point further than this from every walkable way isn't routed (the caller draws a straight line instead) */
const MAX_SNAP_M = 400;
/** Walks are short; this bounds the work one request can cause */
export const MAX_WALK_STRAIGHT_M = 5000;

const M_PER_DEG_LAT = 111_320;
const CELL_DEG = 0.002;   // spatial index cell: about 220 m north-south, 140 m east-west at Regina

const R = 6371008.8, RAD = Math.PI / 180;
export function haversine(a: WalkPoint, b: WalkPoint): number {
    const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

interface Graph {
    nodeCount: number;
    nodeLat: Float64Array; nodeLng: Float64Array;
    edgeA: Int32Array; edgeB: Int32Array;
    edgeLen: Float64Array;     // metres
    edgeCost: Float64Array;    // metres × cost factor
    /** Each edge's full polyline (A, shape…, B) lives at polyLat/polyLng[polyStart[e] .. polyStart[e + 1]) */
    polyStart: Int32Array; polyLat: Float64Array; polyLng: Float64Array;
    /** Node → its edges: adjEdge[adjStart[n] .. adjStart[n + 1]) */
    adjStart: Int32Array; adjEdge: Int32Array;
    /** Spatial index: cell → edges with a segment touching it */
    cells: Map<number, number[]>;
}

let graph: Graph | null = null;

const cellOf = (lat: number, lng: number) => [Math.floor(lat / CELL_DEG), Math.floor(lng / CELL_DEG)] as const;
const cellKey = (row: number, col: number) => row * 1_000_000 + col;

function load(): Graph {
    const raw = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8')) as { scale: number; nodes: number[]; edges: number[][] };
    const s = raw.scale, nodeCount = raw.nodes.length / 2, E = raw.edges.length;
    const nodeLat = new Float64Array(nodeCount), nodeLng = new Float64Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) { nodeLat[i] = raw.nodes[2 * i] / s; nodeLng[i] = raw.nodes[2 * i + 1] / s; }

    const edgeA = new Int32Array(E), edgeB = new Int32Array(E), edgeLen = new Float64Array(E), edgeCost = new Float64Array(E);
    const polyStart = new Int32Array(E + 1);
    let points = 0;
    raw.edges.forEach((e, i) => { polyStart[i] = points; points += 2 + (e.length - 4) / 2; });
    polyStart[E] = points;
    const polyLat = new Float64Array(points), polyLng = new Float64Array(points);
    const degree = new Int32Array(nodeCount);
    raw.edges.forEach(([a, b, dm, cost, ...shape], i) => {
        edgeA[i] = a; edgeB[i] = b; edgeLen[i] = dm / 10; edgeCost[i] = (dm / 10) * (cost / 100);
        degree[a]++; degree[b]++;
        let p = polyStart[i];
        polyLat[p] = nodeLat[a]; polyLng[p++] = nodeLng[a];
        for (let k = 0; k < shape.length; k += 2) { polyLat[p] = shape[k] / s; polyLng[p++] = shape[k + 1] / s; }
        polyLat[p] = nodeLat[b]; polyLng[p] = nodeLng[b];
    });

    const adjStart = new Int32Array(nodeCount + 1);
    for (let n = 0; n < nodeCount; n++) adjStart[n + 1] = adjStart[n] + degree[n];
    const fill = adjStart.slice(0, nodeCount), adjEdge = new Int32Array(adjStart[nodeCount]);
    for (let e = 0; e < E; e++) { adjEdge[fill[edgeA[e]]++] = e; adjEdge[fill[edgeB[e]]++] = e; }

    const cells = new Map<number, number[]>();
    for (let e = 0; e < E; e++) {
        for (let p = polyStart[e]; p < polyStart[e + 1] - 1; p++) {
            const [r1, c1] = cellOf(polyLat[p], polyLng[p]), [r2, c2] = cellOf(polyLat[p + 1], polyLng[p + 1]);
            for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
                const k = cellKey(r, c);
                let list = cells.get(k);
                if (!list) cells.set(k, list = []);
                if (list[list.length - 1] !== e) list.push(e);
            }
        }
    }
    return { nodeCount, nodeLat, nodeLng, edgeA, edgeB, edgeLen, edgeCost, polyStart, polyLat, polyLng, adjStart, adjEdge, cells };
}

/** Where a point meets the walkable network: on edge `edge`, segment `seg` (polyline points seg → seg+1) */
interface Snap { edge: number; seg: number; point: WalkPoint; distance: number; /** metres along the edge from A */ along: number }

function snap(g: Graph, p: WalkPoint): Snap | null {
    const kx = M_PER_DEG_LAT * Math.cos(p.lat * RAD), ky = M_PER_DEG_LAT;
    const [row, col] = cellOf(p.lat, p.lng);
    const reachRows = Math.ceil(MAX_SNAP_M / (CELL_DEG * ky)), reachCols = Math.ceil(MAX_SNAP_M / (CELL_DEG * kx));
    let best: { edge: number; seg: number; t: number; d2: number } | null = null;
    const seen = new Set<number>();
    for (let r = row - reachRows; r <= row + reachRows; r++) for (let c = col - reachCols; c <= col + reachCols; c++) {
        for (const e of g.cells.get(cellKey(r, c)) ?? []) {
            if (seen.has(e)) continue;
            seen.add(e);
            for (let i = g.polyStart[e]; i < g.polyStart[e + 1] - 1; i++) {
                // Flat projection around p: fine over a few hundred metres
                const ax = (g.polyLng[i] - p.lng) * kx, ay = (g.polyLat[i] - p.lat) * ky;
                const bx = (g.polyLng[i + 1] - p.lng) * kx, by = (g.polyLat[i + 1] - p.lat) * ky;
                const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
                const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
                const x = ax + t * dx, y = ay + t * dy, d2 = x * x + y * y;
                if (!best || d2 < best.d2) best = { edge: e, seg: i - g.polyStart[e], t, d2 };
            }
        }
    }
    if (!best || best.d2 > MAX_SNAP_M * MAX_SNAP_M) return null;
    const i = g.polyStart[best.edge] + best.seg;
    const point = { lat: g.polyLat[i] + best.t * (g.polyLat[i + 1] - g.polyLat[i]), lng: g.polyLng[i] + best.t * (g.polyLng[i + 1] - g.polyLng[i]) };
    let along = 0;
    for (let k = g.polyStart[best.edge]; k < i; k++) along += haversine(pt(g, k), pt(g, k + 1));
    along += haversine(pt(g, i), point);
    return { edge: best.edge, seg: best.seg, point, distance: Math.sqrt(best.d2), along: Math.min(along, g.edgeLen[best.edge]) };
}

const pt = (g: Graph, k: number): WalkPoint => ({ lat: g.polyLat[k], lng: g.polyLng[k] });

/** An edge's polyline points, A→B or B→A */
function edgePoints(g: Graph, e: number, fromA: boolean): WalkPoint[] {
    const out: WalkPoint[] = [];
    for (let k = g.polyStart[e]; k < g.polyStart[e + 1]; k++) out.push(pt(g, k));
    return fromA ? out : out.reverse();
}

/** Min-heap of node indices keyed by priority */
class Heap {
    private items: number[] = []; private keys: number[] = [];
    get size() { return this.items.length; }
    push(item: number, key: number) {
        const it = this.items, ks = this.keys;
        let i = it.length; it.push(item); ks.push(key);
        while (i > 0) { const p = (i - 1) >> 1; if (ks[p] <= key) break; it[i] = it[p]; ks[i] = ks[p]; i = p; }
        it[i] = item; ks[i] = key;
    }
    peekKey() { return this.keys[0]; }
    pop(): number {
        const it = this.items, ks = this.keys, top = it[0], lastItem = it.pop()!, lastKey = ks.pop()!;
        if (it.length) {
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i, mk = lastKey;
                if (l < it.length && ks[l] < mk) { m = l; mk = ks[l]; }
                if (r < it.length && ks[r] < mk) { m = r; mk = ks[r]; }
                if (m === i) break;
                it[i] = it[m]; ks[i] = ks[m]; i = m;
            }
            it[i] = lastItem; ks[i] = lastKey;
        }
        return top;
    }
}

function pathLength(points: WalkPoint[]): number {
    let m = 0;
    for (let i = 1; i < points.length; i++) m += haversine(points[i - 1], points[i]);
    return m;
}

/** Drops consecutive repeats (the snap point often coincides with a polyline point) */
function tidy(points: WalkPoint[]): WalkPoint[] {
    const out: WalkPoint[] = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (!last || Math.abs(last.lat - p.lat) > 1e-7 || Math.abs(last.lng - p.lng) > 1e-7) out.push(p);
    }
    return out.map(p => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 }));
}

export const WalkRouteService = {
    /**
     * The walking path from `from` to `to`, or null when either point is too far from any walkable way
     * (or the two are too far apart). Callers fall back to a straight line then.
     */
    route(from: WalkPoint, to: WalkPoint): WalkRoute | null {
        if (haversine(from, to) > MAX_WALK_STRAIGHT_M) return null;
        const g = graph ??= load();
        const s = snap(g, from), t = snap(g, to);
        if (!s || !t) return null;

        // Polyline pieces from a snap point to each end of its edge
        const sPoly = edgePoints(g, s.edge, true);
        const sToA = [s.point, ...sPoly.slice(0, s.seg + 1).reverse()], sToB = [s.point, ...sPoly.slice(s.seg + 1)];
        const tPoly = edgePoints(g, t.edge, true);
        const aToT = [...tPoly.slice(0, t.seg + 1), t.point], bToT = [...tPoly.slice(t.seg + 1), t.point];
        const sFactor = g.edgeCost[s.edge] / (g.edgeLen[s.edge] || 1), tFactor = g.edgeCost[t.edge] / (g.edgeLen[t.edge] || 1);
        const tA = g.edgeA[t.edge], tB = g.edgeB[t.edge];
        const tExtra = (n: number) => n === tA ? t.along * tFactor : (g.edgeLen[t.edge] - t.along) * tFactor;

        // Both on the same edge: walking straight along it is one candidate
        let bestCost = Infinity, bestEnd = -1;
        let direct: WalkPoint[] | null = null;
        if (s.edge === t.edge) {
            bestCost = Math.abs(s.along - t.along) * sFactor;
            direct = s.along <= t.along
                ? [s.point, ...sPoly.slice(s.seg + 1, t.seg + 1), t.point]
                : [s.point, ...sPoly.slice(t.seg + 1, s.seg + 1).reverse(), t.point];
        }

        // A* from both ends of the start edge
        const cost = new Float64Array(g.nodeCount).fill(Infinity);
        const via = new Int32Array(g.nodeCount).fill(-1);   // edge used to reach the node; -1 = start edge
        const done = new Uint8Array(g.nodeCount);
        const h = (n: number) => haversine({ lat: g.nodeLat[n], lng: g.nodeLng[n] }, t.point);
        const heap = new Heap();
        const sA = g.edgeA[s.edge], sB = g.edgeB[s.edge];
        cost[sA] = s.along * sFactor; heap.push(sA, cost[sA] + h(sA));
        const startB = (g.edgeLen[s.edge] - s.along) * sFactor;
        if (startB < cost[sB]) { cost[sB] = startB; heap.push(sB, startB + h(sB)); }

        let expansions = 0;
        while (heap.size && heap.peekKey() < bestCost && expansions++ < 400_000) {
            const n = heap.pop();
            if (done[n]) continue;
            done[n] = 1;
            if ((n === tA || n === tB) && cost[n] + tExtra(n) < bestCost) { bestCost = cost[n] + tExtra(n); bestEnd = n; }
            for (let k = g.adjStart[n]; k < g.adjStart[n + 1]; k++) {
                const e = g.adjEdge[k], m = g.edgeA[e] === n ? g.edgeB[e] : g.edgeA[e];
                const c = cost[n] + g.edgeCost[e];
                if (c < cost[m]) { cost[m] = c; via[m] = e; heap.push(m, c + h(m)); }
            }
        }

        let points: WalkPoint[];
        if (bestEnd === -1) {
            if (!direct) return null;   // not connected (shouldn't happen: the graph is one network)
            points = direct;
        } else {
            // Walk back from the end node to the start edge, then lay the polylines out forwards
            const chain: { edge: number; to: number }[] = [];
            let n = bestEnd;
            while (via[n] !== -1) { const e = via[n]; chain.push({ edge: e, to: n }); n = g.edgeA[e] === n ? g.edgeB[e] : g.edgeA[e]; }
            chain.reverse();
            points = [...(n === sA ? sToA : sToB)];
            for (const { edge, to } of chain) points.push(...edgePoints(g, edge, g.edgeB[edge] === to));
            points.push(...(bestEnd === tA ? aToT : bToT));
        }
        const full = tidy([from, ...points, to]);
        return { path: full, meters: Math.round(pathLength(full)) };
    },

    /** For tests: route on another graph file */
    _reset() { graph = null; },
};
