import type { EvolutionOption, OwnSheet, PlayerRules } from '@the-system/engine';
import { rarityName } from './sheet';

/**
 * Evolution screen helpers (ROADMAP M3.13, DESIGN §2–§3, §6, D64). Pure.
 */

/** "[Old (Rare)] → [New (Epic)]" for one transform, with the current rarity when known. */
export function transformText(
  rules: PlayerRules,
  me: Pick<OwnSheet, 'skills'>,
  t: EvolutionOption['transforms'][number],
): string {
  const old = me.skills.find((s) => s.name === t.skill);
  const from = old ? `[${old.name} (${rarityName(rules, old.rarity)})]` : `[${t.skill}]`;
  return `${from} → [${t.name} (${rarityName(rules, t.rarity)})]`;
}

/** The reshaped class stat weights, biggest first ("Agility 3 · Perception 2"), or null. */
export function weightsText(
  rules: PlayerRules,
  weights: EvolutionOption['classWeights'],
): string | null {
  if (weights === null) return null;
  const parts = rules.stats.list
    .map((s, i) => ({ name: s.name, w: weights[s.id] ?? 0, i }))
    .filter((p) => p.w > 0)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((p) => `${p.name} ${p.w}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The option's one-time stat bonus (D98): "+2 to every stat" when it raises
 * every stat by the same amount, else "+3 Strength · +5 Vitality" in stat
 * order; null when there is none.
 */
export function bonusText(
  rules: PlayerRules,
  bonus: EvolutionOption['statBonus'] | undefined,
): string | null {
  if (!bonus) return null;
  const values = rules.stats.list.map((s) => bonus[s.id] ?? 0);
  const first = values[0] ?? 0;
  if (first > 0 && values.length > 1 && values.every((v) => v === first)) {
    return `+${first} to every stat`;
  }
  const parts = rules.stats.list
    .map((s) => ({ name: s.name, v: bonus[s.id] ?? 0 }))
    .filter((p) => p.v > 0)
    .map((p) => `+${p.v} ${p.name}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Why the player cannot evolve yet, or null: every earned skill selection,
 * offered or not, must be chosen first (MQ.1, D103).
 */
export function evolutionBlocked(me: Pick<OwnSheet, 'selectionsDue'>): string | null {
  const due = me.selectionsDue;
  if (due <= 0) return null;
  return due === 1
    ? 'Choose your waiting skill selection first: you cannot evolve until it is picked.'
    : `Choose your ${due} waiting skill selections first: you cannot evolve until they are picked.`;
}

/**
 * What the player should know before confirming an option: marks the
 * transforms reset (D64), a reshaped spread, and that it is final. Free
 * points are untouched by evolving, so not listed. Waiting selections block
 * the choice instead (evolutionBlocked).
 */
export function evolutionWarnings(me: Pick<OwnSheet, 'skills'>, option: EvolutionOption): string[] {
  const out: string[] = [];
  for (const t of option.transforms) {
    const s = me.skills.find((k) => k.name === t.skill);
    if (s && s.marks > 0)
      out.push(
        `[${s.name}] becomes [${t.name}]: its ${s.marks} mastery ${s.marks === 1 ? 'mark resets' : 'marks reset'} to 0.`,
      );
  }
  if (option.classWeights !== null)
    out.push('Your class stat spread changes for every class level from now on.');
  out.push('The choice is final; the other options will be gone.');
  return out;
}
