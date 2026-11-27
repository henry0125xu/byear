import {
  loadRubberBand,
  RubberBandStretcher,
  SoundTouchStretcher,
  type EngineId,
  type FrameSource,
  type Stretcher,
} from "./stretch";
import type { RubberBandInterface } from "rubberband-wasm";

const BLOCK = 4096;

/**
 * Reads frames from an AudioBuffer, keeping its own read head and wrapping
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
  private left: Float32Array;
  private right: Float32Array;

  constructor(readonly buffer: AudioBuffer) {
    this.left = buffer.getChannelData(0);
    this.right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : this.left;
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
      const keepFrom = this.fed - 10 * this.buffer.sampleRate;
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

export class Player {
  readonly output: GainNode;
  private source: LoopSource | null = null;
  private stretcher: Stretcher | null = null;
  private node: ScriptProcessorNode;
  private _engine: EngineId = "soundtouch";
  private rb: RubberBandInterface | null = null;
  private _playing = false;
  private _speed = 1;
  private _semitones = 0;
  private _cents = 0;
  onEnded: () => void = () => {};

  constructor(ctx: AudioContext) {
    this.output = ctx.createGain();
    this.node = ctx.createScriptProcessor(BLOCK, 2, 2);
    this.node.onaudioprocess = (e) => this.process(e);
    this.node.connect(this.output);
  }

  load(buffer: AudioBuffer): void {
    this._playing = false;
    this.source = new LoopSource(buffer);
    this.source.loopB = buffer.length;
    this.replaceStretcher();
  }

  get buffer(): AudioBuffer | null {
    return this.source?.buffer ?? null;
  }
  get duration(): number {
    return this.buffer?.duration ?? 0;
  }
  get playing(): boolean {
    return this._playing;
  }

  // ---- engine ----
  get engine(): EngineId {
    return this._engine;
  }
  /** Switches the time-stretch engine, keeping the audible position. Rejects if Rubber Band fails to load. */
  async setEngine(id: EngineId): Promise<void> {
    if (id !== "soundtouch") this.rb = await loadRubberBand();
    if (id === this._engine) return;
    const heard = this.currentTime;
    this._engine = id;
    if (!this.source) return;
    this.replaceStretcher();
    this.seek(heard);
  }

  private replaceStretcher(): void {
    const s = this.source;
    if (!s) return;
    this.stretcher?.dispose();
    this.stretcher =
      this._engine !== "soundtouch" && this.rb
        ? new RubberBandStretcher(this.rb, s, s.buffer.sampleRate, this._engine === "rubberband-hq")
        : new SoundTouchStretcher(s);
    this.applyStretch();
  }

  // ---- transport ----
  play(): void {
    if (!this.source) return;
    if (this.source.pos >= this.source.buffer.length && !this.source.loopActive) this.seek(0);
    if (this.source.loopActive && this.currentTime >= this.loop.b) this.seek(this.loop.a);
    this._playing = true;
  }
  pause(): void {
    this._playing = false;
  }
  stop(): void {
    this._playing = false;
    this.seek(this.source?.loopActive ? this.loop.a : 0);
  }

  seek(seconds: number): void {
    if (!this.source || !this.stretcher) return;
    this.source.seek(seconds * this.source.buffer.sampleRate);
    this.stretcher.clear();
  }

  /** Audible position: frames handed to the stretcher, minus what it still holds and the output block. */
  get currentTime(): number {
    const s = this.source;
    if (!s || !this.stretcher) return 0;
    const lag = this.stretcher.pending + (this._playing ? BLOCK * this._speed : 0);
    return s.positionAt(s.fed - lag) / s.buffer.sampleRate;
  }

  // ---- loop ----
  get loop(): { a: number; b: number; on: boolean } {
    const s = this.source;
    if (!s) return { a: 0, b: 0, on: false };
    const sr = s.buffer.sampleRate;
    return { a: s.loopA / sr, b: s.loopB / sr, on: s.loopOn };
  }
  setLoop(a: number, b: number): void {
    const s = this.source;
    if (!s) return;
    const heard = this.currentTime; // read before the loop changes
    const sr = s.buffer.sampleRate;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    s.loopA = Math.max(0, Math.round(lo * sr));
    s.loopB = Math.min(s.buffer.length, Math.round(hi * sr));
    this.resyncToLoop(heard);
  }
  setLoopOn(on: boolean): void {
    if (!this.source) return;
    const heard = this.currentTime;
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
    const { a, b } = this.loop;
    if (heard >= b) this.seek(a);
    else if (heard >= a && s.pos > s.loopB) this.seek(heard);
  }

  // ---- stretch ----
  get speed(): number {
    return this._speed;
  }
  set speed(v: number) {
    this._speed = v;
    this.applyStretch();
  }
  get semitones(): number {
    return this._semitones;
  }
  set semitones(v: number) {
    this._semitones = v;
    this.applyStretch();
  }
  get cents(): number {
    return this._cents;
  }
  set cents(v: number) {
    this._cents = v;
    this.applyStretch();
  }
  /** Total pitch offset of the recording in cents (used to keep test tones in tune). */
  get pitchOffsetCents(): number {
    return this._semitones * 100 + this._cents;
  }

  private applyStretch(): void {
    this.stretcher?.setRate(this._speed, Math.pow(2, this.pitchOffsetCents / 1200));
  }

  private process(e: AudioProcessingEvent): void {
    const l = e.outputBuffer.getChannelData(0);
    const r = e.outputBuffer.getChannelData(1);
    if (!this._playing || !this.stretcher) {
      l.fill(0);
      r.fill(0);
      return;
    }
    const n = this.stretcher.extract(l, r, BLOCK);
    l.fill(0, n);
    r.fill(0, n);
    if (n === 0) {
      this._playing = false;
      queueMicrotask(() => this.onEnded());
    }
  }
}
