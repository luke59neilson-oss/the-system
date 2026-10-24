/**
 * The System's sounds (M3.3, M8.4), made in code with Web Audio so there is no
 * audio file to ship and nothing borrowed: each sound is a short recipe of
 * notes. Silently does nothing where audio is unavailable or blocked.
 */
export type SoundKind = 'ding' | 'selection' | 'evolution';

export interface Note {
  /** Hz. */
  readonly freq: number;
  /** Seconds after the sound starts. */
  readonly at: number;
  /** Seconds from start to silence. */
  readonly length: number;
  /** Seconds to reach the peak. */
  readonly attack: number;
  /** Peak gain at full volume. */
  readonly peak: number;
  readonly wave: OscillatorType;
}

const note = (
  freq: number,
  at: number,
  length: number,
  peak: number,
  wave: OscillatorType = 'sine',
  attack = 0.02,
): Note => ({ freq, at, length, attack, peak, wave });

/**
 * DING: two bright notes a fifth apart (the books' level-up chime).
 * Selection: three rising triangle notes, a "choose" cue.
 * Evolution: a slow major chord swell with a rising shimmer on top.
 */
export const SOUNDS: Readonly<Record<SoundKind, readonly Note[]>> = {
  ding: [note(880, 0, 0.35, 0.15), note(1320, 0.12, 0.35, 0.15)],
  selection: [
    note(660, 0, 0.22, 0.12, 'triangle'),
    note(880, 0.1, 0.22, 0.12, 'triangle'),
    note(1100, 0.2, 0.4, 0.12, 'triangle'),
  ],
  evolution: [
    note(220, 0, 2.2, 0.1, 'sine', 0.6),
    note(330, 0, 2.2, 0.08, 'sine', 0.6),
    note(440, 0.05, 2.1, 0.08, 'sine', 0.6),
    note(554, 0.1, 2.0, 0.06, 'sine', 0.6),
    note(880, 0.6, 1.4, 0.05, 'triangle', 0.3),
    note(1320, 0.9, 1.2, 0.04, 'triangle', 0.3),
    note(1760, 1.2, 1.0, 0.03, 'triangle', 0.3),
  ],
};

/** Volume is 0–100 in the UI; peaks scale linearly. */
export function scaledPeak(n: Note, volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return n.peak * v;
}

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    return context;
  } catch {
    return null;
  }
}

/** Call from the click that turns sound on: browsers only start audio after a gesture. */
export function unlockSound(): void {
  void audio()
    ?.resume()
    .catch(() => undefined);
}

/** Plays a sound at a volume of 0–100; volume 0 plays nothing. */
export function playSound(kind: SoundKind, volume: number): void {
  if (volume <= 0) return;
  const ctx = audio();
  if (!ctx) return;
  // A page reloaded with sound remembered on starts its context suspended
  // (no gesture yet); ask again each time, so it plays once one has happened.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  try {
    const start = ctx.currentTime;
    for (const n of SOUNDS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.wave;
      osc.frequency.value = n.freq;
      const t = start + n.at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, scaledPeak(n, volume)), t + n.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.length + 0.05);
    }
  } catch {
    // Audio is a nicety; never break the screen over it.
  }
}
