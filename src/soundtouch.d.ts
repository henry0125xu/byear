declare module "soundtouchjs" {
  export interface SampleSource {
    extract(target: Float32Array, numFrames: number, position: number): number;
  }
  export class SoundTouch {
    tempo: number;
    rate: number;
    pitch: number;
    pitchSemitones: number;
    clear(): void;
    readonly inputBuffer: { frameCount: number };
    readonly outputBuffer: { frameCount: number };
  }
  export class SimpleFilter {
    constructor(source: SampleSource, pipe: SoundTouch, onEnd?: () => void);
    extract(target: Float32Array, numFrames: number): number;
    clear(): void;
    readonly inputBuffer: { frameCount: number };
    readonly outputBuffer: { frameCount: number };
    outputBufferPosition: number;
  }
}
