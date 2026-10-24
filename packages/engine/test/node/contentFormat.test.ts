// M9.2: the content file format. Every example in docs/content-examples
// parses; bad files come back as path-tagged errors; the committed JSON
// Schema matches the definitions (UPDATE_CONTENT_SCHEMA=1 rewrites it).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_FORMAT,
  DEFAULT_RULES,
  CONTENT_LIMITS,
  MAX_CONTENT_ERRORS,
  contentJsonSchema,
  parseContentFile,
} from '../../src';

const docs = path.resolve(import.meta.dirname, '../../../../docs');
const examplesDir = path.join(docs, 'content-examples');
const schemaFile = path.join(docs, 'content-format.schema.json');
const head = { format: CONTENT_FORMAT, version: 1 };

const errorsOf = (input: unknown) => {
  const r = parseContentFile(input);
  if (r.ok) throw new Error('expected errors');
  return r.errors;
};

describe('content files (M9.2)', () => {
  const examples = readdirSync(examplesDir).filter((f) => f.endsWith('.json'));

  it('has an example for every section', () => {
    const sections = new Set(
      examples.flatMap((f) =>
        Object.keys(JSON.parse(readFileSync(path.join(examplesDir, f), 'utf8')) as object),
      ),
    );
    for (const s of ['skills', 'items', 'titles', 'bestiary', 'skillOffers', 'evolutions']) {
      expect(sections, s).toContain(s);
    }
  });

  it.each(examples)('parses docs/content-examples/%s', (file) => {
    const r = parseContentFile(readFileSync(path.join(examplesDir, file), 'utf8'));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it.each(examples)('docs/content-examples/%s uses only default rules ids', (file) => {
    const rarities = new Set(
      DEFAULT_RULES.skills.rarities.filter((r) => !r.reserved).map((r) => r.id),
    );
    const stats = new Set(DEFAULT_RULES.stats.list.map((x) => x.id));
    const slots = new Set(DEFAULT_RULES.economy.equipmentSlots.map((x) => x.id));
    const grades = new Set(DEFAULT_RULES.grades.map((g) => g.id));
    const bad: string[] = [];
    const walk = (v: unknown, key: string) => {
      if (Array.isArray(v)) return v.forEach((x) => walk(x, key));
      if (v === null || typeof v !== 'object') {
        if (typeof v !== 'string') return;
        if ((key === 'rarity' || key === 'minRarity') && !rarities.has(v)) bad.push(`${key} ${v}`);
        if (key === 'stat' && !stats.has(v)) bad.push(`stat ${v}`);
        if (key === 'slot' && !slots.has(v)) bad.push(`slot ${v}`);
        if (key === 'grade' && !grades.has(v)) bad.push(`grade ${v}`);
        return;
      }
      for (const [k, x] of Object.entries(v)) {
        if (['stats', 'classWeights', 'statBonus'].includes(k) && x && typeof x === 'object') {
          for (const s of Object.keys(x)) if (!stats.has(s)) bad.push(`${k} ${s}`);
        } else if (k === 'rerate' && x && typeof x === 'object') {
          for (const r of Object.values(x))
            if (!rarities.has(String(r))) bad.push(`rerate ${String(r)}`);
        } else walk(x, k);
      }
    };
    walk(JSON.parse(readFileSync(path.join(examplesDir, file), 'utf8')), '');
    expect(bad).toEqual([]);
  });

  it('accepts the smallest file and keeps what it read', () => {
    expect(parseContentFile(head)).toEqual({ ok: true, content: head });
    const r = parseContentFile({
      ...head,
      skills: [{ name: '  Swift Strike ', rarity: 'common' }],
    });
    expect(r.ok && r.content.skills).toEqual([{ name: 'Swift Strike', rarity: 'common' }]);
  });

  it('reports bad JSON, other formats and newer versions plainly', () => {
    expect(errorsOf('{ "format": ')[0]?.message).toMatch(/^Not valid JSON/);
    expect(errorsOf({ format: 'something-else', version: 1 })).toEqual([
      { path: 'format', message: 'Not a content file: format must be "the-system/content"' },
    ]);
    expect(errorsOf({ ...head, version: 2 })[0]?.message).toMatch(/newer version of the app/);
    expect(errorsOf([1, 2]).length).toBeGreaterThan(0);
    expect(errorsOf(null).length).toBeGreaterThan(0);
  });

  it('names the path of each mistake, including unknown keys', () => {
    const errors = errorsOf({
      ...head,
      skills: [
        { name: 'Ok', rarity: 'rare' },
        { name: '', rarity: 'rare' },
      ],
      items: [{ name: 'Charm', rarity: 'rare', bonuses: [{ stat: 'vitality', percent: 10 }] }],
      titles: [{ name: 'Empty bonus', bonuses: [{ stat: 'vitality' }] }],
      bestiary: [{ name: 'Half', tiers: [{ minRarity: 'common', text: 'x' }], grade: 'F' }],
      skillOffers: [{ character: 'Jake', level: 0, options: [] }],
      evolutions: [{ character: 'Jake', options: [{ classname: 'Typo' }] }],
      skils: [],
    });
    const paths = errors.map((e) => e.path);
    expect(paths).toContain('skills[1].name');
    // Items take flat bonuses only.
    expect(paths).toContain('items[0].bonuses[0]');
    expect(errors.find((e) => e.path === 'titles[0].bonuses[0]')?.message).toBe(
      'Give flat, percent or both',
    );
    expect(errors.find((e) => e.path === 'bestiary[0].level')?.message).toBe(
      'Give grade and level together, or neither',
    );
    expect(paths).toContain('skillOffers[0].level');
    expect(paths).toContain('skillOffers[0].options');
    expect(paths).toContain('evolutions[0].options[0].className');
    expect(paths).toContain('evolutions[0].options[0]');
    expect(paths).toContain('(file)'); // The unknown top-level "skils".
  });

  it('caps the error list', () => {
    const skills = Array.from({ length: CONTENT_LIMITS.entries }, () => ({ name: '', rarity: '' }));
    const errors = errorsOf({ ...head, skills });
    expect(errors).toHaveLength(MAX_CONTENT_ERRORS + 1);
    expect(errors.at(-1)?.message).toMatch(/^…and \d+ more$/);
  });

  it('bounds sizes', () => {
    const long = 'x'.repeat(CONTENT_LIMITS.text + 1);
    expect(
      errorsOf({ ...head, skills: [{ name: 'A', rarity: 'rare', effects: long }] })[0]?.path,
    ).toBe('skills[0].effects');
    const many = Array.from({ length: CONTENT_LIMITS.entries + 1 }, () => ({
      name: 'A',
      rarity: 'rare',
    }));
    expect(errorsOf({ ...head, skills: many })[0]?.path).toBe('skills');
  });

  it('docs/content-format.schema.json matches the definitions', () => {
    const generated = `${JSON.stringify(contentJsonSchema(), null, 2)}\n`;
    if (process.env.UPDATE_CONTENT_SCHEMA === '1') writeFileSync(schemaFile, generated);
    expect(readFileSync(schemaFile, 'utf8')).toBe(generated);
  });
});
