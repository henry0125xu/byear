import { Midi } from "tonal";

const LOWEST = 21; // A0
const HIGHEST = 108; // C8
const BLACK = new Set([1, 3, 6, 8, 10]);

/** 88-key on-screen piano. Highlights keys I play (not pitch detection). */
export class Piano {
  private keys = new Map<number, HTMLElement>();

  constructor(private root: HTMLElement, onPlay: (midi: number) => void) {
    root.classList.add("piano");
    for (let m = LOWEST; m <= HIGHEST; m++) {
      const el = document.createElement("button");
      const black = BLACK.has(m % 12);
      el.className = black ? "key black" : "key white";
      el.dataset.midi = String(m);
      el.title = Midi.midiToNoteName(m, { sharps: true });
      if (m % 12 === 0) el.textContent = Midi.midiToNoteName(m, { sharps: true });
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onPlay(m);
      });
      root.appendChild(el);
      this.keys.set(m, el);
    }
  }

  /** Scroll so middle C is in view. */
  centerOn(midi = 60): void {
    const el = this.keys.get(midi);
    if (el) this.root.scrollLeft = el.offsetLeft - this.root.clientWidth / 2;
  }

  flash(midis: number[], ms = 400): void {
    for (const m of midis) {
      const el = this.keys.get(m);
      if (!el) continue;
      el.classList.add("active");
      setTimeout(() => el.classList.remove("active"), ms);
    }
  }
}
