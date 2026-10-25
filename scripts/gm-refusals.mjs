// MT.7 (DESIGN §7 GM authority, Q60): every refusal the engine can give a
// command, as a stable key, so docs/GM-OVERRIDES.md can be checked complete.
// `node scripts/gm-refusals.mjs` prints the keys grouped by file.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'packages/engine/src');
const THROW =
  /(?:new\s+(?:Character|Economy|Title|Bonus|EventRejected)(?:Rule)?Error|\bfail)\(\s*(?:event,\s*)?(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

/** A refusal's key: its message with every `${…}` written as `…`, spaces collapsed. */
export function refusalKey(message) {
  return message
    .replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
  });
}

const LITERAL = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
/** `fail(event, cond ? 'a' : 'b')`: both branches are refusals (MT.7 review). */
const TERNARY =
  /(?:new\s+\w+Error|\bfail)\(\s*(?:event,\s*)?[^'"`(),;]+\?\s*((['"`])(?:\\.|(?!\2)[\s\S])*?\2)\s*:\s*((['"`])(?:\\.|(?!\4)[\s\S])*?\4)/g;
/** A refusal whose message is a variable: `fail(event, problem)` / `new XError(problem)`. */
const VARIABLE =
  /(?:new\s+(?:Character|Economy|Title|Bonus|EventRejected)(?:Rule)?Error|\bfail)\(\s*(?:event,\s*)?([A-Za-z_]\w*)\s*\)/g;
/** A `…Problem` function: each string it returns is a refusal message. */
const PROBLEM_FN = /\n(?:export )?function (\w+Problem|itemOutOfReach|overLimit)\([\s\S]*?\n\}/g;

const unquote = (literal) => literal.slice(1, -1);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Every refusal message in the engine source, with where it is: literal
 * messages, both branches of a ternary message, and the strings `…Problem`
 * functions return (their callers pass them on as a variable).
 */
export function listRefusals() {
  const out = [];
  for (const file of files(SRC).sort()) {
    const text = readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    for (const m of text.matchAll(THROW)) {
      out.push({ file: rel, line: lineOf(text, m.index), key: refusalKey(m[2]) });
    }
    for (const m of text.matchAll(TERNARY)) {
      for (const literal of [m[1], m[3]]) {
        out.push({ file: rel, line: lineOf(text, m.index), key: refusalKey(unquote(literal)) });
      }
    }
    // `{ ok: false, error: 'literal' }` and `error: CONSTANT` results (itemOutOfReach).
    for (const m of text.matchAll(/\berror:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      const key = refusalKey(m[2]);
      // A template with a nested template ("Bad command${…`…`}") is cut short by
      // the literal pattern; keep its fixed head, which is the message.
      out.push({ file: rel, line: lineOf(text, m.index), key: key.replace(/\$\{[\s\S]*$/, '…') });
    }
    for (const m of text.matchAll(/\berror:\s*([A-Z][A-Z_]+)\b/g)) {
      const def = new RegExp(`const ${m[1]} = (['"\`])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1`).exec(text);
      if (def) out.push({ file: rel, line: lineOf(text, m.index), key: refusalKey(def[2]) });
    }
    for (const fn of text.matchAll(PROBLEM_FN)) {
      const body = fn[0];
      // A plain `return 'message';` (its text may hold a semicolon).
      for (const ret of body.matchAll(/\breturn\s+(['"`])((?:\\.|(?!\1)[\s\S])*?)\1\s*;/g)) {
        out.push({ file: rel, line: lineOf(text, fn.index + ret.index), key: refusalKey(ret[2]) });
      }
      for (const ret of body.matchAll(/\breturn\b([\s\S]*?);/g)) {
        for (const lit of ret[1].matchAll(LITERAL)) {
          const key = refusalKey(lit[2]);
          if (key.length < 8) continue; // joiners such as ', '
          out.push({ file: rel, line: lineOf(text, fn.index + ret.index), key });
        }
        // A returned constant (`return ITEM_NOT_AVAILABLE;`) is its literal.
        const name = /^\s*([A-Z][A-Z_]+)\s*$/.exec(ret[1]);
        const def = name ? new RegExp(`const ${name[1]} = '([^']*)'`).exec(text) : null;
        if (def) out.push({ file: rel, line: lineOf(text, fn.index + ret.index), key: def[1] });
      }
    }
  }
  return out;
}

/**
 * Refusals passed on as a variable. Each must be a re-thrown engine error
 * (`error.message`) or come from a `…Problem` function, whose returns
 * `listRefusals` reads; the test checks this so no message hides.
 */
export function variableRefusals() {
  const out = [];
  for (const file of files(SRC).sort()) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(VARIABLE)) {
      const before = text.slice(Math.max(0, m.index - 400), m.index);
      const source = new RegExp(`\\b${m[1]}\\s*=\\s*(\\w+)\\(`).exec(
        before
          .split(/\bconst\b/)
          .reverse()
          .find((s) => new RegExp(`^\\s*${m[1]}\\b`).test(s)) ?? '',
      );
      out.push({
        file: path.relative(ROOT, file),
        line: lineOf(text, m.index),
        variable: m[1],
        from: source ? source[1] : null,
      });
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let last = '';
  for (const r of listRefusals()) {
    if (r.file !== last) console.log(`\n## ${r.file}`);
    last = r.file;
    console.log(`- ${r.line}: ${r.key}`);
  }
}
