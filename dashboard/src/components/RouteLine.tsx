import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { RouteDirection } from '../types/vehicle';

interface Props {
  routeId:     string;
  direction:   RouteDirection;
  color:       string;
  isSelected:  boolean;
}

const MIN_POINTS = 2;

/**
 * Renders a single route direction as a polyline.
 * Selected routes show in their route color with a shadow effect.
 * Unselected routes (when filtering is active) show as ghost lines.
 * 
 * Direction indication is now handled by the teardrop bus marker rotation.
 */
export function RouteLine({
  direction,
  color,
  isSelected,
}: Props) {
  const map = useMap();
  const shadowLineRef = useRef<L.Polyline | null>(null);
  const mainLineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    const shape = direction.shape;
    if (shape.length < MIN_POINTS) return;

    if (isSelected) {
      // Selected route: show with color and shadow effect
      
      // Shadow line (rendered first, appears below)
      if (!shadowLineRef.current) {
        shadowLineRef.current = L.polyline(shape, {
          color,
          weight: 4,
          opacity: 0.15,
          lineCap: 'round',
          lineJoin: 'round',
          pane: 'routeLines',
        }).addTo(map);
      } else {
        shadowLineRef.current.setLatLngs(shape);
        shadowLineRef.current.setStyle({ color });
      }

      // Main colored line
      if (!mainLineRef.current) {
        mainLineRef.current = L.polyline(shape, {
          color,
          weight: 2,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
          pane: 'routeLines',
        }).addTo(map);
      } else {
        mainLineRef.current.setLatLngs(shape);
        mainLineRef.current.setStyle({ color });
      }
    } else {
      // Unselected route: ghost line
      // Remove shadow if it exists
      if (shadowLineRef.current) {
        shadowLineRef.current.remove();
        shadowLineRef.current = null;
      }

      // Show thin gray ghost line
      if (!mainLineRef.current) {
        mainLineRef.current = L.polyline(shape, {
          color: '#CBD5E1',
          weight: 1.5,
          opacity: 0.3,
          lineCap: 'round',
          lineJoin: 'round',
          pane: 'routeLines',
        }).addTo(map);
      } else {
        mainLineRef.current.setLatLngs(shape);
        mainLineRef.current.setStyle({
          color: '#CBD5E1',
          weight: 1.5,
          opacity: 0.3,
        });
      }
    }

    return () => {
      if (shadowLineRef.current) {
        shadowLineRef.current.remove();
        shadowLineRef.current = null;
      }
      if (mainLineRef.current) {
        mainLineRef.current.remove();
        mainLineRef.current = null;
      }
    };
  }, [direction, color, isSelected, map]);

  return null;
}
