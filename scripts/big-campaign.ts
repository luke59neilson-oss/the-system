// M11.3: a long campaign for load and sheet timing. Built through `execute`,
// so every event is one the server itself would have written: four Archers,
// then XP awards, practice entries, renames and System broadcasts in turn
// until the log holds `count` events. Deterministic (fixed clock and ids).
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type Command,
  type CommandContext,
} from '@the-system/engine';

export const BIG_HEROES = ['ana', 'bo', 'cy', 'di'] as const;

export function bigCampaignLines(count: number): string[] {
  let tick = 0;
  let id = 0;
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: 's1',
    now: () => new Date(Date.UTC(2026, 9, 21, 12) + 1000 * tick++).toISOString(),
    newId: () => `ev${++id}`,
  };
  const kit = [
    { name: 'Basic Archery', rarity: 'inferior' },
    { name: 'Basic Stealth', rarity: 'inferior' },
    { name: 'Archer’s Eye', rarity: 'common' },
  ];
  let campaign: Campaign = emptyCampaign();
  const lines: string[] = [];
  const run = (command: Command) => {
    const result = execute(campaign, command, ctx);
    if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
    campaign = result.campaign;
    for (const e of result.events) lines.push(JSON.stringify(e));
  };
  run({ type: 'campaign.create', name: 'Long', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) });
  for (const who of BIG_HEROES) {
    run({ type: 'character.create', id: who, name: who, className: 'Archer', classSkills: kit });
  }
  for (let i = 0; lines.length < count; i++) {
    // Each hero gets every kind in turn (hero changes every four commands).
    const who = BIG_HEROES[Math.floor(i / 4) % BIG_HEROES.length] as string;
    run(
      i % 4 === 0
        ? { type: 'xp.award', track: 'class', amount: 7, participants: [{ characterId: who }] }
        : i % 4 === 1
          ? {
              type: 'practice.log',
              characterId: who,
              action: `step ${i}`,
              skills: ['Basic Archery'],
            }
          : i % 4 === 2
            ? { type: 'character.rename', characterId: who, name: `${who} ${i}` }
            : { type: 'system.broadcast', text: `Notice ${i}`, characterIds: null },
    );
  }
  return lines;
}
