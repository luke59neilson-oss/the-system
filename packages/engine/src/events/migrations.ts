import { isAtCap } from '../character';
import type { CampaignState } from './reducer';
import type { Command } from './commands';

/** One track's XP held at the grade's top under the old banking rules (MR.3). */
export interface BankedXp {
  readonly characterId: string;
  readonly track: 'class' | 'profession';
  readonly xp: number;
}

/**
 * XP each character holds on a track that is at the grade's top. Under XP
 * overflow (DESIGN §2) a capped track holds nothing, so the `xpOverflow`
 * migration clears these (D153). Characters in id order, class first.
 */
export function bankedXp(state: CampaignState): BankedXp[] {
  const out: BankedXp[] = [];
  for (const id of Object.keys(state.characters).sort()) {
    const c = state.characters[id];
    if (!c) continue;
    if (c.xp.class > 0 && isAtCap(state.rules, c.grade, c.classLevel)) {
      out.push({ characterId: id, track: 'class', xp: c.xp.class });
    }
    if (
      c.profession !== null &&
      c.xp.profession > 0 &&
      isAtCap(state.rules, c.grade, c.professionLevel)
    ) {
      out.push({ characterId: id, track: 'profession', xp: c.xp.profession });
    }
  }
  return out;
}

/**
 * Rules migrations a stored campaign needs when it loads (MR.3, L16): the
 * server runs each as a GM command and logs the result like any change.
 * Empty for a campaign already on the current rules.
 */
export function pendingRulesMigrations(state: CampaignState | null): Command[] {
  if (!state) return [];
  return state.rules.xp.overflow ? [] : [{ type: 'rules.migrate', migration: 'xpOverflow' }];
}
