import { useEffect, useState } from 'react';
import { Marked } from 'marked';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const markedInstance = new Marked({
  renderer: {
    link(token) {
      const { href, title, text } = token;
      const isExternal = /^https?:\/\//.test(href);
      const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${href}"${target}${title ? ` title="${title}"` : ''}>${text}</a>`;
    }
  }
});

export function HelpModal({ isOpen, onClose }: Props) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchHelp = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/docs/help.md');
        if (!response.ok) {
          throw new Error(`Failed to load help document: ${response.status}`);
        }
        const markdown = await response.text();
        const html = await markedInstance.parse(markdown);
        setContent(html);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load help document');
      } finally {
        setLoading(false);
      }
    };

    fetchHelp();
  }, [isOpen]);

  if (!isOpen) return null;

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
          background: 'var(--bg-base)',
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
            borderBottom: '1px solid var(--border-light)',
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
              color: 'var(--text-primary)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Help & Documentation
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
              Loading help document...
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
                color: 'var(--text-primary)',
              }}
              className="help-content"
            />
          )}
        </div>
      </div>

      <style>{`
        .help-content h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 24px 0 16px 0;
          color: var(--text-primary);
          border-bottom: 2px solid var(--border-light);
          padding-bottom: 8px;
        }
        .help-content h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 20px 0 12px 0;
          color: var(--text-primary);
        }
        .help-content h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 16px 0 8px 0;
          color: var(--text-secondary);
        }
        .help-content p {
          margin: 12px 0;
        }
        .help-content ul, .help-content ol {
          margin: 12px 0;
          padding-left: 24px;
        }
        .help-content li {
          margin: 6px 0;
        }
        .help-content code {
          background: var(--bg-active);
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          color: #D97706;
        }
        .help-content pre {
          background: #1F2937;
          color: #F8FAFC;
          padding: 16px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 16px 0;
        }
        .help-content pre code {
          background: transparent;
          color: #F8FAFC;
          padding: 0;
        }
        .help-content blockquote {
          border-left: 4px solid var(--primary-color, #3B82F6);
          padding-left: 16px;
          margin: 16px 0;
          color: var(--text-secondary);
          font-style: italic;
        }
        /* Handle alert formatting if needed, default map to blockquote */
        .help-content blockquote.markdown-alert {
          border-left-width: 4px;
        }
        .help-content a {
          color: var(--primary-color, #3B82F6);
          text-decoration: none;
        }
        .help-content a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
