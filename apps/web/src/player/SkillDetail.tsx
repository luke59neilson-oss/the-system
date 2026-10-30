import { useEffect, useRef, useState } from 'react';
import { MAX_NICKNAME, type OwnSheet, type PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { cssToken, rarityName } from './sheet';
import { costText, kindLabel, markProgress, poolShort } from './skillDetailModel';

type Skill = OwnSheet['skills'][number];

/**
 * Skill detail (M3.5, DESIGN §6): official name in its rarity colour (always
 * shown), nickname with an editor, the System description and flavour, the
 * library effects (owner only, MQ.12), and
 * mastery-mark progress. A modal <dialog>: Escape or Close returns focus to
 * the skill that opened it. `client` is null in the GM's View-as panes, which
 * may look but not edit.
 */
export function SkillDetail({
  skill,
  view,
  client,
  onClose,
}: {
  skill: Skill;
  view: PlayerView;
  client: LiveClient | null;
  onClose: () => void;
}) {
  const rules = view.rules;
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);
  const progress = markProgress(rules, view.me.grade, skill);
  const rarity = rarityName(rules, skill.rarity);
  return (
    <dialog
      ref={dialog}
      className={`skill-detail window rarity-${cssToken(skill.rarity)}`}
      aria-labelledby="skill-detail-name"
      data-testid="skill-detail"
      onClose={onClose}
    >
      <div className="skill-detail-head">
        <h3 id="skill-detail-name" className="skill-name" data-testid="skill-detail-name">
          [{skill.name} ({rarity})]
        </h3>
        <button
          type="button"
          className="secondary"
          aria-label="Close skill details"
          onClick={() => dialog.current?.close()}
        >
          Close
        </button>
      </div>
      <p className="muted skill-detail-kind">
        {kindLabel(skill.kind)} · {rarity}
        {skill.unique && (
          <span className="unique-tag" data-testid="skill-detail-unique">
            {' '}
            · Unique
          </span>
        )}
      </p>
      <Nickname key={skill.name} skill={skill} view={view} client={client} />
      <section aria-label="Description">
        {skill.description ? (
          <p className="skill-description" data-testid="skill-detail-description">
            {skill.description}
          </p>
        ) : (
          <p className="muted" data-testid="skill-detail-description">
            The System has not described this skill yet.
          </p>
        )}
        {skill.flavor && (
          <p className="skill-flavor" data-testid="skill-detail-flavor">
            {skill.flavor}
          </p>
        )}
      </section>
      {skill.effects && (
        <section aria-labelledby="skill-detail-effects">
          <h4 id="skill-detail-effects">Effects</h4>
          <p className="skill-effects" data-testid="skill-detail-effects">
            {skill.effects}
          </p>
        </section>
      )}
      {skill.casting && (
        <section aria-labelledby="skill-detail-casting" data-testid="skill-detail-casting">
          <h4 id="skill-detail-casting">Casting</h4>
          <dl className="skill-casting">
            {skill.casting.cost && (
              <>
                <dt>Cost</dt>
                <dd data-testid="skill-detail-cost">{costText(rules, skill)} per use</dd>
              </>
            )}
            {skill.casting.cooldown && (
              <>
                <dt>Cooldown</dt>
                <dd data-testid="skill-detail-cooldown">{skill.casting.cooldown}</dd>
              </>
            )}
            {skill.casting.range && (
              <>
                <dt>Range</dt>
                <dd data-testid="skill-detail-range">{skill.casting.range}</dd>
              </>
            )}
            {skill.casting.castingNotes && (
              <>
                <dt>Notes</dt>
                <dd data-testid="skill-detail-notes">{skill.casting.castingNotes}</dd>
              </>
            )}
          </dl>
          {skill.casting.cost && <Cast skill={skill} view={view} client={client} />}
        </section>
      )}
      <section aria-labelledby="skill-detail-marks">
        <h4 id="skill-detail-marks">Mastery marks</h4>
        <p data-testid="skill-detail-marks">{progress.text}</p>
        {progress.percent !== null && (
          <div
            className={progress.banked ? 'marks-bar banked' : 'marks-bar'}
            role="progressbar"
            aria-labelledby="skill-detail-marks"
            aria-valuemin={0}
            aria-valuemax={skill.marksNeeded ?? 0}
            aria-valuenow={Math.min(skill.marks, skill.marksNeeded ?? 0)}
            aria-valuetext={progress.text}
          >
            <span style={{ width: `${progress.percent}%` }} data-testid="skill-detail-marks-bar" />
          </div>
        )}
      </section>
    </dialog>
  );
}

