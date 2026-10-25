import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M11.4: the guides name on-screen labels in **bold**; every one must exist in
 * the app's source, so a renamed button fails here instead of misleading the
 * table. Emphasis that is not a label uses *italics*. Labels from other
 * programs (Windows, macOS, GitHub) are listed in EXTERNAL.
 */
const GUIDES = ['docs/GM-GUIDE.md', 'docs/PLAYER-QUICKSTART.md', 'docs/TROUBLESHOOTING.md'];
const SOURCES = ['apps/web/src', 'apps/desktop/src', 'apps/server/src', 'packages/engine/src'];
const EXTERNAL = new Set([
  'Releases',
  'More info',
  'Run anyway',
  'System Settings',
  'Privacy & Security',
  'Open Anyway',
]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return walk(file);
    return /\.(ts|tsx)$/.test(name) && !name.includes('.test.') ? [file] : [];
  });

const squash = (text: string) => text.replace(/\s+/g, ' ');

/** "Session → Start session N." → ["Session", "Start session"]. */
export function labelParts(label: string): string[] {
  return label
    .split(/ → | · /)
    .map((part) => part.replace(/\.$/, '').replace(/\s*…$/, '').replace(/ N$/, '').trim())
    .filter((part) => part.length > 0);
}

describe('guides (M11.4)', () => {
  const source = squash(
    SOURCES.flatMap(walk)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n'),
  );

  it('splits labels into checkable parts', () => {
    expect(labelParts('Session → End session N…')).toEqual(['Session', 'End session']);
    expect(labelParts('Welcome back · Continue as …')).toEqual(['Welcome back', 'Continue as']);
    expect(labelParts('Free points · [Assign]')).toEqual(['Free points', '[Assign]']);
  });

  for (const guide of GUIDES) {
    it(`${guide}: every bold label is on screen`, () => {
      const text = squash(readFileSync(guide, 'utf8'));
      const labels = [...text.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1] ?? '');
      expect(labels.length).toBeGreaterThan(10);
      const missing = labels
        .flatMap(labelParts)
        .filter((part) => !EXTERNAL.has(part) && !source.includes(part));
      expect(missing).toEqual([]);
    });
  }

  it('the quickstart fits on one page', () => {
    const lines = readFileSync('docs/PLAYER-QUICKSTART.md', 'utf8').split('\n');
    expect(lines.length).toBeLessThanOrEqual(70);
  });
});
