import type { PlayerQuest, PlayerView } from '@the-system/engine';
import { splitQuests, stabilityLabel, statusText, timeText } from './quests';

/** The quest log (ROADMAP M3.8): visible quests, days left and World Stability. */
export function QuestLog({ view }: { view: PlayerView }) {
  const { active, finished } = splitQuests(view.quests);
  return (
    <section className="window quests" aria-labelledby="quests-heading" data-testid="quests">
      <h2 id="quests-heading">Quests</h2>
      <p className="muted quest-day" data-testid="day">
        Day {view.day}
      </p>
      {active.length === 0 && <p className="muted">No active quests.</p>}
      {active.map((q) => (
        <Quest key={q.id} quest={q} />
      ))}
      {finished.length > 0 && (
        <details className="locked-points" data-testid="finished-quests">
          <summary>Finished quests ({finished.length})</summary>
          {finished.map((q) => (
            <Quest key={q.id} quest={q} />
          ))}
        </details>
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
            <strong data-testid="stability-value">{stabilityLabel(q.stability)}</strong>
          </span>
          <span
            className="stability-bar"
            role="meter"
            aria-label="World Stability"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={q.stabilityPercent}
          >
            <span style={{ width: `${q.stabilityPercent}%` }} />
          </span>
        </div>
      )}
    </article>
  );
}
