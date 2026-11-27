import { CacheStorage, ElectricPiano, Soundfont } from "smplr";

/**
 * Test-tone sounds. `guitar` ones get the guitar voicing and strum by default.
 * `kit: "epiano"` uses smplr's ElectricPiano (multi-sampled recordings);
 * everything else is a General MIDI soundfont.
 */
export const INSTRUMENTS = {
  piano: { label: "Piano", sample: "acoustic_grand_piano", kit: "MusyngKite", guitar: false },
  "ep-rhodes": { label: "E.Piano · Rhodes-like", sample: "electric_piano_1", kit: "MusyngKite", guitar: false },
  "ep-wurli": { label: "E.Piano · Wurlitzer", sample: "WurlitzerEP200", kit: "epiano", guitar: false },
  "ep-cp80": { label: "E.Piano · CP80", sample: "CP80", kit: "epiano", guitar: false },
  "ep-fm": { label: "E.Piano · FM (TX81Z)", sample: "TX81Z", kit: "epiano", guitar: false },
  "guitar-steel": { label: "Guitar · steel", sample: "acoustic_guitar_steel", kit: "MusyngKite", guitar: true },
  "guitar-steel-fluid": { label: "Guitar · steel (FluidR3)", sample: "acoustic_guitar_steel", kit: "FluidR3_GM", guitar: true },
  "guitar-nylon": { label: "Guitar · nylon", sample: "acoustic_guitar_nylon", kit: "MusyngKite", guitar: true },
  "guitar-clean": { label: "Electric · clean", sample: "electric_guitar_clean", kit: "MusyngKite", guitar: true },
  "guitar-jazz": { label: "Electric · jazz", sample: "electric_guitar_jazz", kit: "MusyngKite", guitar: true },
  "guitar-overdrive": { label: "Electric · overdrive", sample: "overdriven_guitar", kit: "MusyngKite", guitar: true },
  "guitar-distortion": { label: "Electric · distortion", sample: "distortion_guitar", kit: "MusyngKite", guitar: true },
} as const;

export type InstrumentId = keyof typeof INSTRUMENTS;

export function isInstrumentId(v: string | null): v is InstrumentId {
  return v !== null && v in INSTRUMENTS;
}
export function isGuitar(id: InstrumentId): boolean {
  return INSTRUMENTS[id].guitar;
}

const STRUM_GAP = 0.025; // seconds between strings
/** Shortest sound for a quick click, counted from the last strummed string. */
const MIN_HOLD = 0.12;
/** With sustain, released notes ring on naturally but are cut after this long. */
const SUSTAIN_MAX = 6;

/** Notes started by `start`; `release` is the key/mouse coming up (now, or at context time `at`). */
export interface HeldNotes {
  release(at?: number): void;
}

type Instrument = ReturnType<typeof Soundfont> | ReturnType<typeof ElectricPiano>;

/** Input range the saturator covers (the curve spans ±1, so the signal is scaled down by this first). */
const SATURATION_RANGE = 4;

/** WaveShaper curve: y = tanh(x) for x in ±SATURATION_RANGE. */
export function tanhCurve(points = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = ((i / (points - 1)) * 2 - 1) * SATURATION_RANGE;
    curve[i] = Math.tanh(x);
  }
  return curve;
}

/** Sampled test tones. Detune follows the recording's transpose + fine-tune. */
export class Tones {
  /** Volume control (0–2). Feeds a soft saturator so loud chords never clip. */
  readonly volume: GainNode;
  readonly output: AudioNode;
  private storage = new CacheStorage("byear-samples");
  private instruments = new Map<InstrumentId, Promise<Instrument>>();
  current: InstrumentId = "piano";
  detuneCents = 0;
  /** Like a sustain pedal: released notes ring on instead of stopping. */
  sustain = false;

  constructor(private ctx: AudioContext) {
    // A limiter capped the level at about 120% (the user heard no change above it). tanh keeps
    // getting fuller up to 200% and can't exceed ±1; pushed hard it adds mild, warm saturation.
    this.volume = ctx.createGain();
    const pre = ctx.createGain();
    pre.gain.value = 1 / SATURATION_RANGE;
    const shaper = ctx.createWaveShaper();
    shaper.curve = tanhCurve();
    shaper.oversample = "4x";
    this.volume.connect(pre).connect(shaper);
    this.output = shaper;
  }

  /** Starts loading an instrument; resolves when it can play. */
  load(id: InstrumentId): Promise<Instrument> {
    let p = this.instruments.get(id);
    if (!p) {
      const { sample, kit } = INSTRUMENTS[id];
      const common = { destination: this.volume, storage: this.storage };
      const inst: Instrument =
        kit === "epiano"
          ? ElectricPiano(this.ctx, { ...common, instrument: sample })
          : Soundfont(this.ctx, { ...common, instrument: sample, kit });
      p = inst.ready.then(() => inst);
      p.catch(() => this.instruments.delete(id)); // allow a retry
      this.instruments.set(id, p);
    }
    return p;
  }

  /**
   * Starts notes that sound until `release()` (press-and-hold), or for a fixed
   * `duration` if given. Samples may still be loading; release still works.
   */
  start(midi: number[], opts: { strum?: boolean; duration?: number; at?: number } = {}): HeldNotes {
    const sorted = [...midi].sort((a, b) => a - b);
    const stops: ((time?: number) => void)[] = [];
    let startedAt = -1;
    let releaseAt = -1;

    const stopAll = () => {
      const t = this.ctx.currentTime;
      const span = opts.strum ? (sorted.length - 1) * STRUM_GAP : 0;
      const at = Math.max(t, releaseAt, startedAt + span + MIN_HOLD);
      const when = this.sustain ? at + SUSTAIN_MAX : at;
      for (const stop of stops) stop(when);
    };

    void this.load(this.current).then((inst) => {
      startedAt = Math.max(this.ctx.currentTime, opts.at ?? 0);
      sorted.forEach((note, i) => {
        stops.push(
          inst.start({
            note,
            time: startedAt + (opts.strum ? i * STRUM_GAP : 0),
            duration: opts.duration ?? null,
            detune: this.detuneCents,
            velocity: 110,
          }),
        );
      });
      if (releaseAt >= 0) stopAll(); // released while loading
    });

    return {
      release: (at?: number) => {
        if (opts.duration !== undefined || releaseAt >= 0) return;
        releaseAt = Math.max(this.ctx.currentTime, at ?? 0);
        if (startedAt >= 0) stopAll();
      },
    };
  }

  stopAll(): void {
    for (const p of this.instruments.values()) p.then((i) => i.stop());
  }
}
