import { Chord, Midi, Note } from "tonal";

/**
 * Structured chord builder (Decision #15): the chord is built from intervals,
 * not from a symbol, so every combination works; the name is derived.
 */
export const TRIADS = {
  maj: { label: "maj", suffix: "", intervals: ["1P", "3M", "5P"] },
  m: { label: "m", suffix: "m", intervals: ["1P", "3m", "5P"] },
  dim: { label: "dim", suffix: "dim", intervals: ["1P", "3m", "5d"] },
  aug: { label: "aug", suffix: "aug", intervals: ["1P", "3M", "5A"] },
  sus2: { label: "sus2", suffix: "sus2", intervals: ["1P", "2M", "5P"] },
  sus4: { label: "sus4", suffix: "sus4", intervals: ["1P", "4P", "5P"] },
  power: { label: "5", suffix: "5", intervals: ["1P", "5P"] },
} as const;
export type TriadId = keyof typeof TRIADS;

export const SEVENTHS = {
  none: { label: "—", interval: null },
  "6": { label: "6", interval: "6M" },
  "7": { label: "7", interval: "7m" },
  maj7: { label: "maj7", interval: "7M" },
  dim7: { label: "dim7", interval: "7d" },
} as const;
export type SeventhId = keyof typeof SEVENTHS;

/** Tensions, in the order they are written. */
export const EXTENSIONS = ["b9", "9", "#9", "11", "#11", "b13", "13"] as const;
export type ExtensionId = (typeof EXTENSIONS)[number];
const EXTENSION_INTERVAL: Record<ExtensionId, string> = {
  b9: "9m",
  "9": "9M",
  "#9": "9A",
  "11": "11P",
  "#11": "11A",
  b13: "13m",
  "13": "13M",
};

export interface ChordSpec {
  root: string;
  triad: TriadId;
  seventh: SeventhId;
  extensions: ExtensionId[];
  /** 0 = root position; n moves the lowest n chord tones up an octave (extensions stay on top). */
  inversion: number;
  /** Octave of the root in root position (3 → C3..B3). */
  octave: number;
}

export interface BuiltChord {
  /** Display name, e.g. "Cm7(9)/Eb". */
  label: string;
  /** MIDI notes, low to high. */
  voicing: number[];
}

/** Named suffix for triad + seventh; null when there is no common name. */
function baseSuffix(triad: TriadId, seventh: SeventhId): string | null {
  const t = TRIADS[triad].suffix;
  if (seventh === "none") return t;
  const named: Partial<Record<TriadId, Partial<Record<SeventhId, string>>>> = {
    maj: { "6": "6", "7": "7", maj7: "maj7" },
    m: { "6": "m6", "7": "m7", maj7: "mMaj7" },
    dim: { "7": "m7b5", dim7: "dim7" },
    aug: { "7": "aug7", maj7: "maj7#5" },
    sus2: { "7": "7sus2" },
    sus4: { "7": "7sus4" },
  };
  return named[triad]?.[seventh] ?? null;
}

/** How many inversions the chord has (one per chord tone below the octave, minus root position). */
export function maxInversion(spec: Pick<ChordSpec, "triad" | "seventh">): number {
  return TRIADS[spec.triad].intervals.length + (SEVENTHS[spec.seventh].interval ? 1 : 0) - 1;
}

export function buildChord(spec: ChordSpec): BuiltChord {
  const triad = TRIADS[spec.triad];
  const seventh = SEVENTHS[spec.seventh].interval;
  const base: string[] = [...triad.intervals, ...(seventh ? [seventh] : [])];
  const exts = EXTENSIONS.filter((e) => spec.extensions.includes(e));

  // Name
  let suffix = baseSuffix(spec.triad, spec.seventh);
  if (suffix === null) suffix = `${triad.suffix}(${SEVENTHS[spec.seventh].label})`;
  if (exts.length) suffix += seventh ? `(${exts.join(",")})` : `(add${exts.join(",")})`;
  const inversion = Math.max(0, Math.min(maxInversion(spec), Math.round(spec.inversion)));
  const bassPc = Note.pitchClass(Note.transpose(spec.root, base[inversion]));
  const label = `${spec.root}${suffix}${inversion ? `/${bassPc}` : ""}`;

  // Voicing
  const rootMidi = (spec.octave + 1) * 12 + (Note.chroma(spec.root) ?? 0);
  const semis = (iv: string) => Note.midi(Note.transpose("C4", iv))! - 60;
  const tones = base.map(semis).map((s, i) => (i < inversion ? s + 12 : s));
  const top = Math.max(...tones);
  // Extensions go above the chord tones, an octave higher if inversion pushed tones past them.
  const extTones = exts.map((e) => {
    let s = semis(EXTENSION_INTERVAL[e]);
    while (s <= top) s += 12;
    return s;
  });
  const voicing = [...new Set([...tones, ...extTones].map((s) => rootMidi + s))].sort((a, b) => a - b);
  return { label, voicing };
}

/**
 * Suggested name for hand-picked notes (manual builder), lowest note as bass.
 * Falls back to the note names when tonal finds no chord.
 */
export function nameNotes(midis: number[]): string {
  if (!midis.length) return "";
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map((m) => Note.pitchClass(Midi.midiToNoteName(m, { sharps: true }))))];
  const found = Chord.detect(pcs)[0];
  if (found) return found.replace(/^([A-G][#b]*)M(\/|$)/, "$1$2"); // "CM/E" → "C/E"
  return sorted.map((m) => Midi.midiToNoteName(m, { sharps: true })).join(" ");
}
