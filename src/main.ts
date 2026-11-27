import "./style.css";
import { Player } from "./audio/player";
import { Tones, type InstrumentId } from "./audio/tones";
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
  $("loop-info").textContent = on ? `${fmt(a)} → ${fmt(b)}` : "";
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

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
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

const instrumentEl = $<HTMLSelectElement>("instrument");
const strumEl = $<HTMLInputElement>("strum");
instrumentEl.addEventListener("change", () => {
  tones.current = instrumentEl.value as InstrumentId;
  strumEl.checked = tones.current === "guitar";
  loadInstrument(tones.current);
  renderChords();
});

// ---------- note pad: plain grid (default) or piano ----------
function playNote(midi: number): void {
  void tones.play([midi], { duration: 1.5 });
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
  return tones.current === "guitar" ? guitarVoicing(c) : pianoVoicing(c);
}
function playChord(c: ParsedChord): void {
  const notes = voicing(c);
  void tones.play(notes, { strum: strumEl.checked, duration: 2.5 });
  flashNotes(notes, 600);
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
        playChord(c);
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
  playChord(parsed);
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
      player.seek(player.loop.on ? player.loop.a : 0);
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
      if (/^[1-9]$/.test(e.key)) {
        const c = chords[Number(e.key) - 1];
        if (c) playChord(c);
      }
  }
});
