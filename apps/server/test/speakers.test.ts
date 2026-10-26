import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SPEAKER_MATCH,
  EnrolmentStore,
  FixtureSpeakerEmbedder,
  cosine,
  matchSpeaker,
  type Enrolment,
  type SpeakerEmbedder,
} from '../src/speech/speakers';
import { FixtureSpeechToText } from '../src/speech/stt';
import { Listener, transcriptFile } from '../src/speech/transcript';

// MC.6 (DESIGN §11 "Who said what"): voice enrolment and confident matching.
// Embeddings are short fixed vectors here; the live extractor sits behind
// the same interface.
const enrol = (characterId: string, name: string, embedding: number[]): Enrolment => ({
  characterId,
  name,
  embedding,
  enrolledAt: '2026-10-26T09:00:00.000Z',
});

describe('cosine similarity', () => {
  it('is 1 for the same direction, 0 for orthogonal, and safe for zero vectors', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it('refuses vectors of different lengths', () => {
    expect(() => cosine([1, 2], [1, 2, 3])).toThrow(/length/);
  });
});

describe('matching a voice (MC.6)', () => {
  const ana = enrol('c1', 'Ana', [1, 0, 0]);
  const bo = enrol('c2', 'Bo', [0, 1, 0]);

  it('labels the enrolled voice that is clearly closest', () => {
    expect(matchSpeaker([0.9, 0.1, 0], [ana, bo])).toEqual({
      characterId: 'c1',
      name: 'Ana',
      score: expect.closeTo(0.994, 2),
    });
    expect(matchSpeaker([0.05, 1, 0.1], [ana, bo])?.name).toBe('Bo');
  });

  it('leaves the line unlabelled below the threshold', () => {
    // An unknown voice: far from both.
    expect(matchSpeaker([0, 0, 1], [ana, bo])).toBeNull();
    expect(DEFAULT_SPEAKER_MATCH.threshold).toBeGreaterThan(0);
  });

  it('leaves the line unlabelled when two voices are too close to call', () => {
    expect(matchSpeaker([1, 1, 0], [ana, bo])).toBeNull();
  });

  it('with one enrolment, only the threshold applies', () => {
    expect(matchSpeaker([1, 0.2, 0], [ana])?.name).toBe('Ana');
    expect(matchSpeaker([0, 1, 0], [ana])).toBeNull();
  });

  it('labels nothing with no enrolments', () => {
    expect(matchSpeaker([1, 0, 0], [])).toBeNull();
  });

  it('takes the threshold and margin from options', () => {
    const v = [0.7, 0.7, 0.1];
    expect(matchSpeaker(v, [ana], { threshold: 0.95, margin: 0 })).toBeNull();
    expect(matchSpeaker(v, [ana], { threshold: 0.5, margin: 0 })?.name).toBe('Ana');
  });
});

describe('the fixture embedder', () => {
  it('answers each segment with the next scripted vector', async () => {
    const e = new FixtureSpeakerEmbedder([
      [1, 0],
      [0, 1],
    ]);
    expect(await e.embed(new Float32Array(16), 16000)).toEqual([1, 0]);
    expect(await e.embed(new Float32Array(16), 16000)).toEqual([0, 1]);
    expect(await e.embed(new Float32Array(16), 16000)).toBeNull();
  });
});

describe('enrolment store (GM-only, per campaign)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'speakers-'));
    dirs.push(d);
    return d;
  };

  it('saves, lists, replaces and deletes enrolments, keeping only embeddings', () => {
    const dir = tmp();
    const store = new EnrolmentStore(dir);
    expect(store.list()).toEqual([]);
    store.save(enrol('c1', 'Ana', [1, 0, 0]));
    store.save(enrol('c2', 'Bo', [0, 1, 0]));
    // Re-enrolling a character replaces the old sample.
    store.save(enrol('c1', 'Ana', [0.5, 0.5, 0]));
    expect(store.list().map((e) => [e.characterId, e.embedding])).toEqual([
      ['c1', [0.5, 0.5, 0]],
      ['c2', [0, 1, 0]],
    ]);
    // A fresh store reads the same file back.
    expect(new EnrolmentStore(dir).list()).toHaveLength(2);
    expect(store.remove('c1')).toBe(true);
    expect(store.remove('c1')).toBe(false);
    expect(new EnrolmentStore(dir).list().map((e) => e.characterId)).toEqual(['c2']);
    // Only the JSON file: no audio is kept.
    expect(readdirSync(dir)).toEqual(['speakers.json']);
    expect(JSON.parse(readFileSync(path.join(dir, 'speakers.json'), 'utf8'))).toMatchObject({
      version: 1,
    });
  });

  it('reads a missing or damaged file as no enrolments', () => {
    const dir = tmp();
    expect(new EnrolmentStore(path.join(dir, 'nope')).list()).toEqual([]);
  });

  it('refuses an empty or non-finite embedding', () => {
    const store = new EnrolmentStore(tmp());
    expect(() => store.save(enrol('c1', 'Ana', []))).toThrow();
    expect(() => store.save(enrol('c1', 'Ana', [1, Number.NaN]))).toThrow();
  });
});

