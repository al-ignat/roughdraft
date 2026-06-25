/**
 * Anchor utilities for the preview-tab comment overlay.
 *
 * Comments persist in the source HTML as `<span data-rd-comment>` blocks
 * with optional `data-rd-anchor-xpath`, `data-rd-anchor-start`,
 * `data-rd-anchor-end`, `data-rd-anchor-quote` attributes. These functions
 * compute and resolve those anchors against a live DOM (typically the
 * iframe's contentDocument).
 *
 * Resolution strategy: try XPath + offset for precision; fall back to
 * quote search if XPath fails (common after the source file is edited
 * upstream of the anchored element).
 */

export interface AnchorMetadata {
  xpath: string;
  start: number;
  end: number;
  quote: string;
}

/**
 * Compute a canonical XPath from the document root to the given element.
 * Uses 1-indexed positional steps among element siblings of the same tag,
 * which is what `document.evaluate` expects.
 *
 * Returns "/" for the document element itself (rare edge case).
 */
export function computeXPath(element: Element, root: Document): string {
  if (element === root.documentElement) {
    return `/${element.tagName.toLowerCase()}`;
  }
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== root.documentElement) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const tagName = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (child) => child.tagName === current?.tagName,
    );
    const index = siblings.indexOf(current) + 1;
    segments.unshift(`${tagName}[${index}]`);
    current = parent;
  }
  return `/${root.documentElement.tagName.toLowerCase()}/${segments.join("/")}`;
}

/**
 * Compute an anchor from a Range — the result of a user's selection.
 *
 * Picks the closest element ancestor that fully contains the range,
 * computes char offsets in its text content, and captures the quote.
 *
 * Returns null if the range is collapsed or spans outside an element.
 */
export function computeAnchorFromRange(
  range: Range,
  doc: Document,
): AnchorMetadata | null {
  if (range.collapsed) return null;
  const container = closestCommonElement(range);
  if (!container) return null;

  const text = container.textContent ?? "";
  const start = textOffsetWithin(
    container,
    range.startContainer,
    range.startOffset,
  );
  const end = textOffsetWithin(container, range.endContainer, range.endOffset);
  if (start < 0 || end < 0 || end <= start) return null;

  return {
    xpath: computeXPath(container, doc),
    start,
    end,
    quote: text.slice(start, end),
  };
}

/**
 * Resolve an anchor to a live Range in the given document.
 *
 * Tries XPath + offsets first; falls back to a quote search if the XPath
 * doesn't resolve or the offsets don't match the recorded quote.
 *
 * Returns null if no anchor candidate is found.
 */
export function resolveAnchor(
  doc: Document,
  anchor: AnchorMetadata,
): Range | null {
  const direct = resolveByXPath(doc, anchor);
  if (direct) return direct;
  return resolveByQuote(doc, anchor.quote);
}

/**
 * Wrap a Range in a `<mark>` highlight element. The wrapper is
 * `data-rd-comment-highlight`-tagged with the comment id for click
 * routing and styling.
 *
 * The wrapper is inserted into the iframe's live DOM only — it does NOT
 * affect the source file.
 *
 * Returns the wrapper, or null if the range cannot be wrapped (e.g. it
 * spans multiple block elements).
 */
export function wrapRangeInHighlight(
  range: Range,
  commentId: string,
  doc: Document,
): HTMLElement | null {
  const wrapper = doc.createElement("mark");
  wrapper.setAttribute("data-rd-comment-highlight", commentId);
  try {
    range.surroundContents(wrapper);
    return wrapper;
  } catch {
    // surroundContents throws when the range partially covers nodes;
    // graceful fallback: clone the range contents and replace.
    try {
      const contents = range.extractContents();
      wrapper.appendChild(contents);
      range.insertNode(wrapper);
      return wrapper;
    } catch {
      return null;
    }
  }
}

/**
 * Walk every hidden `<span data-rd-comment>` block with anchor metadata
 * in the document, resolve its anchor, and wrap the matching text in a
 * highlight mark. Resolved comments (`data-rd-status="resolved"`) are
 * skipped per the preview-tab UX decision — see preview-as-editor-plan.md.
 *
 * Each call clears any previously-applied highlights first, so this is
 * safe to invoke after an SSE reload or any other document mutation.
 *
 * Returns one record per processed comment so the caller (the React
 * rail) can show which comments failed to anchor and need manual
 * re-anchoring.
 */
export function applyCommentAnchors(doc: Document): AppliedAnchor[] {
  ensureHighlightStyle(doc);
  unwrapHighlights(doc);

  const spans = doc.querySelectorAll(
    'span[data-rd-comment][data-rd-anchor-xpath]:not([data-rd-status="resolved"])',
  );
  const results: AppliedAnchor[] = [];

  for (const span of Array.from(spans)) {
    const commentId = span.getAttribute("data-rd-id");
    if (!commentId) continue;

    const xpath = span.getAttribute("data-rd-anchor-xpath") ?? "";
    const startAttr = span.getAttribute("data-rd-anchor-start");
    const endAttr = span.getAttribute("data-rd-anchor-end");
    const quote = span.getAttribute("data-rd-anchor-quote") ?? "";

    const start = startAttr === null ? Number.NaN : Number(startAttr);
    const end = endAttr === null ? Number.NaN : Number(endAttr);

    if (!xpath || Number.isNaN(start) || Number.isNaN(end) || !quote) {
      results.push({ commentId, status: "unanchored" });
      continue;
    }

    const range = resolveAnchor(doc, { xpath, start, end, quote });
    if (!range) {
      results.push({ commentId, status: "unanchored" });
      continue;
    }

    const wrapper = wrapRangeInHighlight(range, commentId, doc);
    results.push({
      commentId,
      status: wrapper ? "anchored" : "unanchored",
    });
  }

  return results;
}

