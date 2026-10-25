import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, listRefusals, refusalKey, variableRefusals } from './gm-refusals.mjs';

// MT.7 (DESIGN §7, Q60): docs/GM-OVERRIDES.md lists every refusal the engine
// can give, with the GM's way through. A new refusal needs a line there.

const doc = readFileSync(path.join(ROOT, 'docs/GM-OVERRIDES.md'), 'utf8');
const cell = (key: string) => '`' + key.replace(/\|/g, '\\|').replace(/`/g, "'") + '`';

describe('GM overrides list (MT.7)', () => {
  it('finds the engine refusals', () => {
    const all = listRefusals();
    expect(all.length).toBeGreaterThan(250);
    expect(all.map((r) => r.key)).toContain('Professions unlock at …-grade');
  });

  it('keys hide interpolated values', () => {
    expect(refusalKey('[${a.b}] needs ${n} marks\n   (has ${f({ x: 1 })})')).toBe(
      '[…] needs … marks (has …)',
    );
  });

  it('reads every refusal passed on as a variable from a …Problem function (MT.7 review)', () => {
    const sites = variableRefusals();
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(site.from, `${site.file}:${site.line} ${site.variable}`).toMatch(/Problem$/);
    }
    const keys = listRefusals().map((r) => r.key);
    expect(keys).toContain('the … list (ids and order) cannot change in a running campaign');
    expect(keys).toContain('this contest needs a roll');
  });

  it('lists every refusal with a category and a way through', () => {
    const missing = [...new Set(listRefusals().map((r) => r.key))].filter(
      (key) => !doc.includes(`| ${cell(key)} |`),
    );
    expect(missing).toEqual([]);
    expect(doc).not.toContain('UNCLASSIFIED');
    // Every rule's way through is built: nothing is left planned.
    expect(doc).not.toMatch(/planned/i);
    for (const line of doc.split('\n').filter((l) => l.startsWith('| `'))) {
      expect(line.split(' | ').at(-1)?.replace(/\|$/, '').trim(), line).not.toBe('');
    }
  });
});
