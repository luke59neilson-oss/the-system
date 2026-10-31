// QF.44: words and file names for the Campaigns and backups window.

/** A backup folder name (`2026-10-31T08-09-46-123Z-session-3-end`) in words. */
export function backupLabel(name: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-\d+)?Z-(.+)$/.exec(name);
  if (!m) return name;
  const [, date, h, min, sec, label] = m;
  return `${date} ${h}:${min}:${sec} UTC · ${labelWords(label!)}`;
}

function labelWords(label: string): string {
  if (label === 'manual') return 'Back up now';
  if (label === 'quit' || label.endsWith('-quit')) return 'when the app quit';
  const end = /^session-(\d+)-end$/.exec(label);
  if (end) return `end of session ${end[1]}`;
  return label.replace(/-/g, ' ');
}

/** The download's file name: the campaign's name (safe characters) and the date. */
export function exportFileName(campaignName: string | null, nowIso: string): string {
  const base =
    (campaignName ?? '')
      .normalize('NFKD')
      .replace(/[^\w -]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'campaign';
  return `${base}-${nowIso.slice(0, 10)}.the-system.json`;
}

/** "1 event" / "3 events"; "1 portrait" / "2 portraits". */
export function count(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}
