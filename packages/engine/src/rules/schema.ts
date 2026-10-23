import { z } from 'zod';

/**
 * Rules config: every number the game uses (DESIGN.md). UI and engine code read
 * rules from here, never from literals. The GM edits it in the app (M4.9).
 */

export const RULES_CONFIG_VERSION = 1;

const id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'must be a camelCase identifier starting with a letter');
const positiveInt = z.number().int().positive();

/** QF.3 defaults (D136): roomy for a 40-session journal, small enough for every view. */
export const DEFAULT_LIMITS = {
  notesPerCharacter: 300,
  noteCharsPerCharacter: 150_000,
  openTradesPerCharacter: 10,
  practiceEntriesPerCharacter: 5_000,
  practiceEntryChars: 500,
} as const;
const nonNegativeInt = z.number().int().nonnegative();
const fraction = z.number().min(0);

export const statSchema = z.strictObject({ id, name: z.string().min(1) });

export const poolSchema = z.strictObject({
  id,
  name: z.string().min(1),
  /** Stat whose value drives the pool maximum. */
  stat: id,
  /** Pool maximum = multiplier × stat value. */
  multiplier: positiveInt,
});

export const raritySchema = z.strictObject({
  id,
  name: z.string().min(1),
  /** Reserved rarities exist in the ladder but cannot be granted yet (Divine). */
  reserved: z.boolean().default(false),
});

export const gradeSchema = z.strictObject({
  id: z.string().regex(/^[A-Z]$/, 'must be a single capital letter'),
  /** Highest race/class/profession level reachable in this grade (4, 14, 49, ...). */
  topLevel: positiveInt,
  /** Class levels between selections; selections fall on multiples inside the grade. null = none. */
  selectionInterval: positiveInt.nullable(),
  /** Highest skill rarity available while in this grade. */
  rarityCeiling: id,
  /** Automatic class stat points per class level gained in this grade. */
  classSpreadPerLevel: nonNegativeInt,
  /** Free stat points per race level gained in this grade. */
  freePointsPerRaceLevel: nonNegativeInt,
  /** XP needed per level while the character is in this grade. */
  xpPerLevel: positiveInt,
  /**
   * Grade-gap mode "multiplier" (DESIGN §7: "grade bonus multiplier per 10
   * points"): each side's stat value is multiplied by its grade's factor before
   * the ratio is taken. M1.11 owns the exact formula.
   */
  gradeGapMultiplier: z.number().positive(),
  /** Metallic theme token (M8.1). */
  theme: z.string().min(1),
});

export const equipmentSlotSchema = z.strictObject({
  id,
  name: z.string().min(1),
  count: positiveInt,
  kind: z.enum(['armor', 'jewelry', 'weapon']),
});

