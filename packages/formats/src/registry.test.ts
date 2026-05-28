import { describe, expect, it } from "vitest";
import { htmlAdapter } from "./html-adapter";
import { markdownAdapter } from "./markdown-adapter";
import {
  adapterFor,
  adapterForFormat,
  adapterForOrThrow,
  isFormatId,
  SUPPORTED_EXTENSIONS,
  UnsupportedFormatError,
} from "./registry";

describe("adapter registry", () => {
  it("returns markdownAdapter for .md and .markdown", () => {
    expect(adapterFor("/p/a.md")).toBe(markdownAdapter);
    expect(adapterFor("/p/a.markdown")).toBe(markdownAdapter);
  });

  it("returns htmlAdapter for .html and .htm", () => {
    expect(adapterFor("/p/a.html")).toBe(htmlAdapter);
    expect(adapterFor("/p/a.htm")).toBe(htmlAdapter);
  });

  it("returns null for unknown extensions", () => {
    expect(adapterFor("/p/a.txt")).toBeNull();
    expect(adapterFor("/p/a.json")).toBeNull();
    expect(adapterFor("/p/a")).toBeNull();
  });

  it("matches extensions case-insensitively", () => {
    expect(adapterFor("/p/a.HTML")).toBe(htmlAdapter);
    expect(adapterFor("/p/a.Md")).toBe(markdownAdapter);
  });

  it("exposes the supported extension list", () => {
    expect(SUPPORTED_EXTENSIONS).toEqual([".md", ".markdown", ".html", ".htm"]);
  });

  it("isFormatId narrows to FormatId", () => {
    expect(isFormatId("md")).toBe(true);
    expect(isFormatId("html")).toBe(true);
    expect(isFormatId("txt")).toBe(false);
    expect(isFormatId(undefined)).toBe(false);
  });

  it("adapterForFormat returns the right adapter", () => {
    expect(adapterForFormat("md")).toBe(markdownAdapter);
    expect(adapterForFormat("html")).toBe(htmlAdapter);
  });
});

describe("adapterForOrThrow", () => {
  it("returns the dispatched adapter when format is not provided", () => {
    expect(adapterForOrThrow("/p/a.html")).toBe(htmlAdapter);
  });

  it("overrides dispatch when format is provided", () => {
    expect(adapterForOrThrow("/p/a.txt", "html")).toBe(htmlAdapter);
    expect(adapterForOrThrow("/p/a.txt", "md")).toBe(markdownAdapter);
  });

  it("throws UnsupportedFormatError on unknown extension with no override", () => {
    expect(() => adapterForOrThrow("/p/a.txt")).toThrow(UnsupportedFormatError);
    try {
      adapterForOrThrow("/p/a.txt");
    } catch (e) {
      const err = e as UnsupportedFormatError;
      expect(err.filePath).toBe("/p/a.txt");
      expect(err.supported).toEqual([".md", ".markdown", ".html", ".htm"]);
      expect(err.message).toContain("--as md or --as html");
    }
  });
});
