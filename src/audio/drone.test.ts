import { describe, expect, it } from "vitest";
import { droneNotes, droneTonicMidi } from "./drone";

describe("droneTonicMidi", () => {
  it("puts the tonic in octave 3", () => {
    expect(droneTonicMidi("C")).toBe(48);
    expect(droneTonicMidi("A")).toBe(57);
    expect(droneTonicMidi("B")).toBe(59);
  });

  it("treats sharps and flats alike", () => {
    expect(droneTonicMidi("Bb")).toBe(58);
    expect(droneTonicMidi("A#")).toBe(58);
    expect(droneTonicMidi("Db")).toBe(droneTonicMidi("C#"));
  });

  it("rejects non-notes", () => {
    expect(droneTonicMidi("H")).toBeNull();
    expect(droneTonicMidi("")).toBeNull();
  });
});

describe("droneNotes", () => {
  it("tonic alone, or with the fifth above", () => {
    expect(droneNotes("D", false)).toEqual([50]);
    expect(droneNotes("D", true)).toEqual([50, 57]);
  });

  it("nothing for an invalid tonic", () => {
    expect(droneNotes("X", true)).toEqual([]);
  });
});
