// Prints what LOOP §4 has a run read from the growing logs, and nothing else
// (D262, in trial): the PROGRESS header and last run entry; ROADMAP's global
// rules and every milestone section that still has an open (`[ ]`) or
// provisional (`[~]`) box, in full; QUESTIONS without an Answer line; the
// DECISIONS L-entries. Read-only. CLAUDE.md, DESIGN.md and ANSWERS.md are
// still read in full by the run itself.
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const out = [];
const head = (t) => out.push(`\n===== ${t} =====`);

// PROGRESS: header lines and the last entry.
const progress = read('docs/PROGRESS.md').split('\n');
head('PROGRESS.md (header)');
out.push(...progress.slice(0, 6));
const last = progress
  .map((l, i) => (l.startsWith('### ') ? i : -1))
  .filter((i) => i >= 0)
  .pop();
head('PROGRESS.md (last entry)');
out.push(...(last === undefined ? ['(none)'] : progress.slice(last)));

// ROADMAP: global rules plus every section with an open or provisional box.
const roadmap = read('docs/ROADMAP.md').split('\n');
const sections = [];
for (const [i, l] of roadmap.entries()) if (l.startsWith('## ')) sections.push(i);
sections.push(roadmap.length);
head('ROADMAP.md (global rules and open milestones)');
for (let s = 0; s + 1 < sections.length; s++) {
  const body = roadmap.slice(sections[s], sections[s + 1]);
  const title = body[0] ?? '';
  if (/Global rules/.test(title) || body.some((l) => /^\s*- \[( |~)\]/.test(l))) {
    out.push(...body);
  }
}

// QUESTIONS: entries with no Answer line yet (a question starts at "- **Q" or "### Q").
const questions = read('docs/QUESTIONS.md').split('\n');
head('QUESTIONS.md (no Answer line yet)');
let block = [];
const flush = () => {
  if (block.length && !block.some((l) => /\bAnswer\b|\(applied/.test(l))) out.push(...block);
  block = [];
};
for (const l of questions) {
  if (/^(\d+\. \*\*|- \*\*Q\d+|### Q\d+)/.test(l)) flush();
  if (block.length || /^(\d+\. \*\*|- \*\*Q\d+|### Q\d+)/.test(l)) block.push(l);
}
flush();

// DECISIONS: the L-entries (made with Luke).
head('DECISIONS.md (L-entries)');
out.push(
  ...read('docs/DECISIONS.md')
    .split('\n')
    .filter((l) => /^- L\d+/.test(l)),
);

console.log(out.join('\n'));
