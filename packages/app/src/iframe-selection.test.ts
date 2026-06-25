import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  computeIframeSelectionState,
  type IframeSelectionState,
} from "./iframe-selection";

/**
 * Build a minimal HTMLIFrameElement-shaped object that
 * `computeIframeSelectionState` can read. Real jsdom iframes don't
 * support full selection semantics across their contentDocument
 * boundary, so we synthesize the four properties the function actually
 * reads: contentDocument, defaultView, getBoundingClientRect, and the
 * selection's range.
 */
function fakeIframe(options: {
  hostLeft: number;
  hostTop: number;
  innerLeft: number;
  innerTop: number;
  width: number;
  height: number;
  quote: string;
}): HTMLIFrameElement {
  const range = {
    toString: () => options.quote,
    getBoundingClientRect: () =>
      new DOMRect(
        options.innerLeft,
        options.innerTop,
        options.width,
        options.height,
      ),
  };
  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => range as unknown as Range,
  };
  const defaultView = {
    getSelection: () => selection as unknown as Selection,
  };
  const contentDocument = { defaultView };
  return {
    contentDocument,
    getBoundingClientRect: () =>
      new DOMRect(options.hostLeft, options.hostTop, 800, 600),
  } as unknown as HTMLIFrameElement;
}

describe("computeIframeSelectionState", () => {
  it("returns null when there is no contentDocument", () => {
    const iframe = {
      contentDocument: null,
      getBoundingClientRect: () => new DOMRect(0, 0, 0, 0),
    } as unknown as HTMLIFrameElement;
    expect(computeIframeSelectionState(iframe)).toBeNull();
  });

  it("returns null when the selection is collapsed", () => {
    const dom = new JSDOM("<html><body><p>hello</p></body></html>");
    const iframe = {
      contentDocument: dom.window.document,
      getBoundingClientRect: () => new DOMRect(0, 0, 100, 100),
    } as unknown as HTMLIFrameElement;
    // jsdom's default selection is collapsed at offset 0
    expect(computeIframeSelectionState(iframe)).toBeNull();
  });

  it("returns null when the selection is whitespace-only", () => {
    const iframe = fakeIframe({
      hostLeft: 0,
      hostTop: 0,
      innerLeft: 0,
      innerTop: 0,
      width: 10,
      height: 10,
      quote: "   \n\t",
    });
    expect(computeIframeSelectionState(iframe)).toBeNull();
  });

  it("returns the quote and range when text is selected", () => {
    const iframe = fakeIframe({
      hostLeft: 0,
      hostTop: 0,
      innerLeft: 0,
      innerTop: 0,
      width: 80,
      height: 18,
      quote: "important phrase",
    });
    const state = computeIframeSelectionState(iframe) as IframeSelectionState;
    expect(state).not.toBeNull();
    expect(state.quote).toBe("important phrase");
    expect(state.range).toBeDefined();
  });

  it("translates the selection rect from iframe-viewport to parent-viewport coords", () => {
    const iframe = fakeIframe({
      hostLeft: 200, // iframe sits at (200, 100) in the parent viewport
      hostTop: 100,
      innerLeft: 30, // selection sits at (30, 50) inside the iframe
      innerTop: 50,
      width: 120,
      height: 24,
      quote: "selected",
    });
    const state = computeIframeSelectionState(iframe) as IframeSelectionState;
    expect(state.rect.left).toBe(230); // 200 + 30
    expect(state.rect.top).toBe(150); // 100 + 50
    expect(state.rect.width).toBe(120);
    expect(state.rect.height).toBe(24);
  });
});
