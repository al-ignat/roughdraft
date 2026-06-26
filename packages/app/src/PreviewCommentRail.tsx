import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  /**
   * Replace a comment or reply's text. Resolves to `true` on success; the
   * edit composer stays open with the draft intact on `false`.
   */
  onEdit: (id: string, message: string) => Promise<boolean> | boolean;
  /** Delete a comment or reply. Deleting a root cascades its replies. */
  onDelete: (id: string) => Promise<void> | void;
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

const replyBlockStyle: CSSProperties = {
  marginBottom: "8px",
};

const cardFooterStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  marginTop: "8px",
};

const rowActionsStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  marginTop: "4px",
};

const composerStyle: CSSProperties = {
  marginTop: "6px",
};

const composerActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "6px",
  marginTop: "6px",
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

/** Stop a DOM event from bubbling to the card's select-thread handler. */
function stopBubble(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

interface ComposerProps {
  initialValue: string;
  placeholder: string;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (value: string) => Promise<boolean> | boolean;
  onClose: () => void;
  testidPrefix: string;
}

/**
 * Shared textarea composer for both replying and editing. Holds its own draft;
 * Esc cancels, Cmd/Ctrl+Enter submits. On a successful submit the parent closes
 * it; on failure it stays open with the draft intact.
 */
function Composer({
  initialValue,
  placeholder,
  submitLabel,
  submittingLabel,
  onSubmit,
  onClose,
  testidPrefix,
}: ComposerProps) {
  const [draft, setDraft] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit(trimmed);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, onSubmit, onClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div style={composerStyle} onClick={stopBubble} onKeyDown={stopBubble}>
      <Textarea
        className="min-h-12 text-xs"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={submitting}
        data-testid={`${testidPrefix}-textarea`}
      />
      <div style={composerActionsStyle}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={submitting}
          data-testid={`${testidPrefix}-cancel`}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void submit()}
          disabled={submitting || !draft.trim()}
          data-testid={`${testidPrefix}-send`}
        >
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}

interface DeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
  title: string;
  description: string;
  testidPrefix: string;
}

/** shadcn modal confirm for a destructive delete. Dismiss = cancel. */
function DeleteConfirm({
  open,
  onOpenChange,
  onConfirm,
  deleting,
  title,
  description,
  testidPrefix,
}: DeleteConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={stopBubble}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            data-testid={`${testidPrefix}-cancel`}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={deleting}
            data-testid={`${testidPrefix}-confirm`}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReplyRowProps {
  reply: PreviewComment;
  onEdit: (id: string, message: string) => Promise<boolean> | boolean;
  onDelete: (id: string) => Promise<void> | void;
}

/** A single reply with inline edit + delete. */
function ReplyRow({ reply, onEdit, onDelete }: ReplyRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(reply.id);
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }, [deleting, onDelete, reply.id]);

  return (
    <div style={replyBlockStyle}>
      {editing ? (
        <Composer
          initialValue={reply.message}
          placeholder="Edit reply…"
          submitLabel="Save"
          submittingLabel="Saving…"
          onSubmit={(message) => onEdit(reply.id, message)}
          onClose={() => setEditing(false)}
          testidPrefix="preview-reply-edit"
        />
      ) : (
        <>
          <div style={messageStyle}>{reply.message}</div>
          <div style={metaRowStyle}>
            <span>
              {reply.author ?? "anonymous"}
              {reply.editedAt ? " · edited" : ""}
            </span>
            <span>{formatDate(reply.at)}</span>
          </div>
          <div style={rowActionsStyle}>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                setEditing(true);
              }}
              data-testid="preview-reply-edit-open"
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                setConfirmOpen(true);
              }}
              data-testid="preview-reply-delete-open"
            >
              Delete
            </Button>
          </div>
          <DeleteConfirm
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            onConfirm={() => void confirmDelete()}
            deleting={deleting}
            title="Delete this reply?"
            description="This removes the reply from the document. This can't be undone."
            testidPrefix="preview-reply-delete"
          />
        </>
      )}
    </div>
  );
}

interface ThreadCardProps {
  root: PreviewComment;
  replies: PreviewComment[];
  isFocused: boolean;
  onSelect: (rootId: string) => void;
  onReply: (rootId: string, message: string) => Promise<boolean> | boolean;
  onToggleResolved: (rootId: string, resolved: boolean) => Promise<void> | void;
  onEdit: (id: string, message: string) => Promise<boolean> | boolean;
  onDelete: (id: string) => Promise<void> | void;
  registerRef: (id: string, node: HTMLDivElement | null) => void;
}

function ThreadCard({
  root,
  replies,
  isFocused,
  onSelect,
  onReply,
  onToggleResolved,
  onEdit,
  onDelete,
  registerRef,
}: ThreadCardProps) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const style: CSSProperties = {
    ...cardBaseStyle,
    ...(isFocused ? cardFocusedStyle : undefined),
    ...(root.resolved ? cardResolvedStyle : undefined),
  };

  const toggleResolved = useCallback(async () => {
    if (resolving) return;
    setResolving(true);
    try {
      await onToggleResolved(root.id, !root.resolved);
    } finally {
      setResolving(false);
    }
  }, [resolving, onToggleResolved, root.id, root.resolved]);

  const confirmDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(root.id);
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }, [deleting, onDelete, root.id]);

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
      {editing ? (
        <Composer
          initialValue={root.message}
          placeholder="Edit comment…"
          submitLabel="Save"
          submittingLabel="Saving…"
          onSubmit={(message) => onEdit(root.id, message)}
          onClose={() => setEditing(false)}
          testidPrefix="preview-edit"
        />
      ) : (
        <>
          <div style={messageStyle}>{root.message}</div>
          <div style={metaRowStyle}>
            <span>
              {root.author ?? "anonymous"}
              {root.editedAt ? " · edited" : ""}
            </span>
            <span>{formatDate(root.at)}</span>
          </div>
        </>
      )}
      {replies.length > 0 && (
        <div style={replyStyle} data-testid="preview-comment-replies">
          {replies.map((reply) => (
            <ReplyRow
              key={reply.id}
              reply={reply}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
      {replying ? (
        <Composer
          initialValue=""
          placeholder="Reply…"
          submitLabel="Reply"
          submittingLabel="Sending…"
          onSubmit={(message) => onReply(root.id, message)}
          onClose={() => setReplying(false)}
          testidPrefix="preview-reply"
        />
      ) : (
        !editing && (
          <div style={cardFooterStyle}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setReplying(true);
              }}
              data-testid="preview-reply-open"
            >
              Reply
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
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
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setEditing(true);
              }}
              data-testid="preview-edit-open"
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setConfirmOpen(true);
              }}
              data-testid="preview-delete-open"
            >
              Delete
            </Button>
          </div>
        )
      )}
      <DeleteConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void confirmDelete()}
        deleting={deleting}
        title="Delete this comment?"
        description={
          replies.length > 0
            ? "This removes the comment and its replies from the document. This can't be undone."
            : "This removes the comment from the document. This can't be undone."
        }
        testidPrefix="preview-delete"
      />
    </div>
  );
}

/**
 * Sidebar list of comment threads extracted from the preview iframe.
 * Document-ordered, click-to-focus, with inline reply/edit composers and
 * delete confirmation per thread.
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
  onEdit,
  onDelete,
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
          onEdit={onEdit}
          onDelete={onDelete}
          registerRef={registerRef}
        />
      ))}
    </aside>
  );
}
