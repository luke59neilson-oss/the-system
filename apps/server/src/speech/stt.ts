// MC.5 (DESIGN §11): speech-to-text runs on the GM laptop. The live engine
// (sherpa-onnx, D235) sits behind this interface; tests and the build use the
// fixture fake, so no run downloads a model or calls a paid service.

export interface SpeechToText {
  /** Text for one speech segment (mono float PCM); '' when nothing was understood. */
  transcribe(samples: Float32Array, sampleRate: number): Promise<string>;
}

/** Answers each segment with the next scripted line, then ''. Records what it heard. */
export class FixtureSpeechToText implements SpeechToText {
  readonly heard: number[] = [];
  private next = 0;

  constructor(private readonly lines: readonly string[]) {}

  transcribe(samples: Float32Array, sampleRate: number): Promise<string> {
    this.heard.push(Math.round((samples.length / sampleRate) * 1000));
    const line = this.lines[this.next++] ?? '';
    return Promise.resolve(line);
  }
}
