import type { PlayerView } from '@the-system/engine';
import { useChangeCount } from './changeCount';
import { partyRows, type PartyPoolRow, type PartyRow } from './party';
import { themeClass } from './sheet';

/**
 * The party view (ROADMAP M3.12, D5, D39, D87): every other character's name,
 * race/class/profession levels and pool bars as whole percents. Never raw
 * pool values or stats: the projection does not carry them.
 */
export function PartyPanel({ view }: { view: PlayerView }) {
  const rows = partyRows(view.party, view.rules);
  return (
    <section className="window party-window" aria-labelledby="party-heading" data-testid="party">
      <h2 id="party-heading">Party</h2>
      {rows.length === 0 && <p className="muted">No other party members yet.</p>}
      {rows.length > 0 && (
        <ul className="party-list">
          {rows.map((m) => (
            <Member key={m.id} member={m} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Member({ member: m }: { member: PartyRow }) {
  return (
    <li
      className={`party-member${themeClass(m.theme)}`}
      data-testid="party-member"
      aria-labelledby={`party-${m.id}`}
    >
      <h3 className="party-name" id={`party-${m.id}`}>
        {m.name}
      </h3>
      <dl className="party-tracks">
        <dt>Race</dt>
        <Track testId="party-race" name={`${m.race} (${m.grade})`} level={m.raceLevel} />
        <dt>Class</dt>
        <Track testId="party-class" name={m.className} level={m.classLevel} />
        {m.profession !== null && (
          <>
            <dt>Profession</dt>
            <Track testId="party-profession" name={m.profession} level={m.professionLevel} />
          </>
        )}
      </dl>
      <div className="party-pools">
        {m.pools.map((p) => (
          <Pool key={p.id} owner={m.name} pool={p} />
        ))}
      </div>
    </li>
  );
}

function Track({ testId, name, level }: { testId: string; name: string; level: number }) {
  const value = `[${name} – lvl ${level}]`;
  const changes = useChangeCount(value);
  return (
    <dd className={changes > 0 ? `flash flash-${changes % 2}` : undefined}>
      <span data-testid={testId}>
        <span className="nowrap">[{name}</span> <span className="nowrap">– lvl {level}]</span>
      </span>
    </dd>
  );
}

function Pool({ owner, pool: p }: { owner: string; pool: PartyPoolRow }) {
  const changes = useChangeCount(p.label);
  const tone = p.percent === 0 ? ' empty' : p.low ? ' low' : '';
  return (
    <div className={`party-pool${tone}`} data-testid={`party-pool-${p.id}`}>
      <span className="party-pool-name" title={p.name}>
        {p.shortName}
      </span>
      <span
        className="party-pool-bar"
        role="meter"
        aria-label={`${owner} ${p.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        aria-valuetext={p.label}
      >
        <span style={{ width: `${p.percent}%` }} />
      </span>
      <span
        className={changes > 0 ? `party-pool-label flash flash-${changes % 2}` : 'party-pool-label'}
        data-testid="party-pool-label"
      >
        {p.label}
      </span>
    </div>
  );
}
