import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMENT_RAIL_PREFERENCE_KEY,
  useCommentRailPreference,
} from "../src/use-comment-rail-preference";

interface HookHandle {
  visible: boolean;
  setVisible: (next: boolean) => void;
  toggle: () => void;
}

function Harness({ onRender }: { onRender: (state: HookHandle) => void }) {
  const state = useCommentRailPreference();
  onRender(state);
  return null;
}

function makeStubStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

describe("useCommentRailPreference", () => {
  let container: HTMLDivElement;
  let root: Root;
  let last: HookHandle | undefined;
  let stub: Storage;

  beforeEach(() => {
    stub = makeStubStorage();
    vi.stubGlobal("localStorage", stub);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => stub,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    last = undefined;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  async function mount() {
    await act(async () => {
      root.render(
        <Harness
          onRender={(state) => {
            last = state;
          }}
        />,
      );
    });
  }

  it("defaults to visible=true when localStorage is empty", async () => {
    await mount();
    expect(last?.visible).toBe(true);
  });

  it("hydrates from 'false' in localStorage", async () => {
    stub.setItem(COMMENT_RAIL_PREFERENCE_KEY, "false");
    await mount();
    expect(last?.visible).toBe(false);
  });

  it("hydrates from 'true' in localStorage", async () => {
    stub.setItem(COMMENT_RAIL_PREFERENCE_KEY, "true");
    await mount();
    expect(last?.visible).toBe(true);
  });

  it("falls back to the default for a corrupted stored value", async () => {
    stub.setItem(COMMENT_RAIL_PREFERENCE_KEY, "garbage");
    await mount();
    expect(last?.visible).toBe(true);
  });

  it("persists toggled state to localStorage", async () => {
    await mount();
    await act(async () => {
      last?.toggle();
    });
    expect(last?.visible).toBe(false);
    expect(stub.getItem(COMMENT_RAIL_PREFERENCE_KEY)).toBe("false");
  });

  it("setVisible(true) writes 'true'", async () => {
    stub.setItem(COMMENT_RAIL_PREFERENCE_KEY, "false");
    await mount();
    await act(async () => {
      last?.setVisible(true);
    });
    expect(stub.getItem(COMMENT_RAIL_PREFERENCE_KEY)).toBe("true");
  });
});
