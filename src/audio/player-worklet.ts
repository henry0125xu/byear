// AudioWorklet side of Player: runs PlaybackEngine on the audio thread.
import type { RubberBandInterface } from "rubberband-wasm";
import { PlaybackEngine } from "./engine";
import { PROCESSOR_NAME, type FromWorklet, type ToWorklet } from "./protocol";
import { initRubberBand } from "./stretch";

// AudioWorkletGlobalScope (not in TypeScript's DOM lib).
declare const currentFrame: number;
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

/** Report the position every this many render quanta (8 × 128 frames ≈ 23 ms). */
const REPORT_EVERY = 8;

class PlayerProcessor extends AudioWorkletProcessor {
  private engine = new PlaybackEngine();
  private rb: RubberBandInterface | null = null;
  private quanta = 0;
  private reportNow = true;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => this.handle(e.data);
  }

  private send(msg: FromWorklet): void {
    this.port.postMessage(msg);
  }

  private handle(msg: ToWorklet): void {
    const en = this.engine;
    switch (msg.type) {
      case "load":
        en.load(msg.left, msg.right, msg.sampleRate);
        break;
      case "engine":
        void this.setEngine(msg);
        break;
      case "play":
        en.play();
        break;
      case "pause":
        en.pause();
        break;
      case "stop":
        en.stop();
        break;
      case "seek":
        en.seek(msg.time);
        break;
      case "seekToLoopStart":
        en.seekToLoopStart();
        break;
      case "loop":
        en.setLoop(msg.a, msg.b);
        break;
      case "loopOn":
        en.setLoopOn(msg.on);
        break;
      case "rate":
        en.setRate(msg.speed, msg.pitchScale);
        break;
      case "preRoll":
        en.setPreRoll(msg.seconds);
        break;
    }
    this.reportNow = true;
  }

  private async setEngine(msg: Extract<ToWorklet, { type: "engine" }>): Promise<void> {
    try {
      if (msg.wasm && !this.rb) this.rb = await initRubberBand(msg.wasm);
      this.engine.setEngine(msg.id, this.rb);
      this.send({ type: "engine", req: msg.req });
    } catch (err) {
      this.send({ type: "engine", req: msg.req, error: String(err) });
    }
    this.reportNow = true;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] ?? out[0];
    // Position of the first frame of this quantum, before rendering it.
    const pos = this.engine.heardTime;
    const stillPlaying = this.engine.render(l, r, l.length);
    if (!stillPlaying) this.send({ type: "ended" });
    if (this.reportNow || ++this.quanta >= REPORT_EVERY || !stillPlaying) {
      this.quanta = 0;
      this.reportNow = false;
      this.send({ type: "pos", pos, time: currentFrame / sampleRate });
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, PlayerProcessor);