describe('labelling transcript lines (MC.6, two voices)', () => {
  const RATE = 16000;
  const tone = (ms: number, hz: number) =>
    Float32Array.from(
      { length: (RATE * ms) / 1000 },
      (_, i) => 0.2 * Math.sin((2 * Math.PI * hz * i) / RATE),
    );
  const quiet = (ms: number) => new Float32Array((RATE * ms) / 1000);
  const join = (...parts: Float32Array[]) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  // A fake embedder that tells the two "voices" apart by pitch, as the live
  // extractor tells real voices apart: low tone → Ana's vector, high → Bo's.
  const byPitch: SpeakerEmbedder = {
    embed: (samples) => {
      let crossings = 0;
      for (let i = 1; i < samples.length; i++)
        if (samples[i - 1]! < 0 !== samples[i]! < 0) crossings++;
      const hz = (crossings / 2) * (RATE / samples.length);
      return Promise.resolve(
        hz < 300 ? [0.95, 0.1, 0.05] : hz < 600 ? [0.1, 0.97, 0.02] : [0, 0, 1],
      );
    },
  };
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('labels each confident voice, leaves an unknown voice unlabelled, and follows deletions', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'labels-'));
    const store = new EnrolmentStore(path.join(dir, 'speakers'));
    store.save(enrol('c1', 'Ana', [1, 0, 0]));
    store.save(enrol('c2', 'Bo', [0, 1, 0]));
    const stt = new FixtureSpeechToText(['one', 'two', 'three', 'four']);
    const l = new Listener({
      dir,
      session: 1,
      stt,
      now: () => 0,
      speakers: { embedder: byPitch, enrolments: () => store.list() },
    });
    await l.push(
      join(tone(600, 200), quiet(800), tone(600, 450), quiet(800), tone(600, 900), quiet(800)),
    );
    store.remove('c1');
    await l.push(join(tone(600, 200), quiet(800)));
    await l.stop();
    expect(l.lines.map((x) => [x.text, x.speaker ?? null, x.speakerId ?? null])).toEqual([
      ['one', 'Ana', 'c1'],
      ['two', 'Bo', 'c2'],
      ['three', null, null],
      // Ana's enrolment was deleted: her voice is no longer named.
      ['four', null, null],
    ]);
    const file = readFileSync(transcriptFile(dir, 1), 'utf8');
    expect(file).toContain('"speaker":"Ana"');
  });

  it('a failed embedding only loses the label', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'labels-'));
    const errors: unknown[] = [];
    const l = new Listener({
      dir,
      session: 1,
      stt: new FixtureSpeechToText(['hello']),
      now: () => 0,
      onError: (e) => errors.push(e),
      speakers: {
        embedder: { embed: () => Promise.reject(new Error('extractor gone')) },
        enrolments: () => [enrol('c1', 'Ana', [1, 0, 0])],
      },
    });
    await l.push(join(tone(600, 200), quiet(800)));
    await l.stop();
    expect(l.lines.map((x) => [x.text, x.speaker])).toEqual([['hello', undefined]]);
    expect(errors).toHaveLength(1);
  });
});
