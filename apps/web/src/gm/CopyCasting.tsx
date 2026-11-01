import { useState, type KeyboardEvent } from 'react';
import {
  MAX_CASTING_NOTES,
  MAX_CASTING_SHORT,
  MAX_SKILL_COST,
  castingForSkill,
  type CampaignState,
  type CharacterSkill,
} from '@the-system/engine';
import type { LiveClient } from '../live';

/**
 * ML.5 (DESIGN §6, Q85): this character's own cost, cooldown, range and casting
 * notes for a skill, inside the Skill text form. Saving makes the copy
 * hand-written; Use library text returns it to the library's. The fields start
 * from what the copy uses now; the caller keys this by skill and stored casting.
 */
export function CopyCasting({
  client,
  state,
  characterId,
  skill,
}: {
  client: LiveClient;
  state: CampaignState;
  characterId: string;
  skill: CharacterSkill;
}) {
  const now = castingForSkill(state.rules, state.skillLibrary, skill);
  const [pool, setPool] = useState(now?.cost?.pool ?? '');
  const [amount, setAmount] = useState(now?.cost ? String(now.cost.amount) : '');
  const [cooldown, setCooldown] = useState(now?.cooldown ?? '');
  const [range, setRange] = useState(now?.range ?? '');
  const [notes, setNotes] = useState(now?.castingNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const wholeAmount = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const problem =
    pool === ''
      ? null
      : wholeAmount === null || wholeAmount < 1 || wholeAmount > MAX_SKILL_COST
        ? `Give a whole cost from 1 to ${MAX_SKILL_COST.toLocaleString()}`
        : null;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    const r = await client.command({
      type: 'skill.setCasting',
      characterId,
      skill: skill.name,
      cost: pool === '' ? null : { pool, amount: wholeAmount as number },
      cooldown: cooldown.trim() || null,
      range: range.trim() || null,
      castingNotes: notes.trim() || null,
    });
    setBusy(false);
    setMessage(r.ok ? 'Own casting saved' : r.error);
  };

  // The fields sit inside the Skill text form: Enter must not save its text.
  const stayHere = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
  };

  return (
    <fieldset className="copy-casting" data-testid="copy-casting" onKeyDown={stayHere}>
      <legend>This character’s casting</legend>
      <p className="muted" data-testid="copy-casting-source">
        {skill.casting
          ? 'This copy’s own casting. Use library text returns it to the library’s.'
          : 'Follows the library. Saving here gives this copy its own.'}
      </p>
      <div className="spell-cost">
        <label>
          Cost pool
          <select value={pool} onChange={(e) => setPool(e.target.value)}>
            <option value="">No cost</option>
            {state.rules.pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cost per use
          <input
            inputMode="numeric"
            value={amount}
            disabled={pool === ''}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={problem !== null}
          />
        </label>
      </div>
      <label>
        Cooldown (shown, not enforced)
        <input
          value={cooldown}
          maxLength={MAX_CASTING_SHORT}
          onChange={(e) => setCooldown(e.target.value)}
        />
      </label>
      <label>
        Range
        <input
          value={range}
          maxLength={MAX_CASTING_SHORT}
          onChange={(e) => setRange(e.target.value)}
        />
      </label>
      <label>
        Casting notes
        <textarea
          value={notes}
          rows={2}
          maxLength={MAX_CASTING_NOTES}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {problem && (
        <p className="err" role="alert">
          {problem}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy || problem !== null}
        onClick={() => void save()}
      >
        Save own casting
      </button>
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
