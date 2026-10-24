// Prints the run clock (LOOP §5.5): minutes since the lock, the phase and
// the next deadline. Read-only.
import { readFileSync } from 'node:fs';

let started;
try {
  started = Date.parse(JSON.parse(readFileSync('docs/LOCK.json', 'utf8')).started);
} catch {
  console.log('No lock held (docs/LOCK.json missing or unreadable).');
  process.exit(0);
}
const minute = Math.floor((Date.now() - started) / 60_000);
const phases = [
  [44, 'build', 'hand off at 44'],
  [50, 'hand-off / close-out', 'reviews not back by 50 stay unchecked'],
  [52, 'close-out', 'hard stop at 52'],
];
const hit = phases.find(([end]) => minute < end);
console.log(
  hit
    ? `minute ${minute}: ${hit[1]} (${hit[2]})`
    : `minute ${minute}: STOP: release the lock now (hard stop at 52)`,
);
