import { Interval, Note } from "tonal";
import { describe, expect, it } from "vitest";
import { guitarVoicing, parseChord, pianoVoicing, type ParsedChord } from "./chords";

/** Semitones above the root, so the tests don't depend on tonal's interval spelling. */
const semis = (c: ParsedChord) => c.intervals.map((iv) => Interval.semitones(iv));

function parsed(symbol: string): ParsedChord {
  const c = parseChord(symbol);
  if (!c) throw new Error(`expected ${symbol} to parse`);
  return c;
}

describe("parseChord: the symbols in Decision #4", () => {
  it.each([
    // triads
    ["C", [0, 4, 7]],
    ["Cm", [0, 3, 7]],
    ["Cdim", [0, 3, 6]],
    ["Caug", [0, 4, 8]],
    // sus, power chord, sixths
    ["Csus2", [0, 2, 7]],
    ["Csus4", [0, 5, 7]],
    ["C5", [0, 7]],
    ["C6", [0, 4, 7, 9]],
    ["C6/9", [0, 4, 7, 9, 14]],
    // sevenths
    ["C7", [0, 4, 7, 10]],
    ["Cmaj7", [0, 4, 7, 11]],
    ["Cm7", [0, 3, 7, 10]],
    ["Bm7b5", [0, 3, 6, 10]],
    ["Cdim7", [0, 3, 6, 9]],
    ["AmMaj7", [0, 3, 7, 11]],
    // extensions and added tones
    ["C9", [0, 4, 7, 10, 14]],
    ["C11", [0, 7, 10, 14, 17]],
    ["C13", [0, 4, 7, 10, 14, 21]],
    ["Cadd9", [0, 4, 7, 14]],
    ["Bbadd9", [0, 4, 7, 14]],
    // altered tensions
    ["C7b9", [0, 4, 7, 10, 13]],
    ["C7#9", [0, 4, 7, 10, 15]],
    ["C7#11", [0, 4, 7, 10, 18]],
    ["C7b13", [0, 4, 10, 20]], // tonal leaves out the 5th (it clashes with b13)
    ["C7b9b13", [0, 4, 7, 10, 13, 20]],
  ])("%s", (symbol, expected) => {
    expect(semis(parsed(symbol))).toEqual(expected);
  });

  it("parses add11", () => {
    const c = parsed("Cadd11");
    expect(semis(c)).toContain(17);
    expect(semis(c)).toEqual(expect.arrayContaining([0, 4, 7]));
  });

  it("keeps the root spelling as typed", () => {
    expect(parsed("F#maj7").root).toBe("F#");
    expect(parsed("Gbmaj7").root).toBe("Gb");
    expect(parsed("Bbadd9").root).toBe("Bb");
  });

  it("keeps the symbol as typed (trimmed)", () => {
    expect(parsed("  Am7 ").symbol).toBe("Am7");
  });
});

describe("parseChord: slash chords", () => {
  it("splits the bass off, intervals stay relative to the chord root", () => {
    const c = parsed("G/B");
    expect(c.root).toBe("G");
    expect(c.bass).toBe("B");
    expect(semis(c)).toEqual([0, 4, 7]);
  });

  it("handles a seventh chord over a non-chord-tone bass", () => {
    const c = parsed("Am7/D");
    expect(c.root).toBe("A");
    expect(c.bass).toBe("D");
    expect(semis(c)).toEqual([0, 3, 7, 10]);
  });

  it("does not treat 6/9 as a slash chord", () => {
    expect(parsed("C6/9").bass).toBeNull();
    expect(parsed("Am6/9").bass).toBeNull();
  });

  it("parses minor 6/9 (tonal only knows it as m69)", () => {
    expect(semis(parsed("Am6/9"))).toEqual([0, 3, 7, 9, 14]);
  });

  it("allows 6/9 with a slash bass", () => {
    const c = parsed("C6/9/E");
    expect(c.bass).toBe("E");
    expect(semis(c)).toEqual([0, 4, 7, 9, 14]);
  });

  it("plain chords have no bass", () => {
    expect(parsed("Am").bass).toBeNull();
  });
});

describe("parseChord: rejects anything else", () => {
  it.each(["", "   ", "H", "Cfoo", "C/H", "C/E4", "/E", "m7"])("%j", (symbol) => {
    expect(parseChord(symbol)).toBeNull();
  });
});

describe("pianoVoicing", () => {
  it("close position with the root in octave 3", () => {
    expect(pianoVoicing(parsed("C"))).toEqual([48, 52, 55]); // C3 E3 G3
    expect(pianoVoicing(parsed("Am7"))).toEqual([57, 60, 64, 67]); // A3 C4 E4 G4
    expect(pianoVoicing(parsed("B"))).toEqual([59, 63, 66]); // B3 D#4 F#4
  });

  it("puts a slash bass in octave 2", () => {
    expect(pianoVoicing(parsed("G/B"))).toEqual([47, 55, 59, 62]); // B2 | G3 B3 D4
  });
});

describe("guitarVoicing", () => {
  it("spreads like a guitar: bass, fifth, root, third", () => {
    expect(guitarVoicing(parsed("E"))).toEqual([40, 47, 52, 56]); // E2 B2 E3 G#3
    expect(guitarVoicing(parsed("C"))).toEqual([48, 55, 60, 64]); // C3 G3 C4 E4
  });

  it("uses the slash bass as the lowest note", () => {
    expect(guitarVoicing(parsed("G/B"))).toEqual([47, 50, 55, 59]); // B2 D3 G3 B3
  });

  const symbols = ["C", "Am", "F#m7b5", "Bbmaj7", "D7#9", "Eadd9", "G/B", "C6/9", "Am7/G", "E5", "C13", "Ab7b13"];

  it.each(symbols)("%s: bass in E2..D#3, strictly rising, at most 6 notes", (symbol) => {
    const v = guitarVoicing(parsed(symbol));
    expect(v[0]).toBeGreaterThanOrEqual(40);
    expect(v[0]).toBeLessThanOrEqual(51);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    expect(v.length).toBeLessThanOrEqual(6);
  });

  it.each(symbols)("%s: lowest note is the bass (or root)", (symbol) => {
    const c = parsed(symbol);
    expect(v0Chroma(guitarVoicing(c))).toBe(Note.chroma(c.bass ?? c.root));
  });

  it.each(symbols.filter((s) => parsed(s).intervals.length <= 5))(
    "%s: contains every chord tone",
    (symbol) => {
      const c = parsed(symbol);
      const want = new Set(c.intervals.map((iv) => Note.chroma(Note.transpose(c.root, iv))));
      const got = new Set(guitarVoicing(c).map((m) => m % 12));
      for (const pc of want) expect(got).toContain(pc);
    },
  );
});

function v0Chroma(v: number[]): number {
  return v[0] % 12;
}
