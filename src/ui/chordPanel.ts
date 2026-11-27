import type { Player } from "../audio/player";
import { isGuitar, type HeldNotes, type Tones } from "../audio/tones";
import { guitarVoicing, parseChord, pianoVoicing, type ParsedChord } from "../music/chords";
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
  symbols(): string[];
  /** Replaces all chord buttons without notifying (restoring a workspace). Unknown symbols are skipped. */
  applySymbols(symbols: string[]): void;
}

/** Chord entry form, the row of chord buttons, and hold mode. */
export function setupChordPanel(
  ctx: AudioContext,
  player: Player,
  tones: Tones,
  pad: NotePad,
  isStrum: () => boolean,
): ChordPanel {
  const chords: ParsedChord[] = [];
  const buttons: HTMLElement[] = [];

  function voicing(c: ParsedChord): number[] {
    return isGuitar(tones.current) ? guitarVoicing(c) : pianoVoicing(c);
  }
  /** Starts a chord (now, or at context time `at`); it sounds until `release()` unless `duration` is given. */
  function play(c: ParsedChord, opts: { duration?: number; at?: number } = {}): HeldNotes {
    const notes = voicing(c);
    const delay = Math.max(0, ((opts.at ?? 0) - ctx.currentTime) * 1000);
    setTimeout(() => pad.flash(notes, 600), delay);
    return tones.start(notes, { strum: isStrum(), ...opts });
  }

  const hold = new HoldMode(
    ctx,
    player,
    (c, at) => play(c, { at }),
    (index) => buttons.forEach((b, i) => b.classList.toggle("latched", i === index)),
  );
  const holdEl = $<HTMLInputElement>("hold");
  holdEl.addEventListener("change", () => (hold.enabled = holdEl.checked));

  function press(index: number): HeldNotes | null {
    const c = chords[index];
    if (!c) return null;
    if (hold.enabled) {
      hold.toggle(index, c);
      return null;
    }
    return play(c);
  }

  function render(): void {
    buttons.length = 0;
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
          hold.unlatch(); // indices move
          chords.splice(i, 1);
          render();
          workspaceChanged();
        });
        btn.append(idx, c.symbol, del);
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
    workspaceChanged();
    if (!hold.enabled) play(parsed, { duration: 2 }); // preview
  });

  return {
    press,
    symbols: () => chords.map((c) => c.symbol),
    applySymbols(symbols) {
      hold.unlatch();
      chords.length = 0;
      for (const s of symbols) {
        const c = parseChord(s);
        if (c) chords.push(c);
      }
      render();
    },
  };
}
