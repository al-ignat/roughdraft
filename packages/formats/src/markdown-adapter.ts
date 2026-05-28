import {
  appendRoughdraftReply,
  extractRoughdraftReviewIndex,
  markRoughdraftResolved,
  validateRoughdraftMarkdown,
} from "@roughdraft/rfm";
import type {
  EditorState,
  FormatAdapter,
  ParseOptions,
  ReplyOptions,
  ResolveOptions,
  ReviewIndex,
  ValidationResult,
} from "./format-adapter";

const NOT_IMPLEMENTED =
  "markdownAdapter parse/serialize live in the app package " +
  "(packages/app/src/formats/markdown-adapter.ts) because they depend on " +
  "the editor's critic-markup module. The @roughdraft/formats export is " +
  "review-side only.";

export const markdownAdapter: FormatAdapter = {
  extension: ".md",

  parse(_rawContent: string, _options?: ParseOptions): EditorState {
    throw new Error(NOT_IMPLEMENTED);
  },

  serialize(_state: EditorState): string {
    throw new Error(NOT_IMPLEMENTED);
  },

  validateReview(content: string): ValidationResult {
    return validateRoughdraftMarkdown(content);
  },

  extractReviewIndex(content: string): ReviewIndex {
    return extractRoughdraftReviewIndex(content);
  },

  appendReply(content: string, options: ReplyOptions): string {
    return appendRoughdraftReply(content, options);
  },

  markResolved(content: string, options: ResolveOptions): string {
    return markRoughdraftResolved(content, options);
  },

  extractTitle(content: string): string | null {
    const firstLine = content.split("\n")[0] || "";
    const stripped = firstLine.replace(/^#*\s*/, "").trim();
    return stripped || null;
  },
};