export interface AppliedAnchor {
  commentId: string;
  status: "anchored" | "unanchored";
}

const HIGHLIGHT_STYLE_ID = "rd-comment-highlight-style";

/**
 * Inject the highlight stylesheet into the iframe's document head
 * exactly once per document. Uses `!important` so authored styles in
 * the source HTML can't accidentally hide our marks.
 */
function ensureHighlightStyle(doc: Document): void {
  if (doc.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
mark[data-rd-comment-highlight] {
  background-color: rgba(255, 213, 79, 0.45) !important;
  color: inherit !important;
  padding: 0 1px;
  border-radius: 2px;
  cursor: pointer;
}
`.trim();
  (doc.head ?? doc.documentElement).appendChild(style);
}

/**
 * Remove every `[data-rd-comment-highlight]` wrapper from the document,
 * lifting its children back into the parent. Used before a re-anchor
 * pass after an SSE reload.
 */
export function unwrapHighlights(doc: Document): void {
  const wrappers = doc.querySelectorAll("mark[data-rd-comment-highlight]");
  for (const wrapper of Array.from(wrappers)) {
    const parent = wrapper.parentNode;
    if (!parent) continue;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    parent.removeChild(wrapper);
    parent.normalize();
  }
}

// --- internal helpers ---

function closestCommonElement(range: Range): Element | null {
  let node: Node | null = range.commonAncestorContainer;
  while (node && node.nodeType !== Node.ELEMENT_NODE) {
    node = node.parentNode;
  }
  return node as Element | null;
}

/**
 * Compute the char offset of a position (node, offset) within the given
 * container's text content. Returns -1 if the position is outside.
 */
function textOffsetWithin(
  container: Element,
  targetNode: Node,
  targetOffset: number,
): number {
  let offset = 0;
  const walker = container.ownerDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
  );
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += (node.textContent ?? "").length;
    node = walker.nextNode();
  }
  // The targetNode may be an element rather than a text node, in which
  // case the offset is the index among its children. Resolve to the
  // start of the n-th child's text content.
  if (
    targetNode.nodeType === Node.ELEMENT_NODE &&
    container.contains(targetNode)
  ) {
    const element = targetNode as Element;
    const child = element.childNodes[targetOffset];
    if (!child) {
      return (
        collectTextLength(container, element) +
        (element.textContent ?? "").length
      );
    }
    return collectTextLength(container, child);
  }
  return -1;
}

/**
 * Walk text nodes from the start of `container` up to (but not
 * including) `until`, summing their lengths.
 */
function collectTextLength(container: Element, until: Node): number {
  let length = 0;
  const walker = container.ownerDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
  );
  let node: Node | null = walker.nextNode();
  while (node) {
    if (until.contains(node) || node === until) {
      return length;
    }
    length += (node.textContent ?? "").length;
    node = walker.nextNode();
  }
  return length;
}

function resolveByXPath(doc: Document, anchor: AnchorMetadata): Range | null {
  let element: Element | null = null;
  try {
    const result = doc.evaluate(
      anchor.xpath,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    const node = result.singleNodeValue;
    if (node && node.nodeType === Node.ELEMENT_NODE) {
      element = node as Element;
    }
  } catch {
    return null;
  }
  if (!element) return null;

  const range = rangeForTextOffsets(element, anchor.start, anchor.end);
  if (!range) return null;

  // Confirm the resolved text matches the recorded quote — guards
  // against XPath collisions where the document has been re-edited.
  if (range.toString() !== anchor.quote) return null;

  return range;
}

function resolveByQuote(doc: Document, quote: string): Range | null {
  if (!quote) return null;
  const walker = doc.createTreeWalker(doc.body ?? doc, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const index = text.indexOf(quote);
    if (index >= 0) {
      const range = doc.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + quote.length);
      return range;
    }
    node = walker.nextNode();
  }
  return null;
}

function rangeForTextOffsets(
  container: Element,
  start: number,
  end: number,
): Range | null {
  const doc = container.ownerDocument;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let runningOffset = 0;
  let startNode: Node | null = null;
  let startNodeOffset = 0;
  let endNode: Node | null = null;
  let endNodeOffset = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const nodeStart = runningOffset;
    const nodeEnd = runningOffset + text.length;
    if (!startNode && start >= nodeStart && start <= nodeEnd) {
      startNode = node;
      startNodeOffset = start - nodeStart;
    }
    if (!endNode && end >= nodeStart && end <= nodeEnd) {
      endNode = node;
      endNodeOffset = end - nodeStart;
    }
    if (startNode && endNode) break;
    runningOffset = nodeEnd;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return null;
  const range = doc.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);
  return range;
}
