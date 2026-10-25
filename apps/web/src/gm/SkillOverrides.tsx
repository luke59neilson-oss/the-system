import { useState } from 'react';
import type { CampaignState, Character } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';

type Outcome = { ok: boolean; text: string } | null;
type Kind = 'class' | 'profession' | 'race';

/**
 * MT.7 (DESIGN §7 GM authority, Q60): the GM's way through the skill and
 * profession rules on the sheet editor. Each control sends one logged,
 * undoable event and says first what it skips.
 */
export function SkillOverrides({
  client,
  state,
  character: c,
}: {
  client: LiveClient;
  state: CampaignState;
  character: Character;
}) {
  const { rules } = state;
  const rarities = rules.skills.rarities.filter((r) => !r.reserved);
  const rarityName = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const rank = (id: string) => rules.skills.rarities.findIndex((r) => r.id === id);
  const grade = rules.grades.find((g) => g.id === c.grade);
  const ceiling = grade?.rarityCeiling ?? '';
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const send = async (command: { type: string } & Record<string, unknown>, okText: string) => {
    setBusy(true);
    setOutcome(null);
    const r = await client.command(command);
    setBusy(false);
    setOutcome(r.ok ? { ok: true, text: okText } : { ok: false, text: friendlyError(r.error) });
    return r.ok;
  };

  // Set a rarity directly.
  const [skillPick, setSkillPick] = useState('');
  const skill = c.skills.find((s) => s.name === skillPick) ?? c.skills[0];
  const [rarityPick, setRarityPick] = useState('');
  const rarity = rarities.some((r) => r.id === rarityPick) ? rarityPick : (skill?.rarity ?? '');
  const rarityNotes: string[] = [];
  if (skill && rarity !== skill.rarity) {
    if (ceiling && rank(rarity) > rank(ceiling)) {
      rarityNotes.push(`above the ${c.grade}-grade ceiling (${rarityName(ceiling)})`);
    }
    if (rank(rarity) > rank(skill.rarity)) {
      rarityNotes.push('raised without marks; it starts at 0 marks, as every upgrade does');
    } else {
      rarityNotes.push('lowered; marks, text and effects stay');
      if (skill.kind === 'race')
        rarityNotes.push('a race skill such as Identify never drops by rule');
    }
  }

  // Give a skill outside selections.
  const [name, setName] = useState('');
  const [grantRarity, setGrantRarity] = useState(rarities[0]?.id ?? '');
  const [kind, setKind] = useState<Kind>('class');
  const [description, setDescription] = useState('');
  const trimmed = name.trim();
  const clash = c.skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const grantNotes = [
    'outside the selection schedule',
    ...(ceiling && rank(grantRarity) > rank(ceiling)
      ? [`above the ${c.grade}-grade ceiling (${rarityName(ceiling)})`]
      : []),
  ];

  // Grant a profession directly.
  const [profession, setProfession] = useState('');
  const unlock = rules.tracks.professionUnlockGrade;
  const gradeIndex = (id: string) => rules.grades.findIndex((g) => g.id === id);
  const early = gradeIndex(c.grade) < gradeIndex(unlock);
  const replacing = c.profession !== null;

  return (
    <fieldset className="sheet-overrides" aria-label="Skill and profession overrides">
      <legend>Skills and profession (GM override)</legend>
      <p className="muted small">
        Normally skills come from selections, marks and merges, and a profession from the {unlock}
        -grade evolution. These skip that; each is logged and can be undone in the change log.
      </p>
      {skill && (
        <div className="override-row" role="group" aria-label="Set a skill’s rarity">
          <label>
            Skill
            <select
              value={skill.name}
              onChange={(e) => {
                setSkillPick(e.target.value);
                setRarityPick('');
              }}
            >
              {c.skills.map((s) => (
                <option key={s.name} value={s.name}>
                  [{s.name}] ({rarityName(s.rarity)})
                </option>
              ))}
            </select>
          </label>
          <label>
            New rarity
            <select value={rarity} onChange={(e) => setRarityPick(e.target.value)}>
              {rarities.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {rarityNotes.length > 0 && (
            <p className="warn small" data-testid="rarity-override-notes">
              Override: {rarityNotes.join('; ')}.
            </p>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy || rarity === skill.rarity}
            onClick={() =>
              void send(
                { type: 'skill.setRarity', characterId: c.id, skill: skill.name, rarity },
                `[${skill.name}] is now ${rarityName(rarity)}`,
              )
            }
          >
            Set rarity
          </button>
        </div>
      )}
      <div className="override-row" role="group" aria-label="Give a skill">
        <label>
          Give a skill
          <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Rarity
          <select value={grantRarity} onChange={(e) => setGrantRarity(e.target.value)}>
            {rarities.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="class">Class</option>
            <option value="profession" disabled={c.profession === null}>
              Profession
            </option>
            <option value="race">Race</option>
          </select>
        </label>
        <label>
          Description (optional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {clash && (
          <p className="warn small" role="alert">
            {c.name} already has a skill named [{trimmed}].
          </p>
        )}
        {trimmed !== '' && !clash && (
          <p className="warn small" data-testid="grant-override-notes">
            Override: {grantNotes.join('; ')}.
          </p>
        )}
        <button
          type="button"
          className="secondary"
          disabled={busy || trimmed === '' || clash}
          onClick={() =>
            void send(
              {
                type: 'skill.grant',
                characterId: c.id,
                name: trimmed,
                rarity: grantRarity,
                kind,
                description: description.trim() || null,
              },
              `${c.name} gained [${trimmed}] (${rarityName(grantRarity)})`,
            ).then((ok) => {
              if (ok) {
                setName('');
                setDescription('');
              }
            })
          }
        >
          Give skill
        </button>
      </div>
      <div className="override-row" role="group" aria-label="Grant a profession">
        <label>
          {replacing ? 'Replace the profession' : 'Grant a profession now'}
          <input
            value={profession}
            maxLength={100}
            onChange={(e) => setProfession(e.target.value)}
          />
        </label>
        {(early || replacing) && (
          <p className="warn small" data-testid="profession-override-notes">
            Override:{' '}
            {replacing
              ? `replaces [${c.profession}] (lvl ${c.professionLevel}); profession skills stay.`
              : `professions unlock at ${unlock}-grade; ${c.name} is ${c.grade}-grade.`}{' '}
            The new profession starts at class level {c.classLevel}.
          </p>
        )}
        <button
          type="button"
          className="secondary"
          disabled={busy || profession.trim() === '' || profession.trim() === c.profession}
          onClick={() =>
            void send(
              {
                type: 'character.grantProfession',
                characterId: c.id,
                profession: profession.trim(),
                ...(early || replacing ? { override: true } : {}),
              },
              `${c.name} is now a [${profession.trim()}]`,
            ).then((ok) => {
              if (ok) setProfession('');
            })
          }
        >
          {replacing ? 'Replace profession' : 'Grant profession'}
        </button>
      </div>
      {outcome && (
        <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
          {outcome.text}
        </p>
      )}
    </fieldset>
  );
}
