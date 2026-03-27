import { useRef, useState } from 'react';

export interface ApiMetrics {
  lastResponseTime: number;      // ms
  avgResponseTime:  number;      // ms (rolling avg of last 10)
  lastPayloadSize:  number;      // bytes
  totalRequests:    number;
  errorCount:       number;
  lastError:        string | null;
}

/**
 * Tracks API performance metrics for SRE observability.
 * Measures response times, payload sizes, and error rates.
 */
export function useApiMetrics() {
  const [metrics, setMetrics] = useState<ApiMetrics>({
    lastResponseTime: 0,
    avgResponseTime:  0,
    lastPayloadSize:  0,
    totalRequests:    0,
    errorCount:       0,
    lastError:        null,
  });

  const responseTimes = useRef<number[]>([]);

  const recordRequest = (responseTimeMs: number, payloadBytes: number, error?: string) => {
    responseTimes.current.push(responseTimeMs);
    if (responseTimes.current.length > 10) {
      responseTimes.current.shift(); // Keep only last 10
    }

    const avg = responseTimes.current.reduce((a, b) => a + b, 0) / responseTimes.current.length;

    setMetrics(prev => ({
      lastResponseTime: responseTimeMs,
      avgResponseTime:  Math.round(avg),
      lastPayloadSize:  payloadBytes,
      totalRequests:    prev.totalRequests + 1,
      errorCount:       error ? prev.errorCount + 1 : prev.errorCount,
      lastError:        error || prev.lastError,
    }));
  };

  return { metrics, recordRequest };
}
