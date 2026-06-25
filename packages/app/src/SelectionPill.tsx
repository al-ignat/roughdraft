import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface SelectionPillProps {
  /**
   * Parent-viewport-relative rect describing where the user's selection
   * sits on screen. Comes from `useIframeSelection`.
   */
  rect: DOMRect;
  /**
   * Whether the comment is currently being submitted. Disables the form
   * and shows a "Sending…" label.
   */
  submitting?: boolean;
  /**
   * Called when the user clicks Send. The pill closes automatically
   * after a successful submit (see resetMessage below); the parent is
   * still responsible for clearing the iframe selection.
   */
  onSubmit: (message: string) => Promise<void> | void;
  /**
   * Called when the user clicks Cancel or presses Escape.
   */
  onCancel: () => void;
}

const PILL_OFFSET_PX = 8;
const PILL_WIDTH_PX = 320;

const pillBaseStyle: CSSProperties = {
  position: "fixed",
  width: `${PILL_WIDTH_PX}px`,
  background: "white",
  color: "#1a1a1a",
  border: "1px solid #d4d4d8",
  borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
  padding: "8px",
  zIndex: 2147483647,
  fontFamily: "system-ui, sans-serif",
  fontSize: "13px",
};

const triggerStyle: CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid transparent",
  background: "#facc15",
  color: "#1a1a1a",
  fontWeight: 500,
  cursor: "pointer",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: "64px",
  resize: "vertical",
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid #d4d4d8",
  fontFamily: "inherit",
  fontSize: "13px",
  boxSizing: "border-box",
};

const actionsRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "6px",
  marginTop: "6px",
};

const buttonBase: CSSProperties = {
  padding: "4px 10px",
  borderRadius: "6px",
  border: "1px solid #d4d4d8",
  background: "white",
  color: "#1a1a1a",
  fontSize: "12px",
  cursor: "pointer",
};

const sendButtonStyle: CSSProperties = {
  ...buttonBase,
  background: "#1a1a1a",
  color: "white",
  borderColor: "#1a1a1a",
};

/**
 * Floating UI shown next to a user's selection inside the preview
 * iframe. Two states: collapsed "Add comment" trigger button, and
 * expanded composer (textarea + Send/Cancel).
 *
 * Rendered into `document.body` via portal so it can sit above the
 * iframe regardless of stacking context.
 */
export function SelectionPill({
  rect,
  submitting = false,
  onSubmit,
  onCancel,
}: SelectionPillProps) {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");

  // When the underlying selection changes (rect identity changes), collapse
  // the pill back to its trigger state — the user moved their selection
  // and is not yet committed to commenting on this new range.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rect is the change trigger; the effect body intentionally does not read it.
  useEffect(() => {
    setExpanded(false);
    setMessage("");
  }, [rect]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const trimmed = message.trim();
      if (!trimmed) return;
      await onSubmit(trimmed);
      setMessage("");
      setExpanded(false);
    },
    [message, onSubmit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        message.trim()
      ) {
        event.preventDefault();
        void handleSubmit(event as unknown as FormEvent);
      }
    },
    [handleSubmit, message, onCancel],
  );

  const style: CSSProperties = {
    ...pillBaseStyle,
    top: `${rect.bottom + PILL_OFFSET_PX}px`,
    left: `${rect.left}px`,
  };

  const content = expanded ? (
    <form
      style={style}
      onSubmit={handleSubmit}
      data-testid="selection-pill-composer"
    >
      <textarea
        style={textareaStyle}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Comment on the selection…"
        disabled={submitting}
        data-testid="selection-pill-textarea"
      />
      <div style={actionsRowStyle}>
        <button
          type="button"
          style={buttonBase}
          onClick={onCancel}
          disabled={submitting}
          data-testid="selection-pill-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          style={sendButtonStyle}
          disabled={submitting || !message.trim()}
          data-testid="selection-pill-send"
        >
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  ) : (
    <div style={style} data-testid="selection-pill-trigger">
      <button
        type="button"
        style={triggerStyle}
        onClick={() => setExpanded(true)}
        data-testid="selection-pill-add-comment"
      >
        Add comment
      </button>
    </div>
  );

  return createPortal(content, document.body);
}
