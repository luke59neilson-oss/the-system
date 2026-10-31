// QF.44: words and file names for the Campaigns and backups window.

/**
 * A backup folder name (`2026-10-31T08-09-46-123Z-session-3-end`) in words,
 * in the console's local time like every other time it shows (QF.66).
 */
export function backupLabel(name: string, timeZone?: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?Z-(.+)$/.exec(name);
  if (!m) return name;
  const [, date, h, min, sec, ms, label] = m;
  const when = new Date(`${date}T${h}:${min}:${sec}.${(ms ?? '0').padEnd(3, '0')}Z`);
  if (Number.isNaN(when.getTime())) return name;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(when)
      .map((p) => [p.type, p.value]),
  );
  const local = `${parts['year']}-${parts['month']}-${parts['day']} ${parts['hour']}:${parts['minute']}:${parts['second']}`;
  return `${local} · ${labelWords(label!)}`;
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

/** Window event: the open campaign changed (the header switch re-reads it). */
export const CAMPAIGN_CHANGED = 'the-system:campaign-changed';

/** The server's limit on a restored file (`RESTORE_MAX_BYTES` in server.ts). */
export const RESTORE_MAX_BYTES = 256 * 1024 * 1024;
