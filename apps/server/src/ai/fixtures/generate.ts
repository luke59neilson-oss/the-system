// Recorded co-DM generation replies (MC.2), one per kind plus replies that
// break the rules. Tests and the e2e fake use them; build runs never call the
// paid API (LOOP Hard rules). Each `match` is the kind line the request
// carries (see buildGenerateRequest).
import type { AiFixture } from '../fake';

const file = (body: object) =>
  JSON.stringify({ format: 'the-system/content', version: 1, ...body });

export const GENERATE_FIXTURES: readonly AiFixture[] = [
  // Broken replies first: they match on the GM's request text.
  {
    role: 'strong',
    match: 'percent bonus please',
    text: file({
      items: [
        {
          name: 'Overcharged Ring',
          rarity: 'rare',
          slot: 'ring',
          bonuses: [{ stat: 'agility', percent: 20 }],
        },
      ],
    }),
  },
  {
    role: 'strong',
    match: 'divine relic please',
    text: file({ items: [{ name: 'Shard of a God', rarity: 'divine' }] }),
  },
  {
    // Flat and allowed, but far above the 20% item cap: it imports, and the cap
    // cuts it when worn (DESIGN §4).
    role: 'strong',
    match: 'huge bonus please',
    text: file({
      items: [
        {
          name: 'Heart of the Host',
          rarity: 'rare',
          slot: 'necklace',
          bonuses: [{ stat: 'vitality', flat: 50 }],
        },
      ],
    }),
  },
  // A slow model: the GM can cancel it, and the route's time limit stops it.
  {
    role: 'strong',
    match: 'slow please',
    delayMs: 4_000,
    text: file({ regions: [{ name: 'Late' }] }),
  },
  // QF.50: a shop reply that also carries a quest and a skill the GM did not
  // ask for; the Import window leaves those unticked.
  {
    role: 'strong',
    match: 'tinker with extras',
    text: file({
      title: 'The Gut Tinker',
      shops: [
        {
          name: 'The Gut Tinker',
          keeper: 'Wren Holloway: soot-black hands, talks to her tools.',
          wares: [{ item: 'Ribcage Lantern', price: 30 }],
        },
      ],
      items: [{ name: 'Ribcage Lantern', rarity: 'common', description: 'Glows near the pulse.' }],
      quests: [
        {
          title: "The Tinker's Debt",
          text: 'Wren owes the pale hunters a lantern. Deliver it, or break it.',
          visible: false,
          notice: false,
        },
      ],
      skills: [{ name: 'Lantern Craft', rarity: 'common', description: 'Make light from bone.' }],
    }),
  },
  { role: 'strong', match: 'say hello', text: 'Hello! What would you like me to make?' },
  {
    role: 'strong',
    match: 'Kind: Shop.',
    text:
      'Here is the shop:\n```json\n' +
      file({
        title: 'Sap & Sinew, herbalist',
        shops: [
          {
            name: 'Sap & Sinew',
            keeper: 'Old Brenna, half-blind, smells of resin.',
            wares: [
              { item: 'Clotleaf Salve', price: 15 },
              { item: 'Lungmoss Tea', price: 8 },
              { item: 'Bracers of the Grove', price: 120 },
            ],
            hook: 'She pays well for pale-hunter glands.',
          },
        ],
        items: [
          { name: 'Clotleaf Salve', rarity: 'common', description: 'Stops bleeding in a breath.' },
          { name: 'Lungmoss Tea', rarity: 'common', description: 'Clears the airway caves cough.' },
          {
            name: 'Bracers of the Grove',
            rarity: 'uncommon',
            slot: 'bracers',
            bonuses: [{ stat: 'vitality', flat: 2 }],
          },
        ],
      }) +
      '\n```',
  },
  {
    role: 'strong',
    match: 'Kind: NPC.',
    text: file({
      gmNotes: [
        {
          title: 'Tamsin Reed',
          body: 'Survivor scout, wiry, chews bark. Wants: a way off the Crown. Secret: she saw the pale hunters spare a child.',
          tags: ['npc'],
        },
      ],
      bestiary: [
        {
          name: 'Tamsin Reed',
          grade: 'F',
          level: 6,
          tiers: [
            { minRarity: 'common', text: '[Human (F) – lvl 6] A scout who has not slept in days.' },
          ],
        },
      ],
    }),
  },
  {
    role: 'strong',
    match: 'Kind: Place.',
    text: file({
      regions: [
        { name: 'The Weeping Vent', notes: 'A fissure that exhales warm mist every hour.' },
      ],
    }),
  },
  {
    role: 'strong',
    match: 'Kind: Encounter.',
    text: file({
      bestiary: [
        {
          name: 'Pale Hunter Pack',
          label: 'Pale Hunter',
          grade: 'F',
          level: 8,
          tiers: [
            { minRarity: 'common', text: '[Pale Hunter – lvl 8]' },
            { minRarity: 'uncommon', text: 'It hunts what does not belong.' },
          ],
          stats: { strength: 30, agility: 40 },
          notes: 'Three of them; they flee at half strength.',
        },
      ],
      gmNotes: [{ title: 'Ambush at the rib', body: 'They drop from above in round one.' }],
    }),
  },
  {
    role: 'strong',
    match: 'Kind: Item.',
    text: file({
      items: [
        {
          name: 'Spout-Glass Lens',
          rarity: 'uncommon',
          slot: 'mask',
          bonuses: [{ stat: 'perception', flat: 2 }],
        },
      ],
    }),
  },
  {
    role: 'strong',
    match: 'Kind: Quest hook.',
    text: file({
      quests: [{ title: 'The Child the Hunters Spared', text: 'Find the child Tamsin saw.' }],
      gmNotes: [{ title: 'The spared child', body: 'The child is a seed of the Host.' }],
    }),
  },
];
