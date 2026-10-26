import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// MC.6 (DESIGN §11 "Who said what"): each player may enrol a short voice
// sample on the GM laptop; a transcript line gets that character's name only
// when the match is confident. Only the voice embedding (a short vector of
// numbers) is kept, in the campaign folder's `speakers/speakers.json`, never
// the audio. GM-only: nothing here reaches players. The live extractor
// (sherpa-onnx speaker embeddings, D238) sits behind `SpeakerEmbedder`; tests
// use the fixture fake.

export interface SpeakerEmbedder {
  /** Voice embedding for one speech segment (mono float PCM); null when too short to tell. */
  embed(samples: Float32Array, sampleRate: number): Promise<number[] | null>;
}

/** Answers each segment with the next scripted vector, then null. */
export class FixtureSpeakerEmbedder implements SpeakerEmbedder {
  private next = 0;
  constructor(private readonly vectors: readonly (readonly number[])[]) {}
  embed(_samples: Float32Array, _sampleRate: number): Promise<number[] | null> {
    const v = this.vectors[this.next++];
    return Promise.resolve(v === undefined ? null : [...v]);
  }
}

export interface Enrolment {
  readonly characterId: string;
  /** Name shown on transcript lines (the character's name at enrolment). */
  readonly name: string;
  readonly embedding: readonly number[];
  readonly enrolledAt: string;
}

export interface SpeakerMatchOptions {
  /** Minimum cosine similarity to label a line. */
  readonly threshold: number;
  /** The best match must beat the runner-up by at least this much. */
  readonly margin: number;
}

/** Defaults; settings may override them (D238). */
export const DEFAULT_SPEAKER_MATCH: SpeakerMatchOptions = { threshold: 0.6, margin: 0.1 };

export const cosine = (a: readonly number[], b: readonly number[]): number => {
  if (a.length !== b.length) throw new Error(`embedding length ${a.length} ≠ ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
};

export interface SpeakerMatch {
  readonly characterId: string;
  readonly name: string;
  readonly score: number;
}

/**
 * The confidently closest enrolled voice, or null (unknown voice, or too close
 * to call). With a single enrolment there is no runner-up to beat, so the
 * score must clear the threshold by the margin too: an unknown voice (the GM,
 * a guest) stays unlabelled rather than taking the one enrolled name (D241).
 */
export const matchSpeaker = (
  embedding: readonly number[],
  enrolments: readonly Enrolment[],
  options: SpeakerMatchOptions = DEFAULT_SPEAKER_MATCH,
): SpeakerMatch | null => {
  const scored = enrolments
    .filter((e) => e.embedding.length === embedding.length)
    .map((e) => ({ e, score: cosine(embedding, e.embedding) }))
    .sort((x, y) => y.score - x.score);
  const best = scored[0];
  if (best === undefined || best.score < options.threshold) return null;
  const second = scored[1];
  const toBeat = second === undefined ? options.threshold : second.score;
  if (best.score - toBeat < options.margin) return null;
  return { characterId: best.e.characterId, name: best.e.name, score: best.score };
};

interface EnrolmentFile {
  readonly version: 1;
  readonly enrolments: Enrolment[];
}

const valid = (e: Enrolment) =>
  e.embedding.length > 0 && e.embedding.every((n) => Number.isFinite(n));

/** Enrolments for one campaign, in `<dir>/speakers.json`. */
export class EnrolmentStore {
  private readonly file: string;
  constructor(private readonly dir: string) {
    this.file = path.join(dir, 'speakers.json');
  }

  /**
   * The saved enrolments; none when the file does not exist yet. A file that
   * exists but cannot be read throws `EnrolmentFileError`, so a save never
   * overwrites the other players' voices with an empty list (D241).
   */
  list(): Enrolment[] {
    if (!existsSync(this.file)) return [];
    let data: Partial<EnrolmentFile> | null;
    try {
      data = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<EnrolmentFile> | null;
    } catch (err) {
      throw new EnrolmentFileError(this.file, err);
    }
    if (data === null || typeof data !== 'object' || !Array.isArray(data.enrolments)) {
      throw new EnrolmentFileError(this.file, new Error('no enrolments list'));
    }
    return data.enrolments.filter(valid);
  }

  /** Adds or replaces this character's enrolment. */
  save(enrolment: Enrolment): void {
    if (!valid(enrolment)) throw new Error('a voice sample needs a finite, non-empty embedding');
    const before = this.list();
    const rest = before.filter((e) => e.characterId !== enrolment.characterId);
    const all = [...rest, enrolment];
    const order = before.map((e) => e.characterId);
    all.sort((a, b) => rank(order, a.characterId) - rank(order, b.characterId));
    this.write(all);
  }

  /** Deletes this character's enrolment; false when there was none. */
  remove(characterId: string): boolean {
    const all = this.list();
    const rest = all.filter((e) => e.characterId !== characterId);
    if (rest.length === all.length) return false;
    this.write(rest);
    return true;
  }

  private write(enrolments: Enrolment[]): void {
    mkdirSync(this.dir, { recursive: true });
    const body: EnrolmentFile = { version: 1, enrolments };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n');
    renameSync(tmp, this.file);
  }
}

/** `speakers.json` exists but is damaged; it is left as it is for the GM to fix or move. */
export class EnrolmentFileError extends Error {
  constructor(
    readonly file: string,
    cause: unknown,
  ) {
    super(
      `The voice samples file is damaged (${path.basename(file)}); move it aside to start over`,
      {
        cause,
      },
    );
    this.name = 'EnrolmentFileError';
  }
}

/** Seconds of the sample whose level counts as speech (the listener's VAD frames and threshold). */
export function voicedSeconds(
  samples: Float32Array,
  sampleRate: number,
  frameMs: number,
  threshold: number,
): number {
  const frame = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  let voiced = 0;
  for (let at = 0; at + frame <= samples.length; at += frame) {
    let sum = 0;
    for (let i = at; i < at + frame; i++) sum += samples[i]! * samples[i]!;
    if (Math.sqrt(sum / frame) >= threshold) voiced += 1;
  }
  return (voiced * frame) / sampleRate;
}

const rank = (order: readonly string[], id: string) => {
  const i = order.indexOf(id);
  return i === -1 ? order.length : i;
};
