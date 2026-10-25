import { useState, type FormEvent } from 'react';
import { mergeCandidates, type CampaignState } from '@the-system/engine';
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
  // The last offer sent from here, to say how the player answered it.
  const [sent, setSent] = useState<{
    characterId: string;
    name: string;
    skills: readonly [string, string];
    /** Set once the offer has reached the state, so a slow update never reads as a decline. */
    seen: boolean;
  } | null>(null);
  const pending = character?.mergeOffer ?? null;
  // Adjusting state while rendering (not in an effect): mark the offer seen.
  if (sent && !sent.seen && pending?.name === sent.name) setSent({ ...sent, seen: true });
  const answered =
    sent !== null &&
    sent.seen &&
    sent.characterId === characterId &&
    (pending === null || pending.name !== sent.name)
      ? (character?.skills.some((s) => s.name === sent.name) ?? false)
        ? 'accepted'
        : 'declined'
      : null;
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
      description: description.trim() || null,
      flavor: flavor.trim() || null,
    });
    setBusy(false);
    if (!r.ok) {
      setOutcome({ ok: false, text: friendlyError(r.error) });
      return;
    }
    setSent({ characterId, name: merged, skills: chosen.skills, seen: false });
    setOutcome(null);
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
                setSent(null);
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
          {pending && (
            <p className="warn" role="status" data-testid="merge-pending">
              Waiting on {character?.name}: [{pending.skills[0]}] + [{pending.skills[1]}] → [
              {pending.name}]. Sending another merge replaces this offer.
            </p>
          )}
          {!pending && answered && sent && (
            <p
              className={answered === 'accepted' ? 'ok' : 'warn'}
              role="status"
              data-testid="merge-answer"
            >
              {character?.name} {answered} [{sent.skills[0]}] + [{sent.skills[1]}] → [{sent.name}]
              {answered === 'declined' ? '; both skills stay.' : '.'}
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
                {character?.name ?? 'The player'} accepts or declines on their screen. If accepted,
                both skills are consumed; the merged skill starts at 0 marks. At most {perGrade}{' '}
                {perGrade === 1 ? 'merge' : 'merges'} per character per grade.
              </p>
              <button
                type="submit"
                disabled={busy || !chosen || chosen.problem !== null || merged === '' || clash}
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
