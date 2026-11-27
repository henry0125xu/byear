import type { Player } from "../audio/player";
import type { HeldNotes } from "../audio/tones";
import type { ParsedChord } from "../music/chords";

/** How far ahead a strike is scheduled (seconds of context time). */
export const LOOKAHEAD = 0.15;
const TICK_MS = 25;
/** Just past A counts as "at A", so starting playback at A strikes right away. */
const AT_A = 0.03;

/**
 * Listening time (seconds) until the audible position next reaches A: forward
 * from the pre-roll, or by wrapping at B. Null when there is no loop.
 */
export function secondsToNextA(pos: number, loop: { a: number; b: number; on: boolean }, speed: number): number | null {
  const { a, b, on } = loop;
  if (!on || b - a < 0.05 || speed <= 0) return null;
  if (pos < a) return (a - pos) / speed;
  if (pos < a + AT_A) return 0;
  if (pos < b) return (b - pos) / speed;
  return 0; // at B: wrapping now
}

/** Two strikes closer than this (context seconds) are the same one. */
export function sameStrikeWindow(loop: { a: number; b: number }, speed: number): number {
  return Math.min(0.25, (loop.b - loop.a) / speed / 2);
}

/**
 * Hold mode (Decision #13): a latched chord is struck again every time the
 * loop returns to A, scheduled ahead so it lines up with the recording.
 * The recording and the tones share the output, so both are heard `latency`
 * after they are rendered; a strike for "A is heard in s seconds" is rendered
 * at now + s − latency.
 */
export class HoldMode {
  private _enabled = false;
  private latched: { index: number; chord: ParsedChord } | null = null;
  private ringing: HeldNotes | null = null;
  private lastStrike = -Infinity;
  private timer = 0;

  constructor(
    private ctx: AudioContext,
    private player: Player,
    /** Plays `chord` starting at context time `at`, sounding until released. */
    private strike: (chord: ParsedChord, at: number) => HeldNotes,
    /** The latched button changed (index, or null). */
    private onLatch: (index: number | null) => void,
  ) {}

  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(on: boolean) {
    this._enabled = on;
    if (!on) this.unlatch();
  }

  get latchedIndex(): number | null {
    return this.latched?.index ?? null;
  }

  /** Click on chord `index`: latch it, switch to it, or release it if it is the latched one. */
  toggle(index: number, chord: ParsedChord): void {
    if (this.latched?.index === index) return this.unlatch();
    this.latched = { index, chord };
    this.strikeAt(this.ctx.currentTime);
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.onLatch(index);
  }

  unlatch(): void {
    this.ringing?.release();
    this.ringing = null;
    this.latched = null;
    clearInterval(this.timer);
    this.timer = 0;
    this.onLatch(null);
  }

  private strikeAt(at: number): void {
    if (!this.latched) return;
    this.ringing?.release(at);
    this.ringing = this.strike(this.latched.chord, at);
    this.lastStrike = at;
  }

  private tick(): void {
    const p = this.player;
    if (!p.playing) {
      // Paused or stopped: let the chord go; it comes back at the next A.
      this.ringing?.release();
      this.ringing = null;
      return;
    }
    const loop = p.loop;
    const secs = secondsToNextA(p.currentTime, loop, p.speed);
    if (secs === null) return;
    const now = this.ctx.currentTime;
    const at = now + secs - p.latency;
    if (at - now > LOOKAHEAD) return;
    if (Math.abs(at - this.lastStrike) < sameStrikeWindow(loop, p.speed)) return;
    this.strikeAt(Math.max(at, now));
  }
}
