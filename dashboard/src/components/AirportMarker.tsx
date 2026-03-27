import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

const ABIA_COORDS: [number, number] = [30.1945, -97.6699]; // Austin-Bergstrom International Airport

/**
 * Renders a permanent marker for Austin-Bergstrom International Airport (ABIA).
 * Always visible regardless of zoom level.
 */
export function AirportMarker() {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const icon = L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#DC2626" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="11" fill="white" opacity="0.9"/>
            <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="#DC2626"/>
          </svg>
          <span style="
            font-family:'Inter',sans-serif;
            font-size:11px;
            font-weight:700;
            color:#1A202C;
            background:rgba(255,255,255,0.95);
            border-radius:3px;
            padding:2px 5px;
            margin-top:2px;
            white-space:nowrap;
            box-shadow:0 1px 3px rgba(0,0,0,0.2);
          ">AUS Airport</span>
        </div>
      `,
      className: '',
      iconSize: [80, 50],
      iconAnchor: [40, 25],
    });

    const popup = `
      <div style="font-family:'Inter',sans-serif;min-width:150px;">
        <div style="font-weight:600;margin-bottom:4px;">Austin-Bergstrom International</div>
        <div style="font-size:12px;color:#666;">IATA: AUS • ICAO: KAUS</div>
        <div style="font-size:11px;color:#888;margin-top:4px;">
          ${ABIA_COORDS[0].toFixed(4)}°N, ${Math.abs(ABIA_COORDS[1]).toFixed(4)}°W
        </div>
      </div>
    `;

    if (!markerRef.current) {
      markerRef.current = L.marker(ABIA_COORDS, { icon })
        .bindPopup(popup)
        .addTo(map);
    }

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map]);

  return null;
}
