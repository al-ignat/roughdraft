import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AnchorMetadata,
  applyCommentAnchors,
  computeAnchorFromRange,
  computeXPath,
  resolveAnchor,
  unwrapHighlights,
  wrapRangeInHighlight,
} from "./iframe-anchors";

function loadDom(html: string): { doc: Document; window: Window } {
  const dom = new JSDOM(html);
  return { doc: dom.window.document, window: dom.window as unknown as Window };
}

describe("computeXPath", () => {
  it("returns a positional path for nested elements", () => {
    const { doc } = loadDom(
      "<html><body><section><p>a</p><p>b</p><p>c</p></section></body></html>",
    );
    const target = doc.querySelectorAll("p")[1]; // selector-check-ignore: jsdom fixture, not a UI selector
    expect(computeXPath(target, doc)).toBe("/html/body[1]/section[1]/p[2]");
  });

  it("uses tag-scoped sibling indices", () => {
    const { doc } = loadDom(
      "<html><body><h1>A</h1><p>X</p><h2>B</h2><p>Y</p></body></html>",
    );
    const secondP = doc.querySelectorAll("p")[1]; // selector-check-ignore: jsdom fixture, not a UI selector
    expect(computeXPath(secondP, doc)).toBe("/html/body[1]/p[2]");
  });
});

describe("computeAnchorFromRange + resolveAnchor (round-trip)", () => {
  it("anchors a selection inside a single text node and resolves it back", () => {
    const { doc } = loadDom(
      "<html><body><p>The brown fox jumped over the lazy dog.</p></body></html>",
    );
    const p = doc.querySelector("p"); // selector-check-ignore: jsdom fixture, not a UI selector
    if (!p?.firstChild) throw new Error("fixture broken");
    const range = doc.createRange();
    range.setStart(p.firstChild, 4); // "brown fox"
    range.setEnd(p.firstChild, 13);
    const anchor = computeAnchorFromRange(range, doc);
    expect(anchor).not.toBeNull();
    expect(anchor?.quote).toBe("brown fox");

    const resolved = resolveAnchor(doc, anchor as AnchorMetadata);
    expect(resolved).not.toBeNull();
    expect(resolved?.toString()).toBe("brown fox");
  });

  it("anchors a selection that spans multiple text nodes (text + inline element + text)", () => {
    const { doc } = loadDom(
      "<html><body><p>The <em>brown</em> fox jumped.</p></body></html>",
    );
    const p = doc.querySelector("p"); // selector-check-ignore: jsdom fixture, not a UI selector
    const em = doc.querySelector("em"); // selector-check-ignore: jsdom fixture, not a UI selector
    if (!p?.firstChild || !em?.firstChild) throw new Error("fixture broken");
    const range = doc.createRange();
    range.setStart(p.firstChild, 4); // start at "brown"
    range.setEnd(em.firstChild, 5); // through "brown"
    const anchor = computeAnchorFromRange(range, doc);
    expect(anchor?.quote).toBe("brown");

    const resolved = resolveAnchor(doc, anchor as AnchorMetadata);
    expect(resolved?.toString()).toBe("brown");
  });
});

describe("resolveAnchor: fallbacks", () => {
  it("falls back to quote search when the XPath is stale", () => {
    const { doc } = loadDom(
      "<html><body><p>Before paragraph.</p><p>The target quote.</p></body></html>",
    );
    const anchor: AnchorMetadata = {
      xpath: "/html/body[1]/p[3]", // non-existent
      start: 4,
      end: 16,
      quote: "target quote",
    };
    const resolved = resolveAnchor(doc, anchor);
    expect(resolved?.toString()).toBe("target quote");
  });

  it("returns null when neither XPath nor quote resolves", () => {
    const { doc } = loadDom(
      "<html><body><p>Some unrelated text.</p></body></html>",
    );
    const anchor: AnchorMetadata = {
      xpath: "/html/body[1]/p[99]",
      start: 0,
      end: 10,
      quote: "missing forever",
    };
    expect(resolveAnchor(doc, anchor)).toBeNull();
  });

  it("rejects an XPath-matched element whose text no longer matches the quote", () => {
    const { doc } = loadDom(
      "<html><body><p>The new content is different now.</p></body></html>",
    );
    const anchor: AnchorMetadata = {
      xpath: "/html/body[1]/p[1]",
      start: 4,
      end: 13,
      quote: "old content", // doesn't match what's at offset 4-13
    };
    // XPath resolves but quote mismatches → fallback to quote search →
    // quote isn't in the document either → null.
    expect(resolveAnchor(doc, anchor)).toBeNull();
  });
});

