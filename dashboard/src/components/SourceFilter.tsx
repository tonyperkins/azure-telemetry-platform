interface Props {
  metroEnabled:  boolean;
  flightEnabled: boolean;
  metroCount:    number;
  flightCount:   number;
  onToggleMetro: () => void;
  onToggleFlight: () => void;
  isFlightCircuitBreakerActive?: boolean;
  onShowCircuitBreakerModal?: () => void;
  flightConfigDisabled?: boolean;
  metroConfigDisabled?: boolean;
}

/**
 * Multi-select source filter using independent checkboxes.
 * User can enable metro only, flights only, or both simultaneously.
 * When a source is config-disabled (ENABLE_* = false), the button is greyed
 * out, non-interactive, and a tooltip explains the reason.
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
  flightConfigDisabled = false,
  metroConfigDisabled = false,
}: Props) {
  const handleFlightClick = () => {
    if (flightConfigDisabled) return; // blocked — config kill switch on
    if (isFlightCircuitBreakerActive && onShowCircuitBreakerModal) {
      onShowCircuitBreakerModal();
    } else {
      onToggleFlight();
    }
  };

  const handleMetroClick = () => {
    if (metroConfigDisabled) return;
    onToggleMetro();
  };

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Metro button */}
      <button
        onClick={handleMetroClick}
        disabled={metroConfigDisabled}
        title={metroConfigDisabled ? 'Metro ingestion is disabled in configuration (ENABLE_METRO_INGESTION=false)' : undefined}
        style={{
          background: metroConfigDisabled ? '#374151' : metroEnabled ? '#0D9488' : '#6B7280',
          color: metroConfigDisabled ? '#6B7280' : 'white',
          border: metroConfigDisabled ? '1px solid #4B5563' : 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: metroConfigDisabled ? 'not-allowed' : 'pointer',
          opacity: metroConfigDisabled ? 0.55 : 1,
          textDecoration: metroConfigDisabled ? 'line-through' : 'none',
          position: 'relative',
        }}
      >
        🚌 Metro ({metroCount})
        {metroConfigDisabled && (
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              background: '#6B7280',
              color: '#D1D5DB',
              fontSize: '9px',
              fontWeight: 700,
              borderRadius: '4px',
              padding: '1px 4px',
              border: '1px solid #4B5563',
              letterSpacing: '0.3px',
            }}
          >
            OFF
          </span>
        )}
      </button>

      {/* Flights button */}
      <button
        onClick={handleFlightClick}
        disabled={flightConfigDisabled}
        title={
          flightConfigDisabled
            ? 'Flight ingestion is disabled in configuration (ENABLE_FLIGHT_INGESTION=false). OpenSky API is not being polled.'
            : isFlightCircuitBreakerActive
              ? 'Flight API rate limited — click for details'
              : undefined
        }
        style={{
          background: flightConfigDisabled ? '#374151' : flightEnabled ? '#D97706' : '#6B7280',
          color: flightConfigDisabled ? '#6B7280' : 'white',
          border: flightConfigDisabled ? '1px solid #4B5563' : 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: flightConfigDisabled ? 'not-allowed' : 'pointer',
          opacity: flightConfigDisabled ? 0.55 : 1,
          position: 'relative',
        }}
      >
        ✈️ Flights ({flightCount})

        {/* Config-disabled badge */}
        {flightConfigDisabled && (
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              background: '#6B7280',
              color: '#D1D5DB',
              fontSize: '9px',
              fontWeight: 700,
              borderRadius: '4px',
              padding: '1px 4px',
              border: '1px solid #4B5563',
              letterSpacing: '0.3px',
            }}
          >
            OFF
          </span>
        )}

        {/* Circuit breaker indicator (only when not config-disabled) */}
        {!flightConfigDisabled && isFlightCircuitBreakerActive && (
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
