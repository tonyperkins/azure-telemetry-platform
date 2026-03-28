import { useEffect, useRef, useState } from 'react';

interface LogData {
  filename: string;
  lines: string[];
  count: number;
  totalLines: number;
}

type LogSource = 'metro' | 'flight' | 'api' | 'dashboard';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

interface LogViewerProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

/**
 * Log viewer component for debugging and monitoring.
 * Displays real-time logs from all system components.
 */
export function LogViewer({ isOpen: externalIsOpen, onToggle }: LogViewerProps = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  
  const setIsOpen = (open: boolean) => {
    if (onToggle) {
      onToggle(open);
    } else {
      setInternalIsOpen(open);
    }
  };
  const [selectedSource, setSelectedSource] = useState<LogSource>('api');
  const [logs, setLogs] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [position, setPosition] = useState({ x: 240, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const logContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // IMPORTANT: This useEffect must be before any conditional returns to maintain hook order
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  };

  const checkIfAtBottom = () => {
    if (!logContainerRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 50;
  };

  const handleScroll = () => {
    setIsAtBottom(checkIfAtBottom());
  };

  const fetchLogs = async (source: LogSource) => {
    const wasAtBottom = checkIfAtBottom();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/logs/${source}?lines=200`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
        
        // Auto-scroll if user was at bottom and auto-refresh is on
        if (wasAtBottom && autoRefresh) {
          setTimeout(scrollToBottom, 100);
        }
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs(selectedSource);
      setTimeout(scrollToBottom, 200);
    }
  }, [isOpen, selectedSource]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs(selectedSource);
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, selectedSource]);

  if (!isOpen) {
    // Don't show floating button if controlled externally
    if (onToggle) return null;
    
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: '#4A5568',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 20px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          fontFamily: "'Inter', sans-serif",
          zIndex: 1000,
        }}
      >
        📋 View Logs
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '700px',
        height: '60vh',
        background: 'var(--bg-header)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
        zIndex: 3000,
        resize: 'both',
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          background: 'var(--text-primary)',
          padding: '12px 16px',
          borderBottom: '1px solid #4A5568',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-inverse)', fontSize: '14px' }}>
          System Logs
        </span>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Source Selector */}
      <div
        style={{
          background: 'var(--text-primary)',
          padding: '8px 16px',
          borderBottom: '1px solid #4A5568',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        {(['metro', 'flight', 'api', 'dashboard'] as LogSource[]).map((source) => (
          <button
            key={source}
            onClick={() => setSelectedSource(source)}
            style={{
              background: selectedSource === source ? '#4299E1' : '#4A5568',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {source}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (3s)
          </label>

          <button
            onClick={() => fetchLogs(selectedSource)}
            disabled={loading}
            style={{
              background: '#48BB78',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '⟳' : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Log Content */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          background: '#0D1117',
          fontFamily: "'Fira Code', 'Courier New', monospace",
          fontSize: '11px',
          lineHeight: '1.6',
        }}
      >
        {loading && !logs && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            Loading logs...
          </div>
        )}

        {logs && (
          <>
            <div style={{ color: '#718096', marginBottom: '8px', fontSize: '10px' }}>
              Showing last {logs.count} of {logs.totalLines} lines from {logs.filename}
            </div>
            {logs.lines.map((log, i) => {
              const getLogColor = (logText: string) => {
                if (logText.includes('[ERROR]')) return '#EF4444';
                if (logText.includes('[WARN]')) return '#F59E0B';
                if (logText.includes('[SIMULATION]')) return '#7C3AED';
                if (logText.includes('[INFO]')) return '#10B981';
                return '#E2E8F0';
              };

              const getLogStyle = (logText: string) => {
                if (logText.includes('[SIMULATION]')) {
                  return { fontStyle: 'italic' as const };
                }
                return {};
              };

              return (
                <div 
                  key={i} 
                  style={{ 
                    marginBottom: '4px', 
                    color: getLogColor(log),
                    ...getLogStyle(log)
                  }}
                >
                  {log}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          background: 'var(--text-primary)',
          borderTop: '1px solid #4A5568',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px',
        }}
      >
        <span style={{ fontSize: '11px', color: '#718096' }}>
          {isAtBottom ? '📍 At latest' : '⬆️ Scroll down for latest'}
        </span>
        <button
          onClick={scrollToBottom}
          style={{
            background: '#4299E1',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ⬇ Jump to Latest
        </button>
      </div>
    </div>
  );
}
