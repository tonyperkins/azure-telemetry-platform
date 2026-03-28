import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

type MapStyle = 'light' | 'dark' | 'streets';

interface MapStyleConfig {
  url: string;
  label: string;
  icon: string;
}

const MAP_STYLES: Record<MapStyle, MapStyleConfig> = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    label: 'Light',
    icon: '☀',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    label: 'Dark',
    icon: '🌙',
  },
  streets: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    label: 'Streets',
    icon: '🗺',
  },
};

interface Props {
  onThemeChange?: (isDark: boolean) => void;
}

export function MapStyleToggle({ onThemeChange }: Props) {
  const map = useMap();
  const [currentStyle, setCurrentStyle] = useState<MapStyle>(() => {
    const saved = localStorage.getItem('mapStyle');
    return (saved as MapStyle) || 'light';
  });

  useEffect(() => {
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        const newUrl = MAP_STYLES[currentStyle].url;
        layer.setUrl(newUrl);
      }
    });

    localStorage.setItem('mapStyle', currentStyle);

    if (onThemeChange) {
      onThemeChange(currentStyle === 'dark');
    }
  }, [currentStyle, map, onThemeChange]);

  const handleStyleChange = (style: MapStyle) => {
    setCurrentStyle(style);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        background: '#FFFFFF',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        padding: '6px',
        display: 'flex',
        gap: '4px',
      }}
    >
      {(Object.keys(MAP_STYLES) as MapStyle[]).map((style) => (
        <button
          key={style}
          onClick={() => handleStyleChange(style)}
          title={MAP_STYLES[style].label}
          style={{
            background: currentStyle === style ? '#3B82F6' : 'transparent',
            color: currentStyle === style ? '#FFFFFF' : '#6B7280',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 10px',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {MAP_STYLES[style].icon}
        </button>
      ))}
    </div>
  );
}
