import type { FormatAdapter } from "./format-adapter.js";
import { htmlAdapter } from "./html-adapter.js";
import { markdownAdapter } from "./markdown-adapter.js";

function extname(filename: string): string {
  const lastSlash = Math.max(
    filename.lastIndexOf("/"),
    filename.lastIndexOf("\\"),
  );
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0 || lastDot < lastSlash || lastDot === filename.length - 1) {
    return "";
  }
  return filename.slice(lastDot);
}

export type FormatId = "md" | "html";

const REGISTRY: Record<string, FormatAdapter> = {
  ".md": markdownAdapter,
  ".markdown": markdownAdapter,
  ".html": htmlAdapter,
  ".htm": htmlAdapter,
};

const FORMAT_TO_EXTENSION: Record<FormatId, string> = {
  md: ".md",
  html: ".html",
};

export const SUPPORTED_EXTENSIONS = Object.keys(REGISTRY);

export const FORMAT_IDS: ReadonlyArray<FormatId> = ["md", "html"];

export function adapterFor(filePath: string): FormatAdapter | null {
  const ext = extname(filePath).toLowerCase();
  return REGISTRY[ext] ?? null;
}

export function adapterForFormat(format: FormatId): FormatAdapter {
  return REGISTRY[FORMAT_TO_EXTENSION[format]];
}

export function isFormatId(value: unknown): value is FormatId {
  return value === "md" || value === "html";
}

export function adapterForOrThrow(
  filePath: string,
  format?: FormatId,
): FormatAdapter {
  if (format) {
    return adapterForFormat(format);
  }
  const adapter = adapterFor(filePath);
  if (!adapter) {
    throw new UnsupportedFormatError(filePath, SUPPORTED_EXTENSIONS);
  }
  return adapter;
}

export class UnsupportedFormatError extends Error {
  constructor(
    public filePath: string,
    public supported: ReadonlyArray<string>,
  ) {
    super(
      `Roughdraft does not recognize the extension of "${filePath}". ` +
        `Supported: ${supported.join(", ")}. ` +
        `Use --as md or --as html to override.`,
    );
    this.name = "UnsupportedFormatError";
  }
}
