import { mkdtempSync, readdirSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SpeechModel } from '../src/speech/model';
import type { SpeechToText } from '../src/speech/stt';
import { Listener } from '../src/speech/transcript';

// MC.5 (D236): the real engine on a real recording. Run by `npm run
// test:speech` (its own config, so `npm run check` stays offline and fast) and
// by CI, which caches the model. Downloads Whisper tiny.en from GitHub
// releases once into .cache/speech-models (or THE_SYSTEM_SPEECH_CACHE).
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, 'fixtures', 'speech', 'table-talk.wav');
const EXPECTED = JSON.parse(
  readFileSync(path.join(here, 'fixtures', 'speech', 'table-talk.json'), 'utf8'),
) as { lines: { speaker: string; text: string }[] };
const CACHE =
  process.env['THE_SYSTEM_SPEECH_CACHE'] ??
  path.resolve(here, '..', '..', '..', '.cache', 'speech-models');

/** Mono 16-bit PCM WAV to float samples. */
function readWav(file: string): { samples: Float32Array; sampleRate: number } {
  const buf = readFileSync(file);
  let at = 12;
  let sampleRate = 0;
  while (at < buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      expect(buf.readUInt16LE(at + 8)).toBe(1); // PCM
      expect(buf.readUInt16LE(at + 10)).toBe(1); // mono
      sampleRate = buf.readUInt32LE(at + 12);
      expect(buf.readUInt16LE(at + 22)).toBe(16);
    } else if (id === 'data') {
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(at + 8 + i * 2) / 32768;
      return { samples, sampleRate };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('No data chunk');
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Word error rate (edit distance over words). */
function wer(expected: string, heard: string): number {
  const a = words(expected);
  const b = words(heard);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length]! / a.length;
}

describe('Whisper tiny.en through sherpa-onnx (MC.5)', () => {
  it('transcribes the table-talk recording, line by line, and keeps only text', async () => {
    const model = new SpeechModel({ dir: CACHE });
    await model.download();
    expect(model.status()).toEqual({ state: 'ready' });
    const stt = model.stt() as SpeechToText;

    const { samples, sampleRate } = readWav(FIXTURE);
    expect(sampleRate).toBe(16_000);
    const audioMs = (samples.length / sampleRate) * 1000;
    const dir = mkdtempSync(path.join(tmpdir(), 'the-system-whisper-'));
    try {
      let cpuMicros = 0;
      const timed: SpeechToText = {
        async transcribe(s, rate) {
          const t0 = process.cpuUsage();
          const text = await stt.transcribe(s, rate);
          const used = process.cpuUsage(t0);
          cpuMicros += used.user + used.system;
          return text;
        },
      };
      const listener = new Listener({ dir, session: 1, stt: timed, now: () => 0 });
      // The GM window posts about one second at a time.
      for (let at = 0; at < samples.length; at += sampleRate) {
        await listener.push(samples.subarray(at, at + sampleRate));
      }
      await listener.stop();

      const heard = listener.lines.map((l) => l.text);
      console.log('Heard:', JSON.stringify(heard));
      expect(heard).toHaveLength(EXPECTED.lines.length);
      EXPECTED.lines.forEach((line, i) => {
        expect(wer(line.text, heard[i]!), `line ${i}: ${heard[i]}`).toBeLessThanOrEqual(0.25);
      });
      // Only the text transcript is on disk: no audio of any kind.
      const files = readdirSync(dir, { recursive: true }).map(String);
      expect(
        files.filter(
          (f) => !f.endsWith('.jsonl') && f !== 'transcripts' && !f.endsWith('transcripts'),
        ),
      ).toEqual([]);
      expect(files.some((f) => /\.(wav|pcm|raw|webm|ogg|mp3|f32)$/i.test(f))).toBe(false);

      const perMinute = (cpuMicros / 1000) * (60_000 / audioMs);
      const report = `Speech-to-text CPU time: ${Math.round(perMinute)} ms per minute of audio (Whisper tiny.en int8, 2 threads; ${(audioMs / 1000).toFixed(1)} s fixture)`;
      console.log(report);
      const summary = process.env['GITHUB_STEP_SUMMARY'];
      if (summary) appendFileSync(summary, `${report}\n`);
      // Real time with room to spare on the CI runner: under 30 s per minute.
      expect(perMinute).toBeLessThan(30_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
