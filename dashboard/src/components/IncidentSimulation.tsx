import { useState } from 'react';

interface Props {
  simulateMetroFailure: boolean;
  simulateLatency: boolean;
  simulateErrors: boolean;
  onToggleMetroFailure: () => void;
  onToggleLatency: () => void;
  onToggleErrors: () => void;
  onOpenRunbook?: () => void;
}

export function IncidentSimulation({
  simulateMetroFailure,
  simulateLatency,
  simulateErrors,
  onToggleMetroFailure,
  onToggleLatency,
  onToggleErrors,
  onOpenRunbook,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        zIndex: 1000,
        background: 'var(--bg-base)',
        border: '2px solid #F59E0B',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        fontFamily: "'Inter', sans-serif",
        minWidth: '320px',
        maxWidth: '400px',
      }}
    >
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 16px',
          background: '#FEF3C7',
          borderTopLeftRadius: '6px',
          borderTopRightRadius: '6px',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#92400E', marginBottom: '2px' }}>
            ⚡ Incident Simulation
          </div>
          <div style={{ fontSize: '11px', color: '#78350F' }}>
            Simulate failure scenarios to demonstrate observability
          </div>
        </div>
        <span style={{ fontSize: '12px', color: '#92400E' }}>
          {isExpanded ? '▼' : '▲'}
        </span>
      </div>

      {/* Content */}
      {isExpanded && (
        <div style={{ padding: '16px' }}>
          <SimulationToggle
            label="Simulate Metro Feed Failure"
            description="Stops polling Metro data, health indicator flips to unhealthy"
            enabled={simulateMetroFailure}
            onToggle={onToggleMetroFailure}
          />
          <SimulationToggle
            label="Simulate API Latency"
            description="Adds 2-3 second delay to all API responses"
            enabled={simulateLatency}
            onToggle={onToggleLatency}
          />
          <SimulationToggle
            label="Simulate High Error Rate"
            description="Randomly fails 20% of vehicle data fetches"
            enabled={simulateErrors}
            onToggle={onToggleErrors}
          />
          
          {onOpenRunbook && (
            <button
              onClick={onOpenRunbook}
              style={{
                width: '100%',
                marginTop: '8px',
                background: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              📋 Runbook
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SimulationToggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        marginBottom: '12px',
        paddingBottom: '12px',
        borderBottom: '1px solid #E5E7EB',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}>
          {label}
        </label>
        <button
          onClick={onToggle}
          style={{
            position: 'relative',
            width: '44px',
            height: '24px',
            background: enabled ? '#10B981' : '#D1D5DB',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '2px',
              left: enabled ? '22px' : '2px',
              width: '20px',
              height: '20px',
              background: 'var(--bg-base)',
              borderRadius: '50%',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
            }}
          />
        </button>
      </div>
      <div style={{ fontSize: '11px', color: '#6B7280' }}>
        {description}
      </div>
    </div>
  );
}
