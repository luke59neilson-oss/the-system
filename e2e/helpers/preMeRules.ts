import { DEFAULT_RULES } from '@the-system/engine';
import type { Page } from '@playwright/test';

/**
 * Rules as a campaign created before ME stored them (D300): class spread plus
 * free points per race level, professions from E-grade. For specs about the
 * free-point and status-screen mechanics written with those numbers; ME.1.spec
 * covers the switch to the new budgets.
 */
export function preMeRules(): unknown {
  const r = JSON.parse(JSON.stringify(DEFAULT_RULES)) as {
    grades: { trackBudget?: unknown }[];
    tracks: { professionUnlockGrade: string };
  };
  for (const g of r.grades) delete g.trackBudget;
  r.tracks.professionUnlockGrade = 'E';
  return r;
}

/** Sets a fresh campaign's rules to `preMeRules()` over the GM page's own origin. */
export async function usePreMeRules(gm: Page, gmKey: string): Promise<void> {
  const result = await gm.evaluate(
    ({ key, rules }) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(
          `ws://${(globalThis as unknown as { location: { host: string } }).location.host}/ws`,
        );
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data)) as { type: string; ok?: boolean; error?: string };
          if (m.type === 'hello') ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: key }));
          if (m.type === 'joined')
            ws.send(
              JSON.stringify({
                type: 'command',
                requestId: 'pre-me',
                command: { type: 'rules.set', rules },
              }),
            );
          if (m.type === 'result') {
            ws.close();
            resolve(m.ok ? 'ok' : (m.error ?? 'failed'));
          }
        };
      }),
    { key: gmKey, rules: preMeRules() },
  );
  if (result !== 'ok') throw new Error(`rules.set refused: ${result}`);
}
