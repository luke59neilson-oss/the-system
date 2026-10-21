import { emptyCampaign, execute, type Campaign, type Command, type DomainEvent } from '../events';
import { DEFAULT_RULES } from '../rules';
import { STARTER_CLASSES } from './starters';

/**
 * The demo campaign (ROADMAP MS.4): a ready-made party for trying the app out,
 * kept in its own campaign so it never mixes into a real one (D53). It is
 * built from ordinary GM commands, so it is exactly what a GM could have
 * typed. Grades above G, titles, items and the World Stability quest join it
 * as the engine learns them (ROADMAP M1.15).
 */
export const DEMO_CAMPAIGN_NAME = 'Demo: The Whale (practice campaign)';

export interface DemoCharacter {
  readonly id: string;
  readonly name: string;
  /** Class XP awarded on creation (G-grade: 100 XP per level). */
  readonly xp: number;
}

export const DEMO_CHARACTERS: readonly DemoCharacter[] = [
  { id: 'demo-jake', name: 'Jake', xp: 450 },
  { id: 'demo-miranda', name: 'Miranda', xp: 320 },
  { id: 'demo-casper', name: 'Casper', xp: 210 },
  { id: 'demo-sultan', name: 'Sultan', xp: 60 },
];

export const DEMO_BROADCASTS: readonly string[] = [
  'The world is dying. Find what is killing it. Delve to the heart of the world and purge the infection. Time remaining: 30 days.',
  'Welcome to the demo campaign. Nothing here touches your real campaign.',
];

export interface DemoContext {
  readonly now: () => string;
  readonly newId: () => string;
}

/** The GM commands that build the demo, in order. */
export function demoCommands(): Command[] {
  const archer = STARTER_CLASSES[0];
  if (!archer) throw new Error('No starter class');
  const commands: Command[] = [
    { type: 'campaign.create', name: DEMO_CAMPAIGN_NAME, rules: DEFAULT_RULES },
  ];
  for (const c of DEMO_CHARACTERS) {
    commands.push({
      type: 'character.create',
      id: c.id,
      name: c.name,
      className: archer.name,
      classSkills: archer.skills,
      classWeights: archer.weights,
    });
  }
  for (const c of DEMO_CHARACTERS) {
    commands.push({
      type: 'xp.award',
      track: 'class',
      amount: c.xp,
      participants: [{ characterId: c.id }],
      reason: 'Demo campaign starting XP',
    });
  }
  for (const text of DEMO_BROADCASTS) {
    commands.push({ type: 'system.broadcast', text, characterIds: null });
  }
  return commands;
}

/**
 * Runs the demo commands as the GM on an empty campaign and returns the events
 * to append. Throws if any command is refused (a bug in the demo content).
 */
export function buildDemoEvents(ctx: DemoContext): DomainEvent[] {
  let campaign: Campaign = emptyCampaign();
  const events: DomainEvent[] = [];
  for (const command of demoCommands()) {
    const result = execute(campaign, command, {
      actor: { role: 'gm' },
      sessionId: null,
      now: ctx.now,
      newId: ctx.newId,
    });
    if (!result.ok) throw new Error(`Demo command ${command.type} refused: ${result.error}`);
    campaign = result.campaign;
    events.push(...result.events);
  }
  return events;
}
