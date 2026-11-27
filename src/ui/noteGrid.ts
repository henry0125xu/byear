const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LOWEST = 21; // A0
const HIGHEST = 108; // C8
const MIN_OCT = 0;
const MAX_OCT = 8;
const VISIBLE_ROWS = 4;

/**
 * Low-key note picker: one row per octave, 12 plain boxes each.
 * Shows a window of octaves that can be shifted up and down.
 */
export class NoteGrid {
  private cells = new Map<number, HTMLElement>();
  private rows: HTMLElement[] = [];
  private low = 2; // lowest visible octave
  private rangeLabel: HTMLElement;

  constructor(root: HTMLElement, onPlay: (midi: number) => void) {
    root.classList.add("note-grid");

    const nav = document.createElement("div");
    nav.className = "grid-nav";
    const up = document.createElement("button");
    up.textContent = "▲";
    up.title = "Octaves up";
    const down = document.createElement("button");
    down.textContent = "▼";
    down.title = "Octaves down";
    this.rangeLabel = document.createElement("span");
    this.rangeLabel.className = "muted small mono";
    up.addEventListener("click", () => this.shift(1));
    down.addEventListener("click", () => this.shift(-1));
    nav.append(up, this.rangeLabel, down);

    const body = document.createElement("div");
    body.className = "grid-body";
    // Highest octave on top, like reading pitch upward.
    for (let oct = MAX_OCT; oct >= MIN_OCT; oct--) {
      const row = document.createElement("div");
      row.className = "grid-row";
      row.dataset.oct = String(oct);
      for (let pc = 0; pc < 12; pc++) {
        const midi = (oct + 1) * 12 + pc;
        const cell = document.createElement("button");
        cell.className = NAMES[pc].includes("#") ? "cell sharp" : "cell";
        if (midi < LOWEST || midi > HIGHEST) {
          cell.disabled = true;
          cell.classList.add("empty");
        } else {
          cell.textContent = `${NAMES[pc]}${oct}`;
          cell.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            onPlay(midi);
          });
          this.cells.set(midi, cell);
        }
        row.appendChild(cell);
      }
      this.rows.push(row);
      body.appendChild(row);
    }

    root.append(nav, body);
    this.render();
  }

  private shift(delta: number): void {
    this.low = Math.max(MIN_OCT, Math.min(MAX_OCT - VISIBLE_ROWS + 1, this.low + delta));
    this.render();
  }

  private render(): void {
    const high = this.low + VISIBLE_ROWS - 1;
    for (const row of this.rows) {
      const oct = Number(row.dataset.oct);
      row.hidden = oct < this.low || oct > high;
    }
    this.rangeLabel.textContent = `${this.low}–${high}`;
  }

  flash(midis: number[], ms = 400): void {
    for (const m of midis) {
      const el = this.cells.get(m);
      if (!el) continue;
      el.classList.add("active");
      setTimeout(() => el.classList.remove("active"), ms);
    }
  }
}
