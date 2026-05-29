import { generateHTML, generateJSON, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import {
  RdDeletion,
  RdHighlight,
  RdInsertion,
  reviewMarkExtensions,
} from "./tiptap-html-extensions";

const extensions = [StarterKit, ...reviewMarkExtensions];

function findMarks(doc: JSONContent, markName: string): JSONContent[] {
  const matches: JSONContent[] = [];
  function walk(node: JSONContent) {
    if (node.marks?.some((mark) => mark.type === markName)) {
      matches.push(node);
    }
    for (const child of node.content ?? []) walk(child);
  }
  walk(doc);
  return matches;
}

describe("review mark extensions — schema", () => {
  it("exposes RdHighlight, RdInsertion, RdDeletion with the expected names", () => {
    expect(RdHighlight.name).toBe("rdHighlight");
    expect(RdInsertion.name).toBe("rdInsertion");
    expect(RdDeletion.name).toBe("rdDeletion");
    expect(reviewMarkExtensions).toHaveLength(3);
  });
});

describe("RdHighlight — parse & render", () => {
  it("parses a <mark data-rd-id> as a rdHighlight mark with id preserved", () => {
    const html = '<p>before <mark data-rd-id="h1">selected</mark> after</p>';
    const doc = generateJSON(html, extensions);
    const marked = findMarks(doc, "rdHighlight");
    expect(marked).toHaveLength(1);
    expect(marked[0].text).toBe("selected");
    const mark = marked[0].marks?.find((m) => m.type === "rdHighlight");
    expect(mark?.attrs?.id).toBe("h1");
  });

  it("round-trips a mark with full attributes through generateHTML", () => {
    const html =
      '<p><mark data-rd-id="h2" data-rd-status="resolved">text</mark></p>';
    const doc = generateJSON(html, extensions);
    const rendered = generateHTML(doc, extensions);
    expect(rendered).toContain("<mark");
    expect(rendered).toContain('data-rd-id="h2"');
    expect(rendered).toContain('data-rd-status="resolved"');
    expect(rendered).toContain(">text</mark>");
  });
});

describe("RdInsertion — parse & render", () => {
  it("parses <ins data-rd-id> as a rdInsertion mark and preserves by/at", () => {
    const html =
      '<p><ins data-rd-id="i1" data-rd-by="AI" data-rd-at="2026-05-21T10:17:00Z">added</ins></p>';
    const doc = generateJSON(html, extensions);
    const marked = findMarks(doc, "rdInsertion");
    expect(marked).toHaveLength(1);
    const mark = marked[0].marks?.find((m) => m.type === "rdInsertion");
    expect(mark?.attrs?.id).toBe("i1");
    expect(mark?.attrs?.by).toBe("AI");
    expect(mark?.attrs?.at).toBe("2026-05-21T10:17:00Z");
  });

  it("round-trips an insertion with pair attribute (substitution half)", () => {
    const html = '<p><ins data-rd-id="s1b" data-rd-pair="s1">new</ins></p>';
    const doc = generateJSON(html, extensions);
    const rendered = generateHTML(doc, extensions);
    expect(rendered).toContain(
      '<ins data-rd-id="s1b" data-rd-pair="s1">new</ins>',
    );
  });
});

describe("RdDeletion — parse & render", () => {
  it("parses <del data-rd-id> as a rdDeletion mark", () => {
    const html = '<p><del data-rd-id="d1">removed</del></p>';
    const doc = generateJSON(html, extensions);
    const marked = findMarks(doc, "rdDeletion");
    expect(marked).toHaveLength(1);
    const mark = marked[0].marks?.find((m) => m.type === "rdDeletion");
    expect(mark?.attrs?.id).toBe("d1");
  });

  it("round-trips a deletion with full metadata", () => {
    const html =
      '<p><del data-rd-id="s1a" data-rd-pair="s1" data-rd-by="AI" data-rd-at="2026-05-21T10:16:00Z">old text</del></p>';
    const doc = generateJSON(html, extensions);
    const rendered = generateHTML(doc, extensions);
    expect(rendered).toContain('<del data-rd-id="s1a"');
    expect(rendered).toContain('data-rd-pair="s1"');
    expect(rendered).toContain('data-rd-by="AI"');
    expect(rendered).toContain('data-rd-at="2026-05-21T10:16:00Z"');
    expect(rendered).toContain(">old text</del>");
  });
});

describe("review marks — coexist on the same text run", () => {
  it("allows highlight + insertion on the same word", () => {
    const html =
      '<p><mark data-rd-id="h3"><ins data-rd-id="i2" data-rd-by="AI">double-marked</ins></mark></p>';
    const doc = generateJSON(html, extensions);
    const marked = findMarks(doc, "rdHighlight");
    expect(marked).toHaveLength(1);
    const markTypes = marked[0].marks?.map((m) => m.type) ?? [];
    expect(markTypes).toContain("rdHighlight");
    expect(markTypes).toContain("rdInsertion");
  });
});
