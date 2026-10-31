import type { ElectronApplication, Page } from '@playwright/test';

/**
 * The GM console window. Since MS.7 the first window is the "Starting The
 * System…" splash, so tests look for the window showing /gm instead.
 */
export async function gmWindow(app: ElectronApplication, timeoutMs = 30_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const gm = app.windows().find((w) => /^http:\/\/127\.0\.0\.1:\d+\/gm/.test(w.url()));
    if (gm) return gm;
    if (Date.now() > deadline) throw new Error('The GM window never opened');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * QF.59: Chromium switches every desktop test launch passes. No GPU process,
 * so a loaded runner's software GL cannot delay a window's first paint;
 * `THE_SYSTEM_TEST_NO_GPU` (set in playwright.config.ts) also turns hardware
 * acceleration off inside the app.
 */
export const TEST_SWITCHES = ['--no-sandbox', '--disable-gpu'] as const;
