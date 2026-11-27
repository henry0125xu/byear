import type { Player } from "../audio/player";
import type { EngineId } from "../audio/stretch";
import { INSTRUMENTS, isGuitar, isInstrumentId, type InstrumentId, type Tones } from "../audio/tones";
import { workspaceChanged } from "./changes";
import { $ } from "./dom";

/** The per-song controls (saved in the workspace). */
export interface SongControls {
  /** 1 = 100%. */
  speed: number;
  semitones: number;
  cents: number;
}

export interface Controls {
  /** Strum checkbox state. */
  readonly strum: boolean;
  song(): SongControls;
  /** Sets the per-song sliders without notifying (restoring a workspace). */
  applySong(values: SongControls): void;
  /** Starts loading the current sound's samples, showing progress next to the select. */
  loadInstrument(): void;
}

/** Calls `apply` now and on every change. User changes also notify the workspace if `perSong`. */
function bindRange(id: string, apply: (v: number) => void, perSong = false): HTMLInputElement {
  const el = $<HTMLInputElement>(id);
  const handler = () => apply(Number(el.value));
  el.addEventListener("input", () => {
    handler();
    if (perSong) workspaceChanged();
  });
  handler();
  return el;
}

/** Sets a range input and runs its handlers, without the workspace notification. */
function setRange(el: HTMLInputElement, value: number, apply: (v: number) => void): void {
  el.value = String(value);
  apply(Number(el.value));
}

/** Speed, pitch, engine, volumes and the test-tone sound. */
export function setupControls(ctx: AudioContext, player: Player, tones: Tones, isUnlocked: () => boolean): Controls {
  const applySpeed = (v: number) => {
    player.speed = v / 100;
    $("speed-val").textContent = `${v}%`;
  };
  const speedEl = bindRange("speed", applySpeed, true);
  document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((btn) =>
    btn.addEventListener("click", () => {
      speedEl.value = btn.dataset.speed!;
      speedEl.dispatchEvent(new Event("input"));
    }),
  );

  // Time-stretch engine (remembered). Rubber Band loads its WASM on first use.
  const ENGINE_KEY = "byear.engine";
  const ENGINES: EngineId[] = ["rubberband", "rubberband-hq", "soundtouch"];
  const engineEl = $<HTMLSelectElement>("engine");
  function selectEngine(id: EngineId): void {
    const status = $("engine-status");
    status.textContent = id === "soundtouch" ? "" : "loading…";
    player
      .setEngine(id)
      .then(() => {
        status.textContent = "";
        localStorage.setItem(ENGINE_KEY, id);
      })
      .catch(() => {
        status.textContent = "Rubber Band failed to load; using SoundTouch";
        engineEl.value = player.engine;
      });
  }
  engineEl.addEventListener("change", () => selectEngine(engineEl.value as EngineId));
  const savedEngine = localStorage.getItem(ENGINE_KEY) as EngineId | null;
  engineEl.value = savedEngine && ENGINES.includes(savedEngine) ? savedEngine : "rubberband-hq";
  selectEngine(engineEl.value as EngineId);

  // Test tones follow the recording's transpose + fine-tune, so labels stay in the original key.
  function syncDetune(): void {
    tones.detuneCents = player.pitchOffsetCents;
  }
  const applySemi = (v: number) => {
    player.semitones = v;
    $("semi-val").textContent = v > 0 ? `+${v}` : String(v);
    syncDetune();
  };
  const applyCents = (v: number) => {
    player.cents = v;
    $("cents-val").textContent = v > 0 ? `+${v}` : String(v);
    syncDetune();
  };
  const semiEl = bindRange("semi", applySemi, true);
  const centsEl = bindRange("cents", applyCents, true);
  bindRange("rec-vol", (v) => player.output.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.01));
  bindRange("tone-vol", (v) => {
    tones.volume.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.01);
    $("tone-vol-val").textContent = `${v}%`;
  });

  function loadInstrument(): void {
    const status = $("sample-status");
    status.textContent = "loading samples…";
    tones
      .load(tones.current)
      .then(() => (status.textContent = ""))
      .catch(() => (status.textContent = "sample load failed (offline?)"));
  }

  // Sound (remembered). Switching to a guitar sound turns strum on; to piano, off.
  const INSTRUMENT_KEY = "byear.instrument";
  const instrumentEl = $<HTMLSelectElement>("instrument");
  const strumEl = $<HTMLInputElement>("strum");
  instrumentEl.replaceChildren(
    ...Object.entries(INSTRUMENTS).map(([id, { label }]) => new Option(label, id)),
  );
  const savedInstrument = localStorage.getItem(INSTRUMENT_KEY);
  tones.current = isInstrumentId(savedInstrument) ? savedInstrument : "piano";
  instrumentEl.value = tones.current;
  strumEl.checked = isGuitar(tones.current);
  instrumentEl.addEventListener("change", () => {
    const wasGuitar = isGuitar(tones.current);
    tones.current = instrumentEl.value as InstrumentId;
    if (isGuitar(tones.current) !== wasGuitar) strumEl.checked = isGuitar(tones.current);
    localStorage.setItem(INSTRUMENT_KEY, tones.current);
    if (isUnlocked()) loadInstrument();
  });

  $<HTMLInputElement>("sustain").addEventListener("change", (e) => {
    tones.sustain = (e.target as HTMLInputElement).checked;
  });

  return {
    get strum() {
      return strumEl.checked;
    },
    song: () => ({ speed: player.speed, semitones: player.semitones, cents: player.cents }),
    applySong({ speed, semitones, cents }) {
      setRange(speedEl, Math.round(speed * 100), applySpeed);
      setRange(semiEl, semitones, applySemi);
      setRange(centsEl, cents, applyCents);
    },
    loadInstrument,
  };
}
