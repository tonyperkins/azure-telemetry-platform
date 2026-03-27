import { useEffect, useState } from 'react';
import { HealthStatus } from '../types/vehicle';

interface Props {
  metroCount: number;
  flightCount: number;
  lastUpdated: Date | null;
  isStale: boolean;
  health: HealthStatus | null;
}

function HealthDot({ status }: { status: 'healthy' | 'degraded' | 'unhealthy' }) {
  const color = status === 'healthy' ? '#10B981' : status === 'degraded' ? '#F59E0B' : '#EF4444';
  return (
    <span
      title={status}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        marginLeft: 4,
        verticalAlign: 'middle',
      }}
    />
  );
}

function useElapsedSeconds(since: Date | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!since) return;
    const tick = () => setElapsed(Math.floor((Date.now() - since.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return elapsed;
}

export function StatsBar({ metroCount, flightCount, lastUpdated, isStale, health }: Props) {
  const elapsed = useElapsedSeconds(lastUpdated);

  const ageLabel = lastUpdated == null
    ? 'loading…'
    : elapsed < 60
      ? `${elapsed}s ago`
      : `${Math.floor(elapsed / 60)}m ago`;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      background: '#2D3748',
      borderBottom: '1px solid #4A5568',
      fontFamily: "'Inter', sans-serif",
      fontSize: '13px',
      color: '#E2E8F0',
    }}>
      <span style={{ fontWeight: 500 }}>
        {metroCount} buses · {flightCount} flights
        {isStale && (
          <span style={{ color: '#F6AD55', marginLeft: 8, fontSize: '12px' }}>
            ⚠ stale data
          </span>
        )}
      </span>

      <span style={{ color: '#A0AEC0' }}>
        Last updated {ageLabel}
      </span>

      {health && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>
            Metro <HealthDot status={health.sources.metro.status} />
          </span>
          <span>
            Flights <HealthDot status={health.sources.flight.status} />
          </span>
        </span>
      )}
    </div>
  );
}
