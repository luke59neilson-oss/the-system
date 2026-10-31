import { useState, type FormEvent } from 'react';
import {
  balancedShares,
  previewXpShares,
  typicalSessionAward,
  typicalSessionXp,
  xpContext,
  levelsWorth,
  type CampaignState,
  type XpPreview,
  type XpTrack,
} from '@the-system/engine';
import { friendlyError } from '../format';
import { evenPercents, formatLevels, percentShares, xpContextText } from './xpAwardModel';
import type { CommandResult, LiveClient } from '../live';

const WHOLE = /^\d+$/;

/**
 * The XP award dialog (M4.6, DESIGN §5): amount, class or profession,
 * participants with percentage shares (MV.2: even to start, typed ones change
 * nothing else, Award only at exactly 100%),
 * the above-level bonus, the target's grade, and a preview of level-ups,
 * overflow and lost XP before the GM confirms.
 */
export function XpAward({ client, state }: { client: LiveClient; state: CampaignState }) {
  const { rules } = state;
  const [track, setTrack] = useState<XpTrack>('class');
  const [amount, setAmount] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  // MV.2: percentages typed by the GM, by character id; untyped rows keep
  // their even starting value. Any change of participants re-evens.
  const [typed, setTyped] = useState<Readonly<Record<string, string>>>({});
  const [resetNote, setResetNote] = useState('');
  const [bonusOn, setBonusOn] = useState(false);
  const [enemyLevel, setEnemyLevel] = useState('');
  const [enemyGrade, setEnemyGrade] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  /** QF.46: what the last award did, named, e.g. "Awarded 300 XP to Jake and Kim." */
  const [awarded, setAwarded] = useState('');

  const ids = state.characterOrder.filter((id) => state.characters[id]);
  const chosen = ids.filter((id) => !excluded.has(id));
  const value = WHOLE.test(amount.trim()) ? Number(amount.trim()) : NaN;
  const amountOk = Number.isSafeInteger(value) && value > 0;
  const levelOk = !bonusOn || WHOLE.test(enemyLevel.trim());

  const even = evenPercents(chosen.length);
  const byHand = chosen.some((id) => typed[id] !== undefined);
  const percents = chosen.map((id, i) => {
    const t = typed[id];
    if (t === undefined) return even[i] as number;
    const raw = t.trim();
    return WHOLE.test(raw) && Number(raw) <= 100 ? Number(raw) : NaN;
  });
  let shareError: string | null = percents.some(Number.isNaN)
    ? 'Percentages must be whole numbers from 0 to 100'
    : null;
  const pctTotal = percents.reduce((a, b) => a + b, 0);
  if (shareError === null && chosen.length > 0 && pctTotal !== 100)
    shareError = `The percentages total ${pctTotal}%, not 100%`;
  // Percentages that equal the even split divide the XP exactly evenly, typed or not, so
  // retyping a shown value never moves the XP (D296, revised after review).
  const atEven = percents.every((p, i) => p === even[i]);
  const shares =
    amountOk && chosen.length > 0 && shareError === null
      ? atEven
        ? balancedShares(value, chosen.length, new Map())
        : percentShares(value, percents)
      : null;
  if (amount.trim() !== '' && !amountOk) shareError = 'The amount must be a whole number above 0';
  else if (!levelOk && enemyLevel.trim() !== '')
    shareError = 'The target’s level must be a whole number of 0 or more';

  let preview: XpPreview[] = [];
  let previewError: string | null = null;
  if (shares && levelOk) {
    try {
      preview = previewXpShares(rules, state.characters, track, {
        amount: value,
        shares: chosen.map((characterId, i) => ({ characterId, share: shares[i] as number })),
        ...(bonusOn ? { enemyLevel: Number(enemyLevel) } : {}),
        ...(enemyGrade ? { enemyGrade } : {}),
      });
    } catch (e) {
      previewError = e instanceof Error ? e.message : String(e);
    }
  }
  const outcome = new Map(preview.map((r) => [r.characterId, r]));
  const totalLost = preview.reduce((a, r) => a + r.lost, 0);
  const valid = preview.length > 0 && preview.length === chosen.length;
  const other = track === 'class' ? 'profession' : 'class';
  const grades = [...new Set(chosen.map((id) => state.characters[id]?.grade ?? ''))].filter(
    (g) => g !== '',
  );

  const toggle = (id: string) => {
    setResult(null);
    // Changing who takes part re-evens; say so when typed percentages are dropped.
    setResetNote(
      Object.keys(typed).length > 0
        ? 'Participants changed: typed percentages were reset to an even split.'
        : '',
    );
    setTyped({});
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !shares) return;
    setBusy(true);
    const r = await client.command({
      type: 'xp.award',
      track,
      amount: value,
      participants: byHand
        ? chosen.map((characterId, i) => ({ characterId, share: shares[i] as number }))
        : chosen.map((characterId) => ({ characterId })),
      ...(bonusOn ? { enemyLevel: Number(enemyLevel) } : {}),
      ...(enemyGrade ? { enemyGrade } : {}),
      reason,
    });
    setResult(r.ok ? r : { ok: false, error: friendlyError(r.error) });
    setBusy(false);
    if (r.ok) {
      // QF.46: the next award starts from the whole table at no target grade,
      // so a table-wide award never goes to last time's subset at ⅓.
      // Shares typed by hand show beside each name.
      setAwarded(
        `Awarded ${value.toLocaleString('en-US')} ${track} XP to ${listNames(
          chosen.map((id, i) => {
            const who = state.characters[id]?.name ?? id;
            return byHand ? `${who} (${(shares[i] ?? 0).toLocaleString('en-US')})` : who;
          }),
        )}.`,
      );
      setAmount('');
      setReason('');
      setTyped({});
      setResetNote('');
      setExcluded(new Set());
      setBonusOn(false);
      setEnemyLevel('');
      setEnemyGrade('');
    }
  };

  const levelText = (r: XpPreview) => {
    const c = state.characters[r.characterId];
    if (!c) return '';
    const ups = r.levelUps.filter((l) => l.track !== 'race');
    if (ups.length === 0) return '';
    const parts: string[] = [];
    for (const t of ['class', 'profession'] as const) {
      const top = ups.filter((l) => l.track === t).at(-1);
      if (top)
        parts.push(`${t} lvl ${t === 'class' ? c.classLevel : c.professionLevel} → ${top.level}`);
    }
    return parts.join(', ');
  };

  return (
    // QF.46: any change to the form clears the last award's line.
    <form
      className="window xp-award"
      onSubmit={(e) => void submit(e)}
      onChange={() => setResult(null)}
      aria-labelledby="award-xp"
    >
      <h2 id="award-xp">Award {track} XP</h2>
      <div className="xp-row">
        <label>
          Amount
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setResult(null);
            }}
            required
          />
        </label>
        <label>
          Track
          <select
            value={track}
            onChange={(e) => {
              setTrack(e.target.value as XpTrack);
              setResult(null);
            }}
          >
            <option value="class">Class</option>
            <option value="profession">Profession</option>
          </select>
        </label>
      </div>
      {grades.length > 0 && (
        <p className="muted small" data-testid="typical-session">
          Grade reference:{' '}
          {grades.map((g, i) => (
            <span key={g}>
              {i > 0 && ' · '}
              {g}: 1 level ={' '}
              {(rules.grades.find((x) => x.id === g)?.xpPerLevel ?? 0).toLocaleString('en-US')} XP;
              a typical session ≈ {rules.campaign.typicalLevelsPerSession} levels ={' '}
              {typicalSessionXp(rules, g).toLocaleString('en-US')} XP each{' '}
              {(() => {
                const group = chosen
                  .map((id) => state.characters[id])
                  .filter((c): c is NonNullable<typeof c> => c?.grade === g);
                const suggested = typicalSessionAward(rules, g, group);
                return (
                  <button
                    type="button"
                    className="secondary small"
                    disabled={suggested === 0}
                    title={
                      group.length === 0
                        ? `No chosen ${g}-grade participants`
                        : suggested === 0
                          ? `Every chosen ${g}-grade participant is at the grade’s top`
                          : `${suggested.toLocaleString('en-US')} XP, split evenly`
                    }
                    onClick={() => {
                      setAmount(String(suggested));
                      setResult(null);
                    }}
                  >
                    Use for {group.length}
                  </button>
                );
              })()}
            </span>
          ))}
          . The button suggests no more than the room left before the grade’s top, so it loses no XP
          for anyone who can still level; the preview below shows overflow and loss.
        </p>
      )}
      <fieldset>
        <legend>Participants ({byHand ? 'shares by percent' : 'even split'})</legend>
        {chosen.length > 0 && (
          <p className="xp-pct-total" data-testid="pct-total" aria-live="polite">
            <span className={pctTotal === 100 ? 'ok' : 'warn'}>
              Total {Number.isNaN(pctTotal) ? '?' : pctTotal}%
            </span>{' '}
            <button
              type="button"
              className="secondary small"
              disabled={!byHand}
              onClick={() => {
                setTyped({});
                setResetNote('');
                setResult(null);
              }}
            >
              Even split
            </button>
          </p>
        )}
        {atEven && chosen.length > 1 && amountOk && (
          <p className="muted" data-testid="pct-even-note">
            Even split: the XP is divided exactly evenly.
          </p>
        )}
        {resetNote !== '' && (
          <p className="muted" data-testid="pct-reset" aria-live="polite">
            {resetNote}
          </p>
        )}
        {ids.length === 0 && <p className="muted">Create a character first.</p>}
        {ids.map((id) => {
          const i = chosen.indexOf(id);
          const r = outcome.get(id);
          const name = state.characters[id]?.name ?? id;
          return (
            <div key={id} className="xp-participant">
              <label className="check">
                <input type="checkbox" checked={!excluded.has(id)} onChange={() => toggle(id)} />
                {name}
              </label>
              {(() => {
                const c = state.characters[id];
                if (!c) return null;
                return (
                  <span className="muted small xp-context" data-testid={`context-${id}`}>
                    {xpContextText(xpContext(rules, c))}
                  </span>
                );
              })()}
              <div className="xp-outcome">
                {i >= 0 && shares && shares[i] !== undefined && (
                  <span className="muted" data-testid={`share-${id}`}>
                    {' '}
                    · {shares[i]} XP
                  </span>
                )}
                {r && state.characters[id] && (
                  <span className="muted" data-testid={`worth-${id}`}>
                    {' '}
                    · ≈ {formatLevels(levelsWorth(rules, state.characters[id], track, r.gained))}
                  </span>
                )}
                {!r &&
                  (previewError ?? shareError) !== null &&
                  i >= 0 &&
                  shares?.[i] !== undefined && (
                    <span className="muted" data-testid={`worth-${id}`}>
                      {' '}
                      · ≈ levels shown once the error is fixed
                    </span>
                  )}
                {r && r.gained !== r.share && (
                  <span className="muted" data-testid={`gained-${id}`}>
                    {' '}
                    · gains {r.gained}
                  </span>
                )}
                {r && r.overflowed > 0 && (
                  <span className="muted" data-testid={`overflow-${id}`}>
                    {' '}
                    · {r.overflowed} to {other}
                  </span>
                )}
                {r && r.lost > 0 && (
                  <span className="warn" data-testid={`lost-${id}`}>
                    {' '}
                    · {r.lost} lost
                  </span>
                )}
                {r && levelText(r) !== '' && (
                  <span className="ok" data-testid={`levels-${id}`}>
                    {' '}
                    · {levelText(r)}
                  </span>
                )}
              </div>
              {i >= 0 && (
                <label className="xp-share">
                  {name}’s %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    value={typed[id] ?? String(even[i] ?? '')}
                    onChange={(e) => {
                      setResetNote('');
                      setTyped((t) => ({ ...t, [id]: e.target.value }));
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </fieldset>
      <fieldset>
        <legend>Target</legend>
        <label>
          Target’s grade
          <select
            value={enemyGrade}
            onChange={(e) => {
              setEnemyGrade(e.target.value);
              setResult(null);
            }}
          >
            <option value="">Not set (full XP)</option>
            {rules.grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id}-grade
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          A target one grade below a character gives{' '}
          {Math.round((rules.xp.gradeBelowFactors[0] ?? 1) * 100)}% XP
          {rules.xp.gradeBelowFactors.length > 1 &&
            `; ${rules.xp.gradeBelowFactors.length} or more below gives ${Math.round((rules.xp.gradeBelowFactors.at(-1) ?? 1) * 100)}%`}
          .
        </p>
        <label className="check">
          <input type="checkbox" checked={bonusOn} onChange={(e) => setBonusOn(e.target.checked)} />
          Above-level bonus
        </label>
        {bonusOn && (
          <label>
            Target’s level
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={enemyLevel}
              onChange={(e) => setEnemyLevel(e.target.value)}
            />
          </label>
        )}
      </fieldset>
      {totalLost > 0 && (
        <p className="warn" data-testid="xp-lost">
          {totalLost} XP will be lost: those tracks are at the top of their grade and nothing can
          take the overflow.
        </p>
      )}
      {(shareError ?? previewError) && (
        <p className="err" role="alert">
          {shareError ?? previewError}
        </p>
      )}
      <label>
        Reason (GM only)
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      </label>
      <button type="submit" disabled={busy || !valid}>
        Award XP
      </button>
      {result &&
        (result.ok ? (
          <p className="ok" role="status">
            {awarded}
          </p>
        ) : (
          <p className="err" role="alert">
            {result.error}
          </p>
        ))}
    </form>
  );
}

/** "Jake", "Jake and Kim", "Jake, Kim and Ada". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
