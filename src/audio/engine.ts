import type { RubberBandInterface } from "rubberband-wasm";
import {
  RubberBandStretcher,
  SoundTouchStretcher,
  type EngineId,
  type FrameSource,
  type Stretcher,
} from "./stretch";

/**
 * Reads frames from the decoded audio, keeping its own read head and wrapping
 * inside the A/B loop. The stretcher pulls from this (SoundTouch's position
 * argument is ignored).
 *
 * It also remembers where each run of frames came from, so "n frames handed
 * out since the last seek" can be mapped back to a file position even across
 * loop wraps (see `positionAt`).
 */
class LoopSource implements FrameSource {
  pos = 0;
  loopA = 0;
  loopB = 0;
  loopOn = false;
  /** Frames handed out since the last seek. */
  fed = 0;
  /** Runs of contiguous frames: handed-out index `cum` came from file frame `src`. */
  private runs: { cum: number; src: number }[] = [{ cum: 0, src: 0 }];

  constructor(
    private left: Float32Array,
    private right: Float32Array,
    readonly sampleRate: number,
  ) {
    this.loopB = left.length;
  }

  get length(): number {
    return this.left.length;
  }
  get loopActive(): boolean {
    return this.loopOn && this.loopB - this.loopA > 64;
  }

  seek(frame: number): void {
    this.pos = Math.max(0, Math.min(this.left.length, Math.round(frame)));
    this.fed = 0;
    this.runs = [{ cum: 0, src: this.pos }];
  }

  /** File frame of the `cum`-th frame handed out since the last seek. */
  positionAt(cum: number): number {
    cum = Math.max(0, cum);
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i];
      if (run.cum <= cum) return Math.min(this.left.length, run.src + (cum - run.cum));
    }
    return this.runs[0].src;
  }

  /** Advances the read head by one frame; returns the frame index, or -1 at the end. */
  private next(): number {
    if (this.loopActive && this.pos >= this.loopB) {
      this.pos = this.loopA;
      this.runs.push({ cum: this.fed, src: this.pos });
      // Keep a few seconds of history; nothing buffered is older than that.
      const keepFrom = this.fed - 10 * this.sampleRate;
      while (this.runs.length > 1 && this.runs[1].cum < keepFrom) this.runs.shift();
    }
    if (this.pos >= this.left.length) return -1;
    this.fed++;
    return this.pos++;
  }

  extract(target: Float32Array, numFrames: number): number {
    let i = 0;
    for (; i < numFrames; i++) {
      const p = this.next();
      if (p < 0) break;
      target[i * 2] = this.left[p];
      target[i * 2 + 1] = this.right[p];
    }
    return i;
  }

  readPlanar(l: Float32Array, r: Float32Array, n: number): number {
    let i = 0;
    for (; i < n; i++) {
      const p = this.next();
      if (p < 0) break;
      l[i] = this.left[p];
      r[i] = this.right[p];
    }
    return i;
  }
}

/**
 * Everything that runs on the audio thread: source, loop, stretcher, transport.
 * No DOM or worklet APIs, so it can be driven from tests too. Times are seconds.
 */
export class PlaybackEngine {
  private source: LoopSource | null = null;
  private stretcher: Stretcher | null = null;
  private engineId: EngineId = "soundtouch";
  private rb: RubberBandInterface | null = null;
  private speed = 1;
  private pitchScale = 1;
  private preRoll = 0;
  playing = false;

  load(left: Float32Array, right: Float32Array, sampleRate: number): void {
    this.playing = false;
    this.source = new LoopSource(left, right, sampleRate);
    this.replaceStretcher();
  }

  /** Switches engine, keeping the audible position. Rubber Band ids need `rb`. */
  setEngine(id: EngineId, rb: RubberBandInterface | null): void {
    if (rb) this.rb = rb;
    if (id !== "soundtouch" && !this.rb) throw new Error("Rubber Band not loaded");
    if (id === this.engineId) return;
    const heard = this.heardTime;
    this.engineId = id;
    if (!this.source) return;
    this.replaceStretcher();
    this.seek(heard);
  }

  private replaceStretcher(): void {
    const s = this.source;
    if (!s) return;
    this.stretcher?.dispose();
    this.stretcher =
      this.engineId !== "soundtouch" && this.rb
        ? new RubberBandStretcher(this.rb, s, s.sampleRate, this.engineId === "rubberband-hq")
        : new SoundTouchStretcher(s);
    this.stretcher.setRate(this.speed, this.pitchScale);
  }

  setRate(speed: number, pitchScale: number): void {
    this.speed = speed;
    this.pitchScale = pitchScale;
    this.stretcher?.setRate(speed, pitchScale);
  }

  setPreRoll(seconds: number): void {
    this.preRoll = Math.max(0, seconds);
  }

  // ---- transport ----
  play(): void {
    const s = this.source;
    if (!s) return;
    if (s.pos >= s.length && !s.loopActive) this.seek(0);
    if (s.loopActive && this.heardTime >= s.loopB / s.sampleRate) this.seekToLoopStart();
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  stop(): void {
    this.playing = false;
    if (this.source?.loopActive) this.seekToLoopStart();
    else this.seek(0);
  }
  seek(seconds: number): void {
    if (!this.source || !this.stretcher) return;
    this.source.seek(seconds * this.source.sampleRate);
    this.stretcher.clear();
  }
  /** Jump to A, starting `preRoll` seconds early. Loop wraps don't use this. */
  seekToLoopStart(): void {
    const s = this.source;
    if (!s) return;
    this.seek(Math.max(0, s.loopA / s.sampleRate - this.preRoll));
  }

  /**
   * Position of the next frame `render` will output: frames handed to the
   * stretcher minus what it still holds, mapped back through loop wraps.
   */
  get heardTime(): number {
    const s = this.source;
    if (!s || !this.stretcher) return 0;
    return s.positionAt(s.fed - this.stretcher.pending) / s.sampleRate;
  }

  // ---- loop ----
  setLoop(a: number, b: number): void {
    const s = this.source;
    if (!s) return;
    const heard = this.heardTime; // read before the loop changes
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    s.loopA = Math.max(0, Math.round(lo * s.sampleRate));
    s.loopB = Math.min(s.length, Math.round(hi * s.sampleRate));
    this.resyncToLoop(heard);
  }
  setLoopOn(on: boolean): void {
    if (!this.source) return;
    const heard = this.heardTime;
    this.source.loopOn = on;
    this.resyncToLoop(heard);
  }

  /**
   * The read head runs ahead of what is audible (stretcher buffering). If a new
   * loop end lands between the two, the buffered audio past B would still play
   * once. Drop the buffer so the very first pass already respects the loop.
   */
  private resyncToLoop(heard: number): void {
    const s = this.source;
    if (!s || !s.loopActive) return;
    const a = s.loopA / s.sampleRate;
    const b = s.loopB / s.sampleRate;
    if (heard >= b) this.seekToLoopStart();
    else if (heard >= a && s.pos > s.loopB) this.seek(heard);
  }

  /**
   * Fills `l`/`r` with `n` frames (silence when paused). Returns false when
   * playback just reached the end of the file.
   */
  render(l: Float32Array, r: Float32Array, n: number): boolean {
    if (!this.playing || !this.stretcher) {
      l.fill(0, 0, n);
      r.fill(0, 0, n);
      return true;
    }
    const got = this.stretcher.extract(l, r, n);
    l.fill(0, got, n);
    r.fill(0, got, n);
    if (got === 0) {
      this.playing = false;
      return false;
    }
    return true;
  }
}
