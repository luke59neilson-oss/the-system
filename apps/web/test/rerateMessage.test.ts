import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RERATE_MESSAGE } from '../src/player/rerateMessage';

// ML.3: the re-rating message players read is Luke's, word for word (DESIGN §6, Q97).
describe('re-rating message (ML.3)', () => {
  it('matches DESIGN.md word for word', () => {
    const design = readFileSync(
      path.resolve(import.meta.dirname, '../../../docs/DESIGN.md'),
      'utf8',
    ).replace(/\s+/g, ' ');
    const quoted = /player reads, in these words \(Luke, Q97\): "([^"]+)"/.exec(design)?.[1];
    expect(quoted).toBeDefined();
    expect(RERATE_MESSAGE).toBe(quoted);
  });
});
