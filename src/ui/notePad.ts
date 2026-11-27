import type { HeldNotes, Tones } from "../audio/tones";
import { $, releaseOnPointerUp } from "./dom";
import { NoteGrid } from "./noteGrid";
import { Piano } from "./piano";

export interface NotePad {
  /** Highlights notes in both views. */
  flash(midis: number[], ms?: number): void;
  /** Starts a note that sounds and stays lit until `release()` (computer keyboard). */
  press(midi: number): HeldNotes;
  /** Key labels for play mode (null to clear); also scrolls the grid to show them. */
  setKeyLabels(labels: Map<number, string> | null): void;
}

/** Note picker: the plain grid (default, low-key) or the piano, toggle remembered. */
export function setupNotePad(tones: Tones): NotePad {
  function playNote(midi: number): void {
    releaseOnPointerUp(tones.start([midi]));
    pad.flash([midi]);
  }
  const noteGrid = new NoteGrid($("note-grid"), playNote);
  const piano = new Piano($("piano"), playNote);

  const PAD_KEY = "byear.noteView";
  function setView(view: "grid" | "piano"): void {
    $("note-grid").hidden = view !== "grid";
    $("piano").hidden = view !== "piano";
    $("pad-toggle").textContent = view === "grid" ? "Piano view" : "Grid view";
    localStorage.setItem(PAD_KEY, view);
    if (view === "piano") requestAnimationFrame(() => piano.centerOn(60));
  }
  $("pad-toggle").addEventListener("click", () => setView($("piano").hidden ? "piano" : "grid"));
  setView(localStorage.getItem(PAD_KEY) === "piano" ? "piano" : "grid");

  // A note may be held by two keys at once (e.g. after an octave shift); count presses.
  const heldCount = new Map<number, number>();
  function setHeld(midi: number, delta: number): void {
    const n = (heldCount.get(midi) ?? 0) + delta;
    if (n > 0) heldCount.set(midi, n);
    else heldCount.delete(midi);
    noteGrid.setHeld(midi, n > 0);
    piano.setHeld(midi, n > 0);
  }

  const pad: NotePad = {
    flash(midis, ms) {
      noteGrid.flash(midis, ms);
      piano.flash(midis, ms);
    },
    press(midi) {
      const held = tones.start([midi]);
      setHeld(midi, 1);
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          held.release();
          setHeld(midi, -1);
        },
      };
    },
    setKeyLabels(labels) {
      noteGrid.setKeyLabels(labels);
      if (labels?.size) {
        const notes = [...labels.keys()];
        noteGrid.show(Math.min(...notes), Math.max(...notes));
      }
    },
  };
  return pad;
}
