import { useState, type FormEvent } from 'react';
import { mergeCandidates, mergeSkills, type CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';

type Outcome = { ok: boolean; text: string } | null;

/**
 * GM merge builder (ROADMAP M5.4, DESIGN §6): a character's merge alerts
 * (pairs logged together often enough), each with the merged rarity or why
 * the engine would refuse it, and a form to name and describe the merged
 * skill and send it. MT.2 (Q62): the merge goes to the player as an offer;
 * the builder shows it waiting, then whether the player accepted or declined.
 * The player gets the System's merge DING on accepting.
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
  // MT.7 (Q60): the GM may merge any two skills, past the merge rules.
  const [overriding, setOverriding] = useState(false);
  const [anyPair, setAnyPair] = useState<[string, string]>(['', '']);
  const pending = character?.mergeOffer ?? null;
  // The player's last answer, from the campaign state (survives reloads).
  const answer = character?.lastMergeAnswer ?? null;
  const merged = name.trim();
  // The engine refuses a name the character already uses; say so before Send.
  const clash =
    merged !== '' &&
    (character?.skills.some((s) => s.name.toLowerCase() === merged.toLowerCase()) ?? false);
  const pairId = (skills: readonly [string, string]) => skills.join('\u0000');
  const perGrade = rules.skills.merge.maxPerCharacterPerGrade;
  const rarityName = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const skillNames = character?.skills.map((s) => s.name) ?? [];
  const overridePair: [string, string] = [
    skillNames.includes(anyPair[0]) ? anyPair[0] : (skillNames[0] ?? ''),
    skillNames.includes(anyPair[1]) ? anyPair[1] : (skillNames[1] ?? ''),
  ];
  // What the override still cannot do (the same skill twice, past the
  // ceiling), from the engine's own check; the result rarity when it can.
  let overrideProblem: string | null = null;
  let overrideRarity: string | null = null;
  if (character && overriding) {
    try {
      const after = mergeSkills(
        rules,
        character,
        overridePair[0],
        overridePair[1],
        merged === '' ? '\u0000draft' : merged,
        0,
        true,
      );
      overrideRarity =
        after.skills.find((s) => !character.skills.some((o) => o.name === s.name))?.rarity ?? null;
    } catch (error) {
      overrideProblem = error instanceof Error ? error.message : String(error);
    }
  }

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!character || clash) return;
    if (overriding ? overrideProblem !== null : !chosen || chosen.problem !== null) return;
    const skills = overriding ? overridePair : chosen?.skills;
    if (!skills) return;
    setBusy(true);
    const r = await client.command({
      type: 'skill.merge',
      characterId,
      skills,
      name: merged,
      description: description.trim() || null,
      flavor: flavor.trim() || null,
      ...(overriding ? { override: true } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      setOutcome({ ok: false, text: friendlyError(r.error) });
      return;
    }
    setOutcome(null);
    setName('');
    setDescription('');
    setFlavor('');
    setOverriding(false);
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
                setOverriding(false);
                setAnyPair(['', '']);
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
          {pending && (
            <p className="warn" role="status" data-testid="merge-pending">
              Waiting on {character?.name}: [{pending.skills[0]}] + [{pending.skills[1]}] → [
              {pending.name}]. Sending another merge replaces this offer.
            </p>
          )}
          {!pending && answer && (
            <p className={answer.accept ? 'ok' : 'warn'} role="status" data-testid="merge-answer">
              {character?.name} {answer.accept ? 'accepted' : 'declined'} [{answer.skills[0]}] + [
              {answer.skills[1]}] → [{answer.name}]{answer.accept ? '.' : '; both skills stay.'}
            </p>
          )}
          {candidates.length === 0 && !overriding && (
            <p className="muted">
              No merge alerts: a merge unlocks when two skills are logged working together{' '}
              {rules.skills.merge.requiredJointUses} times.
            </p>
          )}
          {skillNames.length >= 2 && (
            <label className="check override-toggle">
              <input
                type="checkbox"
                checked={overriding}
                onChange={(e) => setOverriding(e.target.checked)}
              />
              GM override: merge any two skills
            </label>
          )}
          {(candidates.length > 0 || overriding) && (
            <form onSubmit={(e) => void send(e)} aria-label="Build a merge">
              {overriding ? (
                <fieldset className="merge-override" aria-label="Override merge">
                  <legend>Any two skills (GM override)</legend>
                  <p className="warn" role="note" data-testid="merge-override-skips">
                    Skips the merge rules: both at least {rarityName(rules.skills.merge.minRarity)},
                    logged together {rules.skills.merge.requiredJointUses} times, {perGrade} per
                    character per grade, and the grade&rsquo;s rarity ceiling. Logged; undo it in
                    the change log.
                  </p>
                  {[0, 1].map((i) => (
                    <label key={i}>
                      {i === 0 ? 'First skill' : 'Second skill'}
                      <select
                        value={overridePair[i]}
                        onChange={(e) => {
                          const next: [string, string] = [...overridePair];
                          next[i] = e.target.value;
                          setAnyPair(next);
                        }}
                      >
                        {skillNames.map((n) => (
                          <option key={n} value={n}>
                            [{n}]
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {overrideProblem !== null ? (
                    <p className="err" role="alert">
                      Can’t merge: {friendlyError(overrideProblem)}
                    </p>
                  ) : (
                    overrideRarity !== null && (
                      <p className="muted">Merged skill: {rarityName(overrideRarity)}</p>
                    )
                  )}
                </fieldset>
              ) : (
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
                            {c.unreviewed} of these {c.count} uses not reviewed yet (Practice
                            window).
                          </p>
                        )}
                        {c.problem !== null && <p className="warn">{c.problem}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
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
                {character?.name ?? 'The player'} accepts or declines on their screen. If accepted,
                both skills are consumed; the merged skill starts at 0 marks. At most {perGrade}{' '}
                {perGrade === 1 ? 'merge' : 'merges'} per character per grade.
              </p>
              <button
                type="submit"
                disabled={
                  busy ||
                  merged === '' ||
                  clash ||
                  (overriding ? overrideProblem !== null : !chosen || chosen.problem !== null)
                }
              >
                Send merge offer
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
