/*
 MapFit — the map view (centre and whole-number zoom) that shows a set of points inside the part of the map a
 card doesn't cover. Google's own fitBounds does this too, but the map is held inside Regina (strictBounds): on a
 tall phone screen the zoom fitBounds picks can be too far out to allow, and Google then zooms back in while
 keeping the centre it worked out for the farther zoom, leaving the points under the card or off the screen.
 Here the zoom is never below what Regina's bounds allow, and the centre is worked out for the zoom used.
*/

export interface LatLngPoint { lat: number; lng: number }
export interface Padding { top: number; bottom: number; left: number; right: number }
export interface Box { north: number; south: number; east: number; west: number }

/** Web Mercator, in Google's world coordinates (256 units across at zoom 0) */
const worldX = (lng: number) => (lng + 180) / 360 * 256;
const worldY = (lat: number) => {
    const s = Math.sin(lat * Math.PI / 180);
    return 128 - Math.log((1 + s) / (1 - s)) * 256 / (4 * Math.PI);
};
const lngOf = (x: number) => x / 256 * 360 - 180;
const latOf = (y: number) => Math.atan(Math.sinh((128 - y) * 2 * Math.PI / 256)) * 180 / Math.PI;

/**
 * Centre and zoom that put `points` inside the map's `width` × `height` minus `padding`, as close in as
 * `maxZoom` allows. With `restriction` (the map's strict bounds) the zoom is never farther out than those
 * bounds allow; if the points don't fit even then, they are centred in the uncovered part anyway.
 */
export function viewForPoints(points: LatLngPoint[], width: number, height: number, padding: Padding,
    { maxZoom = 17, restriction }: { maxZoom?: number; restriction?: Box } = {}): { center: LatLngPoint; zoom: number } | null {
    if (!points.length || width <= 0 || height <= 0) return null;
    const xs = points.map(p => worldX(p.lng)), ys = points.map(p => worldY(p.lat));
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const availW = Math.max(1, width - padding.left - padding.right);
    const availH = Math.max(1, height - padding.top - padding.bottom);

    // Closest zoom at which the points' span fits the uncovered part (a single point: the closest allowed)
    const spanW = maxX - minX, spanH = maxY - minY;
    let zoom = Math.min(maxZoom, Math.floor(Math.log2(Math.min(
        spanW > 0 ? availW / spanW : Infinity,
        spanH > 0 ? availH / spanH : Infinity,
    ))));
    if (!Number.isFinite(zoom)) zoom = maxZoom;
    // Not farther out than the whole map may show: the view must fit inside the restriction
    if (restriction) {
        const rW = worldX(restriction.east) - worldX(restriction.west);
        const rH = worldY(restriction.south) - worldY(restriction.north);
        zoom = Math.max(zoom, Math.ceil(Math.log2(Math.max(width / rW, height / rH))));
    }
    zoom = Math.min(zoom, maxZoom);

    // The points' middle sits in the middle of the uncovered part: shift the map's centre by half the difference
    // between the paddings, in world units at this zoom
    const scale = 2 ** zoom;
    const cx = (minX + maxX) / 2 - (padding.left - padding.right) / 2 / scale;
    const cy = (minY + maxY) / 2 - (padding.top - padding.bottom) / 2 / scale;
    return { center: { lat: latOf(cy), lng: lngOf(cx) }, zoom };
}
