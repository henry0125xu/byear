import type { Drone } from "../audio/drone";
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
  /** Pitch class, or null when not set. */
  tonic: string | null;
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

/** Speed, pitch, engine, volumes, tonic + drone, and the test-tone sound. */
export function setupControls(
  ctx: AudioContext,
  player: Player,
  tones: Tones,
  drone: Drone,
  isUnlocked: () => boolean,
): Controls {
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

  // Test tones and the drone follow the recording's transpose + fine-tune; labels stay in the original key.
  function syncDetune(): void {
    tones.detuneCents = player.pitchOffsetCents;
    drone.detuneCents = player.pitchOffsetCents;
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

  // Tonic (per song) and drone. The drone always starts off, so opening the app never makes sound;
  // +5th and its volume are remembered.
  const tonicEl = $<HTMLSelectElement>("tonic");
  const droneEl = $<HTMLInputElement>("drone");
  const fifthEl = $<HTMLInputElement>("drone-fifth");
  function applyTonic(tonic: string | null): void {
    tonicEl.value = tonic ?? "";
    drone.tonic = tonic;
    droneEl.disabled = !tonic;
    if (!tonic) droneEl.checked = drone.on = false;
  }
  tonicEl.addEventListener("change", () => {
    applyTonic(tonicEl.value || null);
    workspaceChanged();
  });
  droneEl.addEventListener("change", () => {
    if (droneEl.checked && ctx.state !== "running") void ctx.resume();
    drone.on = droneEl.checked;
  });
  const FIFTH_KEY = "byear.droneFifth";
  fifthEl.checked = localStorage.getItem(FIFTH_KEY) === "1";
  drone.fifth = fifthEl.checked;
  fifthEl.addEventListener("change", () => {
    drone.fifth = fifthEl.checked;
    localStorage.setItem(FIFTH_KEY, fifthEl.checked ? "1" : "0");
  });
  const DRONE_VOL_KEY = "byear.droneVol";
  const droneVolEl = $<HTMLInputElement>("drone-vol");
  droneVolEl.value = localStorage.getItem(DRONE_VOL_KEY) ?? droneVolEl.value;
  bindRange("drone-vol", (v) => {
    drone.output.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.02);
    $("drone-vol-val").textContent = `${v}%`;
    localStorage.setItem(DRONE_VOL_KEY, String(v));
  });

  $<HTMLInputElement>("sustain").addEventListener("change", (e) => {
    tones.sustain = (e.target as HTMLInputElement).checked;
  });

  return {
    get strum() {
      return strumEl.checked;
    },
    song: () => ({ speed: player.speed, semitones: player.semitones, cents: player.cents, tonic: drone.tonic }),
    applySong({ speed, semitones, cents, tonic }) {
      setRange(speedEl, Math.round(speed * 100), applySpeed);
      setRange(semiEl, semitones, applySemi);
      setRange(centsEl, cents, applyCents);
      applyTonic(tonic);
    },
    loadInstrument,
  };
}
