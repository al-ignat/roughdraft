import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RawHtmlPreviewPage } from "../src/RawHtmlPreviewPage";

interface FakeEventSourceInstance {
  url: string;
  listeners: Record<string, Array<(event: Event) => void>>;
  close: () => void;
  dispatchEvent: (type: string) => void;
}

const fakeEventSourceInstances: FakeEventSourceInstance[] = [];

class FakeEventSource {
  static CLOSED = 2;
  url: string;
  listeners: Record<string, Array<(event: Event) => void>> = {};
  readyState = 1;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    fakeEventSourceInstances.push({
      url,
      listeners: this.listeners,
      close: () => {
        this.readyState = FakeEventSource.CLOSED;
      },
      dispatchEvent: (type: string) => {
        for (const listener of this.listeners[type] ?? []) {
          listener(new Event(type));
        }
      },
    });
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("RawHtmlPreviewPage", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalEventSource = global.EventSource;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fakeEventSourceInstances.length = 0;
    global.EventSource = FakeEventSource as unknown as typeof EventSource;
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    global.EventSource = originalEventSource;
    global.fetch = originalFetch;
  });

  it("renders the loading state before the document arrives", async () => {
    fetchMock.mockReturnValueOnce(
      new Promise(() => {
        // never resolves — keep loading state up
      }),
    );

    await act(async () => {
      root.render(
        <RawHtmlPreviewPage projectPath="/proj" documentPath="deck.html" />,
      );
    });

    expect(container.querySelector('[data-testid="preview-loading"]')).not.toBe(
      null,
    );
  });

  it("renders an iframe with the fetched HTML in srcDoc", async () => {
    const rawHtml =
      "<!doctype html><html><body><section class='slide'>Hi</section></body></html>";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => rawHtml,
    } as Response);

    await act(async () => {
      root.render(
        <RawHtmlPreviewPage projectPath="/proj" documentPath="deck.html" />,
      );
    });
    await flush();

    const iframe = container.querySelector<HTMLIFrameElement>(
      '[data-testid="preview-iframe"]',
    );
    expect(iframe).not.toBe(null);
    expect(iframe?.getAttribute("srcdoc")).toBe(rawHtml);
    expect(iframe?.getAttribute("sandbox")).toBe(
      "allow-same-origin allow-scripts allow-popups",
    );
  });

  it("fetches the preview document with projectPath and path query params", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "<html></html>",
    } as Response);

    await act(async () => {
      root.render(
        <RawHtmlPreviewPage projectPath="/work/foo" documentPath="bar.html" />,
      );
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/preview-document");
    expect(calledUrl).toContain("projectPath=%2Fwork%2Ffoo");
    expect(calledUrl).toContain("path=bar.html");
  });

  it("re-fetches the document when an SSE change event arrives (debounced)", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html><body>v1</body></html>",
    } as Response);

    await act(async () => {
      root.render(
        <RawHtmlPreviewPage projectPath="/proj" documentPath="deck.html" />,
      );
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html><body>v2</body></html>",
    } as Response);

    const eventSourceInstance = fakeEventSourceInstances[0];
    expect(eventSourceInstance).toBeDefined();
    act(() => {
      eventSourceInstance.dispatchEvent("change");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("renders an error message when the fetch fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "",
    } as Response);

    await act(async () => {
      root.render(
        <RawHtmlPreviewPage projectPath="/proj" documentPath="missing.html" />,
      );
    });
    await flush();

    const errorEl = container.querySelector('[data-testid="preview-error"]');
    expect(errorEl).not.toBe(null);
    expect(errorEl?.textContent).toContain("HTTP 404");
  });
});
