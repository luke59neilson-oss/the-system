import { z } from 'zod';

/**
 * Content files (ROADMAP M9.2; DESIGN §6 "often from imported files Claude
 * drafts"; D9). A content file is JSON that Claude (or the GM) writes and
 * the GM imports: library entries (skills, items, titles, bestiary) and
 * per-character drafts (skill offers, evolution options). This module only
 * checks the shape. Whether a rarity, stat, slot, grade or character exists
 * depends on the campaign's rules and state; the import (M9.3) checks that
 * and shows the GM what would change before anything applies.
 *
 * Every object is strict: an unknown key is an error, so a typo such as
 * `"rarty"` is reported instead of silently ignored. Rarities, stats, slots
 * and grades are the rules config's ids (`"rare"`, `"vitality"`, `"ring"`,
 * `"E"`); characters are named by name (any case) or id.
 *
 * `docs/CONTENT-FORMAT.md` documents it with examples, and
 * `docs/content-format.schema.json` is the same format as JSON Schema
 * (generated from these definitions; a test keeps it current).
 */

export const CONTENT_FORMAT = 'the-system/content';
export const CONTENT_FORMAT_VERSION = 1;

/** Upper bounds that keep one file from swamping the GM's review. */
export const CONTENT_LIMITS = {
  name: 100,
  text: 4000,
  tags: 12,
  entries: 500,
  options: 10,
  tiers: 8,
  bonuses: 12,
} as const;

const name = z.string().trim().min(1).max(CONTENT_LIMITS.name);
const text = z.string().max(CONTENT_LIMITS.text);
const id = z
  .string()
  .trim()
  .min(1)
  .max(CONTENT_LIMITS.name)
  .describe('An id from the rules config, e.g. "rare", "vitality", "ring", "E".');
const characterRef = name.describe('A character, by name (any case) or id.');
const statMap = z
  .record(id, z.number().int().min(-10_000).max(10_000))
  .describe('Stat id → points.');

const skillOption = z
  .strictObject({
    name,
    rarity: id,
    kind: z.enum(['class', 'profession']).optional().describe('Default "class".'),
    description: text.optional(),
  })
  .describe('One option in a skill selection menu.');

export const contentSkillSchema = z
  .strictObject({
    name,
    rarity: id,
    tags: z.array(name).max(CONTENT_LIMITS.tags).optional(),
    description: text.optional().describe('What the owner reads on their sheet.'),
    flavor: text.optional(),
    effects: text.optional().describe('Mechanical effects; shown to the owner only.'),
  })
  .describe('A skill library entry: one per name and rarity (DESIGN §6).');

export const contentItemSchema = z
  .strictObject({
    name,
    rarity: id,
    description: text.optional(),
    slot: id.nullable().optional().describe('Equipment slot id; null or omitted = not wearable.'),
    bonuses: z
      .array(z.strictObject({ stat: id, flat: z.number().int().min(-10_000).max(10_000) }))
      .max(CONTENT_LIMITS.bonuses)
      .optional()
      .describe('Flat stat bonuses only (DESIGN §4: items never give percentages).'),
  })
  .describe('An item library entry.');

export const contentTitleSchema = z
  .strictObject({
    name,
    text: text.optional().describe('System-style text shown to the player.'),
    bonuses: z
      .array(
        z
          .strictObject({
            stat: id,
            flat: z.number().int().min(-10_000).max(10_000).optional(),
            percent: z.number().min(-100).max(1000).optional(),
          })
          .refine((b) => b.flat !== undefined || b.percent !== undefined, {
            message: 'Give flat, percent or both',
          }),
      )
      .max(CONTENT_LIMITS.bonuses)
      .optional(),
  })
  .describe('A title library entry (DESIGN §4: percentages, optionally flat).');

export const contentBestiarySchema = z
  .strictObject({
    name: name.describe("The GM's own name; never sent to players."),
    label: name.optional().describe('What players see in their Identify list; defaults to name.'),
    tiers: z
      .array(z.strictObject({ minRarity: id, text: text.min(1) }))
      .min(1)
      .max(CONTENT_LIMITS.tiers)
      .describe('Identify text per minimum Identify rarity (DESIGN §7).'),
    grade: id.nullable().optional(),
    level: z.number().int().min(0).max(10_000).nullable().optional(),
    stats: statMap.nullable().optional().describe('GM-only stat block.'),
    notes: text.optional().describe('GM-only notes.'),
  })
  .refine((e) => (e.grade == null) === (e.level == null), {
    message: 'Give grade and level together, or neither',
    path: ['level'],
  })
  .describe('A bestiary entry: something players can Identify.');

export const contentSkillOfferSchema = z
  .strictObject({
    character: characterRef,
    level: z.number().int().min(1).max(10_000).describe('The class level of the selection.'),
    options: z.array(skillOption).min(1).max(CONTENT_LIMITS.options),
  })
  .describe("A drafted skill selection menu for one character's selection (DESIGN §6).");

