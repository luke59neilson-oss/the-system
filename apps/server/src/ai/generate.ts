// Co-DM generation on demand (MC.2, DESIGN §11). The GM picks a kind and
// says what the table needs; the strong model writes content in the existing
// content format, and the reply goes through the same preview as an imported
// file, so every rules check applies (flat item bonuses, the 20% cap, rarity
// ceilings, grades) and nothing changes until the GM approves it. All of it
// is GM-only: the campaign context below never leaves the GM's routes.
import {
  CONTENT_FORMAT,
  CONTENT_FORMAT_VERSION,
  contentJsonSchema,
  type CampaignState,
} from '@the-system/engine';
import { AiError, type AiRequest } from './client';
import { loreForRequest, loreLines } from './quickResponses';

export const GENERATE_KINDS = ['shop', 'npc', 'place', 'encounter', 'item', 'questHook'] as const;
export type GenerateKind = (typeof GENERATE_KINDS)[number];

export const GENERATE_LABELS: Readonly<Record<GenerateKind, string>> = {
  shop: 'Shop',
  npc: 'NPC',
  place: 'Place',
  encounter: 'Encounter',
  item: 'Item',
  questHook: 'Quest hook',
};

/** Where each kind lands in the content format. */
const KIND_GUIDE: Readonly<Record<GenerateKind, string>> = {
  shop: 'A shop: one `shops` entry (name, place if known, keeper NPC, wares naming the items it sells with whole prices in the campaign currency, an optional hook) and the 2–5 `items` it sells, defined in the same file.',
  npc: 'An NPC: one `gmNotes` entry (name, look, wants, secret, how they talk) and, if players could Identify them, one `bestiary` entry with grade, level and tiers.',
  place:
    'A place: one `regions` entry (name, GM notes) and, if it holds something players could Identify, one `bestiary` entry without grade or level.',
  encounter:
    'An encounter: 1–3 `bestiary` entries at sensible grades and levels for the party (tiers, stats, notes) and one `gmNotes` entry with how the fight plays.',
  item: 'An item: 1–3 `items` entries. Flat stat bonuses only, never percentages; keep each bonus small (the total item bonus on a stat is capped at 20% of its base).',
  questHook:
    'A quest hook: one `quests` entry (title, text players read; hidden only if it should start secret) and one `gmNotes` entry with what is really going on.',
};

export const GENERATE_PROMPT_MAX = 2_000;
export const GENERATE_MAX_TOKENS = 4_000;
/** A 4,000-token reply from the strong model can take a minute or more. */
export const GENERATE_TIMEOUT_MS = 150_000;

/**
 * GM-only campaign context for the model: the party, where it is, the
 * active quests, regions and the currency. Bounded so a long campaign does
 * not blow the request up.
 */
export function campaignContext(state: CampaignState): string {
  const lines: string[] = [`Campaign: ${state.name}. In-game day ${state.day}.`];
  const party = state.characterOrder
    .map((id) => state.characters[id])
    .filter((c) => c !== undefined)
    .slice(0, 12)
    .map(
      (c) =>
        `- ${c.name}: ${c.race} ${c.className}, grade ${c.grade}, class level ${c.classLevel}` +
        (c.profession ? `, ${c.profession} level ${c.professionLevel}` : ''),
    );
  lines.push('Party:', ...(party.length ? party : ['- (no characters yet)']));
  const here = state.currentRegion ? state.regions[state.currentRegion] : undefined;
  if (here) lines.push(`Current region: ${here.name}.`);
  const regions = state.regionOrder
    .map((id) => state.regions[id]?.name)
    .filter((n): n is string => typeof n === 'string')
    .slice(0, 30);
  if (regions.length) lines.push(`Known regions: ${regions.join(', ')}.`);
  const quests = state.questOrder
    .map((id) => state.quests[id])
    .filter((q) => q?.status === 'active')
    .slice(0, 20)
    .map((q) => `- ${q?.title ?? ''}`);
  if (quests.length) lines.push('Active quests:', ...quests);
  lines.push(`Currency: ${state.rules.economy.currencyName}.`);
  return lines.join('\n');
}

export function buildGenerateRequest(
  kind: GenerateKind,
  prompt: string,
  state: CampaignState,
): AiRequest {
  const system = [
    'You are the co-DM for a LitRPG tabletop game run by the GM (style: The Primal Hunter; the System, status screens, skill rarities).',
    `Write content for the GM in The System's content format: one JSON object with "format": "${CONTENT_FORMAT}" and "version": ${CONTENT_FORMAT_VERSION}, using only the sections and keys in this JSON Schema (unknown keys are errors):`,
    JSON.stringify(contentJsonSchema()),
    'Ids (rarities, stats, slots, grades) are lower-case rules ids as in the schema, grades G–A. Items give flat stat bonuses only.',
    'Reply with only the JSON object: no prose, no code fence.',
  ].join('\n\n');
  const content = [
    `Kind: ${GENERATE_LABELS[kind]}. ${KIND_GUIDE[kind]}`,
    `What the GM asked for: ${prompt.trim() || '(nothing more; use the context)'}`,
    'Campaign context (GM-only):',
    campaignContext(state),
  ];
  // MD.3: kept lore for the current place and any NPC the GM names; do not contradict it.
  const here = state.currentRegion ? (state.regions[state.currentRegion]?.name ?? null) : null;
  const lore = loreLines(loreForRequest(Object.values(state.notes), here, prompt));
  if (lore.length) content.push(['Kept lore (do not contradict):', ...lore].join('\n'));
  return {
    role: 'strong',
    system,
    messages: [{ role: 'user', content: content.join('\n\n') }],
    maxTokens: GENERATE_MAX_TOKENS,
  };
}

/**
 * The JSON object in a reply. Models sometimes wrap it in a code fence or a
 * sentence despite the instructions, so the outermost braces are taken.
 */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AiError('The co-DM did not reply with content (no JSON object)', 'bad-reply');
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    throw new AiError('The co-DM replied with broken JSON; try Regenerate', 'bad-reply');
  }
}
