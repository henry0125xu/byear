import { describe, expect, it } from "vitest";
import { buildChord, maxInversion, nameNotes, type ChordSpec } from "./builder";

const spec = (s: Partial<ChordSpec>): ChordSpec => ({
  root: "C",
  triad: "maj",
  seventh: "none",
  extensions: [],
  inversion: 0,
  octave: 3,
  ...s,
});

describe("buildChord: names", () => {
  it.each([
    [{}, "C"],
    [{ triad: "m" }, "Cm"],
    [{ triad: "m", seventh: "7" }, "Cm7"],
    [{ seventh: "maj7" }, "Cmaj7"],
    [{ seventh: "7" }, "C7"],
    [{ seventh: "6" }, "C6"],
    [{ triad: "m", seventh: "maj7" }, "CmMaj7"],
    [{ triad: "dim", seventh: "7" }, "Cm7b5"],
    [{ triad: "dim", seventh: "dim7" }, "Cdim7"],
    [{ triad: "sus4", seventh: "7" }, "C7sus4"],
    [{ triad: "power" }, "C5"],
    [{ triad: "m", seventh: "7", extensions: ["9"] }, "Cm7(9)"],
    [{ seventh: "7", extensions: ["#11", "b9"] }, "C7(b9,#11)"],
    [{ extensions: ["9"] }, "C(add9)"],
    [{ triad: "sus2", seventh: "maj7" }, "Csus2(maj7)"],
    [{ root: "F#", triad: "m", seventh: "7" }, "F#m7"],
  ] as [Partial<ChordSpec>, string][])("%j → %s", (s, label) => {
    expect(buildChord(spec(s)).label).toBe(label);
  });

  it("adds the bass as a slash for inversions, spelled from the root", () => {
    expect(buildChord(spec({ inversion: 1 })).label).toBe("C/E");
    expect(buildChord(spec({ triad: "m", inversion: 1 })).label).toBe("Cm/Eb");
    expect(buildChord(spec({ seventh: "7", inversion: 3 })).label).toBe("C7/Bb");
  });
});

describe("buildChord: voicing", () => {
  it("root position, close, root in the chosen octave", () => {
    expect(buildChord(spec({})).voicing).toEqual([48, 52, 55]); // C3 E3 G3
    expect(buildChord(spec({ octave: 4 })).voicing).toEqual([60, 64, 67]);
    expect(buildChord(spec({ root: "A", triad: "m", seventh: "7" })).voicing).toEqual([57, 60, 64, 67]);
  });

  it("inversions move the lowest chord tones up an octave", () => {
    expect(buildChord(spec({ inversion: 1 })).voicing).toEqual([52, 55, 60]); // E G C
    expect(buildChord(spec({ inversion: 2 })).voicing).toEqual([55, 60, 64]); // G C E
    expect(buildChord(spec({ seventh: "7", inversion: 3 })).voicing).toEqual([58, 60, 64, 67]); // Bb C E G
  });

  it("extensions sit above the chord tones", () => {
    expect(buildChord(spec({ seventh: "7", extensions: ["9"] })).voicing).toEqual([48, 52, 55, 58, 62]);
    // After a 2nd inversion the top tone is E4 (64), so the 9th (D) goes to D5.
    const v = buildChord(spec({ extensions: ["9"], inversion: 2 })).voicing;
    expect(v).toEqual([55, 60, 64, 74]);
  });

  it("clamps the inversion to what the chord has", () => {
    expect(maxInversion({ triad: "maj", seventh: "none" })).toBe(2);
    expect(maxInversion({ triad: "maj", seventh: "7" })).toBe(3);
    expect(maxInversion({ triad: "power", seventh: "none" })).toBe(1);
    expect(buildChord(spec({ inversion: 9 })).voicing).toEqual(buildChord(spec({ inversion: 2 })).voicing);
  });

  it("is always sorted with no duplicates", () => {
    const v = buildChord(spec({ triad: "sus4", seventh: "7", extensions: ["9", "13", "b9"], inversion: 2 })).voicing;
    expect([...v].sort((a, b) => a - b)).toEqual(v);
    expect(new Set(v).size).toBe(v.length);
  });
});

describe("nameNotes (manual builder)", () => {
  it("names common chords, lowest note as bass", () => {
    expect(nameNotes([48, 52, 55])).toBe("C");
    expect(nameNotes([52, 55, 60])).toBe("C/E");
    expect(nameNotes([57, 60, 64, 67])).toBe("Am7");
    expect(nameNotes([48, 52, 55, 59])).toBe("Cmaj7");
  });

  it("ignores order and doubled notes", () => {
    expect(nameNotes([55, 48, 64, 52, 60])).toBe("C");
  });

  it("falls back to note names for clusters", () => {
    expect(nameNotes([60, 61, 62])).toBe("C4 C#4 D4");
  });

  it("empty for no notes", () => {
    expect(nameNotes([])).toBe("");
  });
});
