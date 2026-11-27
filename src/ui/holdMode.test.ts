import { describe, expect, it } from "vitest";
import { sameStrikeWindow, secondsToNextA } from "./holdMode";

const loop = { a: 10, b: 14, on: true };

describe("secondsToNextA", () => {
  it("inside the loop: time until B wraps back to A", () => {
    expect(secondsToNextA(12, loop, 1)).toBeCloseTo(2);
  });

  it("scales with speed (half speed takes twice as long)", () => {
    expect(secondsToNextA(12, loop, 0.5)).toBeCloseTo(4);
  });

  it("in the pre-roll before A: time until A", () => {
    expect(secondsToNextA(9, loop, 1)).toBeCloseTo(1);
    expect(secondsToNextA(9, loop, 0.5)).toBeCloseTo(2);
  });

  it("right at A (starting playback there) strikes now", () => {
    expect(secondsToNextA(10, loop, 1)).toBe(0);
    expect(secondsToNextA(10.02, loop, 1)).toBe(0);
    expect(secondsToNextA(10.1, loop, 1)).toBeCloseTo(3.9);
  });

  it("at or past B: wrapping now", () => {
    expect(secondsToNextA(14, loop, 1)).toBe(0);
  });

  it("no loop, a tiny loop or no speed: never", () => {
    expect(secondsToNextA(12, { ...loop, on: false }, 1)).toBeNull();
    expect(secondsToNextA(10, { a: 10, b: 10.01, on: true }, 1)).toBeNull();
    expect(secondsToNextA(12, loop, 0)).toBeNull();
  });
});

describe("sameStrikeWindow", () => {
  it("is 0.25 s for normal loops", () => {
    expect(sameStrikeWindow(loop, 1)).toBe(0.25);
  });

  it("shrinks for very short loops so each pass still strikes", () => {
    expect(sameStrikeWindow({ a: 0, b: 0.3 }, 1)).toBeCloseTo(0.15);
    expect(sameStrikeWindow({ a: 0, b: 0.3 }, 0.5)).toBe(0.25);
  });
});
