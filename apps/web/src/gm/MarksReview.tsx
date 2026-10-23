import { useState } from 'react';
import {
  marksReview,
  reviewSessionId,
  type CampaignState,
  type MarkCandidate,
} from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { cssToken } from '../player/sheet';

type Outcome = { ok: boolean; text: string } | null;

/**
 * End-of-session marks review (ROADMAP M5.3, DESIGN §6–7): for one play
 * session, each character's skills used (most used first, repeats flagged)
 * with Confirm mark, any other skill the GM wants to mark, and the upgrades
 * those marks unlock. Everything is worked out by the engine's
 * `marksReview`, so the window never offers a mark or upgrade it would refuse.
 */
export function MarksReview({ client, state }: { client: LiveClient; state: CampaignState }) {
  const { rules } = state;
  const fallback = reviewSessionId(state);
  const [picked, setPicked] = useState<string | null>(null);
  const sessionId =
    picked !== null && state.sessions.some((s) => s.id === picked) ? picked : fallback;
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [other, setOther] = useState<Record<string, string>>({});
  const rarityName = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const label = (skill: string, rarity: string) => `[${skill} (${rarityName(rarity)})]`;

  const run = async (command: { type: string } & Record<string, unknown>, okText: string) => {
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    setOutcome(r.ok ? { ok: true, text: okText } : { ok: false, text: friendlyError(r.error) });
  };

  const session = state.sessions.find((s) => s.id === sessionId);
  const review = sessionId ? marksReview(state, sessionId) : [];
  const markButton = (characterId: string, name: string, c: MarkCandidate) =>
    c.status === 'eligible' ? (
      <button
        type="button"
        disabled={busy}
        aria-label={`Confirm mark: ${name} ${c.skill}`}
        onClick={() =>
          void run(
            {
              type: 'skill.awardMark',
              characterId,
              skill: c.skill,
              session: sessionId ?? undefined,
            },
            `${name}: mark confirmed on [${c.skill}]${c.banks ? ' (banked)' : ''}`,
          )
        }
      >
        Confirm mark
      </button>
    ) : (
      <span className="muted">{c.status === 'marked' ? 'Marked this session' : 'No upgrade'}</span>
    );
  const progress = (c: MarkCandidate) =>
    c.needed === null ? '' : `${c.marks}/${c.needed} marks${c.banks ? ' · banks at ceiling' : ''}`;

  return (
    <section className="window marks-review" aria-labelledby="marks-review-heading">
      <h2 id="marks-review-heading">Marks review</h2>
      {state.sessions.length === 0 || !sessionId ? (
        <p className="muted">
          No session played yet. Start one in the Session window: marks are confirmed per session.
        </p>
      ) : (
        <>
          <label className="marks-session">
            Session{' '}
            <select
              value={sessionId}
              onChange={(e) => {
                setPicked(e.target.value);
                setOutcome(null);
              }}
            >
              {[...state.sessions].reverse().map((s) => (
                <option key={s.id} value={s.id}>
                  Session {s.number}
                  {s.endedAt === null ? ' (running)' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            One mark per skill per session ({rules.skills.maxMarksPerSkillPerSession} max), for a
            use that mattered: risk, creativity, a turning point.
            {session?.endedAt === null ? ' The session is still running.' : ''}
          </p>
          {outcome && (
            <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
              {outcome.text}
            </p>
          )}
          {review.map((r) => {
            const markable = r.unused.filter((c) => c.status === 'eligible');
            const pick = markable.some((c) => c.skill === other[r.characterId])
              ? (other[r.characterId] as string)
              : (markable[0]?.skill ?? '');
            const pickCandidate = markable.find((c) => c.skill === pick);
            return (
              <section
                key={r.characterId}
                className="marks-character"
                aria-labelledby={`marks-${cssToken(r.characterId)}`}
              >
                <h3 id={`marks-${cssToken(r.characterId)}`}>{r.name} · marks</h3>
                {r.used.length === 0 ? (
                  <p className="muted">No skills logged this session.</p>
                ) : (
                  <ul className="marks-list">
                    {r.used.map((c) => (
                      <li key={c.skill} data-testid="mark-candidate">
                        <div className="marks-row">
                          <span className={`rarity rarity-${cssToken(c.rarity)}`}>
                            <span className="skill-name">{label(c.skill, c.rarity)}</span>
                          </span>
                          <span>
                            used {c.uses}×{progress(c) ? ` · ${progress(c)}` : ''}
                          </span>
                          {markButton(r.characterId, r.name, c)}
                        </div>
                        <ul className="marks-entries">
                          {c.entries.map((e) => (
                            <li key={e.id}>
                              {e.action}
                              {e.source !== 'gm' && <span className="muted"> · {e.source}</span>}
                              {e.repeated && <span className="marks-repeat"> · repeat</span>}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
                {markable.length > 0 && (
                  <div className="marks-row">
                    <label>
                      Mark another skill{' '}
                      <select
                        value={pick}
                        onChange={(e) => setOther({ ...other, [r.characterId]: e.target.value })}
                      >
                        {markable.map((c) => (
                          <option key={c.skill} value={c.skill}>
                            {label(c.skill, c.rarity)} · {progress(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {pickCandidate && markButton(r.characterId, r.name, pickCandidate)}
                  </div>
                )}
                {r.upgrades.map((u) => (
                  <div
                    key={u.skill}
                    className="marks-row upgrade-prompt"
                    data-testid="upgrade-prompt"
                  >
                    <span>
                      <strong>Upgrade ready:</strong> {label(u.skill, u.rarity)} →{' '}
                      {rarityName(u.next)} ({u.marks}/{u.needed} marks
                      {rules.skills.marksResetOnUpgrade ? '; starts again at 0' : ''})
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Upgrade ${r.name} ${u.skill}`}
                      onClick={() =>
                        void run(
                          { type: 'skill.upgrade', characterId: r.characterId, skill: u.skill },
                          `${r.name}: [${u.skill}] is now ${rarityName(u.next)}`,
                        )
                      }
                    >
                      Upgrade
                    </button>
                  </div>
                ))}
                {r.banked.map((b) => (
                  <p key={b.skill} className="muted" data-testid="banked">
                    {label(b.skill, b.rarity)} has {b.marks}/{b.needed} marks but is at the
                    grade&apos;s rarity ceiling: it upgrades after the next evolution.
                  </p>
                ))}
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}
