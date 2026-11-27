import { Midi } from "tonal";
import {
  buildChord,
  EXTENSIONS,
  maxInversion,
  nameNotes,
  SEVENTHS,
  TRIADS,
  type ChordSpec,
  type ExtensionId,
  type SeventhId,
  type TriadId,
} from "../music/builder";
import type { ChordPanel } from "./chordPanel";
import { $ } from "./dom";
import type { NotePad } from "./notePad";

const ROOTS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
const OCTAVES = [2, 3, 4, 5];
const OPEN_KEY = "byear.builderOpen";

function fill(select: HTMLSelectElement, options: [value: string, label: string][], value: string): void {
  select.replaceChildren(...options.map(([v, l]) => new Option(l, v)));
  select.value = value;
}

/**
 * Chord builder (Decision #15), under the chord form:
 * - structured: root, quality, seventh, tensions, inversion, octave → exact voicing;
 * - manual: pick notes on the note pad (or play them in keyboard mode).
 * Both add a chord button with a fixed voicing.
 */
export function setupBuilder(chords: ChordPanel, pad: NotePad): void {
  const panel = $("builder");
  const toggle = $("builder-toggle");
  function setOpen(open: boolean): void {
    panel.hidden = !open;
    toggle.classList.toggle("on", open);
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    if (!open) setPicking(false);
  }
  toggle.addEventListener("click", () => setOpen(!!panel.hidden));

  // ---- structured ----
  const rootEl = $<HTMLSelectElement>("b-root");
  const triadEl = $<HTMLSelectElement>("b-triad");
  const seventhEl = $<HTMLSelectElement>("b-seventh");
  const invEl = $<HTMLSelectElement>("b-inv");
  const octEl = $<HTMLSelectElement>("b-oct");
  const extBox = $("b-ext");
  const labelEl = $("b-label");
  fill(rootEl, ROOTS.map((r) => [r, r]), "C");
  fill(triadEl, Object.entries(TRIADS).map(([id, t]) => [id, t.label]), "maj");
  fill(seventhEl, Object.entries(SEVENTHS).map(([id, s]) => [id, s.label]), "none");
  fill(octEl, OCTAVES.map((o) => [String(o), String(o)]), "3");
  const extInputs = new Map<ExtensionId, HTMLInputElement>();
  extBox.replaceChildren(
    ...EXTENSIONS.map((ext) => {
      const label = document.createElement("label");
      label.className = "inline small";
      const input = document.createElement("input");
      input.type = "checkbox";
      extInputs.set(ext, input);
      label.append(input, ext);
      return label;
    }),
  );

  function spec(): ChordSpec {
    return {
      root: rootEl.value,
      triad: triadEl.value as TriadId,
      seventh: seventhEl.value as SeventhId,
      extensions: EXTENSIONS.filter((e) => extInputs.get(e)!.checked),
      inversion: Number(invEl.value),
      octave: Number(octEl.value),
    };
  }

  function refresh(): void {
    // A power chord has no third to extend; keep the controls honest.
    const power = triadEl.value === "power";
    seventhEl.disabled = power;
    if (power) seventhEl.value = "none";
    for (const input of extInputs.values()) {
      input.disabled = power;
      if (power) input.checked = false;
    }
    const s = spec();
    const max = maxInversion(s);
    const inv = Math.min(Number(invEl.value) || 0, max);
    const names = ["root", "1st", "2nd", "3rd"];
    fill(invEl, Array.from({ length: max + 1 }, (_, i) => [String(i), names[i] ?? `${i}th`]), String(inv));
    const built = buildChord({ ...s, inversion: inv });
    labelEl.textContent = built.label;
    labelEl.title = built.voicing.map((m) => Midi.midiToNoteName(m, { sharps: true })).join(" ");
  }
  for (const el of [rootEl, triadEl, seventhEl, invEl, octEl, ...extInputs.values()]) el.addEventListener("change", refresh);
  refresh();

  $("b-listen").addEventListener("click", () => chords.preview(buildChord(spec()).voicing));
  $("b-add").addEventListener("click", () => {
    const { label, voicing } = buildChord(spec());
    chords.add({ symbol: label, voicing });
  });

  // ---- manual: pick notes ----
  const pickEl = $<HTMLInputElement>("p-on");
  const notesEl = $("p-notes");
  const nameEl = $<HTMLInputElement>("p-name");
  const picked = new Set<number>();

  function refreshPicked(): void {
    pad.setPicked(picked);
    const sorted = [...picked].sort((a, b) => a - b);
    notesEl.textContent = sorted.length
      ? sorted.map((m) => Midi.midiToNoteName(m, { sharps: true })).join(" ")
      : pickEl.checked
        ? "Click notes (or play them in keyboard mode)"
        : "";
    nameEl.placeholder = nameNotes(sorted) || "Name";
  }
  function setPicking(on: boolean): void {
    pickEl.checked = on;
    if (!on) picked.clear();
    pad.setPicker(
      on
        ? (midi) => {
            // Playing a picked note again un-picks it.
            if (!picked.delete(midi)) picked.add(midi);
            refreshPicked();
          }
        : null,
    );
    refreshPicked();
  }
  pickEl.addEventListener("change", () => setPicking(pickEl.checked));

  function addPicked(): void {
    if (!picked.size) return;
    const voicing = [...picked].sort((a, b) => a - b);
    chords.add({ symbol: nameEl.value.trim() || nameNotes(voicing), voicing });
    nameEl.value = "";
    picked.clear();
    refreshPicked();
  }
  $("p-listen").addEventListener("click", () => {
    if (picked.size) chords.preview([...picked].sort((a, b) => a - b));
  });
  $("p-add").addEventListener("click", addPicked);
  nameEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPicked();
  });
  $("p-clear").addEventListener("click", () => {
    picked.clear();
    refreshPicked();
  });

  setOpen(localStorage.getItem(OPEN_KEY) === "1");
}
