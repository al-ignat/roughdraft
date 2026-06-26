# 0014: HTML Content Theming

## Context

Roughdraft's application chrome supports a dark theme. HTML documents, unlike Markdown, carry their own presentation — a `<style>` block, fonts, colors, and layout authored to look a specific way. This raises a question the Markdown path never had to answer: when the app is in dark mode and the user opens a light-themed HTML document, whose theme wins?

An earlier backlog item ("decide an HTML dark-mode strategy") predates the preview tab. At the time, HTML was viewed only through Tiptap (ADR 0012, Document mode), where Roughdraft owns the rendered DOM and app styling can bleed into document content — so a light-authored document could end up with app-dark surfaces behind it, a genuine mismatch worth a strategy.

ADR 0012 then added the preview tab (`/preview?path=...`), which renders the document in a sandboxed iframe at full fidelity, and ADR 0013 made that tab the first-class review surface. That changes the premise: the iframe is its own document with its own stylesheet, and `RawHtmlPreviewPage` paints the iframe's container white. App dark mode cannot cross the iframe boundary into document content. The "strategy" question largely answers itself once the faithful-render path exists — but the answer should be recorded rather than left implicit, so it is not relitigated as a feature later.

## Decision

Roughdraft renders document HTML in the document's own theme and never imposes the application theme on document content.

- **Document content keeps its own theme.** An HTML document is shown as authored. Roughdraft does not invert colors, inject a background, or apply `prefers-color-scheme` overrides to the rendered content. In the preview tab this is structural: the document renders inside its own iframe, and the iframe's container is painted light so even an unstyled document lands on white, not on app-dark.
- **Application chrome follows the application theme.** The comment rail, the floating add-comment pill, the composer, and every other Roughdraft-owned surface around the document respond to dark mode as usual. The theme boundary is the document edge: app surfaces are themed, document content is not.

The preview tab already implements this; this ADR records it as the intended behavior rather than an accident of the iframe design.

## Consequences

The dark-mode question is settled without new code: a light-authored document looks the same in app dark mode as in app light mode, which is the point of a fidelity preview — the author sees what the recipient sees. An unstyled HTML document (no `<style>` of its own) renders dark-text-on-white even when the app is dark; this is accepted, because documents are light by default and forcing them dark would distort author intent and fight any partial styling the document does carry. The old backlog item closes as decided, not deferred.

## What This Explicitly Does Not Mean

This is not a rejection of a reading theme for HTML in principle. A future "read this document in dark mode" affordance is possible, but it would be an explicit, opt-in transform the user invokes on a specific document — not a default that the app theme silently applies to all HTML content. Nor does this constrain Document mode (Tiptap): where Roughdraft owns the rendered DOM, keeping document content visually faithful is a styling concern for that surface to honor, but the principle is the same — the app theme themes app chrome, not the author's content. And this says nothing about Markdown, whose presentation Roughdraft owns end to end and themes as part of its own chrome.
