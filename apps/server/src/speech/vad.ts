// MC.5 (DESIGN §11 "Listening"): voice activity chunking. Pure and
// deterministic: mono float PCM in, speech segments out. A frame is speech
// when its RMS level is at or above the threshold; a segment opens after
// `minSpeechMs` of speech, closes after `hangoverMs` of silence (the quiet
// tail is trimmed), and is cut at `maxSegmentMs` so a long speech still
// reaches the transcript. Audio lives only in memory here and is dropped once
// a segment is handed on (no audio is ever written to disk).

export interface VadOptions {
  readonly sampleRate: number;
  readonly frameMs: number;
  /** RMS level (0–1) at or above which a frame counts as speech. */
  readonly threshold: number;
  readonly minSpeechMs: number;
  readonly hangoverMs: number;
  readonly maxSegmentMs: number;
}

export const DEFAULT_VAD: VadOptions = {
  sampleRate: 16_000,
  frameMs: 30,
  threshold: 0.01,
  minSpeechMs: 240,
  hangoverMs: 600,
  maxSegmentMs: 15_000,
};

export interface SpeechSegment {
  /** Offsets from the first sample pushed, in milliseconds. */
  readonly startMs: number;
  readonly endMs: number;
  readonly samples: Float32Array;
}

export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (const x of frame) sum += x * x;
  return Math.sqrt(sum / frame.length);
}

export class VoiceChunker {
  private readonly frameLen: number;
  private pending: number[] = [];
  private frames = 0;
  // The open run of frames: speech so far and the silence after it.
  private run: Float32Array[] = [];
  private runStart = 0;
  private speechFrames = 0;
  private silentFrames = 0;
  private open = false;

  constructor(private readonly options: VadOptions = DEFAULT_VAD) {
    if (options.sampleRate <= 0 || options.frameMs <= 0) throw new Error('Bad VAD options');
    this.frameLen = Math.max(1, Math.round((options.sampleRate * options.frameMs) / 1000));
  }

  private ms(frames: number): number {
    return frames * this.options.frameMs;
  }

  /** Feeds samples; returns the segments that closed. */
  push(samples: Float32Array): SpeechSegment[] {
    const out: SpeechSegment[] = [];
    for (const s of samples) this.pending.push(s);
    while (this.pending.length >= this.frameLen) {
      const frame = Float32Array.from(this.pending.splice(0, this.frameLen));
      const seg = this.frame(frame);
      if (seg) out.push(seg);
    }
    return out;
  }

  /** Closes any open segment (end of listening). The partial frame is dropped. */
  flush(): SpeechSegment[] {
    this.pending = [];
    const seg = this.open ? this.close() : null;
    this.reset();
    return seg ? [seg] : [];
  }

  private frame(frame: Float32Array): SpeechSegment | null {
    const index = this.frames++;
    const speech = rms(frame) >= this.options.threshold;
    if (!this.open && this.run.length === 0) {
      if (!speech) return null;
      this.runStart = index;
    }
    this.run.push(frame);
    if (speech) {
      this.speechFrames++;
      this.silentFrames = 0;
    } else {
      this.silentFrames++;
    }
    if (!this.open) {
      if (this.ms(this.speechFrames) >= this.options.minSpeechMs) this.open = true;
      else if (this.ms(this.silentFrames) >= this.options.hangoverMs) this.reset();
      return null;
    }
    if (this.ms(this.silentFrames) >= this.options.hangoverMs) {
      const seg = this.close();
      this.reset();
      return seg;
    }
    if (this.ms(this.run.length) >= this.options.maxSegmentMs) {
      const seg = this.close();
      this.reset();
      return seg;
    }
    return null;
  }

  private close(): SpeechSegment {
    const kept = this.run.slice(0, this.run.length - this.silentFrames);
    const samples = new Float32Array(kept.length * this.frameLen);
    kept.forEach((f, i) => samples.set(f, i * this.frameLen));
    return {
      startMs: this.ms(this.runStart),
      endMs: this.ms(this.runStart + kept.length),
      samples,
    };
  }

  private reset(): void {
    this.run = [];
    this.speechFrames = 0;
    this.silentFrames = 0;
    this.open = false;
  }
}
