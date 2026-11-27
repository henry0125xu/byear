import { describe, expect, it } from "vitest";
import { DEFAULT_BASE, keyLabels, noteForCode, PLAY_KEYS, rangeName, shiftBase } from "./keyboard";

const notes = (codes: string[], base = 48) => codes.map((c) => noteForCode(c, base));

describe("layout (Decision #12, tracker style)", () => {
  it("lower row: white keys Z..., black keys on the A row", () => {
    expect(notes(["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"])).toEqual([
      48, 50, 52, 53, 55, 57, 59, 60, 62, 64,
    ]);
    expect(notes(["KeyS", "KeyD", "KeyG", "KeyH", "KeyJ", "KeyL", "Semicolon"])).toEqual([49, 51, 54, 56, 58, 61, 63]);
  });

  it("upper row: an octave higher, black keys on the digit row", () => {
    expect(notes(["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"])).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72, 74, 76,
    ]);
    expect(notes(["Digit2", "Digit3", "Digit5", "Digit6", "Digit7", "Digit9", "Digit0"])).toEqual([
      61, 63, 66, 68, 70, 73, 75,
    ]);
  });

  it("each row covers every semitone C..E without gaps; the rows overlap on C4–E4", () => {
    const lower = PLAY_KEYS.slice(0, 17).map((k) => k.offset);
    const upper = PLAY_KEYS.slice(17).map((k) => k.offset);
    expect(lower).toEqual([...Array(17).keys()]);
    expect(upper).toEqual([...Array(17).keys()].map((i) => i + 12));
    expect(new Set(PLAY_KEYS.map((k) => k.code)).size).toBe(PLAY_KEYS.length);
  });

  it("leaves chord digits 1, 4, 8, transport and octave keys alone", () => {
    for (const code of ["Digit1", "Digit4", "Digit8", "Space", "BracketLeft", "BracketRight", "Minus", "Equal", "KeyA", "KeyF", "KeyK"]) {
      expect(noteForCode(code, 48)).toBeNull();
    }
  });

  it("starts at C3 and spans to E5", () => {
    expect(DEFAULT_BASE).toBe(48);
    expect(rangeName(DEFAULT_BASE)).toBe("C3–E5");
  });
});

describe("octave shift", () => {
  it("moves by octaves", () => {
    expect(shiftBase(48, 1)).toBe(60);
    expect(shiftBase(48, -2)).toBe(24);
  });

  it("stops at C1 and C6", () => {
    expect(shiftBase(24, -1)).toBe(24);
    expect(shiftBase(84, 1)).toBe(84);
  });

  it("drops notes above C8 at the top base", () => {
    expect(noteForCode("KeyI", 84)).toBe(108); // C8
    expect(noteForCode("KeyO", 84)).toBeNull();
    expect(rangeName(84)).toBe("C6–C8");
  });
});

describe("keyLabels", () => {
  it("labels each reachable note; the overlap shows both keys", () => {
    const labels = keyLabels(48);
    expect(labels.get(48)).toBe("Z");
    expect(labels.get(49)).toBe("S");
    expect(labels.get(60)).toBe("Q ,");
    expect(labels.get(64)).toBe("E /");
    expect(labels.get(76)).toBe("P");
    expect(labels.size).toBe(29); // C3..E5
  });
});
