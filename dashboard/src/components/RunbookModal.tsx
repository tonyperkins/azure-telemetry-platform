import { useEffect, useState } from 'react';
import { Marked } from 'marked';
import mermaid from 'mermaid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceName?: string;
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

export function RunbookModal({ isOpen, onClose, sourceName }: Props) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
    });
  }, []);

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
        const html = await markedInstance.parse(markdown);
        setContent(html);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load runbook');
      } finally {
        setLoading(false);
      }
    };

    fetchRunbook();
  }, [isOpen]);

  useEffect(() => {
    if (content && isOpen) {
      const renderDiagrams = async () => {
        const nodes = document.querySelectorAll('.runbook-content pre code.language-mermaid');
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const text = node.textContent || '';
          const id = `mermaid-diagram-${Date.now()}-${i}`;
          const parent = node.parentElement;
          if (parent && parent.tagName.toLowerCase() === 'pre') {
            try {
              const { svg } = await mermaid.render(id, text);
              // Wrap the SVG in a div to center it
              const div = document.createElement('div');
              div.style.display = 'flex';
              div.style.justifyContent = 'center';
              div.style.margin = '20px 0';
              div.style.background = 'var(--bg-base)';
              div.innerHTML = svg;
              parent.parentNode?.replaceChild(div, parent);
            } catch (e) {
              console.error('Mermaid render error:', e);
            }
          }
        }
      };
      setTimeout(renderDiagrams, 100);
    }
  }, [content, isOpen]);

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
                color: 'var(--text-primary)',
              }}
              className="runbook-content"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName.toLowerCase() === 'a') {
                  const href = target.getAttribute('href');
                  if (href && href.startsWith('#')) {
                    e.preventDefault();
                    
                    let element = document.getElementById(href.slice(1));
                    
                    if (!element) {
                        const headers = document.querySelectorAll('.runbook-content h1, .runbook-content h2, .runbook-content h3');
                        const targetText = href.slice(1).toLowerCase().replace(/-/g, ' ');
                        for (let h of Array.from(headers)) {
                            if (h.textContent?.toLowerCase().replace(/[^\w\s]/g, '').trim() === targetText) {
                                element = h as HTMLElement;
                                break;
                            }
                        }
                    }

                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth' });
                    }
                  }
                }
              }}
            />
          )}
        </div>
      </div>

      <style>{`
        .runbook-content h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 24px 0 16px 0;
          color: var(--text-primary);
          border-bottom: 2px solid var(--border-light);
          padding-bottom: 8px;
        }
        .runbook-content h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 20px 0 12px 0;
          color: var(--text-primary);
        }
        .runbook-content h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 16px 0 8px 0;
          color: var(--text-secondary);
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
          background: var(--bg-active);
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          color: #D97706;
        }
        .runbook-content pre {
          background: #1F2937;
          color: #F8FAFC;
          padding: 16px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 16px 0;
        }
        .runbook-content pre code {
          background: transparent;
          color: #F8FAFC;
          padding: 0;
        }
        .runbook-content blockquote {
          border-left: 4px solid var(--primary-color, #3B82F6);
          padding-left: 16px;
          margin: 16px 0;
          color: var(--text-secondary);
          font-style: italic;
        }
        .runbook-content a {
          color: var(--primary-color, #3B82F6);
          text-decoration: none;
        }
        .runbook-content a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
