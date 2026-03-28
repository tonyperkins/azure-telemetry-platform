import { useEffect, useState } from 'react';

export type ToastType = 'warning' | 'critical' | 'recovery';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  body: string;
  timestamp: Date;
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function AlertToastContainer({ toasts, onDismiss }: Props) {
  const visibleToasts = toasts.slice(0, 3);

  return (
    <div
      style={{
        position: 'fixed',
        top: '60px',
        right: '300px',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {visibleToasts.map(toast => (
        <AlertToast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function AlertToast({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 8000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const getConfig = () => {
    switch (toast.type) {
      case 'warning':
        return {
          borderColor: '#F59E0B',
          icon: '⚠',
          iconColor: '#F59E0B',
          bgColor: '#FFFBEB',
        };
      case 'critical':
        return {
          borderColor: '#EF4444',
          icon: '🔴',
          iconColor: '#EF4444',
          bgColor: '#FEF2F2',
        };
      case 'recovery':
        return {
          borderColor: '#10B981',
          icon: '✅',
          iconColor: '#10B981',
          bgColor: '#F0FDF4',
        };
    }
  };

  const config = getConfig();
  const elapsed = Math.floor((Date.now() - toast.timestamp.getTime()) / 1000);
  const timeLabel = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`;

  return (
    <div
      style={{
        background: config.bgColor,
        borderLeft: `4px solid ${config.borderColor}`,
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        padding: '12px 16px',
        minWidth: '320px',
        maxWidth: '400px',
        fontFamily: "'Inter', sans-serif",
        pointerEvents: 'auto',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateX(0)' : 'translateX(20px)',
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ fontSize: '20px', lineHeight: 1 }}>{config.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {toast.title}
            </div>
            <button
              onClick={() => {
                setIsVisible(false);
                setTimeout(() => onDismiss(toast.id), 300);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0 4px',
                color: '#9CA3AF',
                fontSize: '16px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
            {toast.body}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF' }}>
            {timeLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
