/**
 * MapPage.tsx — Transit Regina
 *
 * Extracted from App.tsx so it can be React.lazy()-loaded.
 * This keeps the heavy map bundle (Google Maps + transitShapes.json)
 * out of the initial download for landing page visitors.
 */

import React from 'react';
import { MapView } from './MapView';
import { useMapController } from '../controllers/useMapController';
import DepartureReminderBanner from './DepartureReminderBanner';
import WeatherBanner from './WeatherBanner';
import LiveStatus from './components/transit/LiveStatus';
import LocationPrompt from './components/transit/LocationPrompt';
import { useLocationConsent } from '../controllers/useLocationConsent';
import { useServiceNoticeController } from '../controllers/useServiceNoticeController';

export default function MapPage() {
    const {
        isLoaded, loadError, center, setCenter, options, containerStyle,
        zoom, setZoom, stops, routes, selectedRoute, setSelectedRoute,
        routePaths, liveBuses, handlePlaceSelect, handleMapPlacePick, selectedPlaceMarker,
        setSelectedPlaceMarker, currentZoom, onZoomChanged,
        activeDetours, weather, liveDown, noBusesReporting, linkedStop,
    } = useMapController();
    const notice = useServiceNoticeController();
    // Every visit to the map asks for location again, unless the rider already allowed it
    const { askAgainOnMapOpen } = useLocationConsent();
    React.useEffect(askAgainOnMapOpen, [askAgainOnMapOpen]);

    return (
        <>
        <WeatherBanner weather={weather} />
        <DepartureReminderBanner />
        <LiveStatus liveDown={liveDown} noBuses={noBusesReporting} notice={notice} />
        <LocationPrompt />
        <MapView
            isLoaded={isLoaded}
            loadError={loadError}
            center={center}
            setCenter={setCenter}
            options={options}
            containerStyle={containerStyle}
            zoom={zoom}
            setZoom={setZoom}
            stops={stops}
            routes={routes}
            selectedRoute={selectedRoute}
            setSelectedRoute={setSelectedRoute}
            routePaths={routePaths}
            liveBuses={liveBuses}
            handlePlaceSelect={handlePlaceSelect}
            handleMapPlacePick={handleMapPlacePick}
            selectedPlaceMarker={selectedPlaceMarker}
            setSelectedPlaceMarker={setSelectedPlaceMarker}
            currentZoom={currentZoom}
            onZoomChanged={onZoomChanged}
            activeDetours={activeDetours}
            weather={weather}
            linkedStop={linkedStop}
        />
        </>
    );
}
