export type {
  CriticComment,
  EditorState,
  FormatAdapter,
  ParseOptions,
  ReplyOptions,
  ResolveOptions,
  ReviewIndex,
  ValidationResult,
} from "./format-adapter.js";

export { htmlAdapter } from "./html-adapter.js";
export { markdownAdapter } from "./markdown-adapter.js";

export {
  adapterFor,
  adapterForFormat,
  adapterForOrThrow,
  FORMAT_IDS,
  isFormatId,
  SUPPORTED_EXTENSIONS,
  UnsupportedFormatError,
  type FormatId,
} from "./registry.js";
