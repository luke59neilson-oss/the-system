import { describe, expect, it } from 'vitest';
import {
  EMPTY_LAYOUT,
  arrangeSlots,
  dropPanel,
  isLayoutChanged,
  movePanel,
  orderedPanels,
  panelWidth,
  parseLayout,
  setPanelWidth,
} from './layoutModel';

const PAGE = ['a', 'b', 'c', 'd'];

describe('the panel layout (MW.4)', () => {
  it('starts in the default order', () => {
    expect(orderedPanels(PAGE, EMPTY_LAYOUT)).toEqual(PAGE);
    expect(isLayoutChanged(EMPTY_LAYOUT)).toBe(false);
  });

  it('moves earlier and later, and stops at the ends', () => {
    const later = movePanel(PAGE, EMPTY_LAYOUT, 'a', 1);
    expect(orderedPanels(PAGE, later)).toEqual(['b', 'a', 'c', 'd']);
    const earlier = movePanel(PAGE, later, 'd', -1);
    expect(orderedPanels(PAGE, earlier)).toEqual(['b', 'a', 'd', 'c']);
    expect(movePanel(PAGE, EMPTY_LAYOUT, 'a', -1)).toBe(EMPTY_LAYOUT);
    expect(movePanel(PAGE, EMPTY_LAYOUT, 'd', 1)).toBe(EMPTY_LAYOUT);
    expect(movePanel(PAGE, EMPTY_LAYOUT, 'nope', 1)).toBe(EMPTY_LAYOUT);
  });

  it('a drop takes the spot of the panel dropped on, either way', () => {
    expect(orderedPanels(PAGE, dropPanel(PAGE, EMPTY_LAYOUT, 'a', 'c'))).toEqual([
      'b',
      'c',
      'a',
      'd',
    ]);
    expect(orderedPanels(PAGE, dropPanel(PAGE, EMPTY_LAYOUT, 'd', 'b'))).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
    expect(dropPanel(PAGE, EMPTY_LAYOUT, 'a', 'a')).toBe(EMPTY_LAYOUT);
  });

  it('ignores unknown panels and puts new ones in their default spot', () => {
    const saved = { order: ['d', 'gone', 'a', 'c'], widths: {} };
    expect(orderedPanels(PAGE, saved)).toEqual(['d', 'a', 'b', 'c']);
    expect(orderedPanels(['new', ...PAGE], saved)[0]).toBe('new');
    expect(orderedPanels(PAGE, { order: ['gone'], widths: {} })).toEqual(PAGE);
  });

  it('keeps widths per panel, with the old full-width panels as defaults', () => {
    expect(panelWidth(EMPTY_LAYOUT, 'a')).toBe('third');
    expect(panelWidth(EMPTY_LAYOUT, 'party')).toBe('full');
    const wide = setPanelWidth(EMPTY_LAYOUT, 'a', 'half');
    expect(panelWidth(wide, 'a')).toBe('half');
    expect(isLayoutChanged(wide)).toBe(true);
    expect(panelWidth(setPanelWidth(wide, 'party', 'third'), 'party')).toBe('third');
  });

  it('reads saved layouts tolerantly', () => {
    expect(parseLayout(null)).toEqual(EMPTY_LAYOUT);
    expect(parseLayout('not json')).toEqual(EMPTY_LAYOUT);
    expect(parseLayout('null')).toEqual(EMPTY_LAYOUT);
    expect(parseLayout('{"order":"x","widths":3}')).toEqual(EMPTY_LAYOUT);
    expect(parseLayout('{"order":["a","a",1,"b"],"widths":{"a":"half","b":"huge","c":2}}')).toEqual(
      { order: ['a', 'b'], widths: { a: 'half' } },
    );
  });

  it('arranges only the page panels, leaving other tabs where they are', () => {
    const all = ['x', 'a', 'y', 'b', 'c', 'z'];
    const shown = ['a', 'b', 'c'];
    expect(arrangeSlots(all, shown, EMPTY_LAYOUT)).toEqual(all);
    const moved = movePanel(shown, EMPTY_LAYOUT, 'c', -1);
    expect(arrangeSlots(all, shown, moved)).toEqual(['x', 'a', 'y', 'c', 'b', 'z']);
  });

  it('a reset is the empty layout: default order and default widths come back', () => {
    const changed = setPanelWidth(movePanel(PAGE, EMPTY_LAYOUT, 'b', 1), 'a', 'half');
    expect(isLayoutChanged(changed)).toBe(true);
    expect(orderedPanels(PAGE, EMPTY_LAYOUT)).toEqual(PAGE);
    expect(panelWidth(EMPTY_LAYOUT, 'a')).toBe('third');
    expect(panelWidth(EMPTY_LAYOUT, 'offer-builder')).toBe('full');
  });
});
