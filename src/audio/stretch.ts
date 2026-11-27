import { RubberBandInterface, RubberBandOption } from "rubberband-wasm";
import { SimpleFilter, SoundTouch, type SampleSource } from "soundtouchjs";

export type EngineId = "rubberband" | "rubberband-hq" | "soundtouch";

/** Where stretchers pull source audio from (implemented by LoopSource). */
export interface FrameSource extends SampleSource {
  /** Planar read; returns frames read (less than `n` only at the end of the file). */
  readPlanar(l: Float32Array, r: Float32Array, n: number): number;
}

/** Time-stretch + pitch-shift engine, pulled block by block from the audio callback. */
export interface Stretcher {
  setRate(speed: number, pitchScale: number): void;
  /** Drop everything buffered (after a seek). */
  clear(): void;
  /** Writes up to `n` output frames; fewer only when the source has ended and the engine is drained. */
  extract(l: Float32Array, r: Float32Array, n: number): number;
  /** Source frames already pulled from the source but not yet output. */
  readonly pending: number;
  dispose(): void;
}

// ---------------------------------------------------------------- SoundTouch

export class SoundTouchStretcher implements Stretcher {
  private st = new SoundTouch();
  private filter: SimpleFilter;
  private samples = new Float32Array(0);
  private speed = 1;

  constructor(source: FrameSource) {
    this.filter = new SimpleFilter(source, this.st);
  }

  setRate(speed: number, pitchScale: number): void {
    this.speed = speed;
    this.st.tempo = speed;
    this.st.pitch = pitchScale;
  }
  clear(): void {
    this.filter.clear();
  }
  get pending(): number {
    const pendingOut = this.filter.outputBuffer.frameCount - this.filter.outputBufferPosition;
    return this.st.inputBuffer.frameCount + pendingOut * this.speed;
  }
  extract(l: Float32Array, r: Float32Array, n: number): number {
    if (this.samples.length < n * 2) this.samples = new Float32Array(n * 2);
    const got = this.filter.extract(this.samples, n);
    for (let i = 0; i < got; i++) {
      l[i] = this.samples[i * 2];
      r[i] = this.samples[i * 2 + 1];
    }
    return got;
  }
  dispose(): void {}
}

// ---------------------------------------------------------------- Rubber Band

/** Compiles and instantiates Rubber Band from the .wasm bytes (works inside an AudioWorklet). */
export async function initRubberBand(bytes: ArrayBuffer): Promise<RubberBandInterface> {
  return RubberBandInterface.initialize(await WebAssembly.compile(bytes));
}

const MAX_CHUNK = 8192;
/** Feed only what Rubber Band asks for, in small pieces, so the work spreads evenly over 128-frame render quanta. */
const FEED_CHUNK = 256;

/**
 * Rubber Band in real-time mode. `hq` selects the R3 ("finer") engine: clearly
 * better at low speeds but about 2.5× the CPU of R2, and it runs on the main thread.
 */
export class RubberBandStretcher implements Stretcher {
  private state: number;
  private ptrs: number;
  private ptrL: number;
  private ptrR: number;
  private inL = new Float32Array(MAX_CHUNK);
  private inR = new Float32Array(MAX_CHUNK);
  private speed = 1;
  private fedIn = 0;
  private heardIn = 0;
  private discard = 0;
  private ended = false;

  constructor(
    private rb: RubberBandInterface,
    private source: FrameSource,
    sampleRate: number,
    hq: boolean,
  ) {
    const opts =
      RubberBandOption.RubberBandOptionProcessRealTime |
      RubberBandOption.RubberBandOptionPitchHighConsistency |
      (hq ? RubberBandOption.RubberBandOptionEngineFiner : RubberBandOption.RubberBandOptionEngineFaster);
    this.state = rb.rubberband_new(sampleRate, 2, opts, 1, 1);
    rb.rubberband_set_max_process_size(this.state, MAX_CHUNK);
    this.ptrL = rb.malloc(MAX_CHUNK * 4);
    this.ptrR = rb.malloc(MAX_CHUNK * 4);
    this.ptrs = rb.malloc(8);
    rb.memWritePtr(this.ptrs, this.ptrL);
    rb.memWritePtr(this.ptrs + 4, this.ptrR);
    this.clear();
  }

  setRate(speed: number, pitchScale: number): void {
    this.speed = speed;
    this.rb.rubberband_set_time_ratio(this.state, 1 / speed);
    this.rb.rubberband_set_pitch_scale(this.state, pitchScale);
  }

  /**
   * Reset, then prime with the preferred amount of silence and skip the start
   * delay, so output frame 0 lines up with the first source frame after a seek.
   */
  clear(): void {
    const rb = this.rb;
    rb.rubberband_reset(this.state);
    let pad = rb.rubberband_get_preferred_start_pad(this.state);
    this.inL.fill(0);
    this.inR.fill(0);
    rb.memWrite(this.ptrL, this.inL);
    rb.memWrite(this.ptrR, this.inR);
    while (pad > 0) {
      const k = Math.min(pad, MAX_CHUNK);
      rb.rubberband_process(this.state, this.ptrs, k, 0);
      pad -= k;
    }
    this.discard = rb.rubberband_get_start_delay(this.state);
    this.fedIn = 0;
    this.heardIn = 0;
    this.ended = false;
  }

  get pending(): number {
    return Math.max(0, this.fedIn - this.heardIn);
  }

  extract(l: Float32Array, r: Float32Array, n: number): number {
    const rb = this.rb;
    let written = 0;
    while (written < n) {
      const avail = Math.max(0, rb.rubberband_available(this.state)); // -1 once fully drained
      if (avail > 0 && this.discard > 0) {
        this.discard -= rb.rubberband_retrieve(this.state, this.ptrs, Math.min(avail, this.discard, MAX_CHUNK));
        continue;
      }
      if (avail > 0) {
        const k = rb.rubberband_retrieve(this.state, this.ptrs, Math.min(avail, n - written, MAX_CHUNK));
        l.set(rb.memReadF32(this.ptrL, k), written);
        r.set(rb.memReadF32(this.ptrR, k), written);
        written += k;
        this.heardIn += k * this.speed;
        continue;
      }
      if (this.ended) break;
      const need = Math.min(FEED_CHUNK, Math.max(64, rb.rubberband_get_samples_required(this.state)));
      const got = this.source.readPlanar(this.inL, this.inR, need);
      rb.memWrite(this.ptrL, this.inL.subarray(0, got));
      rb.memWrite(this.ptrR, this.inR.subarray(0, got));
      this.ended = got < need;
      rb.rubberband_process(this.state, this.ptrs, got, this.ended ? 1 : 0);
      this.fedIn += got;
    }
    return written;
  }

  dispose(): void {
    this.rb.rubberband_delete(this.state);
    this.rb.free(this.ptrL);
    this.rb.free(this.ptrR);
    this.rb.free(this.ptrs);
  }
}
