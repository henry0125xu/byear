import type { EngineId } from "./stretch";

/** Main thread → player worklet. Times are seconds. */
export type ToWorklet =
  | { type: "load"; left: Float32Array; right: Float32Array; sampleRate: number }
  | { type: "engine"; req: number; id: EngineId; wasm?: ArrayBuffer }
  | { type: "play" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "seek"; time: number }
  | { type: "seekToLoopStart" }
  | { type: "loop"; a: number; b: number }
  | { type: "loopOn"; on: boolean }
  | { type: "rate"; speed: number; pitchScale: number }
  | { type: "preRoll"; seconds: number };

/** Player worklet → main thread. */
export type FromWorklet =
  /** `pos` is the file position of the audio rendered at context time `time`. */
  | { type: "pos"; pos: number; time: number }
  | { type: "ended" }
  | { type: "engine"; req: number; error?: string };

export const PROCESSOR_NAME = "byear-player";
