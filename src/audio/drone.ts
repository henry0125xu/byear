import { Note } from "tonal";

/** MIDI number of the drone's tonic: the pitch class in octave 3 (C3 = 48 … B3 = 59). */
export function droneTonicMidi(pitchClass: string): number | null {
  const chroma = Note.chroma(pitchClass);
  return chroma === undefined || Number.isNaN(chroma) ? null : 48 + chroma;
}

/** Notes the drone plays: tonic, plus the fifth above if asked. */
export function droneNotes(pitchClass: string, fifth: boolean): number[] {
  const t = droneTonicMidi(pitchClass);
  if (t === null) return [];
  return fifth ? [t, t + 7] : [t];
}

const FADE = 0.25; // seconds, in and out
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Voice {
  oscs: OscillatorNode[];
  gain: GainNode;
}

/**
 * A soft, non-decaying synth drone (triangle + sine an octave below, low-passed).
 * Follows the recording's transpose and fine-tune through `detuneCents` (Decision #2).
 */
export class Drone {
  /** Drone volume (0–1). */
  readonly output: GainNode;
  private filter: BiquadFilterNode;
  private voices: Voice[] = [];
  private _on = false;
  private _tonic: string | null = null;
  private _fifth = false;
  private _detune = 0;

  constructor(private ctx: AudioContext) {
    this.output = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 0.3;
    this.filter.connect(this.output);
  }

  get on(): boolean {
    return this._on;
  }
  set on(v: boolean) {
    this._on = v;
    this.rebuild();
  }
  get tonic(): string | null {
    return this._tonic;
  }
  set tonic(v: string | null) {
    this._tonic = v;
    this.rebuild();
  }
  get fifth(): boolean {
    return this._fifth;
  }
  set fifth(v: boolean) {
    this._fifth = v;
    this.rebuild();
  }
  set detuneCents(cents: number) {
    this._detune = cents;
    const t = this.ctx.currentTime;
    for (const v of this.voices) for (const o of v.oscs) o.detune.setTargetAtTime(cents, t, 0.02);
  }

  /** Fades out what is playing and fades in the current notes (if on). */
  private rebuild(): void {
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + FADE);
      for (const o of v.oscs) o.stop(t + FADE + 0.05);
    }
    this.voices = [];
    if (!this._on || !this._tonic) return;

    const notes = droneNotes(this._tonic, this._fifth);
    const level = 0.5 / notes.length;
    for (const midi of notes) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(level, t + FADE);
      gain.connect(this.filter);
      const oscs = [
        this.osc("triangle", midiHz(midi), 1, gain),
        this.osc("sine", midiHz(midi - 12), 0.6, gain),
      ];
      this.voices.push({ oscs, gain });
    }
  }

  private osc(type: OscillatorType, hz: number, level: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.detune.value = this._detune;
    const g = this.ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(dest);
    o.start();
    return o;
  }
}
