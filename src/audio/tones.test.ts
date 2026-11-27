import { describe, expect, it } from "vitest";
import { tanhCurve } from "./tones";

describe("tanhCurve (tone saturator)", () => {
  const curve = tanhCurve();
  const n = curve.length;
  const mid = (n - 1) / 2;
  /** Output for an input signal level, as the WaveShaper sees it after the 1/4 pre-gain. */
  const at = (input: number) => curve[Math.round(mid + (input / 4) * mid)];

  it("passes quiet signals at unity gain", () => {
    expect(at(0)).toBe(0);
    expect(at(0.1)).toBeCloseTo(0.1, 2);
    expect(at(-0.1)).toBeCloseTo(-0.1, 2);
  });

  it("is symmetric and keeps rising (so the volume slider always does something)", () => {
    for (let i = 1; i < n; i++) expect(curve[i]).toBeGreaterThan(curve[i - 1]);
    for (let i = 0; i < n; i++) expect(curve[i]).toBeCloseTo(-curve[n - 1 - i], 6);
    expect(at(2)).toBeGreaterThan(at(1));
    expect(at(3)).toBeGreaterThan(at(2));
  });

  it("never exceeds ±1, so it can't clip", () => {
    expect(Math.max(...curve)).toBeLessThanOrEqual(1);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-1);
  });
});
