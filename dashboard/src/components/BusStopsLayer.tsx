import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { BusStop } from '../hooks/useBusStops';

interface Props {
  stops: BusStop[];
  zoom:  number;
}

const MIN_ZOOM_FOR_STOPS = 14; // Only show stops when zoomed in close

/**
 * Renders bus stop markers only when zoomed in to zoom level 14+.
 * At lower zoom levels, ~2,500 markers would overwhelm the map.
 *
 * Uses Leaflet's LayerGroup for efficient batch add/remove instead of
 * individual marker management.
 */
export function BusStopsLayer({ stops, zoom }: Props) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    // Remove existing layer if zoom is too low
    if (zoom < MIN_ZOOM_FOR_STOPS) {
      layerRef.current?.remove();
      layerRef.current = null;
      return;
    }

    // Create layer if it doesn't exist
    if (!layerRef.current) {
      const layer = L.layerGroup();

      // Get current map bounds to only render visible stops
      const bounds = map.getBounds();

      for (const stop of stops) {
        // Skip stops outside the current viewport
        if (!bounds.contains([stop.lat, stop.lon])) continue;

        const icon = L.divIcon({
          html: `
            <svg width="8" height="8" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" fill="#0D9488" stroke="white" stroke-width="1"/>
            </svg>
          `,
          className: '',
          iconSize: [8, 8],
          iconAnchor: [4, 4],
        });

        const popup = `
          <div style="font-family:'Inter',sans-serif;min-width:120px;">
            <div style="font-weight:600;font-size:12px;margin-bottom:2px;">${stop.name}</div>
            <div style="font-size:10px;color:#666;">Stop ID: ${stop.stopId}</div>
          </div>
        `;

        const marker = L.marker([stop.lat, stop.lon], { icon }).bindPopup(popup);
        layer.addLayer(marker);
      }

      layer.addTo(map);
      layerRef.current = layer;
    }

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [map, stops, zoom]);

  return null;
}
