import { SimpleFilter, SoundTouch, type SampleSource } from "soundtouchjs";

const BLOCK = 4096;

/**
 * Reads frames from an AudioBuffer, keeping its own read head and wrapping
 * inside the A/B loop. SoundTouch pulls from this; it ignores the position
 * argument SimpleFilter passes in.
 */
class LoopSource implements SampleSource {
  pos = 0;
  loopA = 0;
  loopB = 0;
  loopOn = false;
  private left: Float32Array;
  private right: Float32Array;

  constructor(readonly buffer: AudioBuffer) {
    this.left = buffer.getChannelData(0);
    this.right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : this.left;
  }

  get loopActive(): boolean {
    return this.loopOn && this.loopB - this.loopA > 64;
  }

  extract(target: Float32Array, numFrames: number): number {
    const len = this.left.length;
    let i = 0;
    for (; i < numFrames; i++) {
      if (this.loopActive && this.pos >= this.loopB) this.pos = this.loopA;
      if (this.pos >= len) break;
      target[i * 2] = this.left[this.pos];
      target[i * 2 + 1] = this.right[this.pos];
      this.pos++;
    }
    return i;
  }
}

export class Player {
  readonly output: GainNode;
  private source: LoopSource | null = null;
  private st = new SoundTouch();
  private filter: SimpleFilter | null = null;
  private node: ScriptProcessorNode;
  private samples = new Float32Array(BLOCK * 2);
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
    this.st = new SoundTouch();
    this.filter = new SimpleFilter(this.source, this.st);
    this.applyStretch();
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

  play(): void {
    if (!this.source) return;
    if (this.source.pos >= this.source.buffer.length) this.seek(0);
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
    if (!this.source || !this.filter) return;
    const sr = this.source.buffer.sampleRate;
    this.source.pos = Math.max(0, Math.min(this.source.buffer.length, Math.round(seconds * sr)));
    this.filter.clear();
  }

  /** Approximate audible position: read head minus what is still buffered in the stretcher. */
  get currentTime(): number {
    if (!this.source || !this.filter) return 0;
    const sr = this.source.buffer.sampleRate;
    const pendingOut = this.filter.outputBuffer.frameCount - this.filter.outputBufferPosition;
    const buffered = this.st.inputBuffer.frameCount + (pendingOut + (this._playing ? BLOCK : 0)) * this._speed;
    let pos = this.source.pos - buffered;
    if (this.source.loopActive && pos < this.source.loopA) pos += this.source.loopB - this.source.loopA;
    return Math.max(0, pos / sr);
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
    const heard = this.currentTime; // read before the loop changes (currentTime depends on it)
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
    this.st.tempo = this._speed;
    this.st.pitch = Math.pow(2, this.pitchOffsetCents / 1200);
  }

  private process(e: AudioProcessingEvent): void {
    const l = e.outputBuffer.getChannelData(0);
    const r = e.outputBuffer.getChannelData(1);
    if (!this._playing || !this.filter) {
      l.fill(0);
      r.fill(0);
      return;
    }
    const n = this.filter.extract(this.samples, BLOCK);
    for (let i = 0; i < n; i++) {
      l[i] = this.samples[i * 2];
      r[i] = this.samples[i * 2 + 1];
    }
    l.fill(0, n);
    r.fill(0, n);
    if (n === 0) {
      this._playing = false;
      queueMicrotask(() => this.onEnded());
    }
  }
}
