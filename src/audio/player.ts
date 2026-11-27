import rubberBandWasmUrl from "rubberband-wasm/dist/rubberband.wasm?url";
import workletUrl from "./player-worklet.ts?worker&url";
import { PROCESSOR_NAME, type FromWorklet, type ToWorklet } from "./protocol";
import type { EngineId } from "./stretch";

let wasmBytes: Promise<ArrayBuffer> | null = null;
function fetchRubberBand(): Promise<ArrayBuffer> {
  wasmBytes ??= fetch(rubberBandWasmUrl).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  });
  wasmBytes.catch(() => (wasmBytes = null)); // allow a retry
  return wasmBytes;
}

/**
 * Main-thread handle for the player worklet (see player-worklet.ts / engine.ts).
 * Commands are posted; state the UI reads synchronously is mirrored here, and
 * the playhead is extrapolated from the worklet's ~23 ms position reports.
 */
export class Player {
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private queue: ToWorklet[] = [];
  private _buffer: AudioBuffer | null = null;
  private _loop = { a: 0, b: 0, on: false };
  private _engine: EngineId = "soundtouch";
  private engineReplies = new Map<number, (error?: string) => void>();
  private nextReq = 1;
  private wasmSent = false;
  private _playing = false;
  private _speed = 1;
  private _semitones = 0;
  private _cents = 0;
  private _preRoll = 0;
  /** Last known position: `pos` was rendered at context time `time` (heard `latency` later); never report less than `floor`. */
  private snap = { pos: 0, time: 0, floor: 0 };
  onEnded: () => void = () => {};

  constructor(private ctx: AudioContext) {
    this.output = ctx.createGain();
    ctx.audioWorklet.addModule(workletUrl).then(() => {
      this.node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
        numberOfInputs: 0,
        outputChannelCount: [2],
      });
      this.node.port.onmessage = (e: MessageEvent<FromWorklet>) => this.onMessage(e.data);
      this.node.connect(this.output);
      for (const msg of this.queue) this.node.port.postMessage(msg);
      this.queue = [];
    });
  }

  private post(msg: ToWorklet, transfer: Transferable[] = []): void {
    if (this.node) this.node.port.postMessage(msg, transfer);
    else this.queue.push(msg); // before the module loads; nothing is transferred yet
  }

  private onMessage(msg: FromWorklet): void {
    switch (msg.type) {
      case "pos":
        this.snap = { pos: msg.pos, time: msg.time, floor: 0 };
        break;
      case "ended":
        this._playing = false;
        this.onEnded();
        break;
      case "engine":
        this.engineReplies.get(msg.req)?.(msg.error);
        this.engineReplies.delete(msg.req);
        break;
    }
  }

  load(buffer: AudioBuffer): void {
    this._buffer = buffer;
    this._playing = false;
    this._loop = { a: 0, b: buffer.duration, on: false };
    const left = buffer.getChannelData(0).slice();
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : left;
    const transfer = right === left ? [left.buffer] : [left.buffer, right.buffer];
    this.post({ type: "load", left, right, sampleRate: buffer.sampleRate }, transfer);
    this.setSnap(0);
  }

  get buffer(): AudioBuffer | null {
    return this._buffer;
  }
  get duration(): number {
    return this._buffer?.duration ?? 0;
  }
  get playing(): boolean {
    return this._playing;
  }

  // ---- engine ----
  get engine(): EngineId {
    return this._engine;
  }
  /** Switches the time-stretch engine. Rejects if Rubber Band fails to load. */
  async setEngine(id: EngineId): Promise<void> {
    let wasm: ArrayBuffer | undefined;
    if (id !== "soundtouch" && !this.wasmSent) wasm = await fetchRubberBand();
    const req = this.nextReq++;
    const error = await new Promise<string | undefined>((resolve) => {
      this.engineReplies.set(req, resolve);
      // A copy, so the cached bytes survive a failed init and can be resent.
      this.post({ type: "engine", req, id, wasm: wasm?.slice(0) });
    });
    if (error) throw new Error(error);
    if (wasm) this.wasmSent = true;
    this._engine = id;
  }

  // ---- transport ----
  play(): void {
    if (!this._buffer) return;
    this.post({ type: "play" });
    this._playing = true;
    // Resume extrapolating from the paused position, starting with the next render.
    this.snap = { pos: this.snap.pos, time: this.ctx.currentTime, floor: this.snap.pos };
  }
  pause(): void {
    this.post({ type: "pause" });
    this._playing = false;
  }
  stop(): void {
    this.post({ type: "stop" });
    this._playing = false;
    this.setSnap(this._loop.on ? this.loopStart : 0);
  }
  seek(seconds: number): void {
    const t = Math.max(0, Math.min(this.duration, seconds));
    this.post({ type: "seek", time: t });
    this.setSnap(t);
  }
  /** Jump to A (or the file start without a loop), with pre-roll. */
  seekToLoopStart(): void {
    if (!this._loop.on) return this.seek(0);
    this.post({ type: "seekToLoopStart" });
    this.setSnap(this.loopStart);
  }
  private get loopStart(): number {
    return Math.max(0, this._loop.a - this._preRoll);
  }

  /** Optimistic position until the worklet reports back: rendered from now, heard after the latency. */
  private setSnap(pos: number): void {
    this.snap = { pos, time: this.ctx.currentTime, floor: pos };
  }

  private get latency(): number {
    return this.ctx.outputLatency || this.ctx.baseLatency || 0;
  }

  /** Audible position: last report, plus time since it reached the speakers. */
  get currentTime(): number {
    if (!this._buffer) return 0;
    let t = this.snap.pos;
    if (this._playing) t += (this.ctx.currentTime - this.latency - this.snap.time) * this._speed;
    t = Math.max(t, this.snap.floor);
    const { a, b, on } = this._loop;
    if (on && b - a > 0.01 && this.snap.pos < b && t >= b) t = a + ((t - b) % (b - a));
    return Math.max(0, Math.min(this.duration, t));
  }

  // ---- loop ----
  get loop(): { a: number; b: number; on: boolean } {
    return { ...this._loop };
  }
  setLoop(a: number, b: number): void {
    if (!this._buffer) return;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    this._loop.a = Math.max(0, lo);
    this._loop.b = Math.min(this.duration, hi);
    this.post({ type: "loop", a: this._loop.a, b: this._loop.b });
  }
  setLoopOn(on: boolean): void {
    if (!this._buffer) return;
    this._loop.on = on;
    this.post({ type: "loopOn", on });
  }

  get preRoll(): number {
    return this._preRoll;
  }
  set preRoll(seconds: number) {
    this._preRoll = Math.max(0, seconds);
    this.post({ type: "preRoll", seconds: this._preRoll });
  }

  // ---- stretch ----
  get speed(): number {
    return this._speed;
  }
  set speed(v: number) {
    // Re-anchor the extrapolation so the playhead doesn't jump.
    this.snap = { pos: this.currentTime, time: this.ctx.currentTime - this.latency, floor: 0 };
    this._speed = v;
    this.postRate();
  }
  get semitones(): number {
    return this._semitones;
  }
  set semitones(v: number) {
    this._semitones = v;
    this.postRate();
  }
  get cents(): number {
    return this._cents;
  }
  set cents(v: number) {
    this._cents = v;
    this.postRate();
  }
  /** Total pitch offset of the recording in cents (used to keep test tones in tune). */
  get pitchOffsetCents(): number {
    return this._semitones * 100 + this._cents;
  }
  private postRate(): void {
    this.post({ type: "rate", speed: this._speed, pitchScale: Math.pow(2, this.pitchOffsetCents / 1200) });
  }
}
