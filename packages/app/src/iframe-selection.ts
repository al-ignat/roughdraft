/**
 * Cross-iframe selection observation for the preview-tab annotation flow.
 *
 * The preview tab renders the document inside an iframe. User selections
 * live in `iframe.contentDocument`, but the floating "Add comment" pill
 * lives in the parent. This module bridges that gap:
 *
 *   - `computeIframeSelectionState(iframe)` reads the iframe's current
 *     Selection and returns a parent-viewport-relative rect, the live
 *     Range, and the selected text. Returns null for empty / collapsed /
 *     whitespace-only selections.
 *
 *   - `useIframeSelection(iframeRef)` is a thin React hook that wires the
 *     iframe's `selectionchange` event and re-attaches across iframe
 *     reloads (which replace `contentDocument` wholesale). Exposes the
 *     current selection state plus a `clear()` callback for after a
 *     comment is submitted.
 */

import { type RefObject, useCallback, useEffect, useState } from "react";

export interface IframeSelectionState {
  range: Range;
  rect: DOMRect;
  quote: string;
}

/**
 * Read the iframe's current selection and translate its bounding rect
 * from iframe-viewport coordinates to parent-viewport coordinates so the
 * caller can position floating UI directly over the selected text.
 *
 * Returns null when there is no selection, the selection is collapsed,
 * or the selected text is whitespace-only.
 */
export function computeIframeSelectionState(
  iframe: HTMLIFrameElement,
): IframeSelectionState | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const view = doc.defaultView;
  if (!view) return null;
  const selection = view.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const quote = range.toString();
  if (!quote.trim()) return null;

  const innerRect = range.getBoundingClientRect();
  const hostRect = iframe.getBoundingClientRect();
  const rect = new DOMRect(
    hostRect.left + innerRect.left,
    hostRect.top + innerRect.top,
    innerRect.width,
    innerRect.height,
  );

  return { range, rect, quote };
}

/**
 * React hook: observe text selections inside an iframe and expose them
 * in parent-viewport coordinates.
 *
 * The hook attaches a `selectionchange` listener to the iframe's
 * `contentDocument` and re-attaches it on every iframe `load` event,
 * because navigating or refetching the iframe replaces
 * `contentDocument` with a new object.
 *
 * The returned `clear` callback resets the selection state without
 * touching the iframe's actual Selection — useful right after the user
 * submits a comment, so the pill disappears even though their selection
 * may technically still exist in the iframe.
 */
export function useIframeSelection(
  iframeRef: RefObject<HTMLIFrameElement | null>,
): {
  selection: IframeSelectionState | null;
  clear: () => void;
} {
  const [selection, setSelection] = useState<IframeSelectionState | null>(null);

  // Capture the iframe node in render scope and key the effect on it. The
  // preview shows a "Loading preview…" placeholder until the document fetch
  // resolves, so on the first render(s) `iframeRef.current` is null and the
  // iframe mounts only later. Depending on the stable ref *object* (the
  // previous `[iframeRef]`) meant the effect ran once against the missing
  // iframe and never re-ran, so the `selectionchange` listener was never
  // attached and the Add-comment pill never appeared. Keying on the node
  // identity re-runs the effect once the iframe is actually present.
  const iframe = iframeRef.current;

  useEffect(() => {
    if (!iframe) return;

    let detachInner: (() => void) | null = null;

    const update = () => {
      setSelection(computeIframeSelectionState(iframe));
    };

    const attachInner = () => {
      detachInner?.();
      const doc = iframe.contentDocument;
      if (!doc) {
        detachInner = null;
        return;
      }
      doc.addEventListener("selectionchange", update);
      detachInner = () => {
        doc.removeEventListener("selectionchange", update);
      };
    };

    attachInner();
    iframe.addEventListener("load", attachInner);

    return () => {
      detachInner?.();
      iframe.removeEventListener("load", attachInner);
    };
  }, [iframe]);

  const clear = useCallback(() => setSelection(null), []);

  return { selection, clear };
}
