import { Midi } from "tonal";

/**
 * Computer-keyboard note layout (Decision #12): tracker style, two rows.
 * Z row = C..E from the base (black keys on the A row), Q row = an octave
 * higher (black keys on the digit row); C4–E4 overlaps so either hand reaches it.
 * Keys are physical (`KeyboardEvent.code`), so IME, Caps Lock and Shift don't matter.
 * Kept as data so it can become configurable later (Decision #14).
 */
export const PLAY_KEYS: readonly { code: string; label: string; offset: number }[] = [
  // lower row
  { code: "KeyZ", label: "Z", offset: 0 },
  { code: "KeyS", label: "S", offset: 1 },
  { code: "KeyX", label: "X", offset: 2 },
  { code: "KeyD", label: "D", offset: 3 },
  { code: "KeyC", label: "C", offset: 4 },
  { code: "KeyV", label: "V", offset: 5 },
  { code: "KeyG", label: "G", offset: 6 },
  { code: "KeyB", label: "B", offset: 7 },
  { code: "KeyH", label: "H", offset: 8 },
  { code: "KeyN", label: "N", offset: 9 },
  { code: "KeyJ", label: "J", offset: 10 },
  { code: "KeyM", label: "M", offset: 11 },
  { code: "Comma", label: ",", offset: 12 },
  { code: "KeyL", label: "L", offset: 13 },
  { code: "Period", label: ".", offset: 14 },
  { code: "Semicolon", label: ";", offset: 15 },
  { code: "Slash", label: "/", offset: 16 },
  // upper row
  { code: "KeyQ", label: "Q", offset: 12 },
  { code: "Digit2", label: "2", offset: 13 },
  { code: "KeyW", label: "W", offset: 14 },
  { code: "Digit3", label: "3", offset: 15 },
  { code: "KeyE", label: "E", offset: 16 },
  { code: "KeyR", label: "R", offset: 17 },
  { code: "Digit5", label: "5", offset: 18 },
  { code: "KeyT", label: "T", offset: 19 },
  { code: "Digit6", label: "6", offset: 20 },
  { code: "KeyY", label: "Y", offset: 21 },
  { code: "Digit7", label: "7", offset: 22 },
  { code: "KeyU", label: "U", offset: 23 },
  { code: "KeyI", label: "I", offset: 24 },
  { code: "Digit9", label: "9", offset: 25 },
  { code: "KeyO", label: "O", offset: 26 },
  { code: "Digit0", label: "0", offset: 27 },
  { code: "KeyP", label: "P", offset: 28 },
];
export const OCTAVE_DOWN = "Minus";
export const OCTAVE_UP = "Equal";

/** Note of the `Z` key. */
export const DEFAULT_BASE = 48; // C3
const BASE_MIN = 24; // C1
const BASE_MAX = 84; // C6 (the top keys fall off past C8)
const LOWEST = 21; // A0, like the note grid
const HIGHEST = 108; // C8

const BY_CODE = new Map(PLAY_KEYS.map((k) => [k.code, k.offset]));

/** MIDI note for a key at this base, or null if the key isn't a note key or the note is off the 88 keys. */
export function noteForCode(code: string, base: number): number | null {
  const offset = BY_CODE.get(code);
  if (offset === undefined) return null;
  const midi = base + offset;
  return midi >= LOWEST && midi <= HIGHEST ? midi : null;
}

/** Moves the base by whole octaves, kept within C1..C6. */
export function shiftBase(base: number, octaves: number): number {
  return Math.min(BASE_MAX, Math.max(BASE_MIN, base + octaves * 12));
}

/** Key label(s) for each note the keyboard reaches at this base; the overlap shows both, upper row first. */
export function keyLabels(base: number): Map<number, string> {
  const labels = new Map<number, string>();
  for (const k of PLAY_KEYS) {
    const midi = noteForCode(k.code, base);
    if (midi === null) continue;
    const prev = labels.get(midi);
    labels.set(midi, prev ? `${k.label} ${prev}` : k.label);
  }
  return labels;
}

/** "C3–E5" for the range the keyboard covers. */
export function rangeName(base: number): string {
  const notes = [...keyLabels(base).keys()];
  const name = (m: number) => Midi.midiToNoteName(m, { sharps: true });
  return `${name(Math.min(...notes))}–${name(Math.max(...notes))}`;
}