export const contentEvolutionSchema = z
  .strictObject({
    character: characterRef,
    options: z
      .array(
        z.strictObject({
          id: id.optional().describe('Optional; "o1", "o2"... by position when omitted.'),
          className: name,
          description: text.optional(),
          transforms: z
            .array(
              z.strictObject({
                skill: name.describe('The skill it transforms (current name).'),
                name,
                rarity: id,
                merge: name.optional().describe('A second skill consumed into it.'),
              }),
            )
            .max(CONTENT_LIMITS.options)
            .optional(),
          classWeights: statMap.nullable().optional().describe('New class spread weights.'),
          statBonus: statMap.optional().describe('One-time stat bonus on evolving.'),
        }),
      )
      .min(1)
      .max(CONTENT_LIMITS.options),
    professions: z
      .array(name)
      .max(CONTENT_LIMITS.options)
      .optional()
      .describe('Professions offered (at the profession unlock grade).'),
    rerate: z
      .record(name, id)
      .optional()
      .describe('Skill name → rarity after the evolution; others drop one rarity (DESIGN §6).'),
  })
  .describe('Drafted evolution options for one character (DESIGN §2).');

const list = <T extends z.ZodType>(schema: T) =>
  z.array(schema).max(CONTENT_LIMITS.entries).optional();

export const contentFileSchema = z
  .strictObject({
    format: z.literal(CONTENT_FORMAT),
    version: z.literal(CONTENT_FORMAT_VERSION),
    title: name.optional().describe('Shown to the GM in the import queue.'),
    notes: text.optional().describe('For the GM: what this file is for.'),
    skills: list(contentSkillSchema),
    items: list(contentItemSchema),
    titles: list(contentTitleSchema),
    bestiary: list(contentBestiarySchema),
    skillOffers: list(contentSkillOfferSchema),
    evolutions: list(contentEvolutionSchema),
  })
  .describe('A content file for The System (docs/CONTENT-FORMAT.md).');

export type ContentFile = z.infer<typeof contentFileSchema>;
export type ContentSkill = z.infer<typeof contentSkillSchema>;
export type ContentItem = z.infer<typeof contentItemSchema>;
export type ContentTitle = z.infer<typeof contentTitleSchema>;
export type ContentBestiaryEntry = z.infer<typeof contentBestiarySchema>;
export type ContentSkillOffer = z.infer<typeof contentSkillOfferSchema>;
export type ContentEvolution = z.infer<typeof contentEvolutionSchema>;

/** One problem in a content file: where (`skills[2].rarity`) and what. */
export interface ContentError {
  readonly path: string;
  readonly message: string;
}

export type ContentParse =
  | { readonly ok: true; readonly content: ContentFile }
  | { readonly ok: false; readonly errors: readonly ContentError[] };

/** At most this many errors are reported; the rest are counted. */
export const MAX_CONTENT_ERRORS = 50;

function pathText(path: readonly PropertyKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else out += out === '' ? String(key) : `.${String(key)}`;
  }
  return out === '' ? '(file)' : out;
}

/**
 * Checks a content file's text (or already-parsed JSON). Never throws: bad
 * JSON, a wrong format tag or version, and shape errors all come back as
 * errors with a path, in file order, at most `MAX_CONTENT_ERRORS`.
 */
export function parseContentFile(input: string | unknown): ContentParse {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unreadable';
      return { ok: false, errors: [{ path: '(file)', message: `Not valid JSON: ${detail}` }] };
    }
  }
  // A file for another tool or a newer app version: say so before listing shape errors.
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const head = data as { format?: unknown; version?: unknown };
    if (head.format !== CONTENT_FORMAT) {
      return {
        ok: false,
        errors: [
          { path: 'format', message: `Not a content file: format must be "${CONTENT_FORMAT}"` },
        ],
      };
    }
    if (typeof head.version === 'number' && head.version > CONTENT_FORMAT_VERSION) {
      return {
        ok: false,
        errors: [
          {
            path: 'version',
            message: `Made for a newer version of the app (content version ${head.version}; this app reads ${CONTENT_FORMAT_VERSION})`,
          },
        ],
      };
    }
  }
  const result = contentFileSchema.safeParse(data);
  if (result.success) return { ok: true, content: result.data };
  const errors = result.error.issues.map((issue) => ({
    path: pathText(issue.path),
    message: issue.message,
  }));
  if (errors.length <= MAX_CONTENT_ERRORS) return { ok: false, errors };
  return {
    ok: false,
    errors: [
      ...errors.slice(0, MAX_CONTENT_ERRORS),
      { path: '(file)', message: `…and ${errors.length - MAX_CONTENT_ERRORS} more` },
    ],
  };
}

/** The content format as JSON Schema (draft 2020-12), for Claude and editors. */
export function contentJsonSchema(): unknown {
  return z.toJSONSchema(contentFileSchema, { target: 'draft-2020-12', io: 'input' });
}
