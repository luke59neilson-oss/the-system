import { RULES_CONFIG_VERSION, type RulesConfigInput } from './schema';

/** DESIGN.md defaults. Section numbers refer to DESIGN.md. */
export const DEFAULT_RULES: RulesConfigInput = {
  configVersion: RULES_CONFIG_VERSION,
  campaign: {
    levelCap: 240, // §2
    typicalLevelsPerSession: 6, // §3
    typicalLevelsPerSessionRange: [4, 8],
    plannedSessions: 40,
  },
  stats: {
    // §2: nine stats, everyone starts at 10, displayed in tenths.
    list: [
      { id: 'strength', name: 'Strength' },
      { id: 'agility', name: 'Agility' },
      { id: 'endurance', name: 'Endurance' },
      { id: 'vitality', name: 'Vitality' },
      { id: 'toughness', name: 'Toughness' },
      { id: 'wisdom', name: 'Wisdom' },
      { id: 'intelligence', name: 'Intelligence' },
      { id: 'perception', name: 'Perception' },
      { id: 'willpower', name: 'Willpower' },
    ],
    startingValue: 10,
    displayDivisor: 10,
    displayDecimals: 1,
  },
  // §2 derived pools (open decision).
  pools: [
    { id: 'hp', name: 'Health Points (HP)', stat: 'vitality', multiplier: 10 },
    { id: 'mp', name: 'Mana Points (MP)', stat: 'wisdom', multiplier: 10 },
    { id: 'stamina', name: 'Stamina', stat: 'endurance', multiplier: 10 },
  ],
  // §3 grades and §4 stat budget, §5 XP per level, §7 grade-gap multipliers, D13 themes.
  grades: [
    {
      id: 'G',
      topLevel: 4,
      selectionInterval: null,
      rarityCeiling: 'rare',
      classSpreadPerLevel: 4,
      freePointsPerRaceLevel: 2,
      xpPerLevel: 100,
      gradeGapMultiplier: 1,
      theme: 'aluminum',
    },
    {
      id: 'F',
      topLevel: 14,
      selectionInterval: 5,
      rarityCeiling: 'rare',
      classSpreadPerLevel: 5,
      freePointsPerRaceLevel: 3,
      xpPerLevel: 300,
      gradeGapMultiplier: 3,
      theme: 'bronze',
    },
    {
      id: 'E',
      topLevel: 49,
      selectionInterval: 5,
      rarityCeiling: 'epic',
      classSpreadPerLevel: 8,
      freePointsPerRaceLevel: 4,
      xpPerLevel: 900,
      gradeGapMultiplier: 5,
      theme: 'copper',
    },
    {
      id: 'D',
      topLevel: 99,
      selectionInterval: 10,
      rarityCeiling: 'ancient',
      classSpreadPerLevel: 12,
      freePointsPerRaceLevel: 6,
      xpPerLevel: 2700,
      gradeGapMultiplier: 10,
      theme: 'silver',
    },
    {
      id: 'C',
      topLevel: 149,
      selectionInterval: 10,
      rarityCeiling: 'legendary',
      classSpreadPerLevel: 18,
      freePointsPerRaceLevel: 9,
      xpPerLevel: 8100,
      gradeGapMultiplier: 20,
      theme: 'gold',
    },
    {
      id: 'B',
      topLevel: 199,
      selectionInterval: 10,
      rarityCeiling: 'legendary',
      classSpreadPerLevel: 27,
      freePointsPerRaceLevel: 13,
      xpPerLevel: 24300,
      gradeGapMultiplier: 40,
      theme: 'platinum',
    },
    {
      id: 'A',
      topLevel: 240,
      selectionInterval: 10,
      rarityCeiling: 'mythical',
      classSpreadPerLevel: 40,
      freePointsPerRaceLevel: 20,
      xpPerLevel: 72900,
      gradeGapMultiplier: 80,
      theme: 'diamond',
    },
  ],
  // §2 pools follow maxima: a full pool stays full when its maximum rises (D100).
  character: { defaultRace: 'Human', fullPoolsStayFull: true },
  tracks: {
    professionUnlockGrade: 'E', // §2
    evolutionGate: 'race', // §2, QUESTIONS 6
    raceLevelRounding: 'floor',
  },
  xp: {
    aboveLevelBonusPerLevel: 0.1, // §5
    aboveLevelBonusCap: 1,
    // §5 XP across grades: one grade below ⅓, two or more below 0 (MQ.10, L2).
    gradeBelowFactors: [1 / 3, 0],
    overflow: true, // §2 no banked XP, MQ.11
    defaultSplit: 'even',
  },
  bonuses: { percentCapPerStat: 0.25 }, // §4
  skills: {
    // §6 rarity ladder; Divine reserved. Unique is a tag, not a rarity.
    rarities: [
      { id: 'inferior', name: 'Inferior' },
      { id: 'common', name: 'Common' },
      { id: 'uncommon', name: 'Uncommon' },
      { id: 'rare', name: 'Rare' },
      { id: 'epic', name: 'Epic' },
      { id: 'ancient', name: 'Ancient' },
      { id: 'legendary', name: 'Legendary' },
      { id: 'mythical', name: 'Mythical' },
      { id: 'divine', name: 'Divine', reserved: true },
    ],
    startingClassSkillCount: 3, // §2
    startingRaceSkill: { name: 'Identify', rarity: 'common' },
    menuSize: { min: 3, max: 4 }, // §6
    evolutionTransforms: { min: 0, max: 2 },
    // §6 mastery marks.
    markUpgrades: {
      inferior: 3,
      common: 4,
      uncommon: 6,
      rare: 8,
      epic: 10,
      ancient: 12,
      legendary: 15,
    },
    maxMarksPerSkillPerSession: 1,
    marksCarryOver: true, // §6, MQ.4
    libraryByRarity: true, // §6 skill library, MQ.12
    merge: {
      requiredJointUses: 3,
      minRarity: 'uncommon',
      maxPerCharacterPerGrade: 1,
      rarityStepsAboveHigher: 1,
    },
  },
  practice: { selectionAlertWithinLevels: 5 }, // §7
  resolution: {
    gradeGapMode: 'gradeWalls', // §7 grade walls (Luke), MQ.5
    lowerGradeFraction: 1 / 3,
  },
  identify: { sameGradeLevelRatio: 1.5 }, // §7 Identify range, MQ.8
  montage: { minClockFill: 0.5, requireNoFailures: true }, // §7
  stability: { min: 0, max: 100, initial: 100, visibleToPlayersByDefault: false },
  hunger: { enabledByDefault: false, fadesAtGrade: 'E' }, // §7
  economy: {
    currencyName: 'Credits', // D7, QUESTIONS 2
    // §7: Zogarth's 10 armor/jewelry slots plus main and off hand.
    equipmentSlots: [
      { id: 'ring', name: 'Ring', count: 2, kind: 'jewelry' },
      { id: 'necklace', name: 'Necklace', count: 1, kind: 'jewelry' },
      { id: 'chest', name: 'Chest', count: 1, kind: 'armor' },
      { id: 'legs', name: 'Legs', count: 1, kind: 'armor' },
      { id: 'boots', name: 'Boots', count: 1, kind: 'armor' },
      { id: 'bracers', name: 'Bracers', count: 1, kind: 'armor' },
      { id: 'mask', name: 'Mask', count: 1, kind: 'armor' },
      { id: 'cloak', name: 'Cloak', count: 1, kind: 'armor' },
      { id: 'gloves', name: 'Gloves', count: 1, kind: 'armor' },
      { id: 'mainHand', name: 'Main hand', count: 1, kind: 'weapon' },
      { id: 'offHand', name: 'Off hand', count: 1, kind: 'weapon' },
    ],
  },
  logging: { autosaveMinutes: 5 }, // ROADMAP M2.4
};
