import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_PORT,
  portFallbackMessage,
  startErrorMessage,
} from '../apps/desktop/src/launch';

/**
 * M11.4: the guides name on-screen labels in **bold**; every one must exist in
 * the code of the surface that guide describes (GM console, player screen),
 * outside comments, so a renamed button fails here instead of misleading the
 * table. Emphasis that is not a label uses *italics*. Labels from other
 * programs (Windows, macOS, GitHub) are listed in EXTERNAL. Short generic
 * labels ("Give", "Roll") can still match another control in the same
 * surface: the reviewer reads the flows, this catches renames.
 */
const WEB = 'apps/web/src';
const GUIDES: Record<string, string[]> = {
  'docs/GM-GUIDE.md': [`${WEB}/gm`, `${WEB}/App.tsx`, 'apps/desktop/src'],
  'docs/PLAYER-QUICKSTART.md': [`${WEB}/player`, `${WEB}/gm/JoinPanel.tsx`],
  'docs/TROUBLESHOOTING.md': [WEB, 'apps/desktop/src', 'apps/server/src'],
};
const EXTERNAL = new Set([
  'Releases',
  'Download raw file',
  'More info',
  'Run anyway',
  'System Settings',
  'Privacy & Security',
  'Open Anyway',
]);

const walk = (entry: string): string[] => {
  if (!statSync(entry).isDirectory()) return [entry];
  return readdirSync(entry).flatMap((name) => {
    const file = path.join(entry, name);
    if (statSync(file).isDirectory()) return walk(file);
    return /\.(ts|tsx)$/.test(name) && !name.includes('.test.') ? [file] : [];
  });
};

const squash = (text: string) => text.replace(/\s+/g, ' ');

/**
 * Drops block and line comments (not `//` inside a string such as `http://`).
 * A regex literal ending in `\//` loses the rest of its line; no label sits on
 * such a line today.
 */
export function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** "Session → Start session N." → ["Session", "Start session"]. */
export function labelParts(label: string): string[] {
  return label
    .split(/ → | · /)
    .map((part) => part.replace(/\.$/, '').replace(/\s*…$/, '').replace(/ N$/, '').trim())
    .filter((part) => part.length > 0);
}

const sourceOf = (roots: string[]) =>
  squash(
    roots
      .flatMap(walk)
      .map((f) => stripComments(readFileSync(f, 'utf8')))
      .join('\n'),
  );

const guide = (file: string) => squash(readFileSync(file, 'utf8'));

describe('guides (M11.4)', () => {
  it('splits labels into checkable parts and ignores comments', () => {
    expect(labelParts('Session → End session N…')).toEqual(['Session', 'End session']);
    expect(labelParts('Welcome back · Continue as …')).toEqual(['Welcome back', 'Continue as']);
    expect(labelParts('Free points · [Assign]')).toEqual(['Free points', '[Assign]']);
    expect(stripComments('a // Sound: off\nb /* Give */ "http://x"')).toBe('a \nb   "http://x"');
  });

  for (const [file, roots] of Object.entries(GUIDES)) {
    it(`${file}: every bold label is on its screen`, () => {
      const source = sourceOf(roots);
      const labels = [...guide(file).matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1] ?? '');
      expect(labels.length).toBeGreaterThan(10);
      const missing = labels
        .flatMap(labelParts)
        .filter((part) => !EXTERNAL.has(part) && !source.includes(part));
      expect(missing).toEqual([]);
    });
  }

  it('troubleshooting matches the app: ports and firewall steps', () => {
    const text = guide('docs/TROUBLESHOOTING.md');
    const allTaken = startErrorMessage({ code: 'EADDRINUSE' }, DEFAULT_DESKTOP_PORT);
    expect(text).toContain(allTaken.split('.')[0] ?? '');
    expect(text).toContain(
      portFallbackMessage(DEFAULT_DESKTOP_PORT, 1).split(',')[0] ?? 'missing message',
    );
    expect(text).toContain(String(DEFAULT_DESKTOP_PORT));
    // The menu paths the join panel's own help gives (JoinPanel.tsx).
    const panel = squash(readFileSync(`${WEB}/gm/JoinPanel.tsx`, 'utf8'));
    for (const step of [
      'Settings → Network & internet → Wi-Fi → your network → Network profile type → Private',
      'Allow an app through Windows Firewall',
      'System Settings → Network → Firewall → Options',
    ]) {
      expect(panel).toContain(step);
      expect(text.replace(/\*\*/g, '')).toContain(step);
    }
  });

  it('the quickstart fits on one page', () => {
    const text = readFileSync('docs/PLAYER-QUICKSTART.md', 'utf8');
    expect(text.split('\n').length).toBeLessThanOrEqual(70);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(600);
  });
});
