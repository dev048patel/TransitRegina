/* Props interface for the TrackingPanel component — defines the active trip and stop-tracking callbacks */
import { TripOption } from '../transit/RoutePlanning';
import type { TripWalks } from '../transit/WalkRoute';

export interface TrackingPanelProps {
    tripOption: TripOption;
    /** The trip's real walks (useTripWalksController): their distances and the minutes they add */
    walks?: TripWalks | null;
    onStopTracking: () => void;
    onBack?: () => void;
    /** The place the rider searched for, named in trip texts */
    destinationName?: string;
}
