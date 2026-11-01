import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_QUICK_SLOTS } from '../src/ai/quickResponses';
import {
  QUICK_SETTINGS_FILE,
  QuickSettingsStore,
  campaignQuickSettings,
} from '../src/ai/quickRoutes';

// ML.4 (DESIGN §11, Q79): the quick-response setup is kept per campaign.
let root = '';
let laptop = '';
const campaign = (name: string, hasEvents: boolean) => ({
  dir: mkdtempSync(path.join(root, `${name}-`)),
  campaign: { state: hasEvents ? {} : null },
});
const asStore = (c: ReturnType<typeof campaign>) =>
  c as unknown as Parameters<typeof campaignQuickSettings>[0];
const renamed = DEFAULT_QUICK_SLOTS.map((s) => ({ ...s, label: `My ${s.label}` }));

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'the-system-quick-'));
  laptop = mkdtempSync(path.join(root, 'laptop-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('quick-response setup per campaign (ML.4)', () => {
  it('a new campaign starts from the defaults, whatever the laptop has', () => {
    new QuickSettingsStore(laptop).write(renamed);
    const fresh = campaign('new', false);
    expect(campaignQuickSettings(asStore(fresh), laptop).read()).toEqual(DEFAULT_QUICK_SLOTS);
    // Its first events come later: the choice made at first open stands.
    fresh.campaign.state = {};
    expect(campaignQuickSettings(asStore(fresh), laptop).read()).toEqual(DEFAULT_QUICK_SLOTS);
  });

  it("an existing campaign copies the laptop's setup the first time it opens", () => {
    new QuickSettingsStore(laptop).write(renamed);
    const old = campaign('old', true);
    expect(existsSync(path.join(old.dir, QUICK_SETTINGS_FILE))).toBe(false);
    expect(campaignQuickSettings(asStore(old), laptop).read()).toEqual(renamed);
    expect(existsSync(path.join(old.dir, QUICK_SETTINGS_FILE))).toBe(true);
    // Later changes on the laptop's old file no longer reach it.
    new QuickSettingsStore(laptop).write(DEFAULT_QUICK_SLOTS);
    expect(campaignQuickSettings(asStore(old), laptop).read()).toEqual(renamed);
  });

  it('an existing campaign with no laptop setup gets the defaults', () => {
    expect(campaignQuickSettings(asStore(campaign('old', true)), laptop).read()).toEqual(
      DEFAULT_QUICK_SLOTS,
    );
  });

  it("one campaign's changes do not reach another", () => {
    const a = campaign('a', true);
    const b = campaign('b', true);
    campaignQuickSettings(asStore(a), laptop).write(renamed);
    expect(campaignQuickSettings(asStore(b), laptop).read()).toEqual(DEFAULT_QUICK_SLOTS);
    expect(campaignQuickSettings(asStore(a), laptop).read()).toEqual(renamed);
  });
});
