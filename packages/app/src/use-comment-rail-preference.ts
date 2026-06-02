import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "roughdraft.commentRailVisible";

function readInitial(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function useCommentRailPreference(): {
  visible: boolean;
  setVisible: (next: boolean) => void;
  toggle: () => void;
} {
  const [visible, setVisibleState] = useState<boolean>(readInitial);

  const setVisible = useCallback((next: boolean) => {
    setVisibleState(next);
  }, []);

  const toggle = useCallback(() => {
    setVisibleState((previous) => !previous);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, visible ? "true" : "false");
    } catch {
      // Storage may be unavailable (Safari private mode, disabled quota); skip.
    }
  }, [visible]);

  return { visible, setVisible, toggle };
}

export const COMMENT_RAIL_PREFERENCE_KEY = STORAGE_KEY;
