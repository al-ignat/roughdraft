import {
  adapterFor as adapterForExtension,
  type FormatAdapter,
  type FormatId,
  htmlAdapter,
  markdownAdapter,
} from "./formats";
import {
  createEditorExtensions,
  createHtmlEditorExtensions,
} from "./editor-extensions";

export type SourceLanguage = "markdown" | "html";

export function adapterForDocument(
  filePath: string | null | undefined,
  override?: FormatId,
): FormatAdapter {
  if (override === "html") return htmlAdapter;
  if (override === "md") return markdownAdapter;
  if (!filePath) return markdownAdapter;
  const fromExtension = adapterForExtension(filePath);
  return fromExtension === htmlAdapter ? htmlAdapter : markdownAdapter;
}

export function sourceLanguageForAdapter(
  adapter: FormatAdapter,
): SourceLanguage {
  return adapter === htmlAdapter ? "html" : "markdown";
}

export function editorExtensionsForAdapter(
  adapter: FormatAdapter,
  placeholder: string,
) {
  return adapter === htmlAdapter
    ? createHtmlEditorExtensions(placeholder)
    : createEditorExtensions(placeholder);
}
