import { useState, type FormEvent } from 'react';
import { mergeCandidates, type CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';

type Outcome = { ok: boolean; text: string } | null;

/**
 * GM merge builder (ROADMAP M5.4, DESIGN §6): a character's merge alerts
 * (pairs logged together often enough), each with the merged rarity or why
 * the engine would refuse it, and a form to name and describe the merged
 * skill and send it. The player gets the System's merge DING.
 */
export function MergeBuilder({ client, state }: { client: LiveClient; state: CampaignState }) {
  const { rules } = state;
  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const [picked, setPicked] = useState('');
  const characterId = ids.includes(picked) ? picked : (ids[0] ?? '');
  const character = state.characters[characterId];
  const candidates = character ? mergeCandidates(state, characterId) : [];
  const [pairKey, setPairKey] = useState('');
  const chosen = candidates.find((c) => c.skills.join('\u0000') === pairKey) ?? candidates[0];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [flavor, setFlavor] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const merged = name.trim();
  // The engine refuses a name the character already uses; say so before Send.
  const clash =
    merged !== '' &&
    (character?.skills.some((s) => s.name.toLowerCase() === merged.toLowerCase()) ?? false);
  const pairId = (skills: readonly [string, string]) => skills.join('\u0000');
  const perGrade = rules.skills.merge.maxPerCharacterPerGrade;
  const rarityName = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!character || !chosen || chosen.problem !== null || clash) return;
    setBusy(true);
    const r = await client.command({
      type: 'skill.merge',
      characterId,
      skills: chosen.skills,
      name: merged,
    });
    if (!r.ok) {
      setBusy(false);
      setOutcome({ ok: false, text: friendlyError(r.error) });
      return;
    }
    let text = `${character.name}: [${chosen.skills[0]}] + [${chosen.skills[1]}] → [${merged}] sent`;
    if (description.trim() !== '' || flavor.trim() !== '') {
      const d = await client.command({
        type: 'skill.describe',
        characterId,
        skill: merged,
        description: description.trim() || null,
        flavor: flavor.trim() || null,
      });
      if (!d.ok) text += `; its text was not saved: ${friendlyError(d.error)}`;
    }
    setBusy(false);
    setOutcome({ ok: true, text });
    setName('');
    setDescription('');
    setFlavor('');
  };

  return (
    <section className="window merge-builder" aria-labelledby="merge-builder-heading">
      <h2 id="merge-builder-heading">Merges</h2>
      {ids.length === 0 ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <>
          <label>
            Character
            <select
              value={characterId}
              onChange={(e) => {
                setPicked(e.target.value);
                setPairKey('');
                setOutcome(null);
                // A name typed for one character must not carry over to another.
                setName('');
                setDescription('');
                setFlavor('');
              }}
            >
              {ids.map((id) => (
                <option key={id} value={id}>
                  {state.characters[id]?.name}
                </option>
              ))}
            </select>
          </label>
          {outcome && (
            <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
              {outcome.text}
            </p>
          )}
          {candidates.length === 0 ? (
            <p className="muted">
              No merge alerts: a merge unlocks when two skills are logged working together{' '}
              {rules.skills.merge.requiredJointUses} times.
            </p>
          ) : (
            <form onSubmit={(e) => void send(e)} aria-label="Build a merge">
              <ul className="merge-candidates" aria-label="Merge alerts">
                {candidates.map((c) => {
                  const key = pairId(c.skills);
                  return (
                    <li key={key}>
                      <label className="check">
                        <input
                          type="radio"
                          name="merge-pair"
                          checked={chosen === c}
                          onChange={() => setPairKey(key)}
                        />
                        [{c.skills[0]}] + [{c.skills[1]}] · together {c.count}×
                        {c.rarity !== null ? ` → ${rarityName(c.rarity)}` : ''}
                      </label>
                      {c.unreviewed > 0 && (
                        <p className="warn" data-testid="merge-unreviewed">
                          {c.unreviewed} of these {c.count} uses not reviewed yet (Practice window).
                        </p>
                      )}
                      {c.problem !== null && <p className="warn">{c.problem}</p>}
                    </li>
                  );
                })}
              </ul>
              <label>
                Merged skill name
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              {clash && (
                <p className="warn" role="alert">
                  {character?.name} already has a skill named [{merged}]; pick another name.
                </p>
              )}
              <label>
                Description (optional)
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <label>
                Flavour (optional)
                <textarea value={flavor} onChange={(e) => setFlavor(e.target.value)} />
              </label>
              <p className="muted">
                Both skills are consumed; the merged skill starts at 0 marks. At most {perGrade}{' '}
                {perGrade === 1 ? 'merge' : 'merges'} per character per grade.
              </p>
              <button
                type="submit"
                disabled={busy || !chosen || chosen.problem !== null || merged === '' || clash}
              >
                Send merge
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
