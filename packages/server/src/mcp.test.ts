import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callTool } from "./mcp";

describe("mcp", () => {
  let tempDir: string;
  let stateFile: string;
  let projectDir: string;
  let documentPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "roughdraft-mcp-"));
    projectDir = path.join(tempDir, "project");
    stateFile = path.join(tempDir, "state", "server.json");
    documentPath = path.join(projectDir, "draft.md");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(documentPath, "# Draft\n");
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ url: "http://localhost:7373", port: 7373 }),
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("omits timeoutSeconds from review watch calls unless the tool caller provides one", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ events: [], timedOut: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await callTool(
      "roughdraft_watch_review_events",
      { documentPath, projectPath: projectDir },
      { ROUGHDRAFT_STATE_FILE: stateFile },
      fetchImpl,
    );
    await callTool(
      "roughdraft_watch_review_events",
      { documentPath, projectPath: projectDir, timeoutSeconds: 5 },
      { ROUGHDRAFT_STATE_FILE: stateFile },
      fetchImpl,
    );

    expect(requestBodies[0]).toMatchObject({
      projectPath: projectDir,
      path: "draft.md",
      batchWindowSeconds: 0.25,
      fromNow: true,
    });
    expect(requestBodies[0]).not.toHaveProperty("timeoutSeconds");
    expect(requestBodies[1]).toMatchObject({
      timeoutSeconds: 5,
    });
  });

  it("does not write a reply when the message contains a CriticMarkup close delimiter", async () => {
    const original =
      '# Draft\n\n{>>Needs proof<<}{id="c1" by="user" at="2026-04-28T12:00:00.000Z"}\n';
    fs.writeFileSync(documentPath, original);

    await expect(
      callTool(
        "roughdraft_reply_to_comment",
        {
          documentPath,
          parentId: "c1",
          message: "This closes early <<} and breaks parsing.",
        },
        { ROUGHDRAFT_STATE_FILE: stateFile },
      ),
    ).rejects.toThrow(/CriticMarkup close delimiter/);

    expect(fs.readFileSync(documentPath, "utf8")).toBe(original);
  });

  it("reads a review index from a .html document", async () => {
    const htmlPath = path.join(projectDir, "page.html");
    fs.writeFileSync(
      htmlPath,
      [
        "<!doctype html>",
        '<html><head><title>HTML Doc</title></head>',
        '<body><p>Body <mark data-rd-id="h1">highlight</mark>.</p></body></html>',
      ].join("\n"),
    );

    const result = (await callTool(
      "roughdraft_get_review_index",
      { documentPath: htmlPath },
      { ROUGHDRAFT_STATE_FILE: stateFile },
    )) as { items: Array<{ id: string }> };

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.some((item) => item.id === "h1")).toBe(true);
  });

  it("rejects a .txt document with the supported-extensions hint", async () => {
    const txtPath = path.join(projectDir, "note.txt");
    fs.writeFileSync(txtPath, "plain");

    await expect(
      callTool(
        "roughdraft_get_review_index",
        { documentPath: txtPath },
        { ROUGHDRAFT_STATE_FILE: stateFile },
      ),
    ).rejects.toThrow(/--as md or --as html/);
  });

  it("honors as=html on an unrecognized extension", async () => {
    const txtPath = path.join(projectDir, "note.txt");
    fs.writeFileSync(
      txtPath,
      '<!doctype html><html><body><mark data-rd-id="h1">x</mark></body></html>',
    );

    const result = (await callTool(
      "roughdraft_get_review_index",
      { documentPath: txtPath, as: "html" },
      { ROUGHDRAFT_STATE_FILE: stateFile },
    )) as { items: Array<{ id: string }> };

    expect(result.items.some((item) => item.id === "h1")).toBe(true);
  });
});
