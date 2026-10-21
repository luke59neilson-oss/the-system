// Patterns banned in committed code (docs/LOOP.md §5.6). Every pattern is
// assembled from pieces so neither this file nor its test matches itself.
const at = '@';
const dot = '\\s*\\.\\s*';
const runners = '\\b(?:describe|it|test|suite)';
const lint = ['eslint', 'disable'].join('-');

export const BANNED = [
  {
    name: 'focused or skipped test',
    regex: new RegExp(`${runners}${dot}(?:${'sk' + 'ip'}|${'on' + 'ly'})\\b`),
  },
  { name: `${at}ts-ignore`, regex: new RegExp(`${at}ts-ignore`) },
  { name: `${at}ts-nocheck`, regex: new RegExp(`${at}ts-nocheck`) },
  {
    name: `${at}ts-expect-error without a reason`,
    regex: new RegExp(`${at}ts-expect-error(?:\\s*$|\\s*\\*/)`),
  },
  { name: lint, regex: new RegExp(lint) },
];

/** Returns the banned-pattern hits in a file's text, one per line. */
export function findBanned(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    for (const { name, regex } of BANNED) {
      if (regex.test(line)) hits.push({ line: i + 1, name });
    }
  });
  return hits;
}
