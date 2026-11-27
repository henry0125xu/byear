import "./style.css";
import { Player } from "./audio/player";
import type { EngineId } from "./audio/stretch";
import { INSTRUMENTS, isGuitar, isInstrumentId, Tones, type HeldNotes, type InstrumentId } from "./audio/tones";
import { guitarVoicing, parseChord, pianoVoicing, type ParsedChord } from "./music/chords";
import { NoteGrid } from "./ui/noteGrid";
import { Piano } from "./ui/piano";
import { Waveform } from "./ui/waveform";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ctx = new AudioContext();
const player = new Player(ctx);
const tones = new Tones(ctx);
player.output.connect(ctx.destination);
tones.output.connect(ctx.destination);

// ---------- audio unlock + sample preload ----------
let unlocked = false;
function unlock(): void {
  if (ctx.state !== "running") void ctx.resume();
  if (unlocked) return;
  unlocked = true;
  loadInstrument(tones.current);
}
window.addEventListener("pointerdown", unlock, { capture: true });
window.addEventListener("keydown", unlock, { capture: true });

function loadInstrument(id: InstrumentId): void {
  const status = $("sample-status");
  status.textContent = "loading samples…";
  tones
    .load(id)
    .then(() => (status.textContent = ""))
    .catch(() => (status.textContent = "sample load failed (offline?)"));
}

// ---------- file loading ----------
async function openFile(file: File): Promise<void> {
  $("file-name").textContent = `Decoding ${file.name}…`;
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    player.load(buf);
    waveform.setBuffer(buf);
    $("file-name").textContent = file.name;
    refreshLoopButton();
  } catch {
    $("file-name").textContent = `Could not decode ${file.name}`;
  }
}

$<HTMLInputElement>("file").addEventListener("change", (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void openFile(f);
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.classList.add("dragover");
});
window.addEventListener("dragleave", () => document.body.classList.remove("dragover"));
window.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("dragover");
  const f = e.dataTransfer?.files?.[0];
  if (f) void openFile(f);
});

// ---------- waveform + transport ----------
const waveform = new Waveform($<HTMLCanvasElement>("wave"), {
  onSeek: (t) => player.seek(t),
  onLoopChange: (a, b) => {
    player.setLoop(a, b);
    player.setLoopOn(true);
    refreshLoopButton();
  },
});

function togglePlay(): void {
  if (player.playing) player.pause();
  else player.play();
  refreshPlayButton();
}
function refreshPlayButton(): void {
  $("play").textContent = player.playing ? "❚❚" : "▶";
}
function refreshLoopButton(): void {
  const { a, b, on } = player.loop;
  $("loop").classList.toggle("on", on);
  $("loop-info").textContent = on ? `${fmt(a, 2)} → ${fmt(b, 2)}` : "";
}
player.onEnded = refreshPlayButton;

function setA(): void {
  const { b } = player.loop;
  const t = player.currentTime;
  player.setLoop(t, b > t ? b : player.duration);
  player.setLoopOn(true);
  refreshLoopButton();
}
function setB(): void {
  const { a } = player.loop;
  const t = player.currentTime;
  player.setLoop(a < t ? a : 0, t);
  player.setLoopOn(true);
  refreshLoopButton();
}
const NUDGE = 0.05; // seconds per Shift/Ctrl + arrow
/** Moves one loop edge. Moving A replays from A; moving B replays its last second. */
function nudgeLoop(edge: "a" | "b", delta: number): void {
  const { a, b, on } = player.loop;
  if (!on) return;
  const na = edge === "a" ? Math.min(Math.max(0, a + delta), b - NUDGE) : a;
  const nb = edge === "b" ? Math.max(Math.min(player.duration, b + delta), a + NUDGE) : b;
  player.setLoop(na, nb);
  refreshLoopButton();
  if (!player.playing) return;
  if (edge === "a") player.seekToLoopStart();
  else player.seek(Math.max(na, nb - 1));
}

const PREROLL_KEY = "byear.preRoll";
const prerollEl = $<HTMLSelectElement>("preroll");
prerollEl.value = localStorage.getItem(PREROLL_KEY) ?? "0";
if (!prerollEl.value) prerollEl.value = "0";
player.preRoll = Number(prerollEl.value);
prerollEl.addEventListener("change", () => {
  player.preRoll = Number(prerollEl.value);
  localStorage.setItem(PREROLL_KEY, prerollEl.value);
});

function toggleLoop(): void {
  player.setLoopOn(!player.loop.on);
  refreshLoopButton();
}

$("play").addEventListener("click", togglePlay);
$("stop").addEventListener("click", () => {
  player.stop();
  refreshPlayButton();
});
$("set-a").addEventListener("click", setA);
$("set-b").addEventListener("click", setB);
$("loop").addEventListener("click", toggleLoop);

function fmt(t: number, digits = 1): string {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(digits);
  return `${m}:${s.padStart(digits + 3, "0")}`;
}

