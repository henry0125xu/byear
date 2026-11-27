import type { HeldNotes } from "../audio/tones";
import type { ChordPanel } from "./chordPanel";
import { NUDGE, type Transport } from "./transport";

/** Global keyboard shortcuts. Ignored while a text input or select has focus. */
export function setupShortcuts(transport: Transport, chords: ChordPanel): void {
  // Don't leave buttons focused, or Space would also "click" them.
  document.addEventListener("click", (e) => (e.target as HTMLElement).closest("button")?.blur());

  // Chord keys 1–9 sound while held.
  const heldKeys = new Map<string, HeldNotes>();

  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "SELECT") return;
    if (tag === "INPUT" && (e.target as HTMLInputElement).type !== "range") {
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && (e.shiftKey || e.ctrlKey) && !e.altKey) {
      e.preventDefault();
      transport.nudgeLoop(e.shiftKey ? "a" : "b", e.key === "ArrowLeft" ? -NUDGE : NUDGE);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        transport.togglePlay();
        break;
      case "Escape":
        transport.stop();
        break;
      case "[":
        transport.setA();
        break;
      case "]":
        transport.setB();
        break;
      case "l":
      case "L":
        transport.toggleLoop();
        break;
      case "Enter":
        transport.jumpToLoopStart();
        break;
      case "ArrowLeft":
        e.preventDefault();
        transport.seekBy(-2);
        break;
      case "ArrowRight":
        e.preventDefault();
        transport.seekBy(2);
        break;
      default:
        if (/^[1-9]$/.test(e.key) && !e.repeat && !heldKeys.has(e.key)) {
          const c = chords.chordAt(Number(e.key) - 1);
          if (c) heldKeys.set(e.key, chords.play(c));
        }
    }
  });

  window.addEventListener("keyup", (e) => {
    heldKeys.get(e.key)?.release();
    heldKeys.delete(e.key);
  });
  window.addEventListener("blur", () => {
    for (const held of heldKeys.values()) held.release();
    heldKeys.clear();
  });
}
