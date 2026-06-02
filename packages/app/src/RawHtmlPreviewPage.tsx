import { useEffect, useRef, useState } from "react";

export interface RawHtmlPreviewPageProps {
  projectPath: string;
  documentPath: string;
}

function buildUrl(route: string, params: Record<string, string>): string {
  const url = new URL(route, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

const RELOAD_DEBOUNCE_MS = 150;

const containerStyle = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: "100vh",
  background: "white",
  color: "black",
  fontFamily: "system-ui, sans-serif",
} as const;

const messageStyle = {
  ...containerStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "14px",
} as const;

const iframeStyle = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: "100vh",
  border: 0,
  background: "white",
} as const;

export function RawHtmlPreviewPage({
  projectPath,
  documentPath,
}: RawHtmlPreviewPageProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the intentional refetch trigger fired from the SSE change handler.
  useEffect(() => {
    let cancelled = false;
    setError(null);

    const url = buildUrl("/api/preview-document", {
      projectPath,
      path: documentPath,
    });

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load preview (HTTP ${res.status})`);
        }
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        setHtml(text);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath, documentPath, reloadKey]);

  useEffect(() => {
    const url = buildUrl("/api/markdown-file/events", {
      projectPath,
      path: documentPath,
    });
    const source = new EventSource(url);
    const handleChange = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        setReloadKey((key) => key + 1);
      }, RELOAD_DEBOUNCE_MS);
    };
    source.addEventListener("change", handleChange);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      source.removeEventListener("change", handleChange);
      source.close();
    };
  }, [projectPath, documentPath]);

  if (error) {
    return (
      <div style={messageStyle} data-testid="preview-error">
        Could not load preview: {error}
      </div>
    );
  }
  if (html === null) {
    return (
      <div style={messageStyle} data-testid="preview-loading">
        Loading preview…
      </div>
    );
  }
  return (
    <iframe
      title="Preview"
      data-testid="preview-iframe"
      srcDoc={html}
      sandbox="allow-same-origin allow-scripts allow-popups"
      style={iframeStyle}
    />
  );
}
