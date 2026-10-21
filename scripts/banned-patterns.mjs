// Patterns banned in committed code (docs/LOOP.md §5.6). Every pattern is
// assembled from pieces so neither this file nor its test matches itself.
const at = '@';
const lint = ['eslint', 'disable'].join('-');
const modifiers = [
  'sk' + 'ip',
  'on' + 'ly',
  'fix' + 'me',
  'to' + 'do',
  'sk' + 'ipIf',
  'ru' + 'nIf',
];
const mods = `(?:${modifiers.join('|')})`;

/** Applies to every code file. */
export const BANNED = [
  { name: `${at}ts-ignore`, regex: new RegExp(`${at}ts-ignore`) },
  { name: `${at}ts-nocheck`, regex: new RegExp(`${at}ts-nocheck`) },
  {
    name: `${at}ts-expect-error without a reason`,
    regex: new RegExp(`${at}ts-expect-error(?:\\s*$|\\s*\\*/)`),
  },
  { name: lint, regex: new RegExp(lint) },
];

/** Applies to test files only: any dotted or computed test modifier, or x/f aliases. */
export const BANNED_IN_TESTS = [
  { name: 'disabled or focused test', regex: new RegExp(`\\.\\s*${mods}\\b`) },
  { name: 'disabled or focused test', regex: new RegExp(`\\[\\s*['"\`]${mods}['"\`]\\s*\\]`) },
  { name: 'disabled or focused test', regex: /\b(?:xit|xdescribe|xtest|fit|fdescribe)\s*\(/ },
];

export function isTestFile(file) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || /(?:^|[\\/])e2e[\\/]/.test(file);
}

/** Returns the banned-pattern hits in a file's text, one per line. */
export function findBanned(text, { test = false } = {}) {
  const rules = test ? [...BANNED, ...BANNED_IN_TESTS] : BANNED;
  const hits = [];
  text.split('\n').forEach((line, i) => {
    const seen = new Set();
    for (const { name, regex } of rules) {
      if (!seen.has(name) && regex.test(line)) {
        seen.add(name);
        hits.push({ line: i + 1, name });
      }
    }
  });
  return hits;
}
