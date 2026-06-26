/**
 * Client wrapper around `POST /api/append-comment-with-anchor` for the
 * preview-tab anchored-comment flow.
 *
 * Pure data layer — no React. The pill UI calls this with the live
 * Range and an iframe contentDocument, we compute the canonical
 * AnchorMetadata, post it, and return the server's review-index
 * response.
 */

import { computeAnchorFromRange } from "./iframe-anchors";

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

  return postJson(
    "/api/append-comment-with-anchor",
    args.projectPath,
    args.documentPath,
    {
      message: args.message,
      author: args.author,
      anchor,
    },
  );
}

export interface AppendReplyArgs {
  projectPath: string;
  documentPath: string;
  parentId: string;
  message: string;
  author?: string;
}

/**
 * Post a reply to an existing comment thread. Replies attach to their
 * parent via `parentId` (persisted as `data-rd-re`) and carry no anchor of
 * their own — they live wherever the root comment is anchored.
 */
export async function appendReply(
  args: AppendReplyArgs,
): Promise<AppendAnchoredCommentResult> {
  return postJson(
    "/api/append-comment-with-anchor",
    args.projectPath,
    args.documentPath,
    {
      parentId: args.parentId,
      message: args.message,
      author: args.author,
    },
  );
}

export interface SetCommentResolvedArgs {
  projectPath: string;
  documentPath: string;
  targetId: string;
  resolved: boolean;
}

/**
 * Toggle a comment's resolved state via `POST /api/set-comment-status`.
 * `resolved: true` marks it resolved; `false` reopens it.
 */
export async function setCommentResolved(
  args: SetCommentResolvedArgs,
): Promise<AppendAnchoredCommentResult> {
  return postJson(
    "/api/set-comment-status",
    args.projectPath,
    args.documentPath,
    {
      targetId: args.targetId,
      resolved: args.resolved,
    },
  );
}

export interface EditCommentArgs {
  projectPath: string;
  documentPath: string;
  targetId: string;
  message: string;
}

/**
 * Replace a comment's message text via `POST /api/edit-comment`. The server
 * keeps the original created-at and stamps a `data-rd-edited-at` marker.
 */
export async function editComment(
  args: EditCommentArgs,
): Promise<AppendAnchoredCommentResult> {
  return postJson("/api/edit-comment", args.projectPath, args.documentPath, {
    targetId: args.targetId,
    message: args.message,
  });
}

export interface DeleteCommentArgs {
  projectPath: string;
  documentPath: string;
  targetId: string;
}

/**
 * Delete a comment (or reply) via `POST /api/delete-comment`. Deleting a
 * thread root cascades its replies server-side, so no dangling reference is
 * left behind.
 */
export async function deleteComment(
  args: DeleteCommentArgs,
): Promise<AppendAnchoredCommentResult> {
  return postJson("/api/delete-comment", args.projectPath, args.documentPath, {
    targetId: args.targetId,
  });
}

/**
 * Shared JSON POST for comment mutations. The `projectPath`/`path` pair is
 * sent both as query params and in the body (the server reads either).
 */
async function postJson(
  endpoint: string,
  projectPath: string,
  documentPath: string,
  payload: Record<string, unknown>,
): Promise<AppendAnchoredCommentResult> {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set("projectPath", projectPath);
  url.searchParams.set("path", documentPath);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath, path: documentPath, ...payload }),
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
