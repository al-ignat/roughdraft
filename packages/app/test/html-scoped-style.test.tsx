import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HtmlScopedStyle } from "../src/HtmlScopedStyle";

const SCOPE_SELECTOR = "style[data-rd-scope]";

function findInjected(): HTMLStyleElement | null {
  // selector-check-ignore: the asserted DOM is the injected <style> element itself,
  // which has no semantic role for data-testid in production CSS.
  return document.head.querySelector(SCOPE_SELECTOR);
}

function findAllInjected(): HTMLStyleElement[] {
  // selector-check-ignore: see findInjected.
  return Array.from(document.head.querySelectorAll(SCOPE_SELECTOR));
}

function makeFrontmatter(preamble: string): string {
  return JSON.stringify({ preamble, postamble: "</body></html>", rawBody: "" });
}

describe("HtmlScopedStyle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    for (const el of findAllInjected()) {
      el.remove();
    }
  });

  it("injects a <style data-rd-scope> wrapping the preamble CSS in @scope", async () => {
    const preamble =
      "<!doctype html><html><head><style>body { color: red; }</style></head><body>";
    await act(async () => {
      root.render(<HtmlScopedStyle frontmatter={makeFrontmatter(preamble)} />);
    });
    const injected = findInjected();
    expect(injected).not.toBeNull();
    expect(injected?.textContent).toContain("@scope (.rd-doc-content) {");
    expect(injected?.textContent).toContain("body { color: red; }");
  });

  it("does not inject when the preamble has no <style> block", async () => {
    const preamble = "<head><title>x</title></head>";
    await act(async () => {
      root.render(<HtmlScopedStyle frontmatter={makeFrontmatter(preamble)} />);
    });
    expect(findInjected()).toBeNull();
  });

  it("does not inject when the frontmatter is null", async () => {
    await act(async () => {
      root.render(<HtmlScopedStyle frontmatter={null} />);
    });
    expect(findInjected()).toBeNull();
  });

  it("does not inject when the frontmatter is not parseable HtmlPreambleData", async () => {
    await act(async () => {
      root.render(<HtmlScopedStyle frontmatter="not-json" />);
    });
    expect(findInjected()).toBeNull();
  });

  it("replaces the injected style when the frontmatter changes", async () => {
    const first = makeFrontmatter("<style>p { color: red; }</style>");
    const second = makeFrontmatter("<style>p { color: blue; }</style>");
    await act(async () => {
      root.render(<HtmlScopedStyle frontmatter={first} />);
    });
    await act(async () => {
      root.render(<HtmlScopedStyle frontmatter={second} />);
    });
    const tags = findAllInjected();
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toContain("p { color: blue; }");
    expect(tags[0].textContent).not.toContain("p { color: red; }");
  });

  it("removes the injected style on unmount", async () => {
    const preamble = "<style>body { color: red; }</style>";
    await act(async () => {
      root.render(<HtmlScopedStyle frontmatter={makeFrontmatter(preamble)} />);
    });
    expect(findInjected()).not.toBeNull();
    await act(async () => {
      root.unmount();
    });
    expect(findInjected()).toBeNull();
  });

  it("concatenates multiple preamble <style> blocks", async () => {
    const preamble =
      "<style>.a{color:red}</style><style>.b{color:blue}</style>";
    await act(async () => {
      root.render(<HtmlScopedStyle frontmatter={makeFrontmatter(preamble)} />);
    });
    const injected = findInjected();
    expect(injected?.textContent).toContain(".a{color:red}");
    expect(injected?.textContent).toContain(".b{color:blue}");
  });
});
