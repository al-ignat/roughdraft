import { generateHTML, generateJSON, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { parseHTML } from "linkedom";
import type {
  CriticComment,
  EditorState,
  FormatAdapter,
  ParseOptions,
  ReplyOptions,
  ResolveOptions,
  ReviewIndex,
  ValidationResult,
} from "./format-adapter.js";
import {
  appendHtmlReply,
  extractHtmlReviewIndex,
  markHtmlResolved,
  validateHtmlReview,
} from "./html-review.js";
import {
  CommentAnchor,
  reviewMarkExtensions,
} from "./tiptap-html-extensions.js";

const extensions = [StarterKit, ...reviewMarkExtensions, CommentAnchor];

export const htmlReviewExtensions = reviewMarkExtensions;

interface HtmlPreambleData {
  preamble: string;
  postamble: string;
  rawBody: string;
}

function splitHtmlDocument(raw: string): {
  preamble: string;
  body: string;
  postamble: string;
} {
  const bodyOpen = raw.match(/<body\b[^>]*>/i);
  const bodyClose = raw.match(/<\/body\s*>/i);
  if (
    !bodyOpen ||
    !bodyClose ||
    bodyOpen.index === undefined ||
    bodyClose.index === undefined
  ) {
    return { preamble: "", body: raw, postamble: "" };
  }
  const bodyStart = bodyOpen.index + bodyOpen[0].length;
  const bodyEnd = bodyClose.index;
  return {
    preamble: raw.slice(0, bodyStart),
    body: raw.slice(bodyStart, bodyEnd),
    postamble: raw.slice(bodyEnd),
  };
}

function encodePreamble(data: HtmlPreambleData): string {
  return JSON.stringify(data);
}

function decodePreamble(frontmatter: string | null): HtmlPreambleData | null {
  if (!frontmatter) return null;
  try {
    const parsed = JSON.parse(frontmatter) as HtmlPreambleData;
    if (
      typeof parsed.preamble !== "string" ||
      typeof parsed.postamble !== "string" ||
      typeof parsed.rawBody !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function renderCommentSpans(comments: Map<string, CriticComment>): string {
  if (comments.size === 0) return "";
  const fragments: string[] = [];
  for (const comment of comments.values()) {
    const attrs: string[] = ["data-rd-comment", "hidden"];
    attrs.push(`data-rd-id="${escapeAttribute(comment.id)}"`);
    if (comment.authorId) {
      attrs.push(`data-rd-by="${escapeAttribute(comment.authorId)}"`);
    }
    if (comment.createdAt) {
      attrs.push(`data-rd-at="${escapeAttribute(comment.createdAt)}"`);
    }
    const re = comment.anchorRef ?? comment.parentCommentId ?? null;
    if (re) {
      attrs.push(`data-rd-re="${escapeAttribute(re)}"`);
    }
    fragments.push(
      `<span ${attrs.join(" ")}>${escapeHtmlText(comment.content)}</span>`,
    );
  }
  return fragments.join("");
}

function bridgeCommentAnchors(
  bodyHtml: string,
  comments: Map<string, CriticComment>,
): string {
  const anchorToCommentIds = new Map<string, string[]>();
  for (const [commentId, comment] of comments) {
    const anchorRef = comment.anchorRef;
    if (!anchorRef) continue;
    if (anchorRef.startsWith("c")) continue;
    const arr = anchorToCommentIds.get(anchorRef) ?? [];
    arr.push(commentId);
    anchorToCommentIds.set(anchorRef, arr);
  }
  if (anchorToCommentIds.size === 0) return bodyHtml;

  const { document } = parseHTML(
    `<!doctype html><html><body>${bodyHtml}</body></html>`,
  );
  const body = document.body;
  for (const [rdId, commentIds] of anchorToCommentIds) {
    const escapedId = rdId.replace(/"/g, '\\"');
    const target = body.querySelector(`[data-rd-id="${escapedId}"]`);
    if (!target?.parentNode) continue;
    const wrapper = document.createElement("span");
    wrapper.setAttribute("data-comment-ids", JSON.stringify(commentIds));
    target.parentNode.insertBefore(wrapper, target);
    wrapper.appendChild(target);
  }
  return body.innerHTML;
}

function stripCommentAnchorWrappers(bodyHtml: string): string {
  if (!bodyHtml.includes("data-comment-ids")) return bodyHtml;
  const { document } = parseHTML(
    `<!doctype html><html><body>${bodyHtml}</body></html>`,
  );
  const body = document.body;
  const wrappers = body.querySelectorAll("span[data-comment-ids]");
  for (const wrapper of Array.from(wrappers)) {
    const parent = wrapper.parentNode;
    if (!parent) continue;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    parent.removeChild(wrapper);
  }
  return body.innerHTML;
}

function extractCommentsFromBody(bodyHtml: string): {
  comments: Map<string, CriticComment>;
  bodyWithoutComments: string;
} {
  const { document } = parseHTML(
    `<!doctype html><html><body>${bodyHtml}</body></html>`,
  );
  const body = document.body;
  const comments = new Map<string, CriticComment>();
  const spans = body.querySelectorAll("[data-rd-comment]");
  for (const span of Array.from(spans)) {
    const id = span.getAttribute("data-rd-id");
    if (!id) continue;
    const by = span.getAttribute("data-rd-by");
    const at = span.getAttribute("data-rd-at");
    const re = span.getAttribute("data-rd-re");
    comments.set(id, {
      id,
      content: span.textContent ?? "",
      createdAt: at ?? "",
      authorType: by === "AI" ? "ai" : "user",
      authorId: by ?? null,
      parentCommentId: re?.startsWith("c") ? re : null,
      anchorRef: re ?? null,
    });
    span.remove();
  }
  return { comments, bodyWithoutComments: body.innerHTML };
}

export const htmlAdapter: FormatAdapter = {
  extension: ".html",

  parse(rawContent: string, _options?: ParseOptions): EditorState {
    const { preamble, body, postamble } = splitHtmlDocument(rawContent);
    const { comments, bodyWithoutComments } = extractCommentsFromBody(body);
    const bodyForEditor = bridgeCommentAnchors(bodyWithoutComments, comments);
    let doc: JSONContent;
    try {
      doc = generateJSON(bodyForEditor, extensions);
    } catch {
      doc = { type: "doc", content: [] };
    }
    return {
      doc,
      comments,
      frontmatter: encodePreamble({ preamble, postamble, rawBody: body }),
    };
  },

  serialize(state: EditorState): string {
    const data = decodePreamble(state.frontmatter);
    if (!data) {
      return "";
    }
    if (!state.dirty) {
      return data.preamble + data.rawBody + data.postamble;
    }
    const bodyFromDoc = stripCommentAnchorWrappers(
      generateHTML(state.doc, extensions),
    );
    const commentSpans = renderCommentSpans(state.comments);
    return data.preamble + bodyFromDoc + commentSpans + data.postamble;
  },

  validateReview(content: string): ValidationResult {
    return validateHtmlReview(content);
  },

  extractReviewIndex(content: string): ReviewIndex {
    return extractHtmlReviewIndex(content);
  },

  appendReply(content: string, options: ReplyOptions): string {
    return appendHtmlReply(content, options);
  },

  markResolved(content: string, options: ResolveOptions): string {
    return markHtmlResolved(content, options);
  },

  extractTitle(content: string): string | null {
    const { document } = parseHTML(content);
    const titleText = document.querySelector("title")?.textContent?.trim();
    if (titleText) return titleText;
    const h1Text = document.querySelector("h1")?.textContent?.trim();
    if (h1Text) return h1Text;
    return null;
  },
};
