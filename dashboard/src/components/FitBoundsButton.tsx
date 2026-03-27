import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';

interface Props {
  vehicles: Array<{ latitude: number; longitude: number }>;
}

export function FitBoundsButton({ vehicles }: Props) {
  const map = useMap();

  useEffect(() => {
    const FitBoundsControl = L.Control.extend({
      onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', '', container);
        
        button.innerHTML = '⊕';
        button.href = '#';
        button.title = 'Fit all vehicles';
        button.style.fontSize = '20px';
        button.style.lineHeight = '30px';
        button.style.width = '30px';
        button.style.height = '30px';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.textDecoration = 'none';
        button.style.color = '#000';
        button.style.background = '#fff';

        L.DomEvent.on(button, 'click', function (e) {
          L.DomEvent.preventDefault(e);
          
          if (vehicles.length === 0) return;

          const bounds = L.latLngBounds(
            vehicles.map(v => [v.latitude, v.longitude] as [number, number])
          );
          
          map.fitBounds(bounds, { padding: [40, 40] });
        });

        return container;
      },
    });

    const control = new FitBoundsControl({ position: 'topleft' });
    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map, vehicles]);

  return null;
}
