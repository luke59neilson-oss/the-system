import {
  MAX_TABLE_PANES,
  paneUrl,
  tablePanes,
  togglePane,
  type PartyMember,
  type Perspective,
} from './perspective';

/**
 * The GM app's "View as" bar (ROADMAP MS.3): [GM] [each character] [Table view].
 */
export function PerspectiveBar({
  party,
  current,
  onChange,
}: {
  party: readonly PartyMember[];
  current: Perspective;
  onChange: (p: Perspective) => void;
}) {
  const button = (key: string, label: string, p: Perspective, active: boolean) => (
    <button
      key={key}
      type="button"
      className={active ? 'view-as-btn active' : 'view-as-btn'}
      aria-pressed={active}
      onClick={() => onChange(p)}
    >
      {label}
    </button>
  );
  return (
    <nav className="view-as" aria-label="View as">
      <span className="muted">View as</span>
      {button('gm', 'GM', { kind: 'gm' }, current.kind === 'gm')}
      {party.map((m) =>
        button(
          `c-${m.id}`,
          m.name,
          { kind: 'character', characterId: m.id },
          current.kind === 'character' && current.characterId === m.id,
        ),
      )}
      {button('table', 'Table view', { kind: 'table' }, current.kind === 'table')}
    </nav>
  );
}

/**
 * One player's screen as a real player client: a frame on the ordinary player
 * page, which joins without the GM key and receives only that player's view.
 */
export function PlayerPane({ member }: { member: PartyMember }) {
  return (
    <section className="pane" aria-label={`${member.name} (player view)`}>
      <h2 className="pane-title">
        <span className="muted">Player view ·</span> {member.name}
      </h2>
      <iframe
        className="pane-frame"
        title={`${member.name} (player view)`}
        src={paneUrl(member.id)}
        data-testid={`pane-${member.id}`}
      />
    </section>
  );
}

/** Table view's right side: which characters to show (max 4) and their panes. */
export function TablePanes({
  party,
  picked,
  onPick,
}: {
  party: readonly PartyMember[];
  picked: readonly string[] | null;
  onPick: (ids: string[]) => void;
}) {
  const shown = tablePanes(party, picked);
  const shownIds = new Set(shown.map((m) => m.id));
  return (
    <div className="table-panes">
      {party.length > MAX_TABLE_PANES && (
        <fieldset className="pane-picker">
          <legend>Panes (up to {MAX_TABLE_PANES})</legend>
          {party.map((m) => (
            <label key={m.id} className="check">
              <input
                type="checkbox"
                checked={shownIds.has(m.id)}
                disabled={!shownIds.has(m.id) && shown.length >= MAX_TABLE_PANES}
                onChange={() => onPick(togglePane(party, picked, m.id))}
              />
              {m.name}
            </label>
          ))}
        </fieldset>
      )}
      {shown.length === 0 ? (
        <p className="muted window">
          {party.length === 0
            ? 'Create a character to see their screen here.'
            : 'Pick up to four characters to show.'}
        </p>
      ) : (
        <div className={`pane-grid panes-${shown.length}`}>
          {shown.map((m) => (
            <PlayerPane key={m.id} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}
