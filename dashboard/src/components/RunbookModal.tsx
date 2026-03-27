import { useEffect, useState } from 'react';
import { marked } from 'marked';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceName?: string;
}

export function RunbookModal({ isOpen, onClose, sourceName }: Props) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchRunbook = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/docs/runbook.md');
        if (!response.ok) {
          throw new Error(`Failed to load runbook: ${response.status}`);
        }
        const markdown = await response.text();
        const html = await marked.parse(markdown);
        setContent(html);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load runbook');
      } finally {
        setLoading(false);
      }
    };

    fetchRunbook();
  }, [isOpen]);

  if (!isOpen) return null;

  const title = sourceName ? `Incident Runbook — ${sourceName} Feed` : 'Incident Runbook';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              color: '#2D3748',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
              color: '#9CA3AF',
              fontSize: '24px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
              Loading runbook...
            </div>
          )}
          {error && (
            <div style={{ padding: '20px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', color: '#991B1B' }}>
              {error}
            </div>
          )}
          {!loading && !error && (
            <div
              dangerouslySetInnerHTML={{ __html: content }}
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#2D3748',
              }}
              className="runbook-content"
            />
          )}
        </div>
      </div>

      <style>{`
        .runbook-content h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 24px 0 16px 0;
          color: #1A202C;
          border-bottom: 2px solid #E5E7EB;
          padding-bottom: 8px;
        }
        .runbook-content h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 20px 0 12px 0;
          color: #2D3748;
        }
        .runbook-content h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 16px 0 8px 0;
          color: #374151;
        }
        .runbook-content p {
          margin: 12px 0;
        }
        .runbook-content ul, .runbook-content ol {
          margin: 12px 0;
          padding-left: 24px;
        }
        .runbook-content li {
          margin: 6px 0;
        }
        .runbook-content code {
          background: #F3F4F6;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          color: #D97706;
        }
        .runbook-content pre {
          background: #1F2937;
          color: #F9FAFB;
          padding: 16px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 16px 0;
        }
        .runbook-content pre code {
          background: transparent;
          color: #F9FAFB;
          padding: 0;
        }
        .runbook-content blockquote {
          border-left: 4px solid #3B82F6;
          padding-left: 16px;
          margin: 16px 0;
          color: #4B5563;
          font-style: italic;
        }
        .runbook-content a {
          color: #3B82F6;
          text-decoration: none;
        }
        .runbook-content a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
