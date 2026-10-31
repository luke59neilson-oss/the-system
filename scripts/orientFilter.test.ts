import { describe, expect, it } from 'vitest';
import { collapseChecked, openQuestion } from './orientFilter.mjs';

describe('orient filters (D297)', () => {
  const section = [
    '## QF — Quality fixes',
    '',
    'Intro line.',
    '',
    '- [x] **QF.1 Done thing.** Long body',
    '  line two',
    '  line three',
    '- [ ] **QF.2 Open thing.** Body',
    '  open two',
    '- [~] **QF.3 Provisional.** Body',
    '  prov two',
    '',
    `- [x] **QF.4 ${'x'.repeat(200)}`,
  ];
  it('keeps open and provisional items whole and checked ones as one line', () => {
    const out = collapseChecked(section);
    expect(out).toContain('- [x] **QF.1 Done thing.** Long body');
    expect(out).not.toContain('  line two');
    expect(out).toContain('  open two');
    expect(out).toContain('  prov two');
    expect(out).toContain('Intro line.');
    expect(out.find((l) => l.includes('QF.4'))?.length).toBe(160);
    expect(out.at(-1)).toMatch(/2 checked items collapsed/);
  });
  it('adds no note when nothing is checked', () => {
    expect(collapseChecked(['## M', '- [ ] **A** x', '  y'])).toEqual([
      '## M',
      '- [ ] **A** x',
      '  y',
    ]);
  });
  it('hides answered, applied and default-kept questions', () => {
    expect(openQuestion(['1. **Q?** text', '   Default: no.'])).toBe(true);
    expect(openQuestion(['1. **Q?** text', '   Answer: yes'])).toBe(false);
    expect(openQuestion(['1. **Q?** text (applied, D3)'])).toBe(false);
    expect(
      openQuestion([
        '1. **Q?** text',
        '   Not put to Luke (the build was complete); default kept: no change.',
      ]),
    ).toBe(false);
  });
});
