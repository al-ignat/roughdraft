import { expect, test } from "@playwright/test";
import {
  createMarkdownProject,
  logE2eEvent,
  removeMarkdownProject,
  writeProjectFile,
} from "./helpers";

/**
 * End-to-end smoke for Phase 3.2e — the preview tab now renders
 * comments as both an iframe highlight (`<mark data-rd-comment-highlight>`)
 * and a sidebar card. The XPath/offset/quote anchor written by
 * `appendHtmlAnchoredComment` should resolve against the live DOM.
 *
 * Smoke scope: render path. The full selection → POST → re-anchor
 * round-trip lives behind a flakier iframe selection step and is
 * deferred to manual verification (step 9 in the plan).
 */
test.describe("preview-tab annotations", () => {
  let projectDir: string;

  test.beforeEach(() => {
    projectDir = createMarkdownProject("preview-annotations");
  });

  test.afterEach(() => {
    removeMarkdownProject(projectDir);
  });

  test("renders pre-existing anchored comment as highlight and rail card @smoke", async ({
    page,
  }) => {
    const filePath = writeProjectFile(
      projectDir,
      "deck.html",
      [
        "<!doctype html>",
        '<html lang="en">',
        '<head><meta charset="utf-8"><title>Preview Annotation Smoke</title></head>',
        "<body>",
        '<p data-rd-test="target">The brown fox jumped over the lazy dog.</p>',
        "<span",
        "  data-rd-comment hidden",
        '  data-rd-id="c1"',
        '  data-rd-by="ada"',
        '  data-rd-at="2026-06-08T10:00:00.000Z"',
        '  data-rd-anchor-xpath="/html/body[1]/p[1]"',
        '  data-rd-anchor-start="4"',
        '  data-rd-anchor-end="13"',
        '  data-rd-anchor-quote="brown fox"',
        ">Tighten this phrasing.</span>",
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    );

    await page.goto(`/preview?path=${encodeURIComponent(filePath)}`);

    // The rail's empty-state and the iframe loading should be replaced
    // by the populated state once handleContentReady runs.
    const railCard = page.getByTestId("preview-comment-card");
    await expect(railCard).toBeVisible();
    await expect(railCard).toContainText("Tighten this phrasing.");
    await expect(railCard).toContainText("brown fox");
    await expect(railCard).toHaveAttribute("data-comment-id", "c1");

    // The iframe applies a `<mark data-rd-comment-highlight>` wrapper at
    // runtime; assert via the frame locator.
    const iframe = page.frameLocator('[data-testid="preview-iframe"]');
    const highlight = iframe.locator(
      'mark[data-rd-comment-highlight="c1"]', // selector-check-ignore: asserting runtime overlay wrapper produced by applyCommentAnchors
    );
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText("brown fox");

    // Click-to-focus: clicking the rail card should mark it focused.
    await railCard.click();
    await expect(railCard).toHaveAttribute("data-focused", "true");

    // Click-to-focus reverse: clicking the in-iframe highlight should
    // also focus the rail card with the matching id. Note: the rail card
    // remains the SAME element — focus only changes its data attribute.
    await highlight.click();
    await expect(railCard).toHaveAttribute("data-focused", "true");

    logE2eEvent("preview.annotations-render", {
      projectDir,
      commentIds: ["c1"],
    });
  });

  test("renders empty-state when an HTML file has no comments @smoke", async ({
    page,
  }) => {
    const filePath = writeProjectFile(
      projectDir,
      "plain.html",
      [
        "<!doctype html>",
        '<html lang="en"><head><title>Plain</title></head>',
        "<body><p>Nothing to annotate here.</p></body></html>",
        "",
      ].join("\n"),
    );

    await page.goto(`/preview?path=${encodeURIComponent(filePath)}`);

    const empty = page.getByTestId("preview-comment-rail-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(/no comments yet/i);

    logE2eEvent("preview.annotations-empty", { projectDir });
  });

  test("scrolls an off-screen comment into view when its rail card is clicked @smoke", async ({
    page,
  }) => {
    const filePath = writeProjectFile(
      projectDir,
      "tall.html",
      [
        "<!doctype html>",
        '<html lang="en">',
        '<head><meta charset="utf-8"><title>Forward Scroll</title></head>',
        "<body>",
        // Tall filler pushes the commented paragraph well below the fold.
        '<div style="height:2000px">Filler</div>',
        "<p>The brown fox jumped over the lazy dog.</p>",
        "<span",
        "  data-rd-comment hidden",
        '  data-rd-id="far"',
        '  data-rd-by="ada"',
        '  data-rd-at="2026-06-08T10:00:00.000Z"',
        '  data-rd-anchor-xpath="/html/body[1]/p[1]"',
        '  data-rd-anchor-start="4"',
        '  data-rd-anchor-end="13"',
        '  data-rd-anchor-quote="brown fox"',
        ">Bring me into view.</span>",
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    );

    await page.goto(`/preview?path=${encodeURIComponent(filePath)}`);

    // The rail card renders once the anchors are applied.
    const railCard = page.getByTestId("preview-comment-card");
    await expect(railCard).toBeVisible();

    const highlight = page
      .frameLocator('[data-testid="preview-iframe"]')
      .locator('mark[data-rd-comment-highlight="far"]'); // selector-check-ignore: asserting runtime overlay wrapper produced by applyCommentAnchors

    // On load the iframe sits at the top, so the commented paragraph is far
    // below the fold.
    await expect(highlight).not.toBeInViewport();

    // Clicking the rail card must scroll the iframe so the comment comes into
    // view. This guards the general forward click-to-focus behavior (a broken
    // handler that never scrolls fails here). Note: the specific bug this
    // followed — `scrollIntoView({ behavior: "smooth" })` being silently
    // ignored when driving an iframe-internal element from the parent frame —
    // only reproduces in real Chrome; headless Chromium scrolls smoothly, so
    // this test would pass against the broken "smooth" variant too. The fix
    // uses "auto"; this asserts the user-visible outcome regardless.
    await railCard.click();
    await expect(highlight).toBeInViewport();

    logE2eEvent("preview.annotations-forward-scroll", {
      projectDir,
      commentIds: ["far"],
    });
  });

  test("posts a reply from the rail and shows it nested under the thread @smoke", async ({
    page,
  }) => {
    const filePath = writeProjectFile(
      projectDir,
      "reply.html",
      [
        "<!doctype html>",
        '<html lang="en">',
        '<head><meta charset="utf-8"><title>Reply</title></head>',
        "<body>",
        '<p data-rd-test="target">The brown fox jumped over the lazy dog.</p>',
        "<span",
        "  data-rd-comment hidden",
        '  data-rd-id="c1"',
        '  data-rd-by="ada"',
        '  data-rd-at="2026-06-08T10:00:00.000Z"',
        '  data-rd-anchor-xpath="/html/body[1]/p[1]"',
        '  data-rd-anchor-start="4"',
        '  data-rd-anchor-end="13"',
        '  data-rd-anchor-quote="brown fox"',
        ">Root comment.</span>",
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    );

    await page.goto(`/preview?path=${encodeURIComponent(filePath)}`);

    const card = page.getByTestId("preview-comment-card");
    await expect(card).toBeVisible();

    // Open the reply composer (parent-frame UI), type, and send.
    await page.getByTestId("preview-reply-open").click();
    await page.getByTestId("preview-reply-textarea").fill("Looks good to me.");
    await page.getByTestId("preview-reply-send").click();

    // The write triggers the SSE reload, which re-extracts comments; the
    // reply appears nested under its thread.
    const replies = page.getByTestId("preview-comment-replies");
    await expect(replies).toContainText("Looks good to me.", {
      timeout: 6000,
    });

    logE2eEvent("preview.annotations-reply", { projectDir, parentId: "c1" });
  });

  test("resolves and reopens a thread from the rail @smoke", async ({
    page,
  }) => {
    const filePath = writeProjectFile(
      projectDir,
      "resolve.html",
      [
        "<!doctype html>",
        '<html lang="en">',
        '<head><meta charset="utf-8"><title>Resolve</title></head>',
        "<body>",
        '<p data-rd-test="target">The brown fox jumped over the lazy dog.</p>',
        "<span",
        "  data-rd-comment hidden",
        '  data-rd-id="c1"',
        '  data-rd-by="ada"',
        '  data-rd-at="2026-06-08T10:00:00.000Z"',
        '  data-rd-anchor-xpath="/html/body[1]/p[1]"',
        '  data-rd-anchor-start="4"',
        '  data-rd-anchor-end="13"',
        '  data-rd-anchor-quote="brown fox"',
        ">Root comment.</span>",
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    );

    await page.goto(`/preview?path=${encodeURIComponent(filePath)}`);

    const card = page.getByTestId("preview-comment-card");
    await expect(card).toBeVisible();

    const toggle = page.getByTestId("preview-resolve-toggle");
    // Starts unresolved, so the action offers to resolve.
    await expect(toggle).toHaveText("Resolve");

    // Resolve: the write triggers an SSE reload that re-extracts the
    // comment with data-rd-status="resolved", flipping the button label.
    await toggle.click();
    await expect(toggle).toHaveText("Reopen", { timeout: 6000 });

    // Reopen returns it to the unresolved state.
    await toggle.click();
    await expect(toggle).toHaveText("Resolve", { timeout: 6000 });

    logE2eEvent("preview.annotations-resolve", { projectDir, targetId: "c1" });
  });
});
