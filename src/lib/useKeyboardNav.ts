import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export type NavShortcut = { key: string; url: string };

const CHORD_TIMEOUT = 1500;

function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  );
}

export function useKeyboardNav(shortcuts: NavShortcut[]) {
  const navigate = useNavigate();
  const [awaitingChord, setAwaitingChord] = useState(false);
  // Stable ref so effect doesn't re-run when shortcuts array identity changes
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let waiting = false;

    function onKey(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (!waiting) {
        if (e.key === "g") {
          e.preventDefault();
          waiting = true;
          setAwaitingChord(true);
          timeoutId = setTimeout(() => {
            waiting = false;
            setAwaitingChord(false);
          }, CHORD_TIMEOUT);
        }
        return;
      }

      if (timeoutId) clearTimeout(timeoutId);
      waiting = false;
      setAwaitingChord(false);

      const match = shortcutsRef.current.find((s) => s.key === e.key);
      if (match) {
        e.preventDefault();
        navigate(match.url);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  return { awaitingChord };
}
