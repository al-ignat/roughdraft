/**
 * Client wrapper around `POST /api/append-comment-with-anchor` for the
 * preview-tab anchored-comment flow.
 *
 * Pure data layer — no React. The pill UI calls this with the live
 * Range and an iframe contentDocument, we compute the canonical
 * AnchorMetadata, post it, and return the server's review-index
 * response.
 */

import { type AnchorMetadata, computeAnchorFromRange } from "./iframe-anchors";

export interface AppendAnchoredCommentArgs {
  projectPath: string;
  documentPath: string;
  contentDocument: Document;
  range: Range;
  message: string;
  author?: string;
}

export interface AppendAnchoredCommentResult {
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * Translate a live selection into a server POST, returning a thin
 * success/failure envelope. The caller is responsible for clearing the
 * iframe selection and re-rendering — once the server writes the file
 * the existing SSE → reload pipeline takes over.
 */
export async function appendAnchoredComment(
  args: AppendAnchoredCommentArgs,
): Promise<AppendAnchoredCommentResult> {
  const anchor = computeAnchorFromRange(args.range, args.contentDocument);
  if (!anchor) {
    return {
      ok: false,
      status: 0,
      error: "Selection could not be anchored.",
    };
  }

  return submitAnchoredComment({
    projectPath: args.projectPath,
    documentPath: args.documentPath,
    message: args.message,
    author: args.author,
    anchor,
  });
}

interface SubmitArgs {
  projectPath: string;
  documentPath: string;
  message: string;
  author?: string;
  anchor: AnchorMetadata;
}

async function submitAnchoredComment(
  args: SubmitArgs,
): Promise<AppendAnchoredCommentResult> {
  const url = new URL(
    "/api/append-comment-with-anchor",
    window.location.origin,
  );
  url.searchParams.set("projectPath", args.projectPath);
  url.searchParams.set("path", args.documentPath);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectPath: args.projectPath,
        path: args.documentPath,
        message: args.message,
        author: args.author,
        anchor: args.anchor,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) detail = json.error;
    } catch {
      // ignore JSON parse failure — keep the HTTP-status fallback
    }
    return { ok: false, status: response.status, error: detail };
  }

  return { ok: true, status: response.status };
}
