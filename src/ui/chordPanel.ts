import type { Player } from "../audio/player";
import { isGuitar, type HeldNotes, type Tones } from "../audio/tones";
import { guitarVoicing, parseChord, pianoVoicing, type ParsedChord } from "../music/chords";
import { Midi } from "tonal";
import type { ChordEntry } from "../workspace/workspace";
import { workspaceChanged } from "./changes";
import { $, releaseOnPointerUp } from "./dom";
import { HoldMode } from "./holdMode";
import type { NotePad } from "./notePad";

export interface ChordPanel {
  /**
   * Button `index` (0-based) pressed by mouse or key. Normally starts the chord and
   * returns it (sounding until released); in hold mode latches/switches/releases
   * it and returns null. Also null if there is no such button.
   */
  press(index: number): HeldNotes | null;
  /** Adds a chord button (from the symbol form or the builder) and previews it. */
  add(entry: ChordEntry): void;
  /** Plays notes for 2 s with the current strum setting (builder preview). */
  preview(notes: number[]): void;
  entries(): ChordEntry[];
  /** Replaces all chord buttons without notifying (restoring a workspace). Unusable entries are skipped. */
  applyEntries(entries: ChordEntry[]): void;
}

interface Button {
  entry: ChordEntry;
  /** Parsed symbol; null for builder chords whose name is only a label. */
  parsed: ParsedChord | null;
}

const noteNames = (midis: number[]) => midis.map((m) => Midi.midiToNoteName(m, { sharps: true })).join(" ");

/** Chord entry form, the row of chord buttons, and hold mode. */
export function setupChordPanel(
  ctx: AudioContext,
  player: Player,
  tones: Tones,
  pad: NotePad,
  isStrum: () => boolean,
): ChordPanel {
  const chords: Button[] = [];
  const buttons: HTMLElement[] = [];

  /** A builder voicing is played as built; a symbol follows the sound (guitar or piano voicing). */
  function notesOf(b: Button): number[] {
    if (b.entry.voicing) return b.entry.voicing;
    if (!b.parsed) return [];
    return isGuitar(tones.current) ? guitarVoicing(b.parsed) : pianoVoicing(b.parsed);
  }

  /** Starts notes (now, or at context time `at`); they sound until `release()` unless `duration` is given. */
  function playNotes(notes: number[], opts: { duration?: number; at?: number } = {}): HeldNotes {
    const delay = Math.max(0, ((opts.at ?? 0) - ctx.currentTime) * 1000);
    setTimeout(() => pad.flash(notes, 600), delay);
    return tones.start(notes, { strum: isStrum(), ...opts });
  }

  const hold = new HoldMode<Button>(
    ctx,
    player,
    (b, at) => playNotes(notesOf(b), { at }),
    (index) => buttons.forEach((el, i) => el.classList.toggle("latched", i === index)),
  );
  const holdEl = $<HTMLInputElement>("hold");
  holdEl.addEventListener("change", () => (hold.enabled = holdEl.checked));

  function press(index: number): HeldNotes | null {
    const b = chords[index];
    if (!b) return null;
    if (hold.enabled) {
      hold.toggle(index, b);
      return null;
    }
    return playNotes(notesOf(b));
  }

  function toButton(entry: ChordEntry): Button | null {
    const parsed = parseChord(entry.symbol);
    if (!parsed && !entry.voicing?.length) return null;
    return { entry, parsed };
  }

  function render(): void {
    buttons.length = 0;
    $("chords").replaceChildren(
      ...chords.map((b, i) => {
        const btn = document.createElement("button");
        btn.className = "chord";
        btn.title = b.entry.voicing ? `${b.entry.symbol}: ${noteNames(b.entry.voicing)}` : b.entry.symbol;
        btn.classList.toggle("custom", !!b.entry.voicing);
        const idx = document.createElement("span");
        idx.className = "idx";
        idx.textContent = i < 9 ? String(i + 1) : "";
        const del = document.createElement("span");
        del.className = "del";
        del.textContent = "×";
        del.title = "Remove";
        del.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          hold.unlatch(); // indices move
          chords.splice(i, 1);
          render();
          workspaceChanged();
        });
        btn.append(idx, b.entry.symbol, del);
        btn.addEventListener("pointerdown", (e) => {
          if (e.target === del) return;
          const held = press(i);
          if (held) releaseOnPointerUp(held);
        });
        btn.classList.toggle("latched", hold.latchedIndex === i);
        buttons.push(btn);
        return btn;
      }),
    );
  }

  function add(entry: ChordEntry): void {
    const b = toButton(entry);
    if (!b) return;
    chords.push(b);
    render();
    workspaceChanged();
    if (!hold.enabled) playNotes(notesOf(b), { duration: 2 }); // preview
  }

  $<HTMLFormElement>("chord-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>("chord-input");
    const err = $("chord-error");
    const symbol = input.value.trim();
    if (!parseChord(symbol)) {
      err.textContent = symbol ? `Unknown chord: ${symbol}` : "";
      return;
    }
    err.textContent = "";
    input.value = "";
    add({ symbol });
  });

  return {
    press,
    add,
    preview: (notes) => void playNotes(notes, { duration: 2 }),
    entries: () => chords.map((b) => ({ ...b.entry })),
    applyEntries(entries) {
      hold.unlatch();
      chords.length = 0;
      for (const e of entries) {
        const b = toButton(e);
        if (b) chords.push(b);
      }
      render();
    },
  };
}
