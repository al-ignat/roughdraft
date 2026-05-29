import { useEffect } from "react";
import { extractStyleBlocks, wrapWithScope } from "./html-style-extraction";

interface HtmlPreambleData {
  preamble: string;
  postamble: string;
  rawBody: string;
}

function decodePreamble(frontmatter: string | null): HtmlPreambleData | null {
  if (!frontmatter) return null;
  try {
    const parsed = JSON.parse(frontmatter) as HtmlPreambleData;
    if (
      typeof parsed.preamble !== "string" ||
      typeof parsed.postamble !== "string" ||
      typeof parsed.rawBody !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useHtmlScopedStyle(frontmatter: string | null): void {
  useEffect(() => {
    const data = decodePreamble(frontmatter);
    if (!data) return;
    const blocks = extractStyleBlocks(data.preamble);
    if (blocks.length === 0) return;

    const styleElement = document.createElement("style");
    styleElement.setAttribute("data-rd-scope", "");
    styleElement.textContent = blocks
      .map((css) => wrapWithScope(css))
      .join("\n");
    document.head.appendChild(styleElement);

    return () => {
      styleElement.remove();
    };
  }, [frontmatter]);
}

export function HtmlScopedStyle({
  frontmatter,
}: {
  frontmatter: string | null;
}): null {
  useHtmlScopedStyle(frontmatter);
  return null;
}
