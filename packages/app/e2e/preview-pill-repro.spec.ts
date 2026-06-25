import { expect, test } from "@playwright/test";
import {
  createMarkdownProject,
  removeMarkdownProject,
  writeProjectFile,
} from "./helpers";

/**
 * Regression guard for the preview-tab "Add comment" pill.
 *
 * The write path (selection -> pill) depends on `useIframeSelection`. Its
 * effect previously keyed on the stable `iframeRef` *object*, so it ran once
 * while the iframe was still absent ("Loading preview…", before the document
 * fetch resolved) and never re-ran — the `selectionchange` listener was never
 * attached and the pill never appeared. (The read path — pre-anchored
 * highlight + rail card — kept working because it rides the iframe's React
 * `onLoad` prop, which masked the bug.) The fix keys the effect on the iframe
 * node identity so it re-runs once the iframe mounts.
 *
 * This test performs a REAL text selection (double-click selects a word and
 * fires a native `selectionchange`) and asserts the pill trigger appears.
 * Found via manual testing; the selection->pill seam is a mount-timing
 * boundary that unit tests (hook mounted with the iframe already present) and
 * the read-path e2e do not cross, so it lives here as an e2e.
 */
test.describe("preview-tab pill repro", () => {
  let projectDir: string;

  test.beforeEach(() => {
    projectDir = createMarkdownProject("preview-pill-repro");
  });

  test.afterEach(() => {
    removeMarkdownProject(projectDir);
  });

  test("shows the add-comment pill after selecting text in the preview iframe @smoke", async ({
    page,
  }) => {
    const filePath = writeProjectFile(
      projectDir,
      "deck.html",
      [
        "<!doctype html>",
        '<html lang="en">',
        '<head><meta charset="utf-8"><title>Preview Pill Repro</title></head>',
        "<body>",
        '<p data-rd-test="t">The brown fox jumped over the lazy dog.</p>',
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    );

    await page.goto(`/preview?path=${encodeURIComponent(filePath)}`);

    const frame = page.frameLocator('[data-testid="preview-iframe"]');

    // A real double-click selects the whole word and fires a native
    // `selectionchange` event inside the iframe.
    await frame.getByText("The brown fox", { exact: false }).dblclick();

    // The pill is portaled to document.body in the PARENT frame, so assert
    // via page.getByTestId rather than the frame locator.
    await expect(page.getByTestId("selection-pill-add-comment")).toBeVisible({
      timeout: 4000,
    });
  });
});
