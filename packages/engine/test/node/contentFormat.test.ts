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
  contentFileSchema,
  contentToCommands,
  execute,
  parseContentFile,
  type Campaign,
  type ContentFile,
} from '../../src';
import { kit, rawRules, run, testContext } from '../helpers/events';

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

  it('has an example (or the tutorial pack, M9.5) for every section', () => {
    const files = [
      ...examples.map((f) => path.join(examplesDir, f)),
      path.join(docs, 'content-packs', 'tutorial.json'),
    ];
    const sections = new Set(
      files.flatMap((f) => Object.keys(JSON.parse(readFileSync(f, 'utf8')) as object)),
    );
    for (const s of Object.keys(contentFileSchema.shape).filter(
      (k) => !['format', 'version', 'title', 'notes'].includes(k),
    )) {
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

  it('rejects negative stat blocks, out-of-range percents, duplicates and engine-length texts', () => {
    const paths = errorsOf({
      ...head,
      titles: [
        { name: 'Big', bonuses: [{ stat: 'agility', percent: 20_000 }] },
        {
          name: 'Twice',
          bonuses: [
            { stat: 'agility', flat: 1 },
            { stat: 'agility', flat: 2 },
          ],
        },
        { name: 'x'.repeat(CONTENT_LIMITS.name + 1) },
      ],
      bestiary: [
        {
          name: 'Neg',
          tiers: [{ minRarity: 'common', text: 'x'.repeat(CONTENT_LIMITS.tierText + 1) }],
          stats: { strength: -3 },
        },
      ],
      skills: [
        {
          name: 'S',
          rarity: 'rare',
          flavor: 'x'.repeat(CONTENT_LIMITS.flavor + 1),
          tags: ['t'.repeat(41)],
        },
      ],
      skillOffers: [
        {
          character: 'Jake',
          level: 5,
          options: [
            { name: 'A', rarity: 'common' },
            { name: 'a', rarity: 'rare' },
          ],
        },
      ],
      evolutions: [
        {
          character: 'Jake',
          options: [
            { id: 'o1', className: 'A' },
            { id: 'o1', className: 'B' },
          ],
          professions: ['Cook', 'cook'],
        },
      ],
    }).map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'titles[0].bonuses[0].percent',
        'titles[1].bonuses',
        'titles[2].name',
        'bestiary[0].tiers[0].text',
        'bestiary[0].stats.strength',
        'skills[0].flavor',
        'skills[0].tags[0]',
        'skillOffers[0].options',
        'evolutions[0].options',
        'evolutions[0].professions',
      ]),
    );
  });
});

describe('content files as commands (M9.2)', () => {
  const ctx = testContext('cf');
  const campaign = (): Campaign =>
    run(
      [
        { type: 'campaign.create', name: 'Whale', rules: rawRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
        {
          type: 'character.create',
          id: 'kim1',
          name: 'Kim',
          className: 'Archer',
          classSkills: kit,
        },
        {
          type: 'character.create',
          id: 'kim2',
          name: 'kim',
          className: 'Archer',
          classSkills: kit,
        },
      ],
      ctx,
    );
  const example = (file: string): ContentFile => {
    const r = parseContentFile(readFileSync(path.join(examplesDir, file), 'utf8'));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.content;
  };

  it('the library and bestiary examples define through the real commands; title percents become fractions', () => {
    let c = campaign();
    for (const file of ['library.json', 'bestiary.json', 'skill-offer.json']) {
      const { commands, errors } = contentToCommands(example(file), c.state!);
      expect(errors).toEqual([]);
      for (const { path: at, command } of commands) {
        if (command.type === 'selection.offer') continue; // Needs a pending selection (M9.3).
        const r = execute(c, command, ctx);
        if (!r.ok) throw new Error(`${file} ${at}: ${r.error}`);
        c = r.campaign;
      }
    }
    const state = c.state!;
    const title = Object.values(state.titleLibrary).find((t) => t.name === 'Rapid Spread');
    expect(title?.bonuses).toEqual([
      { stat: 'agility', percent: 0.05 },
      { stat: 'endurance', flat: 2, percent: 0.05 },
    ]);
    expect(Object.values(state.skillLibrary).map((s) => s.name)).toContain("Hunter's Mark");
  });

  it('resolves characters by id or unique name, and reports the rest', () => {
    const state = campaign().state!;
    const offer = (character: string) => ({
      character,
      level: 5,
      options: [{ name: 'A', rarity: 'common' }],
    });
    const { commands, errors } = contentToCommands(
      {
        ...head,
        format: CONTENT_FORMAT,
        version: 1,
        skillOffers: [offer('JAKE'), offer('kim1'), offer('Kim'), offer('Nobody')],
      } as ContentFile,
      state,
    );
    expect(commands.map((x) => (x.command as { characterId: string }).characterId)).toEqual([
      'jake',
      'kim1',
    ]);
    expect(errors).toEqual([
      { path: 'skillOffers[2].character', message: '2 characters are named "Kim": use the id' },
      { path: 'skillOffers[3].character', message: 'No character named "Nobody"' },
    ]);
    const evo = contentToCommands(example('evolution.json'), state);
    expect(evo.errors).toEqual([]);
    expect(evo.commands[0]?.command).toMatchObject({
      type: 'evolution.release',
      characterId: 'jake',
      professions: ['Fletcher', 'Trail Cook'],
    });
  });
});
