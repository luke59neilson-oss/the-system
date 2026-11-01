// MW.2 (DESIGN §6 "Building an offer", §11 "Skill-offer drafts"): the co-DM
// drafts menu options for one due selection, from a stat, from one of the
// character's skills, or from a direction the GM types. The drafts come back
// to the builder as editable rows; nothing reaches the player until the GM
// sends the menu. GM-only: the standing in the prompt never leaves this route.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  characterStanding,
  dueSelections,
  practiceSkillCounts,
  practiceStatCounts,
  recentPractice,
  type CampaignState,
} from '@the-system/engine';
import { AiError, type AiClient, type AiRequest } from './client';
import { extractJson } from './generate';
import { SHARED_SYSTEM_LINES } from './setting';
import type { CampaignStore } from '../store';

export const SKILL_DRAFT_DIRECTION_MAX = 500;
/** The prompt's fixed bound: a long campaign's standing cannot grow it past this. */
export const SKILL_DRAFT_PROMPT_MAX = 6_000;
const SKILL_DRAFT_MAX_TOKENS = 1_500;
const SKILL_DRAFT_TIMEOUT_MS = 90_000;
const MAX_SKILLS = 40;
const MAX_COUNTS = 12;
const MAX_RECENT = 8;
const RECENT_TEXT_MAX = 120;

export const skillDraftSource = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('stat'), stat: z.string().min(1).max(64) }),
  z.strictObject({ mode: z.literal('skill'), skill: z.string().min(1).max(200) }),
  z.strictObject({
    mode: z.literal('direction'),
    direction: z.string().trim().min(1).max(SKILL_DRAFT_DIRECTION_MAX),
  }),
]);
export type SkillDraftSource = z.output<typeof skillDraftSource>;

export interface SkillDraft {
  readonly name: string;
  readonly rarity: string;
  readonly kind: 'class' | 'profession';
  readonly description: string;
  readonly spell: boolean;
  readonly cost: { readonly pool: string; readonly amount: number } | null;
}

/** The prompt's line for this source; throws AiError when it cannot be drafted from. */
function sourceLine(state: CampaignState, characterId: string, source: SkillDraftSource): string {
  const c = state.characters[characterId];
  switch (source.mode) {
    case 'stat': {
      const stat = state.rules.stats.list.find((s) => s.id === source.stat);
      if (!stat) throw new AiError(`Unknown stat "${source.stat}"`, 'bad-reply');
      return `Draft from a stat: skills built around ${stat.name}.`;
    }
    case 'skill': {
      if (!c?.skills.some((s) => s.name === source.skill)) {
        throw new AiError(
          `${c?.name ?? 'The character'} has no skill "${source.skill}"`,
          'bad-reply',
        );
      }
      return `Draft from a skill: options that improve or add to [${source.skill}].`;
    }
    case 'direction':
      return `Draft from the GM's direction: ${source.direction}`;
  }
}

