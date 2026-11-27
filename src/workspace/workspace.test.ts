import { describe, expect, it } from "vitest";
import {
  defaultWorkspace,
  exportFileName,
  parseWorkspace,
  parseWorkspaceJson,
  serializeWorkspace,
  workspaceKey,
  WORKSPACE_VERSION,
  type Workspace,
} from "./workspace";

const sample = (): Workspace => ({
  version: WORKSPACE_VERSION,
  file: { name: "Song.mp3", duration: 215.4 },
  loop: { a: 12.35, b: 20.1, on: true },
  speed: 0.6,
  semitones: -2,
  cents: 15,
  chords: [{ symbol: "Am7" }, { symbol: "G/B" }, { symbol: "C6/9" }],
  tonic: "A",
});

function parsed(data: unknown): Workspace {
  const r = parseWorkspace(data);
  if (!r.ok) throw new Error(r.error);
  return r.workspace;
}

describe("round trip", () => {
  it("serialize → parse gives the same workspace", () => {
    const ws = sample();
    const r = parseWorkspaceJson(serializeWorkspace(ws));
    expect(r).toEqual({ ok: true, workspace: ws });
  });

  it("defaults round-trip too", () => {
    const ws = defaultWorkspace("x.wav", 10);
    expect(parsed(JSON.parse(serializeWorkspace(ws)))).toEqual(ws);
  });
});

describe("rejects", () => {
  it.each([null, 42, "x", [], {}, { version: "1" }])("%j", (data) => {
    expect(parseWorkspace(data).ok).toBe(false);
  });

  it("bad JSON", () => {
    expect(parseWorkspaceJson("{nope")).toEqual({ ok: false, error: "Not valid JSON" });
  });

  it("a newer version", () => {
    const r = parseWorkspace({ ...sample(), version: WORKSPACE_VERSION + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer/);
  });
});

describe("repairs", () => {
  it("fills missing fields with defaults", () => {
    const ws = parsed({ version: 1, file: { name: "a.mp3", duration: 30 } });
    expect(ws).toEqual(defaultWorkspace("a.mp3", 30));
  });

  it("clamps speed, transpose and cents to the slider ranges", () => {
    const ws = parsed({ ...sample(), speed: 9, semitones: -40, cents: 77.6 });
    expect(ws.speed).toBe(1.25);
    expect(ws.semitones).toBe(-12);
    expect(ws.cents).toBe(50);
  });

  it("rounds transpose and cents to whole steps", () => {
    const ws = parsed({ ...sample(), semitones: 2.4, cents: -10.6 });
    expect(ws.semitones).toBe(2);
    expect(ws.cents).toBe(-11);
  });

  it("orders loop edges and keeps them inside the file", () => {
    const ws = parsed({ ...sample(), loop: { a: 300, b: 50, on: true } });
    expect(ws.loop).toEqual({ a: 50, b: 215.4, on: true });
  });

  it("ignores non-number values", () => {
    const ws = parsed({ ...sample(), speed: "fast", loop: { a: NaN, b: "x", on: "yes" } });
    expect(ws.speed).toBe(1);
    expect(ws.loop).toEqual({ a: 0, b: 215.4, on: false });
  });

  it("drops chords that don't parse, keeps order", () => {
    const ws = parsed({ ...sample(), chords: [{ symbol: "Am7" }, { symbol: "Hm" }, 3, { symbol: " Dsus4 " }] });
    expect(ws.chords).toEqual([{ symbol: "Am7" }, { symbol: "Dsus4" }]);
  });

  it("accepts only a pitch class as tonic", () => {
    expect(parsed({ ...sample(), tonic: "Bb" }).tonic).toBe("Bb");
    expect(parsed({ ...sample(), tonic: "F#" }).tonic).toBe("F#");
    expect(parsed({ ...sample(), tonic: "Am" }).tonic).toBeNull();
    expect(parsed({ ...sample(), tonic: 3 }).tonic).toBeNull();
  });
});

describe("file matching", () => {
  it("keys by name and length rounded to 0.1 s", () => {
    expect(workspaceKey("Song.mp3", 215.4321)).toBe(workspaceKey("Song.mp3", 215.4001));
    expect(workspaceKey("Song.mp3", 215.4)).not.toBe(workspaceKey("Song.mp3", 215.6));
    expect(workspaceKey("Song.mp3", 215.4)).not.toBe(workspaceKey("song.mp3", 215.4));
  });

  it("export name", () => {
    expect(exportFileName("My Song.mp3")).toBe("My Song.byear.json");
    expect(exportFileName("a.b.flac")).toBe("a.b.byear.json");
    expect(exportFileName("")).toBe("workspace.byear.json");
  });
});
