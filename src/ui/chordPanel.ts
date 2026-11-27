import { isGuitar, type HeldNotes, type Tones } from "../audio/tones";
import { guitarVoicing, parseChord, pianoVoicing, type ParsedChord } from "../music/chords";
import { $, releaseOnPointerUp } from "./dom";
import type { NotePad } from "./notePad";

export interface ChordPanel {
  /** The chord on button `index` (0-based), if any. */
  chordAt(index: number): ParsedChord | undefined;
  /** Starts a chord; it sounds until `release()` unless `duration` is given. */
  play(chord: ParsedChord, duration?: number): HeldNotes;
}

/** Chord entry form and the row of chord buttons. */
export function setupChordPanel(tones: Tones, pad: NotePad, isStrum: () => boolean): ChordPanel {
  const chords: ParsedChord[] = [];

  function voicing(c: ParsedChord): number[] {
    return isGuitar(tones.current) ? guitarVoicing(c) : pianoVoicing(c);
  }
  function play(c: ParsedChord, duration?: number): HeldNotes {
    const notes = voicing(c);
    pad.flash(notes, 600);
    return tones.start(notes, { strum: isStrum(), duration });
  }

  function render(): void {
    $("chords").replaceChildren(
      ...chords.map((c, i) => {
        const btn = document.createElement("button");
        btn.className = "chord";
        btn.title = c.symbol;
        const idx = document.createElement("span");
        idx.className = "idx";
        idx.textContent = i < 9 ? String(i + 1) : "";
        const del = document.createElement("span");
        del.className = "del";
        del.textContent = "×";
        del.title = "Remove";
        del.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          chords.splice(i, 1);
          render();
        });
        btn.append(idx, c.symbol, del);
        btn.addEventListener("pointerdown", (e) => {
          if (e.target === del) return;
          releaseOnPointerUp(play(c));
        });
        return btn;
      }),
    );
  }

  $<HTMLFormElement>("chord-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>("chord-input");
    const err = $("chord-error");
    const parsed = parseChord(input.value);
    if (!parsed) {
      err.textContent = input.value.trim() ? `Unknown chord: ${input.value.trim()}` : "";
      return;
    }
    err.textContent = "";
    chords.push(parsed);
    input.value = "";
    render();
    play(parsed, 2); // preview
  });

  return {
    chordAt: (index) => chords[index],
    play,
  };
}
