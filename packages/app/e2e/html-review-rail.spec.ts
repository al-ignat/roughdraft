import { expect, test } from "@playwright/test";
import {
  createMarkdownProject,
  openMarkdownFile,
  removeMarkdownProject,
  writeProjectFile,
} from "./helpers";

test.describe("HTML review rail visibility", () => {
  let projectDir: string;

  test.beforeEach(() => {
    projectDir = createMarkdownProject("html-review-rail");
  });

  test.afterEach(() => {
    removeMarkdownProject(projectDir);
  });

  test("renders the review rail for an HTML document with pre-existing comments @smoke", async ({
    page,
  }) => {
    const filePath = writeProjectFile(
      projectDir,
      "with-comments.html",
      [
        "<!doctype html>",
        '<html lang="en">',
        '<head><meta charset="utf-8"><title>HTML rail</title></head>',
        "<body>",
        '<p>Quarterly results show <mark data-rd-id="h1">strong growth</mark> across regions.</p>',
        '<span data-rd-comment hidden data-rd-id="c1" data-rd-by="AI" data-rd-at="2026-05-29T10:00:00Z" data-rd-re="h1">Add a YoY percentage so "strong" has a baseline.</span>',
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    );

    await openMarkdownFile(page, filePath);
    await expect(page.getByTestId("document-page-shell")).toBeVisible();
    await expect(page.getByTestId("rich-text-editor")).toBeVisible();
    await expect(page.getByTestId("document-review-rail")).toBeVisible();
    await expect(page.getByTestId("document-review-rail")).toContainText(
      "Add a YoY percentage",
    );
  });
});
