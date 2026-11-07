/* WalkRoute — a walking path along sidewalks, paths and streets (WalkRouteService on the backend, POST /api/walk) */

export interface WalkPoint { lat: number; lng: number }

export interface WalkRoute {
    /** From the start point to the end point, along the walkable ways */
    path: WalkPoint[];
    /** Length of that path in metres */
    meters: number;
}

/** The real walks of a tracked trip, for the map and the tracking panel (useWalkPathsController) */
export interface TripWalks {
    /** Drawn: the rider (live location, else where the trip was planned from) to the first stop */
    toStopPath: WalkPoint[] | null;
    /** Drawn: between bus i's get-off stop and bus i+1's stop; null where it's the same stop or there's no path */
    transferPaths: (WalkPoint[] | null)[];
    /** Drawn: the last stop to the destination */
    toDestPath: WalkPoint[] | null;
    /** Real walking metres from where the trip was planned, once known (undefined until then) */
    meters: { toStop?: number; transfers: (number | undefined)[]; toDest?: number };
    /** Minutes the real walks add to the planner's straight-line estimate (can be 0) */
    extraMinutes: number;
}
