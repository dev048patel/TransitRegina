/* Props interface for the BusSuggestionPanel component — defines trip options, bus positions, and callbacks */
import { TripOption } from '../transit/RoutePlanning';
import { BusPosition } from '../transit/BusPosition';
import type { WeatherSnapshot } from '../services/WeatherService';
import type { MarkerCharacterId } from '../data/markerCharacters';

export interface BusSuggestionPanelProps {
    destination: { lat: number; lng: number; name: string };
    onClose: () => void;
    /** `rank`: which option the rider chose (0 = the top one), for the admin Usage page */
    onSelectRoute?: (option: TripOption, rank?: number) => void;
    /** A planned-for-later trip to draw on the map (walks, buses, stops), or null when none is previewed */
    onPreviewTrip?: (trip: TripOption | null) => void;
    liveBuses?: BusPosition[];
    weather?: WeatherSnapshot | null;
    /** The user's map character — sets the panel's wording and the face on each card. */
    character?: MarkerCharacterId;
}
