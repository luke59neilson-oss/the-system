import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// QF.56 (WCAG 1.4.11): field and button borders read at 3:1 or more against
// what they sit on: the field fill, the page, and a panel over the page.
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function hex(s: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${s}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(c: readonly number[]): number {
  const [r, g, b] = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: readonly number[], b: readonly number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function variable(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`--${name} not in styles.css`);
  return m[1]!.trim();
}

describe('control borders (QF.56)', () => {
  const border = hex(variable('control-border'));
  const bg = hex(variable('bg'));
  const panelMatch = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(variable('panel'));
  const [pr, pg, pb, pa] = panelMatch!.slice(1).map(Number) as [number, number, number, number];
  const panel = [pr, pg, pb].map((v, i) => v * pa + bg[i]! * (1 - pa));
  const field = hex('#0e1524');

  it('reads at 3:1 on the field fill, the page and a panel', () => {
    expect(ratio(border, field)).toBeGreaterThanOrEqual(3);
    expect(ratio(border, bg)).toBeGreaterThanOrEqual(3);
    expect(ratio(border, panel)).toBeGreaterThanOrEqual(3);
  });

  it('is what inputs, selects, textareas and secondary buttons use', () => {
    expect(css).toContain(`background: #0e1524;\n  border: 1px solid var(--control-border);`);
    expect(css).toMatch(/button\.secondary \{[^}]*border: 1px solid var\(--control-border\);/);
    // The old 2.2:1 colour is gone from every control rule.
    expect(css).not.toMatch(/(input|select|textarea|button)[^{]*\{[^}]*border: 1px solid #3b5682/);
  });
});
