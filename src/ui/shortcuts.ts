import type { HeldNotes } from "../audio/tones";
import { DEFAULT_BASE, keyLabels, noteForCode, OCTAVE_DOWN, OCTAVE_UP, rangeName, shiftBase } from "../music/keyboard";
import type { ChordPanel } from "./chordPanel";
import { $ } from "./dom";
import type { NotePad } from "./notePad";
import { NUDGE, type Transport } from "./transport";

/**
 * Global keyboard shortcuts. Ignored while a text input or select has focus.
 *
 * Two modes (Decision #8), switched with Tab:
 * - command mode (default): letter shortcuts such as L; chord keys 1–9;
 * - play mode: two rows of letter + digit keys play notes (Decision #12),
 *   - / = shift the octave, chords move to Shift+1–9.
 * Space, [ ], Enter, arrows, Esc and numpad 1–9 (chords) work in both.
 */
export function setupShortcuts(transport: Transport, chords: ChordPanel, pad: NotePad): void {
  // Don't leave buttons, checkboxes or selects focused, or Space would toggle them instead of playing.
  document.addEventListener("click", (e) => (e.target as HTMLElement).closest("button")?.blur());
  document.addEventListener("change", (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "SELECT" || (el as HTMLInputElement).type === "checkbox") el.blur();
  });

  // Keys that are sounding while held, by `code` (so Shift coming up first doesn't strand a chord).
  const heldChords = new Map<string, HeldNotes>();
  const heldNotes = new Map<string, HeldNotes>();
  let playMode = false;
  let base = DEFAULT_BASE;

  function releaseAll(): void {
    for (const h of heldChords.values()) h.release();
    for (const h of heldNotes.values()) h.release();
    heldChords.clear();
    heldNotes.clear();
  }

  function refreshMode(): void {
    const el = $("kb-mode");
    el.classList.toggle("on", playMode);
    el.textContent = playMode
      ? `· Play mode ${rangeName(base)} · -/= octave · Shift+1–9 chords · Tab to exit`
      : "· Tab: play with keyboard";
    document.body.classList.toggle("play-mode", playMode);
    pad.setKeyLabels(playMode ? keyLabels(base) : null);
  }

  function setPlayMode(on: boolean): void {
    playMode = on;
    for (const h of heldNotes.values()) h.release();
    heldNotes.clear();
    refreshMode();
  }

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

    if (e.code === "Tab" && !e.shiftKey) {
      e.preventDefault();
      setPlayMode(!playMode);
      return;
    }

    // Chord buttons: digits in command mode, Shift+digits in play mode, the numpad in both.
    const chordKey = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (chordKey && (!playMode || e.shiftKey || e.code.startsWith("Numpad"))) {
      if (!e.repeat && !heldChords.has(e.code)) {
        const held = chords.press(Number(chordKey[1]) - 1);
        if (held) heldChords.set(e.code, held);
      }
      return;
    }

    if (playMode) {
      const midi = noteForCode(e.code, base);
      if (midi !== null) {
        e.preventDefault();
        if (!e.repeat && !heldNotes.has(e.code)) heldNotes.set(e.code, pad.press(midi));
        return;
      }
      if (e.code === OCTAVE_DOWN || e.code === OCTAVE_UP) {
        if (!e.repeat) {
          base = shiftBase(base, e.code === OCTAVE_UP ? 1 : -1);
          refreshMode();
        }
        return;
      }
      if (/^(?:Key[A-Z]|Digit\d)$/.test(e.code)) return; // other letters and digits do nothing in play mode
    }

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
    }
  });

  window.addEventListener("keyup", (e) => {
    heldChords.get(e.code)?.release();
    heldChords.delete(e.code);
    heldNotes.get(e.code)?.release();
    heldNotes.delete(e.code);
  });
  window.addEventListener("blur", releaseAll);

  refreshMode();
}
