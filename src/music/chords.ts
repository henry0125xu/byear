import { Chord, Interval, Note } from "tonal";

export interface ParsedChord {
  symbol: string;
  root: string;
  bass: string | null;
  /** Intervals from the root, e.g. ["1P", "3m", "5P", "7m"]. */
  intervals: string[];
}

/** Parses a chord symbol. Slash chords are split here because tonal measures them from the bass. */
export function parseChord(input: string): ParsedChord | null {
  const symbol = input.trim();
  if (!symbol) return null;
  const slash = symbol.lastIndexOf("/");
  let base = symbol;
  let bass: string | null = null;
  // "C6/9" is a chord type, not a slash chord.
  if (slash > 0 && !/6\/9$/.test(symbol)) {
    const candidate = symbol.slice(slash + 1);
    if (Note.get(candidate).empty || Note.get(candidate).oct !== undefined) return null;
    bass = Note.get(candidate).pc;
    base = symbol.slice(0, slash);
  }
  const c = Chord.get(base);
  if (c.empty || !c.tonic) return null;
  return { symbol, root: c.tonic, bass, intervals: c.intervals };
}

const pcMidi = (pc: string) => Note.chroma(pc) ?? 0;

/** Lowest MIDI number with this pitch class at or above `min`. */
function atOrAbove(pc: string, min: number): number {
  const c = pcMidi(pc);
  let m = min + ((c - (min % 12) + 12) % 12);
  return m;
}

function chordPcs(chord: ParsedChord): string[] {
  return chord.intervals.map((iv) => Note.pitchClass(Note.transpose(chord.root, iv)));
}

/** Piano: close position, root around octave 3, slash bass in octave 2. */
export function pianoVoicing(chord: ParsedChord): number[] {
  const rootMidi = atOrAbove(chord.root, 48); // C3..B3
  const notes = chord.intervals.map((iv) => rootMidi + (Interval.semitones(iv) ?? 0));
  if (chord.bass) notes.unshift(atOrAbove(chord.bass, 36)); // C2..B2
  return notes;
}

/**
 * Guitar-like spread: bass in E2..D#3, then fifth, root, third, the rest,
 * each placed above the previous one. At most 6 notes.
 */
export function guitarVoicing(chord: ParsedChord): number[] {
  const pcs = chordPcs(chord);
  const ivs = chord.intervals;
  const low = atOrAbove(chord.bass ?? chord.root, 40);
  const fifthIdx = ivs.findIndex((iv) => iv.startsWith("5"));
  const order: string[] = [];
  if (fifthIdx >= 0) order.push(pcs[fifthIdx]);
  order.push(chord.root);
  ivs.forEach((_iv, i) => {
    if (i !== 0 && i !== fifthIdx) order.push(pcs[i]);
  });
  const notes = [low];
  for (const pc of order) {
    if (notes.length >= 6) break;
    notes.push(atOrAbove(pc, notes[notes.length - 1] + 1));
  }
  return notes;
}
