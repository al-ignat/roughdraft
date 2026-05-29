import { expect, test } from "@playwright/test";
import {
  createMarkdownProject,
  logE2eEvent,
  openMarkdownFile,
  removeMarkdownProject,
  writeProjectFile,
} from "./helpers";

test.describe("opening local HTML files", () => {
  let projectDir: string;

  test.beforeEach(() => {
    projectDir = createMarkdownProject("open-html");
  });

  test.afterEach(() => {
    removeMarkdownProject(projectDir);
  });

  test("loads a .html document through the document routes @smoke", async ({
    page,
  }) => {
    const filePath = writeProjectFile(
      projectDir,
      "page.html",
      [
        "<!doctype html>",
        '<html lang="en">',
        '<head><meta charset="utf-8"><title>HTML Smoke</title></head>',
        "<body><h1>HTML Smoke</h1><p>Body text from the HTML smoke fixture.</p></body>",
        "</html>",
        "",
      ].join("\n"),
    );

    // The server should accept this path and return 200 from /api/markdown-file.
    const apiResponse = await page.request.get("/api/markdown-file", {
      params: { projectPath: projectDir, path: "page.html" },
    });
    expect(apiResponse.status()).toBe(200);
    const payload = await apiResponse.json();
    expect(payload.title).toBe("HTML Smoke");
    expect(payload.content).toContain("<!doctype html>");

    await openMarkdownFile(page, filePath);
    await expect(page.getByTestId("document-page-shell")).toBeVisible();

    const editor = page.getByTestId("rich-text-editor");
    await expect(editor).toBeVisible();
    const heading = editor.locator("h1"); // selector-check-ignore: asserting htmlAdapter rendered the body's heading
    const paragraph = editor.locator("p"); // selector-check-ignore: asserting htmlAdapter rendered the body's paragraph
    await expect(heading).toHaveText("HTML Smoke");
    await expect(paragraph).toHaveText(
      "Body text from the HTML smoke fixture.",
    );

    logE2eEvent("open-html-file.loaded", {
      projectDir,
      file: "page.html",
    });
  });
});
