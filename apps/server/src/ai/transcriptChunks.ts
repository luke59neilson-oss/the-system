// QF.49: the co-DM reads a long session's transcript in bounded pieces, so no
// single request carries a whole evening of talk (cost, and replies cut at
// their output cap), and the read position can move after each piece.
import type { TranscriptLine } from '../speech/transcript';
import { TooLongError } from './client';

/** Characters of transcript text one request may carry (about 3k tokens). */
export const CHUNK_CHARS = 12_000;
/** Lines one request may carry, however short (a reply lists per line). */
export const CHUNK_LINES = 150;

/** One piece of the unread transcript: lines `[start, end)` of the session. */
export interface Chunk {
  readonly start: number;
  readonly end: number;
}

/**
 * Splits `lines[from..]` into consecutive chunks of at most `maxLines` lines
 * and `maxChars` characters of text (a single longer line is a chunk alone).
 */
export function transcriptChunks(
  lines: readonly TranscriptLine[],
  from: number,
  maxChars = CHUNK_CHARS,
  maxLines = CHUNK_LINES,
): Chunk[] {
  const out: Chunk[] = [];
  let start = Math.max(0, from);
  while (start < lines.length) {
    let end = start;
    let chars = 0;
    while (end < lines.length && end - start < maxLines) {
      const size = lines[end]!.text.length + (lines[end]!.speaker?.length ?? 0);
      if (end > start && chars + size > maxChars) break;
      chars += size;
      end += 1;
    }
    out.push({ start, end });
    start = end;
  }
  return out;
}

/**
 * Runs `work` on each chunk of `lines[from..]` in order. A chunk whose reply
 * was cut at its output cap (TooLongError) is split in half and the halves
 * run instead, down to one line, so a dense stretch never blocks the rest.
 * `work` returns false to stop early.
 */
export async function eachChunk(
  lines: readonly TranscriptLine[],
  from: number,
  work: (chunk: Chunk) => Promise<boolean>,
): Promise<void> {
  const queue = transcriptChunks(lines, from);
  while (queue.length > 0) {
    const chunk = queue.shift()!;
    let more: boolean;
    try {
      more = await work(chunk);
    } catch (err) {
      if (!(err instanceof TooLongError) || chunk.end - chunk.start <= 1) throw err;
      const mid = chunk.start + Math.floor((chunk.end - chunk.start) / 2);
      queue.unshift({ start: chunk.start, end: mid }, { start: mid, end: chunk.end });
      continue;
    }
    if (!more) return;
  }
}