function frame(): void {
  const time = player.currentTime;
  waveform.update({ duration: player.duration, time, loop: player.loop });
  $("time").textContent = `${fmt(time)} / ${fmt(player.duration)}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- speed / pitch / mix ----------
function bindRange(id: string, apply: (v: number) => void): HTMLInputElement {
  const el = $<HTMLInputElement>(id);
  const handler = () => apply(Number(el.value));
  el.addEventListener("input", handler);
  handler();
  return el;
}

const speedEl = bindRange("speed", (v) => {
  player.speed = v / 100;
  $("speed-val").textContent = `${v}%`;
});
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
bindRange("semi", (v) => {
  player.semitones = v;
  $("semi-val").textContent = v > 0 ? `+${v}` : String(v);
  syncDetune();
});
bindRange("cents", (v) => {
  player.cents = v;
  $("cents-val").textContent = v > 0 ? `+${v}` : String(v);
  syncDetune();
});
bindRange("rec-vol", (v) => player.output.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.01));
bindRange("tone-vol", (v) => {
  tones.volume.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.01);
  $("tone-vol-val").textContent = `${v}%`;
});

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
  if (unlocked) loadInstrument(tones.current);
});

$<HTMLInputElement>("sustain").addEventListener("change", (e) => {
  tones.sustain = (e.target as HTMLInputElement).checked;
});

/** Notes and chords sound while the mouse button is held (see Tones.sustain). */
function releaseOnPointerUp(held: HeldNotes): void {
  const up = () => {
    held.release();
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

// ---------- note pad: plain grid (default) or piano ----------
function playNote(midi: number): void {
  releaseOnPointerUp(tones.start([midi]));
  flashNotes([midi]);
}
const noteGrid = new NoteGrid($("note-grid"), playNote);
const piano = new Piano($("piano"), playNote);
function flashNotes(midis: number[], ms?: number): void {
  noteGrid.flash(midis, ms);
  piano.flash(midis, ms);
}

const PAD_KEY = "byear.noteView";
function setPadView(view: "grid" | "piano"): void {
  $("note-grid").hidden = view !== "grid";
  $("piano").hidden = view !== "piano";
  $("pad-toggle").textContent = view === "grid" ? "Piano view" : "Grid view";
  localStorage.setItem(PAD_KEY, view);
  if (view === "piano") requestAnimationFrame(() => piano.centerOn(60));
}
$("pad-toggle").addEventListener("click", () =>
  setPadView($("piano").hidden ? "piano" : "grid"),
);
setPadView(localStorage.getItem(PAD_KEY) === "piano" ? "piano" : "grid");

// ---------- chord buttons ----------
const chords: ParsedChord[] = [];

function voicing(c: ParsedChord): number[] {
  return isGuitar(tones.current) ? guitarVoicing(c) : pianoVoicing(c);
}
/** Starts a chord; it sounds until `release()` unless `duration` is given. */
function playChord(c: ParsedChord, duration?: number): HeldNotes {
  const notes = voicing(c);
  flashNotes(notes, 600);
  return tones.start(notes, { strum: strumEl.checked, duration });
}

function renderChords(): void {
  const root = $("chords");
  root.replaceChildren(
    ...chords.map((c, i) => {
      const btn = document.createElement("button");
      btn.className = "chord";
      btn.title = c.symbol;
      const idx = document.createElement("span");
      idx.className = "idx";
      idx.textContent = i < 9 ? String(i + 1) : "";
      const del = document.createElement("span");
      del.className = "del";
      del.textContent = "×";
      del.title = "Remove";
      del.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        chords.splice(i, 1);
        renderChords();
      });
      btn.append(idx, c.symbol, del);
      btn.addEventListener("pointerdown", (e) => {
        if (e.target === del) return;
        releaseOnPointerUp(playChord(c));
      });
      return btn;
    }),
  );
}

$<HTMLFormElement>("chord-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("chord-input");
  const err = $("chord-error");
  const parsed = parseChord(input.value);
  if (!parsed) {
    err.textContent = input.value.trim() ? `Unknown chord: ${input.value.trim()}` : "";
    return;
  }
  err.textContent = "";
  chords.push(parsed);
  input.value = "";
  renderChords();
  playChord(parsed, 2); // preview
});

// ---------- keyboard shortcuts ----------
// Don't leave buttons focused, or Space would also "click" them.
document.addEventListener("click", (e) => (e.target as HTMLElement).closest("button")?.blur());

window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "SELECT") return;
  if (tag === "INPUT" && (e.target as HTMLInputElement).type !== "range") {
    if (e.key === "Escape") (e.target as HTMLElement).blur();
    return;
  }
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && (e.shiftKey || e.ctrlKey) && !e.altKey) {
    e.preventDefault();
    nudgeLoop(e.shiftKey ? "a" : "b", e.key === "ArrowLeft" ? -NUDGE : NUDGE);
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key) {
    case " ":
      e.preventDefault();
      togglePlay();
      break;
    case "Escape":
      player.stop();
      refreshPlayButton();
      break;
    case "[":
      setA();
      break;
    case "]":
      setB();
      break;
    case "l":
    case "L":
      toggleLoop();
      break;
    case "Enter":
      player.seekToLoopStart();
      break;
    case "ArrowLeft":
      e.preventDefault();
      player.seek(player.currentTime - 2);
      break;
    case "ArrowRight":
      e.preventDefault();
      player.seek(player.currentTime + 2);
      break;
    default:
      if (/^[1-9]$/.test(e.key) && !e.repeat && !heldKeys.has(e.key)) {
        const c = chords[Number(e.key) - 1];
        if (c) heldKeys.set(e.key, playChord(c));
      }
  }
});

// Chord keys sound while held.
const heldKeys = new Map<string, HeldNotes>();
window.addEventListener("keyup", (e) => {
  heldKeys.get(e.key)?.release();
  heldKeys.delete(e.key);
});
window.addEventListener("blur", () => {
  for (const held of heldKeys.values()) held.release();
  heldKeys.clear();
});
