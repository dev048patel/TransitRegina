/*
This is Frontend part. Rules and Settings of MAP
1. Map default settings
2. Type definitions
3. Constants(Model)
*/

// Type Definitions (ensures data consistency) 
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  west: number;
  east: number;
}

export interface MapRestriction {
  latLngBounds: MapBounds;
  strictBounds: boolean;
}

export interface MapOptions {
  styles?: any[];
  disableDefaultUI: boolean;
  zoomControl: boolean;
  restriction?: MapRestriction;
  gestureHandling?: string;
}

// The Model Object
/** Phones and tablets (a finger is the main pointer). A touchscreen laptop used with a mouse counts as desktop. */
export const isTouchDevice = (): boolean => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export const MapModel = {
  // Default Center (Regina)
  center: {
    lat: 50.44521,
    lng: -104.618896,
  } as Coordinates,

  // Configuration Options passed to Google Maps
  options: {
    // styles: mapStyles,
    disableDefaultUI: true,
    zoomControl: false,
    gestureHandling: 'greedy',
    restriction: {
      latLngBounds: {
        north: 50.53,
        south: 50.36,
        west: -104.81,
        east: -104.36,
      },
      strictBounds: true, // Prevents user from panning outside Regina
    },
  } as MapOptions,

  // Default Zoom Level
  defaultZoom: 11,

  // CSS Styles for the map container
  containerStyle: {
    // Fills MapView's wrapper, which is sized to the visible screen (100dvh) so phones don't hide the bottom
    width: '100%',
    height: '100%',
  } as React.CSSProperties,

  libraries: ['places'] as ("places" | "drawing" | "geometry" | "visualization")[],
};
