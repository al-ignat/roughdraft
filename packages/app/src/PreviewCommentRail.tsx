import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  groupPreviewCommentThreads,
  type PreviewComment,
} from "./preview-comments";

export interface PreviewCommentRailProps {
  comments: PreviewComment[];
  focusedThreadId: string | null;
  /** Called when the user clicks a thread card. Drives iframe scroll-to-mark. */
  onSelectThread: (rootId: string) => void;
  /**
   * Post a reply to the given thread. Resolves to `true` on success; the
   * composer stays open with the draft intact on `false`.
   */
  onReply: (rootId: string, message: string) => Promise<boolean> | boolean;
  /** Mark the thread resolved (`true`) or reopen it (`false`). */
  onToggleResolved: (rootId: string, resolved: boolean) => Promise<void> | void;
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

const cardFooterStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  marginTop: "6px",
  alignItems: "center",
};

const smallButtonStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: "6px",
  border: "1px solid #d4d4d8",
  background: "white",
  color: "#3f3f46",
  fontSize: "11px",
  cursor: "pointer",
};

const replyComposerStyle: CSSProperties = {
  marginTop: "6px",
};

const replyTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: "48px",
  resize: "vertical",
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid #d4d4d8",
  fontFamily: "inherit",
  fontSize: "12px",
  boxSizing: "border-box",
};

const replyActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "6px",
  marginTop: "6px",
};

const replyCancelStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: "6px",
  border: "1px solid #d4d4d8",
  background: "white",
  color: "#1a1a1a",
  fontSize: "11px",
  cursor: "pointer",
};

const replySendStyle: CSSProperties = {
  ...replyCancelStyle,
  background: "#1a1a1a",
  color: "white",
  borderColor: "#1a1a1a",
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

interface ThreadCardProps {
  root: PreviewComment;
  replies: PreviewComment[];
  isFocused: boolean;
  onSelect: (rootId: string) => void;
  onReply: (rootId: string, message: string) => Promise<boolean> | boolean;
  onToggleResolved: (rootId: string, resolved: boolean) => Promise<void> | void;
  registerRef: (id: string, node: HTMLDivElement | null) => void;
}

/** Stop a DOM event from bubbling to the card's select-thread handler. */
function stopBubble(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function ThreadCard({
  root,
  replies,
  isFocused,
  onSelect,
  onReply,
  onToggleResolved,
  registerRef,
}: ThreadCardProps) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);

  const toggleResolved = useCallback(async () => {
    if (resolving) return;
    setResolving(true);
    try {
      await onToggleResolved(root.id, !root.resolved);
    } finally {
      setResolving(false);
    }
  }, [resolving, onToggleResolved, root.id, root.resolved]);

  const style: CSSProperties = {
    ...cardBaseStyle,
    ...(isFocused ? cardFocusedStyle : undefined),
    ...(root.resolved ? cardResolvedStyle : undefined),
  };

  const closeComposer = useCallback(() => {
    setReplying(false);
    setDraft("");
  }, []);

  const submitReply = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onReply(root.id, trimmed);
      if (ok) {
        setDraft("");
        setReplying(false);
      }
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, onReply, root.id]);

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeComposer();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submitReply();
    }
  };

  return (
    <div
      // selector-check-ignore: ref callback writing to internal Map, not a UI query
      ref={(node) => registerRef(root.id, node)}
      data-testid="preview-comment-card"
      data-comment-id={root.id}
      data-focused={isFocused ? "true" : "false"}
      style={style}
      onClick={() => onSelect(root.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(root.id);
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
      {replying ? (
        <div
          style={replyComposerStyle}
          onClick={stopBubble}
          onKeyDown={stopBubble}
        >
          <textarea
            style={replyTextareaStyle}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleReplyKeyDown}
            placeholder="Reply…"
            disabled={submitting}
            data-testid="preview-reply-textarea"
          />
          <div style={replyActionsStyle}>
            <button
              type="button"
              style={replyCancelStyle}
              onClick={closeComposer}
              disabled={submitting}
              data-testid="preview-reply-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              style={replySendStyle}
              onClick={() => void submitReply()}
              disabled={submitting || !draft.trim()}
              data-testid="preview-reply-send"
            >
              {submitting ? "Sending…" : "Reply"}
            </button>
          </div>
        </div>
      ) : (
        <div style={cardFooterStyle}>
          <button
            type="button"
            style={smallButtonStyle}
            onClick={(event) => {
              event.stopPropagation();
              setReplying(true);
            }}
            data-testid="preview-reply-open"
          >
            Reply
          </button>
          <button
            type="button"
            style={smallButtonStyle}
            onClick={(event) => {
              event.stopPropagation();
              void toggleResolved();
            }}
            disabled={resolving}
            data-testid="preview-resolve-toggle"
          >
            {resolving
              ? root.resolved
                ? "Reopening…"
                : "Resolving…"
              : root.resolved
                ? "Reopen"
                : "Resolve"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Sidebar list of comment threads extracted from the preview iframe.
 * Document-ordered, click-to-focus, with an inline reply composer per
 * thread.
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
  onReply,
  onToggleResolved,
}: PreviewCommentRailProps) {
  const threads = useMemo(
    () => groupPreviewCommentThreads(comments),
    [comments],
  );

  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const registerRef = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) cardRefs.current.set(id, node);
    else cardRefs.current.delete(id);
  }, []);

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
      {threads.map(({ root, replies }) => (
        <ThreadCard
          key={root.id}
          root={root}
          replies={replies}
          isFocused={focusedThreadId === root.id}
          onSelect={onSelectThread}
          onReply={onReply}
          onToggleResolved={onToggleResolved}
          registerRef={registerRef}
        />
      ))}
    </aside>
  );
}
