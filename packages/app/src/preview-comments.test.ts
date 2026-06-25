import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  extractPreviewComments,
  groupPreviewCommentThreads,
} from "./preview-comments";

function buildDoc(body: string): Document {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`);
  return dom.window.document;
}

describe("extractPreviewComments", () => {
  it("returns one entry per data-rd-comment span in source order", () => {
    const doc = buildDoc(`
      <p>Hello <span data-rd-comment hidden data-rd-id="c1" data-rd-by="ada">First.</span> world.</p>
      <p>More <span data-rd-comment hidden data-rd-id="c2" data-rd-by="ben">Second.</span> text.</p>
    `);
    const comments = extractPreviewComments(doc);
    expect(comments.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(comments[0]?.message).toBe("First.");
    expect(comments[0]?.author).toBe("ada");
    expect(comments[1]?.message).toBe("Second.");
  });

  it("captures resolved status from data-rd-status", () => {
    const doc = buildDoc(`
      <span data-rd-comment hidden data-rd-id="c1">Open.</span>
      <span data-rd-comment hidden data-rd-id="c2" data-rd-status="resolved">Closed.</span>
    `);
    const [open, closed] = extractPreviewComments(doc);
    expect(open?.resolved).toBe(false);
    expect(closed?.resolved).toBe(true);
  });

  it("threads replies via data-rd-re without losing parent context", () => {
    const doc = buildDoc(`
      <span data-rd-comment hidden data-rd-id="c1">Root.</span>
      <span data-rd-comment hidden data-rd-id="c2" data-rd-re="c1">Reply.</span>
    `);
    const comments = extractPreviewComments(doc);
    expect(comments[0]?.replyTo).toBeUndefined();
    expect(comments[1]?.replyTo).toBe("c1");
  });

  it("captures anchor quote when present so the rail can show context", () => {
    const doc = buildDoc(`
      <span data-rd-comment hidden data-rd-id="c1" data-rd-anchor-quote="brown fox">Tighten this.</span>
    `);
    const [c] = extractPreviewComments(doc);
    expect(c?.quote).toBe("brown fox");
  });

  it("skips spans without data-rd-id — they have no rail identity", () => {
    const doc = buildDoc(`
      <span data-rd-comment hidden>No id, ignored.</span>
      <span data-rd-comment hidden data-rd-id="c1">Kept.</span>
    `);
    const comments = extractPreviewComments(doc);
    expect(comments.map((c) => c.id)).toEqual(["c1"]);
  });

  it("returns an empty list when the document has no comments", () => {
    const doc = buildDoc(`<p>Just text, no comments here.</p>`);
    expect(extractPreviewComments(doc)).toEqual([]);
  });
});

describe("groupPreviewCommentThreads", () => {
  it("groups replies under their parent in source order", () => {
    const doc = buildDoc(`
      <span data-rd-comment hidden data-rd-id="r1">Root one.</span>
      <span data-rd-comment hidden data-rd-id="r2">Root two.</span>
      <span data-rd-comment hidden data-rd-id="reply1a" data-rd-re="r1">Reply A.</span>
      <span data-rd-comment hidden data-rd-id="reply1b" data-rd-re="r1">Reply B.</span>
      <span data-rd-comment hidden data-rd-id="reply2" data-rd-re="r2">Reply for two.</span>
    `);
    const threads = groupPreviewCommentThreads(extractPreviewComments(doc));
    expect(threads.map((t) => t.root.id)).toEqual(["r1", "r2"]);
    expect(threads[0]?.replies.map((r) => r.id)).toEqual([
      "reply1a",
      "reply1b",
    ]);
    expect(threads[1]?.replies.map((r) => r.id)).toEqual(["reply2"]);
  });

  it("drops replies pointing at a missing root rather than crashing", () => {
    const doc = buildDoc(`
      <span data-rd-comment hidden data-rd-id="orphan" data-rd-re="ghost">Reply.</span>
    `);
    const threads = groupPreviewCommentThreads(extractPreviewComments(doc));
    expect(threads).toEqual([]);
  });
});
