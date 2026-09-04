import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import styles from './MermaidDiagram.module.css';

let mermaidInitialized = false;

interface MermaidDiagramProps {
  source: string;
}

export default function MermaidDiagram({ source }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose',
        fontFamily: 'Helvetica Neue, Arial, sans-serif',
      });
      mermaidInitialized = true;
    }

    let cancelled = false;
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    (async () => {
      try {
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.error}>Diagram error: {error}</div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {loading && <div className={styles.loading}>Rendering diagram…</div>}
      <div ref={containerRef} />
    </div>
  );
}
