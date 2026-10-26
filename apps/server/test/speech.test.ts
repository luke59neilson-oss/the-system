import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FixtureSpeechToText } from '../src/speech/stt';
import { Listener, transcriptFile } from '../src/speech/transcript';
import { DEFAULT_VAD, VoiceChunker, rms } from '../src/speech/vad';

// MC.5 (DESIGN §11 "Listening"): chunking, the fixture recognizer and the
// GM-only transcript file. Synthesized audio: a 220 Hz tone for speech.
const RATE = DEFAULT_VAD.sampleRate;
const tone = (ms: number, amp = 0.2) =>
  Float32Array.from(
    { length: (RATE * ms) / 1000 },
    (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / RATE),
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

describe('voice chunking (MC.5)', () => {
  it('measures level', () => {
    expect(rms(quiet(30))).toBe(0);
    expect(rms(tone(30, 0.2))).toBeCloseTo(0.2 / Math.SQRT2, 2);
    expect(rms(new Float32Array())).toBe(0);
  });

  it('cuts speech at pauses, trims the quiet tail and drops short blips', () => {
    const c = new VoiceChunker();
    const audio = join(
      quiet(300),
      tone(900),
      quiet(900),
      tone(90),
      quiet(900),
      tone(600),
      quiet(300),
    );
    const segs = c.push(audio);
    // The 90 ms blip is under minSpeechMs, so it never becomes a segment.
    expect(segs.map((s) => [s.startMs, s.endMs])).toEqual([[300, 1200]]);
    expect(segs[0]!.samples.length).toBe((RATE * 900) / 1000);
    // The last speech is still open (only 300 ms of quiet): flush closes it.
    expect(c.flush().map((s) => [s.startMs, s.endMs])).toEqual([[3090, 3690]]);
    expect(c.flush()).toEqual([]);
  });

  it('gives the same segments however the audio is split into chunks', () => {
    const audio = join(tone(500), quiet(700), tone(400), quiet(700));
    const whole = new VoiceChunker().push(audio).map((s) => [s.startMs, s.endMs]);
    const c = new VoiceChunker();
    const parts: number[][] = [];
    for (let i = 0; i < audio.length; i += 1234) {
      parts.push(...c.push(audio.subarray(i, i + 1234)).map((s) => [s.startMs, s.endMs]));
    }
    expect(parts).toEqual(whole);
    expect(whole).toEqual([
      [0, 510],
      [1200, 1620],
    ]);
  });

  it('cuts a long speech at maxSegmentMs', () => {
    const c = new VoiceChunker({ ...DEFAULT_VAD, maxSegmentMs: 1500 });
    const segs = [...c.push(tone(4000)), ...c.flush()];
    expect(segs.map((s) => s.endMs - s.startMs)).toEqual([1500, 1500, 990]);
  });

  it('refuses bad options', () => {
    expect(() => new VoiceChunker({ ...DEFAULT_VAD, sampleRate: 0 })).toThrow();
  });
});

describe('transcript (MC.5)', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes one text line per utterance, in order, and keeps no audio', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'transcript-'));
    const stt = new FixtureSpeechToText(['We want an herbalist.', '', 'Jake draws his bow.']);
    const seen: string[] = [];
    const t0 = Date.parse('2026-10-26T19:00:00.000Z');
    const l = new Listener({
      dir,
      session: 3,
      stt,
      now: () => t0,
      onLine: (x) => seen.push(x.text),
    });
    await l.push(join(tone(600), quiet(800), tone(300), quiet(800)));
    await l.push(tone(700));
    await l.stop();
    // The second segment came back empty, so it is not a line.
    expect(stt.heard).toEqual([600, 330, 690]);
    expect(seen).toEqual(['We want an herbalist.', 'Jake draws his bow.']);
    const file = transcriptFile(dir, 3);
    expect(path.basename(file)).toBe('session-03.jsonl');
    const lines = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((x) => JSON.parse(x));
    expect(lines).toEqual([
      { at: '2026-10-26T19:00:00.000Z', startMs: 0, endMs: 600, text: 'We want an herbalist.' },
      { at: '2026-10-26T19:00:02.490Z', startMs: 2490, endMs: 3180, text: 'Jake draws his bow.' },
    ]);
    // Only the text file exists: no audio is written.
    expect(readdirSync(dir)).toEqual(['session-03.jsonl']);
  });

  it('skips a segment the recognizer fails on and carries on', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'transcript-'));
    let n = 0;
    const errors: unknown[] = [];
    const l = new Listener({
      dir,
      session: 1,
      now: () => 0,
      onError: (e) => errors.push(e),
      stt: {
        transcribe: () =>
          n++ === 0 ? Promise.reject(new Error('model gone')) : Promise.resolve('ok'),
      },
    });
    await l.push(join(tone(500), quiet(800), tone(500), quiet(800)));
    await l.stop();
    expect(errors).toHaveLength(1);
    expect(l.lines.map((x) => x.text)).toEqual(['ok']);
  });

  it('a failed transcript write is reported and the queue carries on (review)', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'transcript-'));
    // A file where the transcripts folder should be: every write fails.
    const blocked = path.join(dir, 'transcripts');
    writeFileSync(blocked, 'not a folder');
    const errors: unknown[] = [];
    const l = new Listener({
      dir: blocked,
      session: 1,
      now: () => 0,
      onError: (e) => errors.push(e),
      stt: new FixtureSpeechToText(['one', 'two']),
    });
    await l.push(join(tone(500), quiet(800), tone(500), quiet(800)));
    await expect(l.stop()).resolves.toBeUndefined();
    expect(errors).toHaveLength(2);
    expect(l.lines.map((x) => x.text)).toEqual(['one', 'two']);
  });
});

describe('sherpa adapter (MC.5, D235)', () => {
  it('builds a Whisper recognizer from the model files and returns trimmed text', async () => {
    const { sherpaSpeechToText, whisperModelFiles } = await import('../src/speech/sherpa');
    const files = whisperModelFiles('/models', 'tiny.en');
    expect(files.encoder).toBe(path.join('/models', 'tiny.en-encoder.int8.onnx'));
    const configs: unknown[] = [];
    const fed: number[] = [];
    const stt = await sherpaSpeechToText(files, () =>
      Promise.resolve({
        OfflineRecognizer: {
          createAsync: (config: unknown) => {
            configs.push(config);
            return Promise.resolve({
              createStream: () => ({
                acceptWaveform: (o: { samples: Float32Array }) => fed.push(o.samples.length),
              }),
              decodeAsync: () => Promise.resolve({ text: '  Hello there. ' }),
            });
          },
        },
      }),
    );
    expect(await stt.transcribe(new Float32Array(160), 16_000)).toBe('Hello there.');
    expect(fed).toEqual([160]);
    expect(JSON.stringify(configs[0])).toContain('tiny.en-decoder.int8.onnx');
  });

  it('rejects when the package is missing', async () => {
    const { sherpaSpeechToText, whisperModelFiles } = await import('../src/speech/sherpa');
    await expect(
      sherpaSpeechToText(whisperModelFiles('/m', 'x'), () =>
        Promise.reject(new Error('no module')),
      ),
    ).rejects.toThrow('no module');
  });
});
