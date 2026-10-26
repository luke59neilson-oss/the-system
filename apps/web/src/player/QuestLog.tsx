import type { PlayerQuest, PlayerView } from '@the-system/engine';
import { hiddenQuestText, splitQuests, stabilityLabel, statusText, timeText } from './quests';

/**
 * The quest log (ROADMAP M3.8): visible quests, days left and World Stability,
 * plus where the party is (M7.4) and the factions the GM has revealed (MT.8).
 */
export function QuestLog({ view }: { view: PlayerView }) {
  const { active, finished } = splitQuests(view.quests);
  return (
    <section className="window quests" aria-labelledby="quests-heading" data-testid="quests">
      <h2 id="quests-heading">Quests</h2>
      <p className="muted quest-day" data-testid="day">
        Day {view.day}
        {view.region !== null && (
          // M7.4: where the party is, as the GM set it.
          <span data-testid="region"> · {view.region}</span>
        )}
      </p>
      {active.length === 0 && view.hiddenQuests === 0 && <p className="muted">No active quests.</p>}
      {active.map((q) => (
        <Quest key={q.id} quest={q} />
      ))}
      {view.hiddenQuests > 0 && (
        <p className="quest-hidden" data-testid="hidden-quests" role="note">
          <span className="quest-hidden-title">[Hidden quest]</span>{' '}
          {hiddenQuestText(view.hiddenQuests)}
        </p>
      )}
      {finished.length > 0 && (
        <details className="locked-points" data-testid="finished-quests">
          <summary>Finished quests ({finished.length})</summary>
          {finished.map((q) => (
            <Quest key={q.id} quest={q} />
          ))}
        </details>
      )}
      {view.factions.length > 0 && (
        // MT.8 (Q69): factions the GM has revealed, name and standing only.
        <div className="quest-factions" data-testid="factions">
          <h3>Factions</h3>
          <ul aria-label="Factions">
            {view.factions.map((f, i) => (
              <li key={`${i}-${f.name}`}>
                <span className="quest-title">[{f.name}]</span>
                {f.standing !== '' && <span className="muted"> · {f.standing}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Quest({ quest: q }: { quest: PlayerQuest }) {
  const time = timeText(q);
  return (
    <article className={`quest quest-${q.status}`} data-testid="quest" aria-label={q.title}>
      <h3 className="quest-title">
        {q.title}
        {q.status !== 'active' && (
          <span className="badge quest-status" data-testid="quest-status">
            {statusText(q.status)}
          </span>
        )}
      </h3>
      {q.text && <p className="quest-text">{q.text}</p>}
      {time && (
        <p
          className={q.daysLeft !== null && q.daysLeft <= 3 ? 'quest-time urgent' : 'quest-time'}
          data-testid="quest-time"
        >
          {time}
        </p>
      )}
      {q.stability !== null && q.stabilityPercent !== null && (
        <div className="stability" data-testid="stability">
          <span className="stability-label">
            World Stability:{' '}
            <strong data-testid="stability-value">{stabilityLabel(q.stabilityPercent)}%</strong>
          </span>
          <span
            className="stability-bar"
            role="meter"
            aria-label="World Stability"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={q.stabilityPercent}
            aria-valuetext={`${stabilityLabel(q.stabilityPercent)}%`}
          >
            <span style={{ width: `${q.stabilityPercent}%` }} />
          </span>
        </div>
      )}
    </article>
  );
}
