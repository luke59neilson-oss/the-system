// Pure filters for `npm run orient` (D297, in trial). Kept apart so tests can
// import them without printing anything.

const ITEM = /^- \[/;
const OPEN = /^\s*- \[( |~)\]/;

/**
 * One ROADMAP milestone section: open (`[ ]`) and provisional (`[~]`) items and
 * every non-item line print whole; a checked (`[x]`) item prints only its first
 * line, cut to 160 characters. Adds one note when anything was collapsed.
 */
export function collapseChecked(lines) {
  const out = [];
  let collapsed = 0;
  let inChecked = false;
  for (const l of lines) {
    if (ITEM.test(l)) {
      inChecked = !OPEN.test(l);
      if (inChecked) {
        collapsed++;
        out.push(l.length > 160 ? `${l.slice(0, 159)}…` : l);
        continue;
      }
    } else if (inChecked) {
      if (l.trim() === '' || /^#/.test(l)) inChecked = false;
      else continue;
    }
    out.push(l);
  }
  if (collapsed > 0)
    out.push(`(${collapsed} checked items collapsed to one line; grep ROADMAP.md for the ID)`);
  return out;
}

/**
 * QUESTIONS blocks still to show: no Answer line, not applied, and not a
 * question the build kept at its default without putting it to Luke.
 */
export function openQuestion(block) {
  if (block.some((l) => /\bAnswer\b|\(applied/.test(l))) return false;
  return !/Not put to Luke[^.]*default kept/.test(block.join(' '));
}
