# 0013: Preview-Tab Annotation Anchoring

## Context

ADR 0012 introduced an "open in new tab" preview (`/preview?path=...`) that renders an HTML document at full fidelity — the document's own `<style>`, fonts, and layout — by serving it as-is, outside Tiptap. ADR 0011 established that review state for HTML lives inline as `data-rd-*` attributes, with anchored comments pointing at a persisted `<mark data-rd-id>` via `data-rd-re`.

Phase 3.2e makes the preview tab annotatable: an author can select text in the rendered document and attach a comment without round-tripping through the Tiptap editor. This collides with two prior decisions. First, the preview's whole purpose is to show the document exactly as the recipient will see it — so wrapping a selected range in a persisted `<mark>` (the 0011 model) would mutate the author's HTML structure and disturb the very fidelity the preview exists to verify, and risk fighting the document's own CSS. Second, the document renders in a sandboxed iframe for isolation, so the selection lives in `iframe.contentDocument` while any Roughdraft annotation chrome must live in the parent frame.

The preview tab therefore needs a way to anchor a comment to a range **without rewriting the range's markup**, and a way to bridge selections and overlays across the iframe boundary.

## Decision

Preview-tab comments anchor to their target with a stored pointer, and the highlight is reconstructed at runtime rather than persisted.

**Anchor metadata (persisted).** A comment is a hidden span (as in ADR 0011) that additionally carries a Hypothes.is-style range pointer:

```html
<span data-rd-comment hidden
  data-rd-id="c1"
  data-rd-anchor-xpath="/html/body[1]/section[2]/p[1]"
  data-rd-anchor-start="4"
  data-rd-anchor-end="13"
  data-rd-anchor-quote="brown fox">Tighten this phrasing.</span>
```

- `data-rd-anchor-xpath` locates the text node's element; `data-rd-anchor-start`/`-end` are character offsets within it; `data-rd-anchor-quote` is the selected text for verification and fuzzy fallback.
- The span is appended to the HTML file. The file remains the single source of truth; no sidecar, consistent with ADR 0001 and 0011.

**Runtime highlight (not persisted).** On load, `applyCommentAnchors(doc)` resolves each anchor against the live DOM and wraps the range in `<mark data-rd-comment-highlight="<id>">`. These marks are DOM-only — they are never written back to the file. The author's saved HTML keeps its original structure; the highlight exists only while the document is being reviewed.

**One id, two homes.** The persisted `<span data-rd-comment data-rd-id>` and the runtime `<mark data-rd-comment-highlight>` share the comment id. That shared id drives two-way click-to-focus between the in-document highlight and the rail card.

**Parent-frame annotation layer.** The iframe is a rendering surface, not a place to inject chrome. Selections are observed from the parent via the iframe document's `selectionchange` event; the floating "add comment" pill and the comment rail are rendered in the parent document (the pill via a portal). Submitting a comment computes the anchor from the live `Range`, appends the span to the file, and lets the existing ADR 0012 SSE stream re-render and re-anchor.

**Coexistence with ADR 0011.** Two anchoring models now run side by side, selected by view mode:
- **Document mode** (Tiptap, ADR 0012) keeps ADR 0011's model: comments anchor to a persisted `<mark data-rd-id>` via `data-rd-re`.
- **Preview mode** (this ADR) uses `data-rd-anchor-*` with a runtime-only mark.

This is deliberate. Document mode already owns the DOM (Tiptap controls rendering), so a persisted mark is natural and cheap. Preview mode does not own the DOM — it must not rewrite it — so the pointer-plus-runtime-mark split is what preserves fidelity. The `data-rd-anchor-*` attributes are a new sub-namespace of the review-state namespace ADR 0011 reserved; anchoring is review state, so this stays within that boundary.

## Consequences

The preview tab becomes a first-class review surface while the document on disk stays byte-for-byte the structure the author wrote, minus the appended hidden comment spans. Authors reviewing for visual fidelity annotate in the exact rendering the recipient will see. Re-anchoring is resilient: an exact XPath+offset hit is preferred, with the stored quote available to recover when surrounding content shifts. Because highlights are rebuilt from the file on every load, the SSE re-render path needs no special handling for marks — they regenerate from the source of truth each time. The annotation layer reuses the existing preview route and SSE stream rather than adding a new transport.

The cost is a second anchoring model to maintain alongside ADR 0011's, and an anchor that is a best-effort pointer rather than an embedded marker: heavy edits to the document between annotation and re-open can move or invalidate a range faster than the quote fallback can recover it.

## What This Explicitly Does Not Mean

The runtime `<mark data-rd-comment-highlight>` is not part of the saved review format — tools reading the file see only the hidden comment span and its `data-rd-anchor-*` pointer, never the mark. The preview iframe remains a fidelity surface, not a security boundary; Roughdraft trusts the document author exactly as ADR 0012 states. XPath+offset anchoring is not a guarantee of stable anchoring across arbitrary edits; it is a robust-enough pointer for the review window, backed by the quote, not a content-addressed identity. And this ADR does not deprecate ADR 0011: persisted-mark anchoring remains correct for Document mode, where Roughdraft owns the rendered DOM.
