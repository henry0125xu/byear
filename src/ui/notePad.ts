import type { Tones } from "../audio/tones";
import { $, releaseOnPointerUp } from "./dom";
import { NoteGrid } from "./noteGrid";
import { Piano } from "./piano";

export interface NotePad {
  /** Highlights notes in both views. */
  flash(midis: number[], ms?: number): void;
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

  const pad: NotePad = {
    flash(midis, ms) {
      noteGrid.flash(midis, ms);
      piano.flash(midis, ms);
    },
  };
  return pad;
}
