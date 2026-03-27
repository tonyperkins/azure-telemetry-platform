import { useMap } from 'react-leaflet';

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431];

/**
 * Floating "home" button that recenters the map on Austin.
 * Positioned in the top-right corner below the zoom controls.
 */
export function RecenterButton() {
  const map = useMap();

  const handleRecenter = () => {
    map.setView(AUSTIN_CENTER, 10, { animate: true, duration: 0.5 });
  };

  return (
    <button
      onClick={handleRecenter}
      style={{
        position: 'absolute',
        top: '90px',
        right: '10px',
        zIndex: 1000,
        width: '34px',
        height: '34px',
        background: 'white',
        border: '2px solid rgba(0,0,0,0.2)',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f4f4')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
      title="Recenter on Austin"
      aria-label="Recenter map on Austin"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#333"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" fill="#333" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    </button>
  );
}
