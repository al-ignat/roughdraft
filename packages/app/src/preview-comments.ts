/**
 * Extract the comment thread set from a preview iframe's document.
 *
 * Comments persist in source HTML as `<span data-rd-comment>` blocks.
 * The preview-tab rail needs a flat, ordered view of them; this module
 * is the read-side counterpart to `appendHtmlAnchoredComment` /
 * `appendHtmlReply` in `@roughdraft/formats`.
 *
 * Pure DOM walk — no React, no fetch. The hidden span carries every
 * attribute we care about (`data-rd-id`, `data-rd-by`, `data-rd-at`,
 * `data-rd-re`, `data-rd-status`, `data-rd-anchor-quote`), so we don't
 * need to consult the on-disk file separately.
 */

export interface PreviewComment {
  id: string;
  message: string;
  author?: string;
  at?: string;
  /** `data-rd-edited-at` — present once the comment has been edited. */
  editedAt?: string;
  quote?: string;
  resolved: boolean;
  /** `data-rd-re` — the parent comment id when this is a reply. */
  replyTo?: string;
}

/**
 * Walk every `<span data-rd-comment>` block in the iframe document and
 * return them in source order. Spans without a `data-rd-id` are
 * skipped — they have no identity for the rail to key off.
 */
export function extractPreviewComments(doc: Document): PreviewComment[] {
  const spans = doc.querySelectorAll("span[data-rd-comment][data-rd-id]");
  const results: PreviewComment[] = [];
  for (const span of Array.from(spans)) {
    const id = span.getAttribute("data-rd-id");
    if (!id) continue;
    const message = (span.textContent ?? "").trim();
    if (!message) continue;
    const author = span.getAttribute("data-rd-by") ?? undefined;
    const at = span.getAttribute("data-rd-at") ?? undefined;
    const editedAt = span.getAttribute("data-rd-edited-at") ?? undefined;
    const quote = span.getAttribute("data-rd-anchor-quote") ?? undefined;
    const replyTo = span.getAttribute("data-rd-re") ?? undefined;
    const resolved = span.getAttribute("data-rd-status") === "resolved";
    results.push({
      id,
      message,
      author,
      at,
      editedAt,
      quote,
      resolved,
      replyTo,
    });
  }
  return results;
}

/**
 * Group comments into root + replies, preserving root order from the
 * source document. Replies inherit the order they appear in the file.
 * Used by the rail to render one card per thread.
 */
export interface PreviewCommentThread {
  root: PreviewComment;
  replies: PreviewComment[];
}

export function groupPreviewCommentThreads(
  comments: PreviewComment[],
): PreviewCommentThread[] {
  const roots: PreviewCommentThread[] = [];
  const rootById = new Map<string, PreviewCommentThread>();
  for (const c of comments) {
    if (!c.replyTo) {
      const thread = { root: c, replies: [] };
      roots.push(thread);
      rootById.set(c.id, thread);
    }
  }
  for (const c of comments) {
    if (!c.replyTo) continue;
    const thread = rootById.get(c.replyTo);
    if (thread) thread.replies.push(c);
  }
  return roots;
}
