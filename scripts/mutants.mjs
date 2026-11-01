#!/usr/bin/env node
// QF.60: re-applies the mutations that once survived with no test and checks
// that a test now fails for each. Slow (one vitest run per mutant), so it is
// not part of `npm run check`: run `npm run mutants` after changing these areas.
// Each mutant is restored from its original text, whatever the outcome.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const E = 'packages/engine/src';
const S = 'apps/server/src';
const T = 'packages/engine/test';
const ST = 'apps/server/test';

/** [label, file, original text, mutated text, test file]. */
export const MUTANTS = [
  [
    'one-field progression notice',
    `${E}/history/gmChanges.ts`,
    'if (String(from) !== String(to))',
    "if (String(from) !== String(to) || label === 'Grade')",
    `${T}/playerLog.test.ts`,
  ],
  [
    'equip falls into a skill notice',
    `${E}/history/gmChanges.ts`,
    "...(name === '' ? {} : { subject: name }),\n      });\n      break;",
    "...(name === '' ? {} : { subject: name }),\n      });",
    `${T}/playerLog.test.ts`,
  ],
  [
    "another character's practice",
    `${E}/projection/player.ts`,
    'return state.practice.filter((e) => e.characterId === c.id).flatMap((e) => e.skills);',
    'return state.practice.flatMap((e) => e.skills);',
    `${T}/evolution.test.ts`,
  ],
  [
    'top-rarity marksToUpgrade',
    `${E}/skills/model.ts`,
    'if (needed === undefined || !next || next.reserved) return null;',
    'if (needed === undefined || !next) return null;',
    `${T}/qf60.test.ts`,
  ],
  [
    'unknown rarity',
    `${E}/skills/model.ts`,
    'if (index === -1) throw new CharacterRuleError(`Unknown rarity "${rarity}"`);',
    '',
    `${T}/qf60.test.ts`,
  ],
  [
    'transform names vs selection menus',
    `${E}/evolution/model.ts`,
    'if (menu.chosen === null && menu.options.some',
    'if (menu.options.some',
    `${T}/evolution.test.ts`,
  ],
  [
    'single-stat evolution bonus',
    `${E}/evolution/model.ts`,
    'if (entries.length === 0) return character;',
    'if (entries.length <= 1) return character;',
    `${T}/evolution.test.ts`,
  ],
  [
    'blank profession guard',
    `${E}/evolution/model.ts`,
    "  if (trimmed.some((p) => p === '')) throw new CharacterRuleError('A profession needs a name');",
    '',
    `${T}/evolution.test.ts`,
  ],
  [
    'campaigns list without a dir',
    `${S}/store.ts`,
    '    if (!existsSync(dir)) return [];\n',
    '',
    `${ST}/store.test.ts`,
  ],
  [
    'IP octet 255',
    `${S}/security.ts`,
    'Number(n) <= 255',
    'Number(n) < 255',
    `${ST}/security.test.ts`,
  ],
  [
    'blank transcript target',
    `${S}/ai/quickResponses.ts`,
    "if (text === '') return false;",
    "if (text === '') return true;",
    `${ST}/quickResponses.test.ts`,
  ],
  [
    'replayed cast of a missing skill',
    `${E}/events/reducer.ts`,
    '      if (!character.skills.some((s) => s.name === skill)) {\n        fail(event, `${character.name} has no skill "${skill}"`);\n      }\n',
    '',
    `${T}/cast.test.ts`,
  ],
  [
    'stability range min = max',
    `${E}/projection/player.ts`,
    'if (!(max > min)) return 100;',
    'if (!(max >= min)) return 100;',
    `${T}/quests.test.ts`,
  ],
];

let survived = 0;
for (const [label, file, from, to, test] of MUTANTS) {
  const original = readFileSync(file, 'utf8');
  const count = original.split(from).length - 1;
  if (count !== 1) {
    console.log(`?  ${label}: the original text appears ${count} times in ${file}; update MUTANTS`);
    survived++;
    continue;
  }
  writeFileSync(file, original.replace(from, to));
  try {
    const run = spawnSync('npx', ['vitest', 'run', test], {
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
    });
    const killed = run.status !== 0;
    if (!killed) survived++;
    console.log(`${killed ? 'ok' : 'SURVIVED'}  ${label} (${test})`);
  } finally {
    writeFileSync(file, original);
  }
}
console.log(`${MUTANTS.length - survived} of ${MUTANTS.length} mutants killed`);
process.exit(survived === 0 ? 0 : 1);