describe("wrapRangeInHighlight + unwrapHighlights", () => {
  let doc: Document;

  beforeEach(() => {
    doc = loadDom(
      "<html><body><p>The brown fox jumped over the lazy dog.</p></body></html>",
    ).doc;
  });

  afterEach(() => {
    unwrapHighlights(doc);
  });

  it("wraps a single-text-node range in a marker mark", () => {
    const p = doc.querySelector("p"); // selector-check-ignore: jsdom fixture, not a UI selector
    if (!p?.firstChild) throw new Error("fixture broken");
    const range = doc.createRange();
    range.setStart(p.firstChild, 4);
    range.setEnd(p.firstChild, 13);

    const wrapper = wrapRangeInHighlight(range, "c-1", doc);
    expect(wrapper).not.toBeNull();
    expect(wrapper?.tagName).toBe("MARK");
    expect(wrapper?.getAttribute("data-rd-comment-highlight")).toBe("c-1");
    expect(wrapper?.textContent).toBe("brown fox");
    expect(doc.getElementsByTagName("p")[0]?.textContent).toBe(
      "The brown fox jumped over the lazy dog.",
    );
  });

  it("unwrapHighlights removes every wrapper and restores the original tree", () => {
    const p = doc.getElementsByTagName("p")[0];
    if (!p?.firstChild) throw new Error("fixture broken");
    const range1 = doc.createRange();
    range1.setStart(p.firstChild, 4);
    range1.setEnd(p.firstChild, 9);
    wrapRangeInHighlight(range1, "c-1", doc);

    expect(doc.getElementsByTagName("mark").length).toBe(1);

    unwrapHighlights(doc);

    expect(doc.getElementsByTagName("mark").length).toBe(0);
    expect(doc.getElementsByTagName("p")[0]?.textContent).toBe(
      "The brown fox jumped over the lazy dog.",
    );
  });
});

describe("applyCommentAnchors", () => {
  function fixtureWithAnchoredComment(): Document {
    return loadDom(
      [
        "<html><head></head><body>",
        "<p>The brown fox jumped over the lazy dog.</p>",
        '<span data-rd-comment hidden data-rd-id="c1" data-rd-by="user"',
        '      data-rd-anchor-xpath="/html/body[1]/p[1]"',
        '      data-rd-anchor-start="4" data-rd-anchor-end="13"',
        '      data-rd-anchor-quote="brown fox">Looks good.</span>',
        "</body></html>",
      ].join(""),
    ).doc;
  }

  it("wraps the anchored text in a highlight mark and reports it as anchored", () => {
    const doc = fixtureWithAnchoredComment();
    const results = applyCommentAnchors(doc);
    expect(results).toEqual([{ commentId: "c1", status: "anchored" }]);
    const mark = doc.getElementsByTagName("mark")[0];
    expect(mark?.getAttribute("data-rd-comment-highlight")).toBe("c1");
    expect(mark?.textContent).toBe("brown fox");
  });

  it("skips comments whose status is 'resolved' so resolved highlights vanish", () => {
    const doc = loadDom(
      [
        "<html><body>",
        "<p>The brown fox jumped over the lazy dog.</p>",
        '<span data-rd-comment hidden data-rd-id="c1" data-rd-status="resolved"',
        '      data-rd-anchor-xpath="/html/body[1]/p[1]"',
        '      data-rd-anchor-start="4" data-rd-anchor-end="13"',
        '      data-rd-anchor-quote="brown fox">Old.</span>',
        "</body></html>",
      ].join(""),
    ).doc;
    const results = applyCommentAnchors(doc);
    expect(results).toEqual([]);
    expect(doc.getElementsByTagName("mark").length).toBe(0);
  });

  it("reports comments with an unresolvable anchor as 'unanchored'", () => {
    const doc = loadDom(
      [
        "<html><body>",
        "<p>The text here is completely different now.</p>",
        '<span data-rd-comment hidden data-rd-id="c2"',
        '      data-rd-anchor-xpath="/html/body[1]/p[7]"',
        '      data-rd-anchor-start="0" data-rd-anchor-end="3"',
        '      data-rd-anchor-quote="vanished phrase">Stale.</span>',
        "</body></html>",
      ].join(""),
    ).doc;
    const results = applyCommentAnchors(doc);
    expect(results).toEqual([{ commentId: "c2", status: "unanchored" }]);
    expect(doc.getElementsByTagName("mark").length).toBe(0);
  });

  it("injects the highlight stylesheet exactly once even when run repeatedly", () => {
    const doc = fixtureWithAnchoredComment();
    applyCommentAnchors(doc);
    applyCommentAnchors(doc);
    applyCommentAnchors(doc);
    const styles = doc.querySelectorAll("style#rd-comment-highlight-style"); // selector-check-ignore: jsdom fixture, not a UI selector
    expect(styles.length).toBe(1);
  });

  it("clears stale highlights before re-applying (SSE reload safety)", () => {
    const doc = fixtureWithAnchoredComment();
    applyCommentAnchors(doc);
    expect(doc.getElementsByTagName("mark").length).toBe(1);
    // Re-running must not duplicate marks
    applyCommentAnchors(doc);
    expect(doc.getElementsByTagName("mark").length).toBe(1);
  });

  it("ignores comments without anchor metadata (legacy doc-mode rd-id refs)", () => {
    const doc = loadDom(
      [
        "<html><body>",
        "<p>Some text.</p>",
        '<span data-rd-comment hidden data-rd-id="c3" data-rd-re="h1">No anchor.</span>',
        "</body></html>",
      ].join(""),
    ).doc;
    const results = applyCommentAnchors(doc);
    expect(results).toEqual([]);
    expect(doc.getElementsByTagName("mark").length).toBe(0);
  });
});
