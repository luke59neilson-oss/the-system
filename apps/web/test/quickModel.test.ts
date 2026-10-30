import { describe, expect, it } from 'vitest';
import {
  foldQuick,
  isTypingTarget,
  keyForSlot,
  moveSlot,
  slotForKey,
  splitLines,
  streamingPreview,
} from '../src/gm/quickModel';

// MD.1: the quick-response row's pure helpers.
const noMods = { altKey: false, ctrlKey: false, metaKey: false };

describe('quick responses (MD.1)', () => {
  it('keys 1–9 and 0 map to slots 1–10 and back', () => {
    expect(['1', '2', '3', '4', '5'].map(slotForKey)).toEqual([1, 2, 3, 4, 5]);
    expect(slotForKey('0')).toBe(10);
    expect(slotForKey('a')).toBeNull();
    expect(slotForKey('F1')).toBeNull();
    expect([1, 5, 10].map(keyForSlot)).toEqual(['1', '5', '0']);
  });

  it('a key press in a text field or with a modifier is not a button press', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' }, noMods)).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT' }, noMods)).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' }, noMods)).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' }, noMods)).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true }, noMods)).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' }, noMods)).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' }, noMods)).toBe(false);
    expect(isTypingTarget(null, noMods)).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' }, { ...noMods, ctrlKey: true })).toBe(true);
  });

  it('splits a growing NDJSON buffer', () => {
    expect(splitLines('{"a":1}\n{"b"')).toEqual({ lines: ['{"a":1}'], rest: '{"b"' });
    expect(splitLines('x\n\ny\n')).toEqual({ lines: ['x', 'y'], rest: '' });
  });

  it('folds the streamed events into the shown answer', () => {
    let v = foldQuick(null, { type: 'text', delta: 'lost' });
    expect(v).toBeNull();
    v = foldQuick(null, {
      type: 'start',
      slot: { id: 'twist', label: 'Twist' },
      quote: 'I open it',
      npc: { id: 'sal', name: 'Sal' },
      richer: false,
    });
    v = foldQuick(v, { type: 'text', delta: 'SAY: It ' });
    v = foldQuick(v, { type: 'text', delta: 'bites.\n- a' });
    expect(v).toMatchObject({ text: 'SAY: It bites.\n- a', streaming: true, npc: 'Sal' });
    expect(streamingPreview(v!.text)).toEqual({ say: 'It bites.', beats: ['a'] });
    v = foldQuick(v, { type: 'done', say: 'It bites.', beats: ['a b'] });
    expect(v).toMatchObject({ say: 'It bites.', beats: ['a b'], streaming: false, error: null });
    expect(foldQuick(v, { type: 'error', error: 'busy' })).toMatchObject({ error: 'busy' });
  });

  it('the preview hides a half-written SAY tag', () => {
    expect(streamingPreview('SA')).toEqual({ say: '', beats: [] });
    expect(streamingPreview('SAY:')).toEqual({ say: '', beats: [] });
    expect(streamingPreview('Plain line\n- one\n- two\n- three\n- four').beats).toHaveLength(3);
  });

  it('moves a slot within bounds', () => {
    expect(moveSlot(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveSlot(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveSlot(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });
});

describe('a stream that stops early (MD.1 review M1)', () => {
  it('stops showing "writing…" with a reason; a finished answer is left alone', async () => {
    const { endQuick, foldQuick } = await import('../src/gm/quickModel');
    const started = foldQuick(null, {
      type: 'start',
      slot: { id: 'twist', label: 'Twist' },
      quote: 'q',
      npc: { id: 'sal', name: 'Sal' },
      richer: false,
    });
    expect(started?.npcId).toBe('sal');
    expect(endQuick(started, 'cut off')).toMatchObject({ streaming: false, error: 'cut off' });
    const done = foldQuick(started, { type: 'done', say: 's', beats: [] });
    expect(endQuick(done, 'cut off')).toBe(done);
    expect(endQuick(null, 'x')).toBeNull();
  });
});