export const rulesConfigSchema = z
  .strictObject({
    configVersion: z.literal(RULES_CONFIG_VERSION),
    campaign: z.strictObject({
      /** Campaign level cap (DESIGN §2: 240 for now). */
      levelCap: positiveInt,
      /** Pacing target shown to the GM ("typical session ≈ 6 levels"). */
      typicalLevelsPerSession: positiveInt,
      typicalLevelsPerSessionRange: z.tuple([positiveInt, positiveInt]),
      plannedSessions: positiveInt,
    }),
    stats: z.strictObject({
      list: z.array(statSchema).min(1),
      startingValue: positiveInt,
      /** Modifier = stat ÷ displayDivisor, shown with displayDecimals (10 → 1.0). */
      displayDivisor: positiveInt,
      displayDecimals: nonNegativeInt.max(4),
    }),
    pools: z.array(poolSchema).min(1),
    grades: z.array(gradeSchema).min(1),
    character: z.strictObject({
      /** Race every new character starts as (DESIGN §2: Earth's humans). */
      defaultRace: z.string().min(1),
      /**
       * DESIGN §2 (MQ.2, D100): when a pool maximum rises, a full pool stays
       * full. Rules stored before it read false (D81: a rising maximum never
       * changes the pool), so older campaigns replay unchanged.
       */
      fullPoolsStayFull: z.boolean().default(false),
      /**
       * DESIGN §2 (MQ.15, L7): a pool clamped by a falling maximum stays full
       * only if it was full before the drop, so swapping gear never heals.
       * Rules stored before it read false (D111's literal reading).
       */
      clampedPoolsNotFull: z.boolean().default(false),
    }),
    tracks: z.strictObject({
      /** Grade at whose evolution professions are first offered. */
      professionUnlockGrade: z.string(),
      /** What opens an evolution: race level or class level at the grade top. */
      evolutionGate: z.enum(['race', 'class']),
      /** Race level = floor(average(class, profession)) once a profession exists. */
      raceLevelRounding: z.literal('floor'),
    }),
    xp: z.strictObject({
      /** Bonus per level the enemy is above the character (0.10 = +10%). */
      aboveLevelBonusPerLevel: fraction,
      aboveLevelBonusCap: fraction,
      /**
       * XP factor for defeating a target 1, 2, … grades below the character
       * (MQ.10, DESIGN §5); gaps past the end use the last entry. Empty (stored
       * campaigns from before MQ.10) means no reduction.
       */
      gradeBelowFactors: z.array(fraction.max(1)).max(10).default([]),
      /**
       * DESIGN §2 (MQ.11, L3): XP a capped track cannot use goes to the other
       * track, and is lost when neither can use it. Rules stored before it
       * read false (XP banks at the grade's top), so older logs replay unchanged.
       */
      overflow: z.boolean().default(false),
      defaultSplit: z.literal('even'),
    }),
    bonuses: z.strictObject({
      /** Cap on the sum of percentage bonuses per stat (0.25 = +25%); null = no cap (L8). */
      percentCapPerStat: fraction.nullable(),
      /**
       * DESIGN §4 (MQ.14, L6): the total item bonus on a stat is capped at this
       * fraction of the stat's base (0.2 = 20%). Rules stored before it read
       * null (no item cap), so older logs replay unchanged.
       */
      itemCapOfBase: fraction.nullable().default(null),
      /**
       * DESIGN §4 (MQ.14, L6): items carry flat stat bonuses only; item
       * definitions with percentages are refused and stored ones count 0%.
       * Rules stored before it read false.
       */
      itemsFlatOnly: z.boolean().default(false),
    }),
    skills: z.strictObject({
      rarities: z.array(raritySchema).min(2),
      startingClassSkillCount: positiveInt,
      startingRaceSkill: z.strictObject({ name: z.string().min(1), rarity: id }),
      menuSize: z.strictObject({ min: positiveInt, max: positiveInt }),
      evolutionTransforms: z.strictObject({ min: nonNegativeInt, max: positiveInt }),
      /** Marks needed to upgrade FROM the keyed rarity to the next one. */
      markUpgrades: z.record(z.string(), positiveInt),
      maxMarksPerSkillPerSession: positiveInt,
      /**
       * DESIGN §6 (MQ.4, D101, D113, D114): marks beyond an upgrade's cost carry into the
       * next rarity. Rules stored before it read false (marks reset to 0), so
       * older campaigns replay unchanged.
       */
      marksCarryOver: z.boolean().default(false),
      /**
       * DESIGN §6 skill library (MQ.12, L4): entries keyed by name and rarity;
       * library text follows to every copy the GM has not edited. Rules stored
       * before it read false (name-only fill of empty text, D90).
       */
      libraryByRarity: z.boolean().default(false),
      merge: z.strictObject({
        requiredJointUses: positiveInt,
        minRarity: id,
        maxPerCharacterPerGrade: positiveInt,
        rarityStepsAboveHigher: positiveInt,
      }),
    }),
    practice: z.strictObject({
      /** Selection alert fires within this many class levels of a selection. */
      selectionAlertWithinLevels: positiveInt,
    }),
    resolution: z.strictObject({
      gradeGapMode: z.enum(['none', 'multiplier', 'lowerGradeFraction', 'gradeWalls']),
      /** Stat (and, in "gradeWalls", damage) factor for a side one grade lower (⅓). */
      lowerGradeFraction: z.number().positive().max(1),
    }),
    /**
     * DESIGN §7 Identify range (MQ.8, D107): a same-grade target is
     * identifiable only up to this many times the viewer's race level.
     */
    identify: z
      .strictObject({ sameGradeLevelRatio: z.number().positive().max(100) })
      .default({ sameGradeLevelRatio: 1.5 }),
    montage: z.strictObject({
      /** Clock fill fraction needed before a montage is offered. */
      minClockFill: z.number().min(0).max(1),
      requireNoFailures: z.boolean(),
    }),
    stability: z.strictObject({
      min: z.number(),
      max: z.number(),
      initial: z.number(),
      visibleToPlayersByDefault: z.boolean(),
    }),
    hunger: z.strictObject({
      enabledByDefault: z.boolean(),
      fadesAtGrade: z.string(),
    }),
    economy: z.strictObject({
      currencyName: z.string().min(1),
      equipmentSlots: z.array(equipmentSlotSchema).min(1),
    }),
    logging: z.strictObject({
      autosaveMinutes: positiveInt,
    }),
    /**
     * Caps on what one character can create (QF.3), so one phone cannot fill
     * every client's view. Checked on commands, never on replay, so stored
     * logs replay unchanged; rules stored before QF.3 read the defaults.
     */
    limits: z
      .strictObject({
        /** Notes a character has written (journal and party). */
        notesPerCharacter: positiveInt.default(DEFAULT_LIMITS.notesPerCharacter),
        /** Characters across those notes' titles, bodies and tags. */
        noteCharsPerCharacter: positiveInt.default(DEFAULT_LIMITS.noteCharsPerCharacter),
        /** Trades a character has proposed that are still open. */
        openTradesPerCharacter: positiveInt.default(DEFAULT_LIMITS.openTradesPerCharacter),
        /** Practice entries a player may log for their character (the GM is not capped). */
        practiceEntriesPerCharacter: positiveInt.default(
          DEFAULT_LIMITS.practiceEntriesPerCharacter,
        ),
        /** Characters in one player-logged practice entry (action, skills and tags). */
        practiceEntryChars: positiveInt.default(DEFAULT_LIMITS.practiceEntryChars),
      })
      .default(DEFAULT_LIMITS),
  })
  .superRefine((config, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: 'custom', path, message });
    };
    const duplicates = (ids: string[]): string[] => [
      ...new Set(ids.filter((value, index) => ids.indexOf(value) !== index)),
    ];

    const statIds = config.stats.list.map((s) => s.id);
    for (const dup of duplicates(statIds)) issue(['stats', 'list'], `duplicate stat id "${dup}"`);
    config.pools.forEach((pool, i) => {
      if (!statIds.includes(pool.stat)) {
        issue(['pools', i, 'stat'], `unknown stat "${pool.stat}" (known: ${statIds.join(', ')})`);
      }
    });
    for (const dup of duplicates(config.pools.map((p) => p.id))) {
      issue(['pools'], `duplicate pool id "${dup}"`);
    }

    const rarityIds = config.skills.rarities.map((r) => r.id);
    for (const dup of duplicates(rarityIds)) {
      issue(['skills', 'rarities'], `duplicate rarity id "${dup}"`);
    }
    const reservedSeen = config.skills.rarities.findIndex((r) => r.reserved);
    if (
      reservedSeen !== -1 &&
      config.skills.rarities.slice(reservedSeen).some((r) => !r.reserved)
    ) {
      issue(['skills', 'rarities'], 'reserved rarities must come last in the ladder');
    }
    const grantable = config.skills.rarities.filter((r) => !r.reserved).map((r) => r.id);
    const knownRarity = (value: string, path: (string | number)[]): void => {
      if (!rarityIds.includes(value)) {
        issue(path, `unknown rarity "${value}" (known: ${rarityIds.join(', ')})`);
      } else if (!grantable.includes(value)) {
        issue(path, `rarity "${value}" is reserved and cannot be used yet`);
      }
    };

    const gradeIds = config.grades.map((g) => g.id);
    for (const dup of duplicates(gradeIds)) issue(['grades'], `duplicate grade id "${dup}"`);
    config.grades.forEach((grade, i) => {
      knownRarity(grade.rarityCeiling, ['grades', i, 'rarityCeiling']);
      const previous = config.grades[i - 1];
      if (
        previous &&
        rarityIds.indexOf(grade.rarityCeiling) < rarityIds.indexOf(previous.rarityCeiling)
      ) {
        issue(
          ['grades', i, 'rarityCeiling'],
          `grade ${grade.id}'s ceiling must not be below grade ${previous.id}'s ("${previous.rarityCeiling}")`,
        );
      }
      const previousTop = previous?.topLevel ?? 0;
      if (grade.topLevel <= previousTop) {
        issue(
          ['grades', i, 'topLevel'],
          `must be greater than the previous grade's (${previousTop})`,
        );
      }
      if (grade.selectionInterval !== null) {
        const first =
          Math.floor(previousTop / grade.selectionInterval + 1) * grade.selectionInterval;
        if (first > grade.topLevel) {
          issue(
            ['grades', i, 'selectionInterval'],
            `no selection level falls inside levels ${previousTop + 1}-${grade.topLevel}`,
          );
        }
      }
    });
    // The cap must be the top of some grade, so every grade up to it is complete.
    // Grades above the cap may be defined ahead of time (e.g. S) but are unreachable.
    const tops = config.grades.map((g) => g.topLevel);
    if (!tops.includes(config.campaign.levelCap)) {
      issue(['campaign', 'levelCap'], `must equal the top level of a grade (${tops.join(', ')})`);
    }
    if (config.grades[0]?.id === config.tracks.professionUnlockGrade) {
      issue(
        ['tracks', 'professionUnlockGrade'],
        'must be a grade reached by evolving (not the first)',
      );
    }
    for (const [path, value] of [
      [['tracks', 'professionUnlockGrade'], config.tracks.professionUnlockGrade],
      [['hunger', 'fadesAtGrade'], config.hunger.fadesAtGrade],
    ] as const) {
      if (!gradeIds.includes(value)) {
        issue([...path], `unknown grade "${value}" (known: ${gradeIds.join(', ')})`);
      }
    }

    knownRarity(config.skills.startingRaceSkill.rarity, ['skills', 'startingRaceSkill', 'rarity']);
    knownRarity(config.skills.merge.minRarity, ['skills', 'merge', 'minRarity']);
    const upgradable = config.skills.rarities.slice(0, -1).filter((r, i) => {
      const next = config.skills.rarities[i + 1];
      return !r.reserved && next !== undefined && !next.reserved;
    });
    for (const rarity of upgradable) {
      if (!Object.hasOwn(config.skills.markUpgrades, rarity.id)) {
        issue(['skills', 'markUpgrades'], `missing mark cost to upgrade from "${rarity.id}"`);
      }
    }
    for (const key of Object.keys(config.skills.markUpgrades)) {
      if (!upgradable.some((r) => r.id === key)) {
        issue(['skills', 'markUpgrades', key], `"${key}" is not an upgradable rarity`);
      }
    }
    if (config.skills.menuSize.min > config.skills.menuSize.max) {
      issue(['skills', 'menuSize'], 'min must not exceed max');
    }
    if (config.skills.evolutionTransforms.min > config.skills.evolutionTransforms.max) {
      issue(['skills', 'evolutionTransforms'], 'min must not exceed max');
    }
    const [low, high] = config.campaign.typicalLevelsPerSessionRange;
    if (low > high) issue(['campaign', 'typicalLevelsPerSessionRange'], 'low must not exceed high');
    const typical = config.campaign.typicalLevelsPerSession;
    if (typical < low || typical > high) {
      issue(['campaign', 'typicalLevelsPerSession'], `must be within the range ${low}-${high}`);
    }

    if (config.stability.min >= config.stability.max) {
      issue(['stability', 'min'], 'must be less than max');
    }
    if (
      config.stability.initial < config.stability.min ||
      config.stability.initial > config.stability.max
    ) {
      issue(['stability', 'initial'], 'must be between min and max');
    }
    for (const dup of duplicates(config.economy.equipmentSlots.map((s) => s.id))) {
      issue(['economy', 'equipmentSlots'], `duplicate slot id "${dup}"`);
    }
  });

/** Parsed, validated rules config. */
export type RulesConfig = z.output<typeof rulesConfigSchema>;
/** Rules config as authored (defaults not yet applied). */
export type RulesConfigInput = z.input<typeof rulesConfigSchema>;
export type GradeRules = RulesConfig['grades'][number];
