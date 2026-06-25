import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import {
  groupPreviewCommentThreads,
  type PreviewComment,
} from "./preview-comments";

export interface PreviewCommentRailProps {
  comments: PreviewComment[];
  focusedThreadId: string | null;
  /** Called when the user clicks a thread card. Drives iframe scroll-to-mark. */
  onSelectThread: (rootId: string) => void;
}

const railStyle: CSSProperties = {
  flex: "0 0 320px",
  height: "100%",
  overflowY: "auto",
  borderLeft: "1px solid #e4e4e7",
  background: "#fafaf9",
  padding: "12px",
  fontFamily: "system-ui, sans-serif",
  fontSize: "13px",
  color: "#1a1a1a",
  boxSizing: "border-box",
};

const cardBaseStyle: CSSProperties = {
  background: "white",
  border: "1px solid #e4e4e7",
  borderRadius: "8px",
  padding: "10px",
  marginBottom: "8px",
  cursor: "pointer",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
};

const cardFocusedStyle: CSSProperties = {
  borderColor: "#facc15",
  boxShadow: "0 0 0 2px rgba(250, 204, 21, 0.35)",
};

const cardResolvedStyle: CSSProperties = {
  opacity: 0.55,
};

const quoteStyle: CSSProperties = {
  display: "block",
  fontStyle: "italic",
  color: "#6b7280",
  fontSize: "12px",
  marginBottom: "4px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const messageStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const metaRowStyle: CSSProperties = {
  marginTop: "6px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "11px",
  color: "#71717a",
};

const replyStyle: CSSProperties = {
  marginTop: "6px",
  paddingTop: "6px",
  borderTop: "1px dashed #e4e4e7",
};

const emptyStyle: CSSProperties = {
  color: "#71717a",
  fontStyle: "italic",
  padding: "8px 4px",
};

function formatDate(at?: string): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Sidebar list of comment threads extracted from the preview iframe.
 * Document-ordered, click-to-focus.
 *
 * Why this and not the existing `DocumentCommentRail`: that one is wired
 * to the markdown CriticMarkup pipeline (`CriticComment` shape, thread
 * layout math driven by editor caret position). The preview tab's
 * comments live in the iframe DOM and have no editor caret to track,
 * so a separate, simpler list lives here.
 */
export function PreviewCommentRail({
  comments,
  focusedThreadId,
  onSelectThread,
}: PreviewCommentRailProps) {
  const threads = useMemo(
    () => groupPreviewCommentThreads(comments),
    [comments],
  );

  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!focusedThreadId) return;
    const el = cardRefs.current.get(focusedThreadId);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedThreadId]);

  if (threads.length === 0) {
    return (
      <aside style={railStyle} data-testid="preview-comment-rail">
        <div style={emptyStyle} data-testid="preview-comment-rail-empty">
          No comments yet. Select text in the preview to add one.
        </div>
      </aside>
    );
  }

  return (
    <aside style={railStyle} data-testid="preview-comment-rail">
      {threads.map(({ root, replies }) => {
        const isFocused = focusedThreadId === root.id;
        const style: CSSProperties = {
          ...cardBaseStyle,
          ...(isFocused ? cardFocusedStyle : undefined),
          ...(root.resolved ? cardResolvedStyle : undefined),
        };
        return (
          <div
            key={root.id}
            // selector-check-ignore: ref callback writing to internal Map, not a UI query
            ref={(node) => {
              if (node) cardRefs.current.set(root.id, node);
              else cardRefs.current.delete(root.id);
            }}
            data-testid="preview-comment-card"
            data-comment-id={root.id}
            data-focused={isFocused ? "true" : "false"}
            style={style}
            onClick={() => onSelectThread(root.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectThread(root.id);
              }
            }}
            role="button"
            tabIndex={0}
          >
            {root.quote && <span style={quoteStyle}>“{root.quote}”</span>}
            <div style={messageStyle}>{root.message}</div>
            <div style={metaRowStyle}>
              <span>{root.author ?? "anonymous"}</span>
              <span>{formatDate(root.at)}</span>
            </div>
            {replies.length > 0 && (
              <div style={replyStyle} data-testid="preview-comment-replies">
                {replies.map((reply) => (
                  <div key={reply.id} style={{ marginBottom: "4px" }}>
                    <div style={messageStyle}>{reply.message}</div>
                    <div style={metaRowStyle}>
                      <span>{reply.author ?? "anonymous"}</span>
                      <span>{formatDate(reply.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
