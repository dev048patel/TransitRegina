/* Props interface for RouteTrackingOverlay — passes the active trip to render map polylines and markers */
import { TripOption } from './RoutePlanning';
import type { TripWalks } from './WalkRoute';

export interface RouteTrackingOverlayProps {
    tripOption: TripOption;
    /** The trip's walks along sidewalks and paths (useTripWalksController); straight lines until they arrive */
    walks?: TripWalks | null;
}
