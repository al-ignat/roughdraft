import type { JSONContent } from "@tiptap/core";
import type {
  AppendRoughdraftReplyOptions,
  MarkRoughdraftResolvedOptions,
  RfmReviewIndex,
  RfmValidationResult,
} from "@roughdraft/rfm";

export interface CriticComment {
  id: string;
  content: string;
  createdAt: string;
  authorType?: "user" | "ai";
  authorId?: string | null;
  parentCommentId?: string | null;
  anchorRef?: string | null;
}

export interface EditorState {
  doc: JSONContent;
  comments: Map<string, CriticComment>;
  frontmatter: string | null;
  dirty?: boolean;
}

export interface ParseOptions {
  resolveFileUrl?: (path: string) => string | null;
  resolveLinkUrl?: (path: string) => string | null;
}

export type ValidationResult = RfmValidationResult;
export type ReviewIndex = RfmReviewIndex;
export type ReplyOptions = AppendRoughdraftReplyOptions;
export type ResolveOptions = MarkRoughdraftResolvedOptions;

export interface FormatAdapter {
  extension: string;

  parse(rawContent: string, options?: ParseOptions): EditorState;
  serialize(state: EditorState): string;

  validateReview(content: string): ValidationResult;
  extractReviewIndex(content: string): ReviewIndex;

  appendReply(content: string, options: ReplyOptions): string;
  markResolved(content: string, options: ResolveOptions): string;

  extractTitle(content: string): string | null;
}
