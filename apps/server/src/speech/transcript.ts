import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  matchSpeaker,
  type Enrolment,
  type SpeakerEmbedder,
  type SpeakerMatchOptions,
} from './speakers';
import type { SpeechToText } from './stt';
import { VoiceChunker, type VadOptions, DEFAULT_VAD } from './vad';

// MC.5 (DESIGN §11): the GM-only transcript, one JSON line per utterance in
// `<dir>/session-<NN>.jsonl` (the campaign's transcripts folder). Only text
// is written; audio is never saved.

export interface TranscriptLine {
  /** Wall-clock time the utterance began (ISO). */
  readonly at: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  /** Speaker label (MC.6): the enrolled character's name, only on a confident voice match. */
  readonly speaker?: string;
  readonly speakerId?: string;
}

export const transcriptFile = (dir: string, session: number) =>
  path.join(dir, `session-${String(session).padStart(2, '0')}.jsonl`);

export interface ListenerOptions {
  readonly dir: string;
  readonly session: number;
  readonly stt: SpeechToText;
  /** Wall clock (injectable). */
  readonly now: () => number;
  readonly vad?: VadOptions;
  readonly onLine?: (line: TranscriptLine) => void;
  /** Speaker labels (MC.6); without it lines carry no speaker. */
  readonly speakers?: {
    readonly embedder: SpeakerEmbedder;
    /** Read per line, so an enrolment made or deleted mid-session applies at once. */
    readonly enrolments: () => readonly Enrolment[];
    readonly match?: SpeakerMatchOptions;
  };
  readonly onError?: (err: unknown) => void;
}

/**
 * One listening stretch: PCM chunks in, transcript lines out (to the file
 * and `onLine`). Segments are transcribed one at a time, in order.
 */
export class Listener {
  private readonly chunker: VoiceChunker;
  private readonly startedAt: number;
  private queue: Promise<void> = Promise.resolve();
  readonly lines: TranscriptLine[] = [];

  constructor(private readonly options: ListenerOptions) {
    this.chunker = new VoiceChunker(options.vad ?? DEFAULT_VAD);
    this.startedAt = options.now();
  }

  private get sampleRate(): number {
    return (this.options.vad ?? DEFAULT_VAD).sampleRate;
  }

  push(samples: Float32Array): Promise<void> {
    for (const seg of this.chunker.push(samples)) this.enqueue(seg);
    return this.queue;
  }

  /** Ends listening: the open segment is transcribed; resolves when all are written. */
  stop(): Promise<void> {
    for (const seg of this.chunker.flush()) this.enqueue(seg);
    return this.queue;
  }

  /** The confident speaker of a segment, or null; a failed embedding only loses the label. */
  private async label(samples: Float32Array) {
    const speakers = this.options.speakers;
    if (speakers === undefined) return null;
    const enrolments = speakers.enrolments();
    if (enrolments.length === 0) return null;
    try {
      const embedding = await speakers.embedder.embed(samples, this.sampleRate);
      return embedding === null ? null : matchSpeaker(embedding, enrolments, speakers.match);
    } catch (err) {
      this.options.onError?.(err);
      return null;
    }
  }

  private enqueue(seg: { startMs: number; endMs: number; samples: Float32Array }): void {
    this.queue = this.queue.then(async () => {
      let text: string;
      try {
        text = (await this.options.stt.transcribe(seg.samples, this.sampleRate)).trim();
      } catch (err) {
        // One bad segment must not stop the rest of the transcript.
        this.options.onError?.(err);
        return;
      }
      if (text === '') return;
      const speaker = await this.label(seg.samples);
      const line: TranscriptLine = {
        at: new Date(this.startedAt + seg.startMs).toISOString(),
        startMs: seg.startMs,
        endMs: seg.endMs,
        text,
        ...(speaker === null ? {} : { speaker: speaker.name, speakerId: speaker.characterId }),
      };
      // The line still shows in the GM's panel when the disk write fails
      // (disk full, folder locked); the queue carries on (MC.5 review).
      try {
        mkdirSync(this.options.dir, { recursive: true });
        appendFileSync(
          transcriptFile(this.options.dir, this.options.session),
          JSON.stringify(line) + '\n',
        );
      } catch (err) {
        this.options.onError?.(err);
      }
      this.lines.push(line);
      this.options.onLine?.(line);
    });
  }
}
