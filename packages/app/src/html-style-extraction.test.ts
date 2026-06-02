import { describe, expect, it } from "vitest";
import { extractStyleBlocks, wrapWithScope } from "./html-style-extraction";

describe("extractStyleBlocks", () => {
  it("returns the raw CSS text of a single <style> block", () => {
    const preamble =
      "<!doctype html><html><head><style>body { color: red; }</style></head><body>";
    expect(extractStyleBlocks(preamble)).toEqual(["body { color: red; }"]);
  });

  it("returns each <style> block in document order", () => {
    const preamble =
      "<head><style>.a{color:red}</style><style>.b{color:blue}</style></head>";
    expect(extractStyleBlocks(preamble)).toEqual([
      ".a{color:red}",
      ".b{color:blue}",
    ]);
  });

  it("returns an empty array when no <style> block is present", () => {
    expect(extractStyleBlocks("<head><title>x</title></head>")).toEqual([]);
  });

  it("returns an empty array for an empty preamble", () => {
    expect(extractStyleBlocks("")).toEqual([]);
  });

  it("ignores <link rel='stylesheet'> elements (external stylesheets are out of scope)", () => {
    const preamble = '<head><link rel="stylesheet" href="x.css"></head>';
    expect(extractStyleBlocks(preamble)).toEqual([]);
  });

  it("handles attributes on the <style> tag", () => {
    const preamble =
      "<style type='text/css' media='screen'>p{margin:0}</style>";
    expect(extractStyleBlocks(preamble)).toEqual(["p{margin:0}"]);
  });

  it("preserves whitespace inside the CSS body", () => {
    const css = "\n  body {\n    color: red;\n  }\n";
    const preamble = `<style>${css}</style>`;
    expect(extractStyleBlocks(preamble)).toEqual([css]);
  });
});

describe("wrapWithScope", () => {
  it("wraps CSS text in @scope (.rd-doc-content) by default", () => {
    expect(wrapWithScope("body { color: red; }")).toBe(
      "@scope (.rd-doc-content) { body { color: red; } }",
    );
  });

  it("accepts a custom selector", () => {
    expect(wrapWithScope(".x { color: red; }", ".custom")).toBe(
      "@scope (.custom) { .x { color: red; } }",
    );
  });

  it("rewrites bare :root to :scope so authored variables land on the scope root", () => {
    expect(wrapWithScope(":root { --brand: red; }")).toBe(
      "@scope (.rd-doc-content) { :scope { --brand: red; } }",
    );
  });

  it("rewrites :root when combined with other selector parts", () => {
    expect(
      wrapWithScope(":root.dark, :root[data-mode='x'] { --brand: blue; }"),
    ).toBe(
      "@scope (.rd-doc-content) { :scope.dark, :scope[data-mode='x'] { --brand: blue; } }",
    );
  });

  it("rewrites :root inside nested at-rules like @media", () => {
    expect(
      wrapWithScope(
        "@media (prefers-color-scheme: dark) { :root { --brand: blue; } }",
      ),
    ).toBe(
      "@scope (.rd-doc-content) { @media (prefers-color-scheme: dark) { :scope { --brand: blue; } } }",
    );
  });

  it("does not rewrite identifiers that merely start with :root", () => {
    expect(wrapWithScope(":root-x { color: red; }")).toBe(
      "@scope (.rd-doc-content) { :root-x { color: red; } }",
    );
  });
});
