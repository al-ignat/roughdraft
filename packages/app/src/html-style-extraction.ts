const STYLE_BLOCK_REGEX = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

export function extractStyleBlocks(preambleHtml: string): string[] {
  if (!preambleHtml) return [];
  const blocks: string[] = [];
  for (const match of preambleHtml.matchAll(STYLE_BLOCK_REGEX)) {
    blocks.push(match[1]);
  }
  return blocks;
}

export function wrapWithScope(
  cssText: string,
  selector = ".rd-doc-content",
): string {
  return `@scope (${selector}) { ${cssText} }`;
}
