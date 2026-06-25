import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendAnchoredComment } from "./append-anchored-comment";

function buildRange(): { doc: Document; range: Range } {
  const dom = new JSDOM(
    "<html><body><p>The brown fox jumped over the lazy dog.</p></body></html>",
  );
  const doc = dom.window.document;
  const p = doc.getElementsByTagName("p")[0];
  if (!p?.firstChild) throw new Error("fixture broken");
  const range = doc.createRange();
  range.setStart(p.firstChild, 4); // "brown fox"
  range.setEnd(p.firstChild, 13);
  return { doc, range };
}

describe("appendAnchoredComment", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("http://localhost:7373/preview"),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the computed anchor and message to /api/append-comment-with-anchor", async () => {
    const { doc, range } = buildRange();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );

    const result = await appendAnchoredComment({
      projectPath: "/proj",
      documentPath: "deck.html",
      contentDocument: doc,
      range,
      message: "Looks good.",
      author: "user",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/append-comment-with-anchor");
    expect(calledInit?.method).toBe("POST");
    const body = JSON.parse(String(calledInit?.body));
    expect(body.message).toBe("Looks good.");
    expect(body.author).toBe("user");
    expect(body.anchor.quote).toBe("brown fox");
    expect(body.anchor.xpath).toBe("/html/body[1]/p[1]");
    expect(body.parentId).toBeUndefined();
  });

  it("returns ok=false with the server's error message on HTTP failure", async () => {
    const { doc, range } = buildRange();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Anchor mismatch." }), {
        status: 400,
      }),
    );

    const result = await appendAnchoredComment({
      projectPath: "/proj",
      documentPath: "deck.html",
      contentDocument: doc,
      range,
      message: "Hi.",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toBe("Anchor mismatch.");
  });

  it("returns ok=false when the selection cannot be anchored", async () => {
    const { doc } = buildRange();
    const collapsedRange = doc.createRange();
    const p = doc.getElementsByTagName("p")[0];
    if (!p?.firstChild) throw new Error("fixture broken");
    collapsedRange.setStart(p.firstChild, 0);
    collapsedRange.setEnd(p.firstChild, 0); // collapsed

    const result = await appendAnchoredComment({
      projectPath: "/proj",
      documentPath: "deck.html",
      contentDocument: doc,
      range: collapsedRange,
      message: "Hi.",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not be anchored/i);
  });
});
