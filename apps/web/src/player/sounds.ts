/**
 * The optional DING sound (M3.3): two short sine notes made with Web Audio,
 * so there is no audio file to ship. Silently does nothing where audio is
 * unavailable or blocked.
 */
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
export function unlockChime(): void {
  void audio()
    ?.resume()
    .catch(() => undefined);
}

export function playChime(): void {
  const ctx = audio();
  if (!ctx) return;
  try {
    const start = ctx.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = start + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  } catch {
    // Audio is a nicety; never break the screen over it.
  }
}
