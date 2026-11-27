import { parseChord } from "../music/chords";

/**
 * Per-song state, saved automatically and exportable as JSON.
 * Global preferences (sound, engine, volumes, views) are not part of it.
 *
 * Adding an optional field with a default in `parseWorkspace` needs no new
 * version; renaming or changing the meaning of a field does.
 */
export const WORKSPACE_VERSION = 1;

export interface Workspace {
  version: typeof WORKSPACE_VERSION;
  /** The audio file this belongs to; matched by name and length (Decision #11). */
  file: { name: string; duration: number };
  loop: { a: number; b: number; on: boolean };
  /** Playback rate, 1 = 100%. */
  speed: number;
  semitones: number;
  cents: number;
  /** Chord buttons, in order. */
  chords: ChordEntry[];
  /** Pitch class such as "A" or "Bb"; null until set (v0.2 step 2). */
  tonic: string | null;
}

/**
 * A chord button. `symbol` is the name shown; it must parse as a chord unless
 * `voicing` is given (builder chords), in which case it is only a label.
 */
export interface ChordEntry {
  symbol: string;
  /** Exact MIDI notes, low to high (chord builder). Without it the voicing follows the sound. */
  voicing?: number[];
}

const MAX_LABEL = 40;
const MAX_NOTES = 12;

/** Valid voicing: whole MIDI notes on the 88 keys, sorted, no duplicates; null if none are valid. */
function repairVoicing(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const notes = [...new Set(v.filter((m): m is number => Number.isInteger(m) && m >= 21 && m <= 108))];
  notes.sort((a, b) => a - b);
  return notes.length ? notes.slice(0, MAX_NOTES) : null;
}

export const SPEED_RANGE = [0.25, 1.25] as const;
export const SEMITONE_RANGE = [-12, 12] as const;
export const CENT_RANGE = [-50, 50] as const;

const STORAGE_PREFIX = "byear.ws.";

/** localStorage key for a file. Length is rounded so tiny decoder differences still match. */
export function workspaceKey(name: string, duration: number): string {
  return `${STORAGE_PREFIX}${name}|${duration.toFixed(1)}`;
}

export function defaultWorkspace(name: string, duration: number): Workspace {
  return {
    version: WORKSPACE_VERSION,
    file: { name, duration },
    loop: { a: 0, b: duration, on: false },
    speed: 1,
    semitones: 0,
    cents: 0,
    chords: [],
    tonic: null,
  };
}

export type ParseResult = { ok: true; workspace: Workspace } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/**
 * Validates data read from storage or an imported file. Bad or missing fields
 * fall back to defaults; chord symbols that no longer parse are dropped.
 */
export function parseWorkspace(data: unknown): ParseResult {
  if (!isObj(data)) return { ok: false, error: "Not a ByEar workspace" };
  const version = data.version;
  if (typeof version !== "number") return { ok: false, error: "Not a ByEar workspace" };
  if (version > WORKSPACE_VERSION) return { ok: false, error: "Made by a newer version of ByEar" };

  const file = isObj(data.file) ? data.file : {};
  const name = typeof file.name === "string" ? file.name : "";
  const duration = Math.max(0, num(file.duration, 0));
  const ws = defaultWorkspace(name, duration);

  if (isObj(data.loop)) {
    let a = Math.max(0, num(data.loop.a, 0));
    let b = Math.max(0, num(data.loop.b, duration));
    if (duration > 0) [a, b] = [Math.min(a, duration), Math.min(b, duration)];
    if (a > b) [a, b] = [b, a];
    ws.loop = { a, b, on: data.loop.on === true };
  }
  ws.speed = clamp(num(data.speed, 1), SPEED_RANGE);
  ws.semitones = Math.round(clamp(num(data.semitones, 0), SEMITONE_RANGE));
  ws.cents = Math.round(clamp(num(data.cents, 0), CENT_RANGE));
  if (Array.isArray(data.chords)) {
    ws.chords = [];
    for (const c of data.chords) {
      if (!isObj(c) || typeof c.symbol !== "string") continue;
      const symbol = c.symbol.trim().slice(0, MAX_LABEL);
      const voicing = repairVoicing(c.voicing);
      if (voicing) ws.chords.push({ symbol: symbol || "Chord", voicing });
      else if (parseChord(symbol)) ws.chords.push({ symbol });
    }
  }
  ws.tonic = typeof data.tonic === "string" && /^[A-G][#b]?$/.test(data.tonic) ? data.tonic : null;
  return { ok: true, workspace: ws };
}

/** Parses JSON text (from storage or a file). */
export function parseWorkspaceJson(text: string): ParseResult {
  try {
    return parseWorkspace(JSON.parse(text));
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
}

export function serializeWorkspace(ws: Workspace): string {
  return JSON.stringify(ws, null, 2);
}

/** Suggested export file name: "song.mp3" → "song.byear.json". */
export function exportFileName(audioName: string): string {
  const base = audioName.replace(/\.[^.]+$/, "") || "workspace";
  return `${base}.byear.json`;
}
