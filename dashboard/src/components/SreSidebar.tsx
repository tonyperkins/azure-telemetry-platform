import { useEffect, useRef, useState } from 'react';
import { HealthStatus } from '../types/vehicle';
import { ApiMetrics } from '../hooks/useApiMetrics';

interface Props {
  health: HealthStatus | null;
  metrics: ApiMetrics;
  metroCount: number;
  flightCount: number;
  lastUpdated: Date | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenLogs?: () => void;
  onOpenRunbook?: (sourceName: string) => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onClearData?: () => void;
}

interface MetricSnapshot {
  timestamp: number;
  successRate: number;
  p95Latency: number;
  requestsPerMin: number;
  errorRate: number;
}

interface VehicleCountSnapshot {
  timestamp: number;
  metroCount: number;
  flightCount: number;
}

function useElapsedSeconds(since: Date | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!since) return;
    const tick = () => {
      const diff = Date.now() - since.getTime();
      setElapsed(Math.max(0, Math.floor(diff / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return elapsed;
}

export function SreSidebar({
  health,
  metrics,
  metroCount,
  flightCount,
  lastUpdated,
  isCollapsed,
  onToggleCollapse,
  onOpenLogs,
  onOpenRunbook,
  isPaused,
  onTogglePause,
  onClearData,
}: Props) {
  const handleToggleCollapse = onToggleCollapse;

  const [functionStatus, setFunctionStatus] = useState<'Running' | 'Stopped' | 'Unknown'>('Unknown');
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5200';

  useEffect(() => {
    if (isCollapsed) return;
    fetch(`${API_BASE}/api/manage/status`)
      .then(res => res.json())
      .then(data => setFunctionStatus(data.state))
      .catch(() => setFunctionStatus('Unknown'));
  }, [isCollapsed, API_BASE]);

  const handleFunctionStatusToggle = async (action: 'start' | 'stop') => {
    const token = window.prompt(`Please enter the SRE Admin Token to ${action} the Azure Function integration pipeline:`);
    if (!token) return;

    try {
      setFunctionStatus("Unknown"); // Optimistic loading
      const response = await fetch(`${API_BASE}/api/manage/${action}?token=${encodeURIComponent(token)}`, {
        method: 'POST'
      });
      if (!response.ok) {
        window.alert(`Authorization Refused. The provided SRE token was invalid or missing.`);
        return;
      }
      const data = await response.json();
      setFunctionStatus(data.state);
    } catch (err) {
      window.alert("Failed to reach the Azure Management API.");
      setFunctionStatus("Unknown");
    }
  };

  const metricsHistory = useRef<MetricSnapshot[]>([]);
  const vehicleCountHistory = useRef<VehicleCountSnapshot[]>([]);
  const prevMetroCount = useRef(metroCount);
  const prevFlightCount = useRef(flightCount);
  const prevRequestCount = useRef(metrics.totalRequests);

  const apiElapsed = useElapsedSeconds(lastUpdated);

  const successRate = metrics.totalRequests > 0
    ? ((metrics.totalRequests - metrics.errorCount) / metrics.totalRequests) * 100
    : 100;

  const errorRate = metrics.totalRequests > 0
    ? (metrics.errorCount / metrics.totalRequests) * 100
    : 0;

  const requestsPerMin = useRef(0);

  useEffect(() => {
    const now = Date.now();

    const newRequestsSinceLastPoll = metrics.totalRequests - prevRequestCount.current;
    requestsPerMin.current = newRequestsSinceLastPoll * 2;
    prevRequestCount.current = metrics.totalRequests;

    const snapshot: MetricSnapshot = {
      timestamp: now,
      successRate,
      p95Latency: metrics.lastResponseTime,
      requestsPerMin: requestsPerMin.current,
      errorRate,
    };

    metricsHistory.current.push(snapshot);
    if (metricsHistory.current.length > 20) {
      metricsHistory.current.shift();
    }

    const vehicleSnapshot: VehicleCountSnapshot = {
      timestamp: now,
      metroCount,
      flightCount,
    };

    vehicleCountHistory.current.push(vehicleSnapshot);
    if (vehicleCountHistory.current.length > 60) {
      vehicleCountHistory.current.shift();
    }
  }, [metrics.totalRequests, metrics.lastResponseTime, successRate, errorRate, metroCount, flightCount]);

  const metroTrend = metroCount > prevMetroCount.current ? '↑' : metroCount < prevMetroCount.current ? '↓' : '→';
  const flightTrend = flightCount > prevFlightCount.current ? '↑' : flightCount < prevFlightCount.current ? '↓' : '→';

  useEffect(() => {
    prevMetroCount.current = metroCount;
    prevFlightCount.current = flightCount;
  }, [metroCount, flightCount]);

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 99.9) return '#10B981';
    if (rate >= 99.0) return '#F59E0B';
    return '#EF4444';
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 200) return '#10B981';
    if (latency < 500) return '#F59E0B';
    return '#EF4444';
  };

  const getSloStatus = (metric: 'availability' | 'latency' | 'errorRate'): { label: string; color: string; pulse: boolean } => {
    if (metric === 'availability') {
      if (successRate >= 99.9) return { label: 'MEETING OBJECTIVE', color: '#10B981', pulse: false };
      if (successRate >= 99.0) return { label: 'AT RISK', color: '#F59E0B', pulse: true };
      return { label: 'OBJECTIVE BREACH', color: '#EF4444', pulse: true };
    }
    if (metric === 'latency') {
      if (metrics.lastResponseTime < 500) return { label: 'MEETING OBJECTIVE', color: '#10B981', pulse: false };
      return { label: 'OBJECTIVE BREACH', color: '#EF4444', pulse: true };
    }
    if (errorRate < 0.1) return { label: 'MEETING OBJECTIVE', color: '#10B981', pulse: false };
    if (errorRate < 0.5) return { label: 'AT RISK', color: '#F59E0B', pulse: true };
    return { label: 'OBJECTIVE BREACH', color: '#EF4444', pulse: true };
  };

  const sidebarWidth = isCollapsed ? '48px' : '280px';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: sidebarWidth,
        background: 'var(--bg-base)',
        borderLeft: '1px solid var(--border-light)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s ease',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: isCollapsed ? '12px 8px' : '12px 16px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-hover)',
          gap: '8px',
        }}
      >
        {!isCollapsed && (
          <h2
            style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: "'Inter', sans-serif",
              flex: 1,
            }}
          >
            SRE Dashboard
          </h2>
        )}
        {!isCollapsed && onOpenLogs && (
          <button
            onClick={onOpenLogs}
            style={{
              background: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
            title="Toggle system logs"
          >
            📋 Logs
          </button>
        )}
        {!isCollapsed && onOpenRunbook && (
          <button
            onClick={() => onOpenRunbook('')}
            style={{
              background: '#6D28D9',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
            title="Open incident runbook"
          >
            📖 Runbook
          </button>
        )}
        <button
          onClick={handleToggleCollapse}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: '#6B7280',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? '◀' : '▶'}
        </button>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {isCollapsed ? (
          <CollapsedView health={health} />
        ) : (
          <>
            {/* Section 1 - Platform Health */}
            <Section title="Platform Health">
              <HealthCard
                title="API Health"
                status={health?.status ?? 'unhealthy'}
                lastChecked={apiElapsed}
                onOpenRunbook={onOpenRunbook}
              />
              <HealthCard
                title="Metro Feed"
                status={health?.sources.metro.status ?? 'unhealthy'}
                lastIngest={health?.sources.metro.lastIngest}
                vehicleCount={metroCount}
                onOpenRunbook={onOpenRunbook}
              />
              <HealthCard
                title="Flight Feed"
                status={health?.sources.flight.status ?? 'unhealthy'}
                lastIngest={health?.sources.flight.lastIngest}
                vehicleCount={flightCount}
                onOpenRunbook={onOpenRunbook}
              />
            </Section>

            {/* Section 2 - Live Metrics */}
            <Section title="Live Metrics">
              <MetricCard
                title="API Success Rate"
                value={`${successRate.toFixed(1)}%`}
                color={getSuccessRateColor(successRate)}
                sparklineData={metricsHistory.current.map(m => m.successRate)}
                threshold={99.9}
                label="SLO: ≥ 99.9%"
              />
              <MetricCard
                title="P95 Latency"
                value={`${metrics.lastResponseTime}ms`}
                color={getLatencyColor(metrics.lastResponseTime)}
                sparklineData={metricsHistory.current.map(m => m.p95Latency)}
                threshold={500}
                label="SLO: < 500ms"
              />
              <MetricCard
                title="Requests / min"
                value={`${requestsPerMin.current}`}
                color="#3B82F6"
                sparklineData={metricsHistory.current.map(m => m.requestsPerMin)}
                trend={requestsPerMin.current > 0 ? '↑' : '→'}
              />
              <MetricCard
                title="Error Rate"
                value={`${errorRate.toFixed(2)}%`}
                color={errorRate < 0.1 ? '#10B981' : errorRate < 0.5 ? '#F59E0B' : '#EF4444'}
                sparklineData={metricsHistory.current.map(m => m.errorRate)}
                threshold={0.1}
                label="SLO: < 0.1%"
              />
            </Section>

            {/* Section 3 - Vehicle Activity */}
            <Section title="Vehicle Activity">
              <div style={{ padding: '8px 0' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif", marginBottom: '4px' }}>
                  Metro: {metroCount} buses <span style={{ color: '#0D9488' }}>{metroTrend}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif", marginBottom: '8px' }}>
                  Flights: {flightCount} aircraft <span style={{ color: '#D97706' }}>{flightTrend}</span>
                </div>
                <VehicleCountChart history={vehicleCountHistory.current} />
              </div>
            </Section>

            {/* Section 4 - SLO Status */}
            <Section title="SLO Status">
              <SLOBadge
                label="Availability ≥ 99.9%"
                status={getSloStatus('availability')}
              />
              <SLOBadge
                label="Latency < 500ms"
                status={getSloStatus('latency')}
              />
              <SLOBadge
                label="Error Rate < 0.1%"
                status={getSloStatus('errorRate')}
              />
            </Section>

            {/* Control Buttons */}
            {(onTogglePause || onClearData) && (
              <div style={{ padding: '12px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px', flexDirection: 'column' }}>

                {/* Azure Function App Ingestion Suspend */}
                <div style={{ padding: '8px', background: 'var(--bg-active)', border: '1px solid var(--border-light)', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>
                    Azure Pipeline: {functionStatus}
                  </div>
                  {functionStatus !== 'Stopped' ? (
                    <button
                      onClick={() => handleFunctionStatusToggle('stop')}
                      style={{
                        background: '#EF4444', color: 'white', border: 'none', borderRadius: '4px',
                        padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif", width: '100%',
                      }}
                    >
                      ■ Suspend Active Ingestion
                    </button>
                  ) : (
                    <button
                      onClick={() => handleFunctionStatusToggle('start')}
                      style={{
                        background: '#10B981', color: 'white', border: 'none', borderRadius: '4px',
                        padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif", width: '100%',
                      }}
                    >
                      ▶ Resume Azure Loop
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {onTogglePause && (
                    <button
                      onClick={onTogglePause}
                      style={{
                        background: isPaused ? '#48BB78' : '#F6AD55', color: 'white', border: 'none', borderRadius: '4px',
                        padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif", flex: 1,
                      }}
                    >
                      {isPaused ? '▶ Resume UI Polling' : '⏸ Pause UI Polling'}
                    </button>
                  )}
                  {onClearData && (
                    <button
                      onClick={onClearData}
                      style={{
                        background: '#4B5563', color: 'white', border: 'none', borderRadius: '4px',
                        padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      🗑 Clear Data
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CollapsedView({ health }: { health: HealthStatus | null }) {
  const getStatusIcon = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    if (status === 'healthy') return '🟢';
    if (status === 'degraded') return '🟡';
    return '🔴';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 8px' }}>
      <div title="API Health" style={{ fontSize: '16px', textAlign: 'center' }}>
        {getStatusIcon(health?.status ?? 'unhealthy')}
      </div>
      <div title="Metro Feed" style={{ fontSize: '16px', textAlign: 'center' }}>
        {getStatusIcon(health?.sources.metro.status ?? 'unhealthy')}
      </div>
      <div title="Flight Feed" style={{ fontSize: '16px', textAlign: 'center' }}>
        {getStatusIcon(health?.sources.flight.status ?? 'unhealthy')}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border-light)', padding: '12px 16px' }}>
      <h3
        style={{
          margin: '0 0 12px 0',
          fontSize: '12px',
          fontWeight: 600,
          color: '#6B7280',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function HealthCard({
  title,
  status,
  lastChecked,
  lastIngest,
  vehicleCount,
  onOpenRunbook,
}: {
  title: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked?: number;
  lastIngest?: string | null;
  vehicleCount?: number;
  onOpenRunbook?: (sourceName: string) => void;
}) {
  const getStatusIcon = () => {
    if (status === 'healthy') return '🟢';
    if (status === 'degraded') return '🟡';
    return '🔴';
  };

  const getStatusLabel = () => {
    if (status === 'healthy') return 'Healthy';
    if (status === 'degraded') return 'Degraded';
    return 'Unhealthy';
  };

  const getIngestAge = () => {
    if (!lastIngest) return 'Never';
    // Server returns timestamps without timezone suffix (local server time).
    // Append 'Z' would treat as UTC causing huge negative diffs.
    // Instead parse as-is and clamp to 0 if future (clock skew).
    const raw = lastIngest.endsWith('Z') || lastIngest.includes('+') ? lastIngest : lastIngest + 'Z';
    const age = Math.max(0, Math.floor((Date.now() - new Date(raw).getTime()) / 1000));
    if (age < 60) return `${age}s ago`;
    if (age < 3600) return `${Math.floor(age / 60)}m ago`;
    return `${Math.floor(age / 3600)}h ago`;
  };

  return (
    <div
      style={{
        background: 'var(--bg-hover)',
        border: '1px solid var(--border-light)',
        borderRadius: '6px',
        padding: '10px',
        marginBottom: '8px',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '18px' }}>{getStatusIcon()}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>{getStatusLabel()}</div>
        </div>
      </div>
      {lastChecked !== undefined && (
        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
          Last checked {lastChecked}s ago
        </div>
      )}
      {lastIngest !== undefined && (
        <>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
            Last ingest: {getIngestAge()}
          </div>
          {vehicleCount !== undefined && (
            <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
              {vehicleCount} vehicles active
            </div>
          )}
        </>
      )}
      {status === 'unhealthy' && onOpenRunbook && (
        <button
          onClick={() => onOpenRunbook(title.replace(' Feed', '').replace(' Health', 'API'))}
          style={{
            marginTop: '8px',
            background: 'transparent',
            border: 'none',
            color: '#3B82F6',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          See runbook →
        </button>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  color,
  sparklineData,
  threshold,
  label,
  trend,
}: {
  title: string;
  value: string;
  color: string;
  sparklineData: number[];
  threshold?: number;
  label?: string;
  trend?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-hover)',
        border: '1px solid var(--border-light)',
        borderRadius: '6px',
        padding: '10px',
        marginBottom: '8px',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</span>
        {trend && <span style={{ fontSize: '14px', color: '#9CA3AF' }}>{trend}</span>}
      </div>
      {label && <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '6px' }}>{label}</div>}
      <Sparkline data={sparklineData} color={color} threshold={threshold} />
    </div>
  );
}

function Sparkline({ data, color, threshold }: { data: number[]; color: string; threshold?: number }) {
  if (data.length < 2) {
    return <div style={{ height: '40px', background: 'var(--bg-active)', borderRadius: '4px' }} />;
  }

  const width = 200;
  const height = 40;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((value - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const thresholdY = threshold !== undefined
    ? height - padding - ((threshold - min) / range) * (height - 2 * padding)
    : null;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {thresholdY !== null && (
        <line
          x1={padding}
          y1={thresholdY}
          x2={width - padding}
          y2={thresholdY}
          stroke="#9CA3AF"
          strokeWidth="1"
          strokeDasharray="2,2"
        />
      )}

      <polygon
        points={`${padding},${height} ${points} ${width - padding},${height}`}
        fill={`url(#gradient-${color})`}
      />

      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function VehicleCountChart({ history }: { history: VehicleCountSnapshot[] }) {
  if (history.length < 2) {
    return <div style={{ height: '80px', background: 'var(--bg-active)', borderRadius: '4px' }} />;
  }

  const width = 200;
  const height = 80;
  const padding = 10;

  const metroCounts = history.map(h => h.metroCount);
  const flightCounts = history.map(h => h.flightCount);
  const allCounts = [...metroCounts, ...flightCounts];
  const min = Math.min(...allCounts, 0);
  const max = Math.max(...allCounts, 1);
  const range = max - min;

  const metroPoints = history.map((h, i) => {
    const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((h.metroCount - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const flightPoints = history.map((h, i) => {
    const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((h.flightCount - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <polyline
          points={metroPoints}
          fill="none"
          stroke="#0D9488"
          strokeWidth="1.5"
        />
        <polyline
          points={flightPoints}
          fill="none"
          stroke="#D97706"
          strokeWidth="1.5"
        />
      </svg>
      <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#6B7280', marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0D9488', display: 'inline-block' }} />
          Metro
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
          Flights
        </div>
      </div>
    </div>
  );
}

function SLOBadge({ label, status }: { label: string; status: { label: string; color: string; pulse: boolean } }) {
  return (
    <div
      style={{
        background: 'var(--bg-hover)',
        border: `2px solid ${status.color}`,
        borderRadius: '6px',
        padding: '8px 10px',
        marginBottom: '8px',
        fontFamily: "'Inter', sans-serif",
        animation: status.pulse ? 'pulse 2s infinite' : 'none',
      }}
    >
      <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: status.color }}>{status.label}</div>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `}
      </style>
    </div>
  );
}
