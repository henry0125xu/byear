import type { Player } from "../audio/player";
import { workspaceChanged } from "./changes";
import { $, fmt } from "./dom";
import { Waveform } from "./waveform";

/** Seconds per Shift/Ctrl + arrow. */
export const NUDGE = 0.05;

export interface Transport {
  setBuffer(buffer: AudioBuffer): void;
  togglePlay(): void;
  stop(): void;
  setA(): void;
  setB(): void;
  toggleLoop(): void;
  /** Moves one loop edge. Moving A replays from A; moving B replays its last second. */
  nudgeLoop(edge: "a" | "b", delta: number): void;
  jumpToLoopStart(): void;
  seekBy(seconds: number): void;
  /** Redraws the play and loop buttons from the player's state. */
  refresh(): void;
  /** Sets the loop without notifying (restoring a workspace). */
  applyLoop(loop: { a: number; b: number; on: boolean }): void;
}

/** Waveform, transport buttons, A/B loop, pre-roll and the playhead render loop. */
export function setupTransport(player: Player): Transport {
  const waveform = new Waveform($<HTMLCanvasElement>("wave"), {
    onSeek: (t) => player.seek(t),
    onLoopChange: (a, b) => {
      player.setLoop(a, b);
      player.setLoopOn(true);
      refreshLoop();
      workspaceChanged();
    },
  });

  function refreshPlay(): void {
    $("play").textContent = player.playing ? "❚❚" : "▶";
  }
  function refreshLoop(): void {
    const { a, b, on } = player.loop;
    $("loop").classList.toggle("on", on);
    $("loop-info").textContent = on ? `${fmt(a, 2)} → ${fmt(b, 2)}` : "";
  }
  player.onEnded = refreshPlay;

  const t: Transport = {
    setBuffer(buffer) {
      waveform.setBuffer(buffer);
      t.refresh();
    },
    togglePlay() {
      if (player.playing) player.pause();
      else player.play();
      refreshPlay();
    },
    stop() {
      player.stop();
      refreshPlay();
    },
    setA() {
      const { b } = player.loop;
      const now = player.currentTime;
      player.setLoop(now, b > now ? b : player.duration);
      player.setLoopOn(true);
      refreshLoop();
      workspaceChanged();
    },
    setB() {
      const { a } = player.loop;
      const now = player.currentTime;
      player.setLoop(a < now ? a : 0, now);
      player.setLoopOn(true);
      refreshLoop();
      workspaceChanged();
    },
    toggleLoop() {
      player.setLoopOn(!player.loop.on);
      refreshLoop();
      workspaceChanged();
    },
    nudgeLoop(edge, delta) {
      const { a, b, on } = player.loop;
      if (!on) return;
      const na = edge === "a" ? Math.min(Math.max(0, a + delta), b - NUDGE) : a;
      const nb = edge === "b" ? Math.max(Math.min(player.duration, b + delta), a + NUDGE) : b;
      player.setLoop(na, nb);
      refreshLoop();
      workspaceChanged();
      if (!player.playing) return;
      if (edge === "a") player.seekToLoopStart();
      else player.seek(Math.max(na, nb - 1));
    },
    jumpToLoopStart() {
      player.seekToLoopStart();
    },
    seekBy(seconds) {
      player.seek(player.currentTime + seconds);
    },
    refresh() {
      refreshPlay();
      refreshLoop();
    },
    applyLoop({ a, b, on }) {
      player.setLoop(a, b);
      player.setLoopOn(on);
      refreshLoop();
    },
  };

  $("play").addEventListener("click", t.togglePlay);
  $("stop").addEventListener("click", t.stop);
  $("set-a").addEventListener("click", t.setA);
  $("set-b").addEventListener("click", t.setB);
  $("loop").addEventListener("click", t.toggleLoop);

  // Pre-roll (remembered).
  const PREROLL_KEY = "byear.preRoll";
  const prerollEl = $<HTMLSelectElement>("preroll");
  prerollEl.value = localStorage.getItem(PREROLL_KEY) ?? "0";
  if (!prerollEl.value) prerollEl.value = "0";
  player.preRoll = Number(prerollEl.value);
  prerollEl.addEventListener("change", () => {
    player.preRoll = Number(prerollEl.value);
    localStorage.setItem(PREROLL_KEY, prerollEl.value);
  });

  function frame(): void {
    const time = player.currentTime;
    waveform.update({ duration: player.duration, time, loop: player.loop });
    $("time").textContent = `${fmt(time)} / ${fmt(player.duration)}`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return t;
}
