/// <reference types="node" />
// Node types for this file only: it reads the stylesheets from disk (Vitest
// hands `?raw` CSS imports over empty).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, deltaE2000, deltaE2000Lab, hexToRgb, over } from '../src/color';

const src = new URL('../src/', import.meta.url);
const themes = readFileSync(new URL('themes.css', src), 'utf8');
const styles = readFileSync(new URL('styles.css', src), 'utf8');

// M8.3: the grade theme tokens are checked as written in the stylesheets.
// The e2e spec (e2e/M8.3.spec.ts) checks the rendered page as well.

const GRADES = ['aluminum', 'bronze', 'copper', 'silver', 'gold', 'platinum', 'diamond'];

function token(css: string, selector: string, name: string): string {
  const block = css.match(new RegExp(`${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1];
  const value = block?.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
  if (!value) throw new Error(`${selector} has no ${name}`);
  return value;
}

describe('colour maths', () => {
  it('matches the CIEDE2000 reference pairs (Sharma, Wu and Dalal 2005)', () => {
    expect(deltaE2000Lab([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE2000Lab([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 4);
    expect(deltaE2000Lab([50, 2.5, 0], [50, 0, -2.5])).toBeCloseTo(4.3065, 4);
    expect(deltaE2000Lab([2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514])).toBeCloseTo(
      0.9082,
      4,
    );
    expect(deltaE2000(hexToRgb('#000'), hexToRgb('#fff'))).toBeCloseTo(100, 3);
  });

  it('computes WCAG contrast ratios', () => {
    expect(contrast(hexToRgb('#000'), hexToRgb('#fff'))).toBeCloseTo(21, 5);
    expect(contrast(hexToRgb('#777'), hexToRgb('#fff'))).toBeCloseTo(4.48, 2);
    expect(() => hexToRgb('red')).toThrow();
  });
});

describe('grade themes', () => {
  // The lightest a window gets: the panel colour over the page gradient's
  // light stop. Light text on it is the worst case.
  const panel = token(styles, ':root', '--panel')
    .match(/rgba\(([^)]+)\)/)?.[1]
    ?.split(',');
  if (!panel) throw new Error('--panel is not rgba()');
  const [r, g, b, a] = panel.map(Number) as [number, number, number, number];
  const light = styles.match(/radial-gradient\(circle at 30% 0%, (#[0-9a-f]+)/)?.[1];
  if (!light) throw new Error('page gradient not found');
  const windowBg = over([r, g, b], a, hexToRgb(light));

  it.each(GRADES)('%s headings read at 4.5:1 or better on a window', (grade) => {
    const text = hexToRgb(token(themes, `.theme-${grade}`, '--metal-text'));
    expect(contrast(text, windowBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('every rarity colour and shared text colour reads at 4.5:1 on a window', () => {
    const rarities = [...styles.matchAll(/\.rarity-(\w+) \.skill-name \{\s*color: (#[0-9a-f]+);/g)];
    expect(rarities.map((m) => m[1])).toEqual([
      'inferior',
      'common',
      'uncommon',
      'rare',
      'epic',
      'ancient',
      'legendary',
      'mythical',
      'divine',
    ]);
    const shared = ['--text', '--muted', '--ok', '--err', '--accent'].map((n) => [
      n,
      token(styles, ':root', n),
    ]);
    for (const [name, hex] of [...rarities.map((m) => [m[1], m[2]]), ...shared]) {
      expect(contrast(hexToRgb(hex!), windowBg), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every theme sets its own text colour, so nested themes never inherit one', () => {
    for (const grade of GRADES)
      expect(token(themes, `.theme-${grade}`, '--metal-text')).toMatch(/^#/);
    expect(themes).toMatch(/:is\(h2, h3\) \{\s*color: var\(--metal-text\)/);
  });

  it('silver and platinum differ by ΔE (CIEDE2000) of at least 10 (DESIGN §9)', () => {
    const silver = hexToRgb(token(themes, '.theme-silver', '--metal'));
    const platinum = hexToRgb(token(themes, '.theme-platinum', '--metal'));
    expect(deltaE2000(silver, platinum)).toBeGreaterThanOrEqual(10);
  });

  it('all seven metals are distinct', () => {
    const metals = GRADES.map((t) => token(themes, `.theme-${t}`, '--metal'));
    expect(new Set(metals).size).toBe(GRADES.length);
  });
});