/**
 * MU.5: the Cast button. The pool pays the cost (the server refuses when it
 * is too low, and the button says so first); the use goes to the GM's
 * practice review. Cooldowns are shown above, never enforced. Absent in View
 * as (no client).
 */
function Cast({
  skill,
  view,
  client,
}: {
  skill: Skill;
  view: PlayerView;
  client: LiveClient | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const cost = skill.casting?.cost;
  if (!cost || !client) return null;
  const pool = view.me.pools.find((p) => p.id === cost.pool);
  const have = pool?.current ?? 0;
  const label = poolShort(view.rules, cost.pool);
  const short = have < cost.amount;
  const cast = async () => {
    setBusy(true);
    setMessage(null);
    const result = await client.command({
      type: 'skill.cast',
      characterId: view.me.id,
      skill: skill.name,
    });
    setBusy(false);
    setMessage(
      result.ok
        ? { ok: true, text: `Cast! −${cost.amount} ${label}. The GM will review the use.` }
        : { ok: false, text: friendlyError(result.error) },
    );
  };
  return (
    <div className="skill-cast">
      <button
        type="button"
        data-testid="skill-cast"
        disabled={busy}
        className={short ? 'cast-short' : undefined}
        aria-describedby="skill-cast-pool"
        onClick={() => void cast()}
      >
        Cast ({costText(view.rules, skill)})
      </button>
      <p id="skill-cast-pool" className={short ? 'err' : 'muted'} data-testid="skill-cast-pool">
        {short
          ? `Not enough ${label}: ${have} of ${cost.amount}`
          : `${label} ${have}/${pool?.max ?? have}`}
      </p>
      {message && (
        <p
          className={message.ok ? 'ok' : 'err'}
          role={message.ok ? 'status' : 'alert'}
          data-testid="skill-cast-result"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** The nickname line and its editor; the official name above never changes. */
function Nickname({
  skill,
  view,
  client,
}: {
  skill: Skill;
  view: PlayerView;
  client: LiveClient | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(skill.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const [returnFocus, setReturnFocus] = useState(0);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (returnFocus > 0) editButton.current?.focus();
  }, [returnFocus]);
  const finish = () => {
    setEditing(false);
    setError(null);
    setReturnFocus((n) => n + 1);
  };
  const send = async (nickname: string | null) => {
    if (!client) return;
    const next = nickname === null ? null : nickname.trim() === '' ? null : nickname.trim();
    if (next === skill.nickname) {
      finish();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await client.command({
      type: 'skill.nickname',
      characterId: view.me.id,
      skill: skill.name,
      nickname: next,
    });
    setBusy(false);
    if (result.ok) finish();
    else if (result.error === 'Connection lost' || result.error === 'Not connected to the System')
      setError('Connection lost. Check the nickname once you are back: it may already be saved.');
    else setError(friendlyError(result.error));
  };
  if (!editing) {
    return (
      <div className="skill-nickname">
        <p data-testid="skill-detail-nickname">
          Nickname:{' '}
          {skill.nickname ? (
            <span className="nickname">“{skill.nickname}”</span>
          ) : (
            <span className="muted">none</span>
          )}
        </p>
        {client && (
          <button
            type="button"
            className="secondary"
            ref={editButton}
            onClick={() => {
              setDraft(skill.nickname ?? '');
              setEditing(true);
            }}
          >
            {skill.nickname ? 'Edit nickname' : 'Add nickname'}
          </button>
        )}
      </div>
    );
  }
  return (
    <form
      className="skill-nickname-form"
      onSubmit={(e) => {
        e.preventDefault();
        void send(draft);
      }}
      onKeyDown={(e) => {
        // Escape cancels the edit rather than closing the whole dialog.
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish();
        }
      }}
    >
      <label htmlFor="skill-nickname-input">Nickname</label>
      <input
        id="skill-nickname-input"
        ref={input}
        value={draft}
        maxLength={MAX_NICKNAME}
        autoComplete="off"
        aria-describedby="skill-nickname-help"
        onChange={(e) => setDraft(e.target.value)}
      />
      <p id="skill-nickname-help" className="muted">
        Shown beside the official name, which always stays. Leave empty to remove.
      </p>
      <div className="assign-actions">
        <button type="submit" disabled={busy}>
          Save
        </button>
        {skill.nickname && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void send(null)}
          >
            Remove nickname
          </button>
        )}
        <button type="button" className="secondary" disabled={busy} onClick={finish}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
