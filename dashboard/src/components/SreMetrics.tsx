import { ApiMetrics } from '../hooks/useApiMetrics';

interface Props {
  metrics: ApiMetrics;
  isPaused: boolean;
  onTogglePause: () => void;
  onClearData: () => void;
}

/**
 * SRE observability panel showing API performance metrics and control actions.
 * Demonstrates production-ready monitoring for Azure-native solutions.
 */
export function SreMetrics({ metrics, isPaused, onTogglePause, onClearData }: Props) {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const errorRate = metrics.totalRequests > 0
    ? ((metrics.errorCount / metrics.totalRequests) * 100).toFixed(1)
    : '0.0';

  return (
    <div style={{
      background: 'var(--bg-header)',
      borderBottom: '1px solid var(--border-dark)',
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '24px',
      flexWrap: 'wrap',
      fontSize: '12px',
      color: 'var(--text-inverse)',
      fontFamily: "'Inter', sans-serif",
    }}>
      <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>SRE Metrics</span>

      <div style={{ display: 'flex', gap: '4px', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--text-muted)' }}>Response:</span>
        <span style={{ fontWeight: 600, color: '#68D391' }}>{metrics.lastResponseTime}ms</span>
        <span style={{ color: '#718096', fontSize: '10px' }}>(avg: {metrics.avgResponseTime}ms)</span>
      </div>

      <div style={{ display: 'flex', gap: '4px', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--text-muted)' }}>Payload:</span>
        <span style={{ fontWeight: 600, color: '#63B3ED' }}>{formatBytes(metrics.lastPayloadSize)}</span>
      </div>

      <div style={{ display: 'flex', gap: '4px', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--text-muted)' }}>Requests:</span>
        <span style={{ fontWeight: 600 }}>{metrics.totalRequests}</span>
      </div>

      <div style={{ display: 'flex', gap: '4px', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--text-muted)' }}>Error Rate:</span>
        <span style={{
          fontWeight: 600,
          color: parseFloat(errorRate) > 5 ? '#FC8181' : '#68D391'
        }}>
          {errorRate}%
        </span>
        <span style={{ color: '#718096', fontSize: '10px' }}>({metrics.errorCount} errors)</span>
      </div>

      {metrics.lastError && (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'baseline', maxWidth: '300px' }}>
          <span style={{ color: '#FC8181' }}>Last Error:</span>
          <span style={{ fontSize: '10px', color: '#FEB2B2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {metrics.lastError}
          </span>
        </div>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
        <button
          onClick={onTogglePause}
          style={{
            background: isPaused ? '#48BB78' : '#F6AD55',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>

        <button
          onClick={onClearData}
          style={{
            background: '#E53E3E',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          🗑 Clear Data
        </button>
      </div>
    </div>
  );
}
