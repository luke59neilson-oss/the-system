import { describe, expect, it } from 'vitest';
import { TABS, WINDOWS, parseTab, tabAfterKey, tabOf, windowsOn } from '../src/gm/tabsModel';

// MU.1: where every GM window lives (DESIGN §9a).
describe('console tabs (MU.1)', () => {
  it('has Home and the three tabs, in order', () => {
    expect(TABS.map((t) => t.label)).toEqual([
      'Home',
      'Session',
      'Progression',
      'Library & settings',
    ]);
  });

  it('puts every window in exactly one place, except Award XP on Session and Progression', () => {
    for (const [id, tabs] of Object.entries(WINDOWS)) {
      if (id === 'award-xp') expect(tabs).toEqual(['session', 'progression']);
      else expect(tabs, id).toHaveLength(1);
    }
    const all = TABS.flatMap((t) => windowsOn(t.id));
    expect(all.length).toBe(Object.keys(WINDOWS).length + 1);
  });

  it('keeps the §9a groupings', () => {
    expect(windowsOn('home')).toEqual(expect.arrayContaining(['party', 'join']));
    expect(windowsOn('session')).toEqual(
      expect.arrayContaining(['codm', 'listen', 'encounter', 'quest-manager', 'change-log']),
    );
    expect(windowsOn('progression')).toEqual(
      expect.arrayContaining(['award-xp', 'offer-builder', 'evolution-builder', 'marks-review']),
    );
    expect(windowsOn('library')).toEqual(
      expect.arrayContaining(['skill-library', 'rules-settings', 'codm-settings', 'bestiary']),
    );
  });

  it('opens a window on its first tab', () => {
    expect(tabOf('award-xp')).toBe('session');
    expect(tabOf('evolution-builder')).toBe('progression');
    expect(tabOf('nope')).toBeNull();
  });

  it('remembers a known tab and falls back to Home', () => {
    expect(parseTab('library')).toBe('library');
    expect(parseTab(null)).toBe('home');
    expect(parseTab('settings')).toBe('home');
  });

  it('moves between tabs with arrows, Home and End, wrapping', () => {
    expect(tabAfterKey('home', 'ArrowRight')).toBe('session');
    expect(tabAfterKey('home', 'ArrowLeft')).toBe('library');
    expect(tabAfterKey('library', 'ArrowRight')).toBe('home');
    expect(tabAfterKey('progression', 'Home')).toBe('home');
    expect(tabAfterKey('session', 'End')).toBe('library');
    expect(tabAfterKey('session', 'a')).toBeNull();
  });
});