/** The request for one due selection; throws AiError when it is not due. */
export function buildSkillDraftRequest(
  state: CampaignState,
  characterId: string,
  level: number,
  source: SkillDraftSource,
): AiRequest {
  const { rules } = state;
  const c = state.characters[characterId];
  const standing = characterStanding(state, characterId);
  if (!c || !standing) throw new AiError('No such character', 'bad-reply');
  const slot = dueSelections(rules, c).find((s) => s.level === level);
  if (!slot) throw new AiError(`No selection is due at level ${level}`, 'bad-reply');
  const ceiling = rules.grades.find((g) => g.id === slot.grade)?.rarityCeiling ?? '';
  const ladder = rules.skills.rarities.filter((r) => !r.reserved).map((r) => r.id);
  const allowed = ladder.slice(0, ladder.indexOf(ceiling) + 1);

  const display = (n: number) =>
    (n / rules.stats.displayDivisor).toFixed(rules.stats.displayDecimals);
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const statName = (id: string) => rules.stats.list.find((s) => s.id === id)?.name ?? id;
  const counts = [
    ...practiceSkillCounts(state, characterId).map((p) => `[${p.skill}] ×${p.count}`),
    ...practiceStatCounts(state, characterId).map((p) => `${statName(p.stat)} ×${p.count}`),
  ].slice(0, MAX_COUNTS);
  const recent = recentPractice(state, characterId, MAX_RECENT).map(
    (p) => `- ${clip(p.action, RECENT_TEXT_MAX)}`,
  );
  const names = standing.skills.map((s) => s.name);

  const content = [
    'Skill-offer drafts.',
    sourceLine(state, characterId, source),
    `Selection: class level ${level}, grade ${slot.grade}.`,
    `Rarity ceiling: ${ceiling}. Use only these rarity ids: ${allowed.join(', ')}.`,
    slot.capstone
      ? `Capstone: this is the grade's last selection, so at least one draft must be ${ceiling}.`
      : 'Not a capstone.',
    `Write ${rules.skills.menuSize.min} drafts.`,
    `Pool ids for spell costs: ${rules.pools.map((p) => p.id).join(', ')}.`,
    `Character: ${c.name}, ${standing.race} ${standing.className}, class level ${standing.classLevel}` +
      (standing.profession
        ? `, ${standing.profession} level ${standing.professionLevel ?? 0}`
        : ''),
    `Stats: ${standing.stats.map((s) => `${s.name} ${display(s.total)}`).join(', ')}.`,
    `Skills (names already taken; do not reuse): ${
      standing.skills
        .slice(0, MAX_SKILLS)
        .map((s) => `[${clip(s.name, 60)}] ${s.rarity}`)
        .join(', ') || 'none'
    }${names.length > MAX_SKILLS ? ` and ${names.length - MAX_SKILLS} more` : ''}.`,
    `Titles: ${
      standing.titles
        .slice(0, MAX_COUNTS)
        .map((t) => clip(t, 60))
        .join(', ') || 'none'
    }.`,
    `Practice counts: ${counts.join(', ') || 'none yet'}.`,
    `Used together: ${
      standing.pairs.map((p) => `[${p.skills[0]}] + [${p.skills[1]}] ×${p.count}`).join(', ') ||
      'none yet'
    }.`,
    recent.length > 0 ? `Recent practice:\n${recent.join('\n')}` : 'Recent practice: none yet.',
  ].join('\n');

  return {
    role: 'strong',
    system: [
      'You are the co-DM for a LitRPG tabletop game run by the GM (style: The Primal Hunter). You draft skill options the GM may offer a character at a selection.',
      ...SHARED_SYSTEM_LINES,
      'Reply with only a JSON object: {"drafts": [{"name": string, "rarity": rarity id, "kind": "class" or "profession", "description": what the skill does in the System\'s words, "spell": true if it is cast for a cost, "cost": {"pool": pool id, "amount": whole number} or null}]}. No prose, no code fence.',
      'Build on what the character has and practises. Stay within the rarity ids given. Avoid names the character already has. A spell must carry a cost.',
    ].join('\n\n'),
    messages: [{ role: 'user', content: content.slice(0, SKILL_DRAFT_PROMPT_MAX) }],
    maxTokens: SKILL_DRAFT_MAX_TOKENS,
  };
}

const replySchema = z.object({
  drafts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        rarity: z.string().trim().min(1),
        kind: z.enum(['class', 'profession']).default('class'),
        description: z.string().trim().max(1000).default(''),
        spell: z.boolean().default(false),
        cost: z
          .object({ pool: z.string(), amount: z.number().int().positive() })
          .nullable()
          .default(null),
      }),
    )
    .min(1),
});

/**
 * The model's reply as drafts, at most a menu's worth. The ceiling, capstone,
 * name and cost checks run in the builder, where the GM's edits re-check them;
 * here a reply is refused only when it cannot become a row at all.
 */
export function parseSkillDrafts(text: string, state: CampaignState): SkillDraft[] {
  const parsed = replySchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new AiError('The co-DM replied without usable drafts; try again', 'bad-reply');
  }
  const { rules } = state;
  const rarities = new Set(rules.skills.rarities.filter((r) => !r.reserved).map((r) => r.id));
  const pools = new Set(rules.pools.map((p) => p.id));
  return parsed.data.drafts.slice(0, rules.skills.menuSize.max).map((d) => {
    const rarity = d.rarity.toLowerCase();
    if (!rarities.has(rarity)) {
      throw new AiError(`The co-DM used a rarity the rules do not have: ${d.rarity}`, 'bad-reply');
    }
    return {
      name: d.name,
      rarity,
      kind: d.kind,
      description: d.description,
      spell: d.spell || d.cost !== null,
      // A cost in a pool the rules do not have is no cost: the row's flag says so.
      cost: d.cost !== null && pools.has(d.cost.pool) ? d.cost : null,
    };
  });
}

const body = z.strictObject({
  characterId: z.string().min(1).max(200),
  level: z.number().int().positive(),
  source: skillDraftSource,
});

export function registerSkillDraftRoutes(
  app: FastifyInstance,
  options: { active: () => { store: CampaignStore } | null; client: AiClient },
): void {
  app.post('/api/gm/ai/skill-drafts', { bodyLimit: 16 * 1024 }, async (request, reply) => {
    const state = options.active()?.store.campaign.state;
    if (!state) return reply.code(404).send({ error: 'No campaign open' });
    const parsed = body.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Send { characterId, level, source }' });
    }
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort();
    });
    try {
      const { characterId, level, source } = parsed.data;
      const built = buildSkillDraftRequest(state, characterId, level, source);
      const answer = await options.client.complete({
        ...built,
        timeoutMs: SKILL_DRAFT_TIMEOUT_MS,
        signal: abort.signal,
      });
      return { drafts: parseSkillDrafts(answer.text, state) };
    } catch (e) {
      return reply.code(502).send({
        error: e instanceof AiError ? e.message : 'The co-DM could not draft options',
      });
    }
  });
}
