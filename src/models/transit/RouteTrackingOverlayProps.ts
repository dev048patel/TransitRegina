/* Props interface for RouteTrackingOverlay — passes the active trip to render map polylines and markers */
import { TripOption } from './RoutePlanning';
import type { TripWalks } from './WalkRoute';

export interface RouteTrackingOverlayProps {
    tripOption: TripOption;
    /** The trip's walks along sidewalks and paths (useTripWalksController); straight lines until they arrive */
    walks?: TripWalks | null;
    /** A trip planned for later, shown before it starts: drawn from where it was planned (not the GPS), every bus
        at full strength, and each boarding stop marked with its route number */
    preview?: boolean;
}
