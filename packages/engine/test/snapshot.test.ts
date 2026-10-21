import { describe, expect, it } from 'vitest';
import { replay, resume, snapshotOf, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const commands: Command[] = [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.rename', characterId: 'jake', name: 'Jake T.' },
  {
    type: 'xp.award',
    track: 'class',
    amount: 250,
    participants: [{ characterId: 'jake' }],
  },
];

describe('snapshots and resume', () => {
  const full = run(commands);
  const raw = JSON.parse(JSON.stringify(full.events)) as unknown[];

  it('resumes from a matching snapshot to the replayed campaign', () => {
    const { campaign, usedSnapshot } = resume(snapshotOf(full), raw);
    expect(usedSnapshot).toBe(true);
    expect(campaign).toEqual(replay(raw));
  });

  it('appends the tail after the snapshot, including undo of an event inside it', () => {
    const prefix = run(commands.slice(0, 3));
    const ctx = testContext('t');
    const more = run(
      [
        commands[3] as Command,
        { type: 'event.undo', eventId: 'e3' }, // the rename, inside the snapshot
      ],
      ctx,
      prefix,
    );
    const all = JSON.parse(JSON.stringify(more.events)) as unknown[];
    const { campaign, usedSnapshot } = resume(snapshotOf(prefix), all);
    expect(usedSnapshot).toBe(true);
    expect(campaign).toEqual(replay(all));
    expect(campaign.state?.characters.jake?.name).toBe('Jake');
  });

  it('falls back to full replay on any mismatch', () => {
    const snap = snapshotOf(full);
    const empty = snapshotOf(run([]));
    for (const bad of [
      null,
      { ...snap, lastEventId: 'nope' },
      // A rules migration since the snapshot: its state.rules is stale (M1.A).
      { ...snap, rulesConfigVersion: snap.rulesConfigVersion - 1 },
      { ...snap, format: 1 },
      { ...snap, eventCount: raw.length + 1 },
      { ...snap, eventCount: 1.5 },
      { ...snap, format: 3 },
      { ...snap, stateSchemaVersion: 1 },
      { ...snap, eventVersions: { ...snap.eventVersions, extra: 1 } },
      { ...snap, undone: { e2: 'e9' } },
      { ...snap, rawUpcasters: 1 },
      { ...snap, eventVersions: null } as unknown as typeof snap,
      5 as unknown as typeof snap,
      { ...snap, state: null },
      { ...empty, eventCount: 0, state: snap.state },
    ]) {
      const { campaign, usedSnapshot } = resume(bad, raw);
      expect(usedSnapshot).toBe(false);
      expect(campaign).toEqual(full);
    }
    expect(resume(empty, raw)).toEqual({ campaign: full, usedSnapshot: true });
  });

  it('replays in full when the tail does not apply on top of the snapshot body', () => {
    const prefix = snapshotOf(run(commands.slice(0, 3)));
    const wrongBody = { ...prefix, state: snapshotOf(run(commands.slice(0, 1))).state };
    const { campaign, usedSnapshot } = resume(wrongBody, raw);
    expect(usedSnapshot).toBe(false);
    expect(campaign).toEqual(full);
  });
});
