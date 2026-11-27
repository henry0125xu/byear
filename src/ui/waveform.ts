const EDGE_GRAB_PX = 6;
const DRAG_THRESHOLD_PX = 4;

export interface WaveformCallbacks {
  onSeek(seconds: number): void;
  onLoopChange(a: number, b: number): void;
}

export interface WaveformState {
  duration: number;
  time: number;
  loop: { a: number; b: number; on: boolean };
}

/** Canvas waveform: click to seek, drag to select a loop, drag loop edges to adjust. */
export class Waveform {
  private ctx: CanvasRenderingContext2D;
  private peaks: Float32Array | null = null;
  private buffer: AudioBuffer | null = null;
  private state: WaveformState = { duration: 0, time: 0, loop: { a: 0, b: 0, on: false } };

  constructor(private canvas: HTMLCanvasElement, private cb: WaveformCallbacks) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bindPointer();
  }

  setBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
    this.computePeaks();
  }

  update(state: WaveformState): void {
    this.state = state;
    this.draw();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.computePeaks();
    this.draw();
  }

  private computePeaks(): void {
    if (!this.buffer) return;
    const w = this.canvas.width;
    const data = this.buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    const peaks = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let max = 0;
      const start = x * step;
      const end = Math.min(data.length, start + step);
      for (let i = start; i < end; i += 4) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
      peaks[x] = max;
    }
    this.peaks = peaks;
  }

  private xToTime(clientX: number): number {
    const r = this.canvas.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return f * this.state.duration;
  }

  private timeToCssX(t: number): number {
    const r = this.canvas.getBoundingClientRect();
    return this.state.duration ? (t / this.state.duration) * r.width : 0;
  }

  private bindPointer(): void {
    type Drag = { kind: "new"; anchor: number; startX: number; moved: boolean } | { kind: "edge"; fixed: number };
    let drag: Drag | null = null;

    this.canvas.addEventListener("pointerdown", (e) => {
      if (!this.state.duration) return;
      this.canvas.setPointerCapture(e.pointerId);
      const x = e.clientX - this.canvas.getBoundingClientRect().left;
      const { a, b, on } = this.state.loop;
      if (on && Math.abs(x - this.timeToCssX(a)) <= EDGE_GRAB_PX) drag = { kind: "edge", fixed: b };
      else if (on && Math.abs(x - this.timeToCssX(b)) <= EDGE_GRAB_PX) drag = { kind: "edge", fixed: a };
      else drag = { kind: "new", anchor: this.xToTime(e.clientX), startX: e.clientX, moved: false };
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (!drag) {
        this.updateCursor(e.clientX);
        return;
      }
      const t = this.xToTime(e.clientX);
      if (drag.kind === "edge") this.cb.onLoopChange(drag.fixed, t);
      else {
        if (Math.abs(e.clientX - drag.startX) > DRAG_THRESHOLD_PX) drag.moved = true;
        if (drag.moved) this.cb.onLoopChange(drag.anchor, t);
      }
    });

    this.canvas.addEventListener("pointerup", (e) => {
      if (drag?.kind === "new" && !drag.moved) this.cb.onSeek(this.xToTime(e.clientX));
      drag = null;
    });
  }

  private updateCursor(clientX: number): void {
    const x = clientX - this.canvas.getBoundingClientRect().left;
    const { a, b, on } = this.state.loop;
    const nearEdge = on && (Math.abs(x - this.timeToCssX(a)) <= EDGE_GRAB_PX || Math.abs(x - this.timeToCssX(b)) <= EDGE_GRAB_PX);
    this.canvas.style.cursor = nearEdge ? "ew-resize" : "crosshair";
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const css = getComputedStyle(canvas);
    ctx.clearRect(0, 0, w, h);

    const { duration, time, loop } = this.state;
    const tx = (t: number) => (duration ? (t / duration) * w : 0);

    if (loop.on && loop.b > loop.a) {
      ctx.fillStyle = css.getPropertyValue("--loop-fill");
      ctx.fillRect(tx(loop.a), 0, tx(loop.b) - tx(loop.a), h);
      ctx.fillStyle = css.getPropertyValue("--loop-edge");
      ctx.fillRect(tx(loop.a) - 1, 0, 2, h);
      ctx.fillRect(tx(loop.b) - 1, 0, 2, h);
    }

    if (this.peaks) {
      ctx.fillStyle = css.getPropertyValue("--wave");
      const mid = h / 2;
      for (let x = 0; x < this.peaks.length; x++) {
        const ph = Math.max(1, this.peaks[x] * mid * 0.95);
        ctx.fillRect(x, mid - ph, 1, ph * 2);
      }
    }

    if (duration) {
      ctx.fillStyle = css.getPropertyValue("--playhead");
      ctx.fillRect(Math.round(tx(time)) - 1, 0, 2, h);
    }
  }
}
