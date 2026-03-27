interface Props {
  metroEnabled:  boolean;
  flightEnabled: boolean;
  metroCount:    number;
  flightCount:   number;
  onToggleMetro: () => void;
  onToggleFlight: () => void;
  isFlightCircuitBreakerActive?: boolean;
  onShowCircuitBreakerModal?: () => void;
}

/**
 * Multi-select source filter using independent checkboxes.
 * User can enable metro only, flights only, or both simultaneously.
 */
export function SourceFilter({
  metroEnabled,
  flightEnabled,
  metroCount,
  flightCount,
  onToggleMetro,
  onToggleFlight,
  isFlightCircuitBreakerActive = false,
  onShowCircuitBreakerModal,
}: Props) {
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      fontFamily: "'Inter', sans-serif",
    }}>
      <button
        onClick={onToggleMetro}
        style={{
          background: metroEnabled ? '#0D9488' : '#6B7280',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
        }}
      >
        🚌 Metro ({metroCount})
      </button>

      <button
        onClick={() => {
          if (isFlightCircuitBreakerActive && onShowCircuitBreakerModal) {
            onShowCircuitBreakerModal();
          } else {
            onToggleFlight();
          }
        }}
        style={{
          background: flightEnabled ? '#D97706' : '#6B7280',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        ✈️ Flights ({flightCount})
        {isFlightCircuitBreakerActive && (
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              width: '16px',
              height: '16px',
              background: '#EF4444',
              borderRadius: '50%',
              border: '2px solid white',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)',
            }}
            title="Flight API rate limited - Click for details"
          />
        )}
      </button>
    </div>
  );
}
