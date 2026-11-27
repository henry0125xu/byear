/// <reference types="node" />
// Drives PlaybackEngine the way the AudioWorklet does (128-frame quanta) and
// checks what comes out against where the engine says we are.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { RubberBandInterface } from "rubberband-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { PlaybackEngine } from "./engine";
import { initRubberBand, type EngineId } from "./stretch";

const SR = 44100;
const Q = 128;
const CLICK_EVERY = 0.5; // seconds
const LENGTH = 8; // seconds

/** Silence with a short click every 0.5 s, so output frames can be traced back to file positions. */
const clicks = new Float32Array(SR * LENGTH);
for (let i = 0; i < clicks.length; i += SR * CLICK_EVERY) {
  for (let k = 0; k < 64; k++) clicks[i + k] = 0.9 * Math.sin((Math.PI * k) / 64);
}

let rb: RubberBandInterface;
beforeAll(async () => {
  const path = createRequire(import.meta.url).resolve("rubberband-wasm/dist/rubberband.wasm");
  const bytes = readFileSync(path);
  rb = await initRubberBand(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
});

function makeEngine(id: EngineId, speed: number): PlaybackEngine {
  const en = new PlaybackEngine();
  en.setEngine(id, id === "soundtouch" ? null : rb);
  en.load(clicks, clicks, SR);
  en.setRate(speed, Math.pow(2, 2 / 12)); // transposed +2 as well
  return en;
}

interface Heard {
  /** Where the engine said this click was (seconds in the file). */
  estimate: number;
}

/**
 * Renders `seconds` of output. For each click in the output, records the
 * position the engine reported for that frame. Also returns every per-quantum
 * position report.
 */
function render(en: PlaybackEngine, seconds: number, speed: number) {
  const l = new Float32Array(Q);
  const r = new Float32Array(Q);
  const heard: Heard[] = [];
  const positions: number[] = [];
  let armed = true;
  let ended = false;
  for (let q = 0; q < (seconds * SR) / Q && !ended; q++) {
    const pos = en.heardTime;
    positions.push(pos);
    ended = !en.render(l, r, Q);
    for (let i = 0; i < Q; i++) {
      const v = Math.abs(l[i]);
      if (armed && v > 0.3) {
        armed = false;
        heard.push({ estimate: pos + (i * speed) / SR });
      }
      if (v < 0.05) armed = true;
    }
  }
  return { heard, positions, ended };
}

/** Distance (ms) from an estimate to the nearest click in the file. */
const errorMs = (t: number) => Math.abs(t - Math.round(t / CLICK_EVERY) * CLICK_EVERY) * 1000;
const nearestClick = (t: number) => Math.round(t / CLICK_EVERY) * CLICK_EVERY;

// Measured on 2026-11-27: SoundTouch ≤ 54 ms, Rubber Band ≤ 16 ms, HQ ≤ 7 ms.
const TOLERANCE_MS: Record<EngineId, number> = { soundtouch: 80, rubberband: 25, "rubberband-hq": 12 };
const ENGINES: EngineId[] = ["soundtouch", "rubberband", "rubberband-hq"];

describe.each(ENGINES)("%s", (id) => {
  it.each([1, 0.5])("playhead matches the audio at speed %s", (speed) => {
    const en = makeEngine(id, speed);
    en.play();
    const { heard } = render(en, 4, speed);
    expect(heard.length).toBeGreaterThanOrEqual(3);
    for (const h of heard) expect(errorMs(h.estimate)).toBeLessThan(TOLERANCE_MS[id]);
  });

  it("a loop set while playing never plays past B, even on the first pass", () => {
    const speed = 1;
    const en = makeEngine(id, speed);
    en.seek(1.6);
    en.play();
    render(en, 0.35, speed); // heard ≈ 1.95 s; the read head is further ahead
    // B lands between what is heard and the read head: the buffered audio past B must be dropped.
    const b = en.heardTime + 0.01;
    en.setLoop(1.2, b);
    en.setLoopOn(true);
    const { heard, positions } = render(en, 3, speed);
    for (const p of positions) expect(p).toBeLessThanOrEqual(b + 0.005);
    const heardClicks = heard.map((h) => nearestClick(h.estimate));
    expect(heardClicks).not.toContain(2); // the click just past B
    expect(heardClicks).toContain(1.5); // it did wrap back
    for (const h of heard) expect(errorMs(h.estimate)).toBeLessThan(TOLERANCE_MS[id]);
  });

  it("pre-roll starts before A, but loop wraps go straight to A", () => {
    const speed = 0.5;
    const en = makeEngine(id, speed);
    en.setPreRoll(1);
    en.setLoop(2.25, 3.75);
    en.setLoopOn(true);
    en.seekToLoopStart();
    expect(en.heardTime).toBeCloseTo(1.25, 2);
    en.play();
    const { heard, positions } = render(en, 8, speed);
    const order = heard.map((h) => nearestClick(h.estimate));
    expect(order[0]).toBe(1.5); // pre-roll region is heard first
    // After the first wrap, nothing before A again.
    const wrap = positions.findIndex((p, i) => i > 0 && p < positions[i - 1] - 0.5);
    expect(wrap).toBeGreaterThan(0);
    for (const p of positions.slice(wrap)) {
      expect(p).toBeGreaterThanOrEqual(2.25 - 0.005);
      expect(p).toBeLessThanOrEqual(3.75 + 0.005);
    }
  });

  it("stops at the end of the file, and play() starts over", () => {
    const speed = 1;
    const en = makeEngine(id, speed);
    en.seek(LENGTH - 0.5);
    en.play();
    const { ended } = render(en, 2, speed);
    expect(ended).toBe(true);
    expect(en.playing).toBe(false);
    en.play();
    expect(en.playing).toBe(true);
    expect(en.heardTime).toBeLessThan(0.01);
  });

  it("stop() returns to A when looping, else to the start", () => {
    const en = makeEngine(id, 1);
    en.seek(3);
    en.play();
    render(en, 0.3, 1);
    en.stop();
    expect(en.heardTime).toBeCloseTo(0, 2);
    en.setLoop(2, 4);
    en.setLoopOn(true);
    en.stop();
    expect(en.heardTime).toBeCloseTo(2, 2);
  });
});

describe("switching engines", () => {
  it.each([
    ["soundtouch", "rubberband-hq"],
    ["rubberband-hq", "rubberband"],
    ["rubberband", "soundtouch"],
  ] as [EngineId, EngineId][])("%s → %s keeps the position", (from, to) => {
    const en = makeEngine(from, 1);
    en.seek(2);
    en.play();
    render(en, 1, 1);
    const before = en.heardTime;
    en.setEngine(to, rb);
    expect(en.heardTime).toBeCloseTo(before, 2);
    const { heard } = render(en, 1.5, 1);
    for (const h of heard) expect(errorMs(h.estimate)).toBeLessThan(TOLERANCE_MS[to]);
  });

  it("refuses Rubber Band before it is loaded", () => {
    const en = new PlaybackEngine();
    expect(() => en.setEngine("rubberband", null)).toThrow();
  });
});
