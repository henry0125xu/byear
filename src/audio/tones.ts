import { CacheStorage, Soundfont } from "smplr";

export type InstrumentId = "piano" | "guitar";

const SOUNDFONT_NAME: Record<InstrumentId, string> = {
  piano: "acoustic_grand_piano",
  guitar: "acoustic_guitar_steel",
};

const STRUM_GAP = 0.025; // seconds between strings

type Instrument = ReturnType<typeof Soundfont>;

/** Sampled test tones. Detune follows the recording's transpose + fine-tune. */
export class Tones {
  /** Volume control (0–2). Feeds a limiter so loud chords don't clip. */
  readonly volume: GainNode;
  readonly output: DynamicsCompressorNode;
  private storage = new CacheStorage("byear-samples");
  private instruments = new Map<InstrumentId, Promise<Instrument>>();
  current: InstrumentId = "piano";
  detuneCents = 0;

  constructor(private ctx: AudioContext) {
    this.volume = ctx.createGain();
    this.output = ctx.createDynamicsCompressor();
    this.output.threshold.value = -6;
    this.output.knee.value = 4;
    this.output.ratio.value = 12;
    this.output.attack.value = 0.002;
    this.output.release.value = 0.15;
    this.volume.connect(this.output);
  }

  /** Starts loading an instrument; resolves when it can play. */
  load(id: InstrumentId): Promise<Instrument> {
    let p = this.instruments.get(id);
    if (!p) {
      const inst = Soundfont(this.ctx, {
        instrument: SOUNDFONT_NAME[id],
        kit: "MusyngKite",
        destination: this.volume,
        storage: this.storage,
      });
      p = inst.ready.then(() => inst);
      this.instruments.set(id, p);
    }
    return p;
  }

  async play(midi: number[], opts: { strum?: boolean; duration?: number } = {}): Promise<void> {
    const inst = await this.load(this.current);
    const now = this.ctx.currentTime;
    const sorted = [...midi].sort((a, b) => a - b);
    const duration = opts.duration ?? 2;
    sorted.forEach((note, i) => {
      inst.start({
        note,
        time: now + (opts.strum ? i * STRUM_GAP : 0),
        duration,
        detune: this.detuneCents,
        velocity: 110,
      });
    });
  }

  stopAll(): void {
    for (const p of this.instruments.values()) p.then((i) => i.stop());
  }
}
