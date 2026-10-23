import { describe, expect, it } from 'vitest';
import { currentSchemaVersion, record, sha256, verify } from './golden-manifest.mjs';

// QF.4: the pin rules, on in-memory files.
const files = { 'a.jsonl': '{"x":1}\n', 'a.state.json': '{"s":1}\n' };
const pinned = record(files, { files: {} }, 5);

describe('golden manifest', () => {
  it('pins every file by hash and the schema version it was recorded at', () => {
    expect(pinned.files['a.jsonl']).toEqual({ sha256: sha256(files['a.jsonl']), schemaVersion: 5 });
    expect(verify(files, pinned, 5)).toEqual([]);
  });

  it('fails when a log changes, even at a higher schema version, and refuses to re-record it', () => {
    const edited = { ...files, 'a.jsonl': '{"x":2}\n' };
    for (const version of [5, 6]) {
      expect(verify(edited, pinned, version)).toEqual([
        'a.jsonl changed: golden logs are never edited (add an upcaster instead)',
      ]);
      expect(() => record(edited, pinned, version)).toThrow(/Refusing to re-record/);
    }
  });

  it('fails when a state changes without a higher schema version, and refuses to re-record it', () => {
    const regenerated = { ...files, 'a.state.json': '{"s":2}\n' };
    expect(verify(regenerated, pinned, 5)).toEqual([
      'a.state.json changed without a state schema bump (pinned at v5, now v5)',
    ]);
    expect(() => record(regenerated, pinned, 5)).toThrow(/without a state schema bump/);
  });

  it('after a schema bump, a changed state must be re-recorded, which keeps unchanged pins', () => {
    const regenerated = { ...files, 'a.state.json': '{"s":2}\n' };
    expect(verify(regenerated, pinned, 6)).toEqual([
      'a.state.json changed at v6: run `npm run golden:record`',
    ]);
    const next = record(regenerated, pinned, 6);
    expect(next.files['a.state.json']?.schemaVersion).toBe(6);
    expect(next.files['a.jsonl']?.schemaVersion).toBe(5);
    expect(verify(regenerated, next, 6)).toEqual([]);
  });

  it('new files must be pinned and pinned files must exist', () => {
    expect(verify({ ...files, 'b.jsonl': 'x' }, pinned, 5)).toEqual([
      'b.jsonl is not pinned: run `npm run golden:record`',
    ]);
    expect(verify({ 'a.jsonl': files['a.jsonl'] }, pinned, 5)).toEqual([
      'a.state.json is pinned but missing',
    ]);
    expect(record({ ...files, 'b.jsonl': 'x' }, pinned, 5).files['b.jsonl']?.schemaVersion).toBe(5);
  });

  it('reads the schema version from the engine source', () => {
    expect(currentSchemaVersion('export const CAMPAIGN_STATE_SCHEMA_VERSION = 42;')).toBe(42);
    expect(() => currentSchemaVersion('nothing')).toThrow(/not found/);
  });
});
