import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendAnchoredComment,
  appendReply,
  setCommentResolved,
} from "./append-anchored-comment";
import { applyCommentAnchors } from "./iframe-anchors";
import { useIframeSelection } from "./iframe-selection";
import { PreviewCommentRail } from "./PreviewCommentRail";
import { PreviewIframe } from "./PreviewIframe";
import {
  extractPreviewComments,
  type PreviewComment,
} from "./preview-comments";
import { SelectionPill } from "./SelectionPill";

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

const splitStyle = {
  ...containerStyle,
  display: "flex",
  flexDirection: "row",
} as const;

const iframeSlotStyle = {
  flex: "1 1 auto",
  minWidth: 0,
  position: "relative",
  height: "100%",
} as const;

const messageStyle = {
  ...containerStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "14px",
} as const;

export function RawHtmlPreviewPage({
  projectPath,
  documentPath,
}: RawHtmlPreviewPageProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  /**
   * Iframe scroll position captured immediately before an SSE-driven
   * reload, and consumed once after the new contentDocument is ready.
   * Null when no reload is pending — that's how the first render and
   * user-initiated reloads skip the restore.
   */
  const pendingScrollRef = useRef<{ x: number; y: number } | null>(null);

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
        const win = iframeRef.current?.contentWindow;
        if (win) {
          pendingScrollRef.current = { x: win.scrollX, y: win.scrollY };
        }
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

  const { selection, clear } = useIframeSelection(iframeRef);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [comments, setComments] = useState<PreviewComment[]>([]);
  const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);

  // The same id has two homes — the source `<span data-rd-comment>`
  // carries the persisted id, and the runtime `<mark data-rd-comment-highlight>`
  // wraps the anchored selection. Clicking either should focus the rail
  // card. The rail card click reverses the flow by scrolling the iframe
  // to the mark.
  const handleContentReady = useCallback((doc: Document) => {
    applyCommentAnchors(doc);
    setComments(extractPreviewComments(doc));

    const handleMarkClick = (event: Event) => {
      const target = event.target as Element | null;
      const mark = target?.closest?.("mark[data-rd-comment-highlight]");
      if (!mark) return;
      const id = mark.getAttribute("data-rd-comment-highlight");
      if (id) setFocusedThreadId(id);
    };
    doc.addEventListener("click", handleMarkClick);
    // The doc itself is replaced on every iframe reload, so cleanup is
    // automatic for old documents — the SSE refresh path creates a new
    // contentDocument and we re-attach there.

    // SSE reload path: restore the scroll position captured before the
    // refetch. First-load and user-driven reloads leave pendingScrollRef
    // null and skip this branch.
    const pending = pendingScrollRef.current;
    if (pending) {
      doc.defaultView?.scrollTo(pending.x, pending.y);
      pendingScrollRef.current = null;
    }
  }, []);

  const handleSelectThread = useCallback((rootId: string) => {
    setFocusedThreadId(rootId);
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    // selector-check-ignore: iframe contentDocument query, not a UI selector
    const mark = doc.querySelector(
      `mark[data-rd-comment-highlight="${CSS.escape(rootId)}"]`,
    );
    // `behavior: "smooth"` is silently ignored when scrolling an element
    // that lives inside the sandboxed iframe but is driven from the parent
    // frame — the scroll never happens. Instant scrolling is reliable, so an
    // off-screen comment actually comes into view when its rail card is
    // clicked.
    mark?.scrollIntoView({ block: "center", behavior: "auto" });
  }, []);

  const handleSubmit = useCallback(
    async (message: string) => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!iframe || !doc || !selection) return;
      setSubmitting(true);
      setSubmitError(null);
      const result = await appendAnchoredComment({
        projectPath,
        documentPath,
        contentDocument: doc,
        range: selection.range,
        message,
      });
      setSubmitting(false);
      if (!result.ok) {
        setSubmitError(result.error ?? "Could not save the comment.");
        return;
      }
      clear();
    },
    [clear, documentPath, projectPath, selection],
  );

  const handleReply = useCallback(
    async (rootId: string, message: string): Promise<boolean> => {
      setSubmitError(null);
      const result = await appendReply({
        projectPath,
        documentPath,
        parentId: rootId,
        message,
      });
      if (!result.ok) {
        setSubmitError(result.error ?? "Could not save the reply.");
        return false;
      }
      // Success: the SSE reload re-renders the rail with the new reply.
      return true;
    },
    [documentPath, projectPath],
  );

  const handleToggleResolved = useCallback(
    async (rootId: string, resolved: boolean): Promise<void> => {
      setSubmitError(null);
      const result = await setCommentResolved({
        projectPath,
        documentPath,
        targetId: rootId,
        resolved,
      });
      if (!result.ok) {
        setSubmitError(
          result.error ??
            (resolved
              ? "Could not resolve the comment."
              : "Could not reopen the comment."),
        );
      }
      // Success: the SSE reload re-renders the rail with the new status.
    },
    [documentPath, projectPath],
  );

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
    <div style={splitStyle} data-testid="preview-split">
      <div style={iframeSlotStyle}>
        <PreviewIframe
          srcDoc={html}
          iframeRef={iframeRef}
          onContentReady={handleContentReady}
        />
      </div>
      <PreviewCommentRail
        comments={comments}
        focusedThreadId={focusedThreadId}
        onSelectThread={handleSelectThread}
        onReply={handleReply}
        onToggleResolved={handleToggleResolved}
      />
      {selection && (
        <SelectionPill
          rect={selection.rect}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={clear}
        />
      )}
      {submitError && (
        <div
          data-testid="preview-submit-error"
          style={{
            position: "fixed",
            bottom: "12px",
            right: "12px",
            padding: "8px 12px",
            borderRadius: "6px",
            background: "#fee2e2",
            color: "#7f1d1d",
            border: "1px solid #fca5a5",
            fontFamily: "system-ui, sans-serif",
            fontSize: "12px",
            zIndex: 2147483647,
          }}
        >
          {submitError}
        </div>
      )}
    </div>
  );
}
