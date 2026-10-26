import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  DEFAULT_RULES,
  STARTER_CLASSES,
  entryForSkill,
  librarySkill,
  type CampaignState,
} from '@the-system/engine';
import { activeBanners, useTick } from '../banners';
import { friendlyError } from '../format';
import { forgetGmKey, takeGmKey } from '../gmKey';
import { LiveClient, type CommandResult, type LiveSnapshot } from '../live';
import { CampaignSwitch } from './CampaignSwitch';
import { feedRows } from './feed';
import { JoinPanel } from './JoinPanel';
import { SkillLibrary } from './SkillLibrary';
import { ItemLibrary } from './ItemLibrary';
import { Shops } from './Shops';
import { clearLoadingCommand, loadingBannerId, loadingCommand } from './loadingScreen';
import { LootTables } from './LootTables';
import { CurrencyLedger } from './CurrencyLedger';
import { TitleLibrary } from './TitleLibrary';
import { OriginLibrary } from './OriginLibrary';
import { entriesOf } from './originLibraryModel';
import { resolvePerspective, type PartyMember, type Perspective } from './perspective';
import { PerspectiveBar, PlayerPane, TablePanes } from './ViewAs';
import { SessionPanel } from './SessionPanel';
import { ContentImport, type IncomingContent } from './ContentImport';
import { CoDmPanel } from './CoDmPanel';
import { PortraitPicker } from './PortraitControls';
import { PartyDashboard } from './PartyDashboard';
import { XpAward } from './XpAward';
import { OfferBuilder, type OfferTarget } from './OfferBuilder';
import { ChangeLog } from './ChangeLog';
import { EvolutionBuilder } from './EvolutionBuilder';
import { MarksReview } from './MarksReview';
import { MergeBuilder } from './MergeBuilder';
import { PracticeCapture } from './PracticeCapture';
import { QuestManager } from './QuestManager';
import { Bestiary } from './Bestiary';
import { Trackers } from './Trackers';
import { Encounter } from './Encounter';
import { RulesSettings } from './RulesSettings';
import { CoDmSettings } from './CoDmSettings';
import { uploadPortrait } from './portraitUpload';
import { sessionSummary } from './sessionModel';

/**
 * Minimal GM screen (ROADMAP MS.1): create a campaign and characters from a
 * built-in starter class, award XP with the even split, send a System
 * broadcast. The full console replaces this in M4.
 */
export function GmScreen() {
  const [gmKey] = useState(() => takeGmKey());
  const client = useMemo(() => (gmKey ? new LiveClient({ role: 'gm', gmKey }) : null), [gmKey]);
  useEffect(() => () => client?.close(), [client]);
  // A GM link pasted into this tab changes only the fragment: reload to pick up the key.
  useEffect(() => {
    const onHash = () => {
      if (/(^#|&)key=/.test(window.location.hash)) window.location.reload();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!client) {
    return (
      <main className="gm">
        <h1>The System · GM</h1>
        <section className="window" role="alert">
          <h2>GM key needed</h2>
          <p>
            Open the GM console from the desktop app (its “Players join” box has a GM link for other
            browsers on this computer), or use the GM link printed in the server terminal (it ends
            in <code>#key=…</code>).
          </p>
        </section>
      </main>
    );
  }
  return <GmConsole client={client} gmKey={gmKey ?? ''} />;
}

function useLive(client: LiveClient): LiveSnapshot {
  return useSyncExternalStore(
    (onChange) => client.subscribe(onChange),
    () => client.current,
  );
}

function partyOf(state: CampaignState | null): PartyMember[] {
  if (!state) return [];
  return state.characterOrder.flatMap((id) => {
    const c = state.characters[id];
    return c ? [{ id, name: c.name }] : [];
  });
}

function GmConsole({ client, gmKey }: { client: LiveClient; gmKey: string }) {
  const live = useLive(client);
  const state = live.state;
  const [wanted, setWanted] = useState<Perspective>({ kind: 'gm' });
  const [picked, setPicked] = useState<string[] | null>(null);
  // A dashboard selection chip asks the offer builder to open that selection (M5.1).
  const [offerTarget, setOfferTarget] = useState<OfferTarget | null>(null);
  // Once opened, Table view's panes stay connected (hidden) across switches.
  const [tableOpened, setTableOpened] = useState(false);
  // MC.2: co-DM generations open in the Import window.
  const [incoming, setIncoming] = useState<IncomingContent | null>(null);
  // MC.4: the loading screen sent with a generation, cleared on approval if asked.
  const [loading, setLoading] = useState<{
    text: string;
    since: number;
    clearOnApprove: boolean;
  } | null>(null);
  const loadingId = state && loading ? loadingBannerId(state, loading.text, loading.since) : null;
  // Takes the current loading screen down (a regeneration replaces it; a
  // failed or cancelled generation, or an approval, ends it).
  const endLoading = () => {
    const command = state && loadingId !== null ? clearLoadingCommand(state, loadingId) : null;
    setLoading(null);
    if (command) void client.command(command);
  };
  const sendLoading = (text: string, clearOnApprove: boolean) => {
    const command = loadingCommand(text);
    if (!state || !command) return;
    endLoading();
    setLoading({ text: text.trim(), since: state.broadcasts.length, clearOnApprove });
    void client.command(command);
  };
  const approved = () => {
    if (loading?.clearOnApprove) endLoading();
  };
  const party = useMemo(() => partyOf(state), [state]);
  const view = resolvePerspective(wanted, party);
  if (view.kind === 'table' && !tableOpened) setTableOpened(true);
  const viewed =
    view.kind === 'character' ? party.find((m) => m.id === view.characterId) : undefined;

  if (live.status === 'refused') {
    return (
      <main className="gm">
        <h1>The System · GM</h1>
        <section className="window" role="alert">
          <h2>Not connected</h2>
          <p>{live.error}</p>
          <button
            type="button"
            onClick={() => {
              forgetGmKey();
              window.location.reload();
            }}
          >
            Forget key
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={`gm perspective-${state ? view.kind : 'gm'}`}>
      <header className="gm-header">
        <h1>The System · GM</h1>
        <span className={`status status-${live.status}`} data-testid="connection">
          {live.status === 'joined'
            ? 'Connected'
            : live.status === 'offline'
              ? 'Reconnecting…'
              : 'Connecting…'}
        </span>
        {state && <SessionChip state={state} />}
        {state && <BannersChip client={client} state={state} />}
        {state && <PerspectiveBar party={party} current={view} onChange={setWanted} />}
      </header>
      {live.status === 'joined' && <CampaignSwitch gmKey={gmKey} stateName={state?.name ?? null} />}
      {live.status === 'joined' && state === null && <CreateCampaign client={client} />}
      {state && (
        <div className="perspective-body">
          {/* Kept mounted while viewing as a character so half-filled GM forms survive. */}
          <div className="gm-pane" hidden={view.kind === 'character'}>
            <div className="gm-grid">
              <PartyDashboard
                client={client}
                gmKey={gmKey}
                state={state}
                onBuildMenu={(characterId, level) =>
                  setOfferTarget((t) => ({ characterId, level, n: (t?.n ?? 0) + 1 }))
                }
              />
              <SessionPanel client={client} state={state} gmKey={gmKey} />
              <CoDmPanel
                gmKey={gmKey}
                onGenerated={(c) => setIncoming((cur) => ({ ...c, seq: (cur?.seq ?? 0) + 1 }))}
                onLoading={sendLoading}
                onLoadingFailed={endLoading}
              />
              <ContentImport
                client={client}
                gmKey={gmKey}
                incoming={incoming}
                onApproved={approved}
              />
              <JoinPanel gmKey={gmKey} />
              <CreateCharacter client={client} gmKey={gmKey} state={state} />
              <XpAward client={client} state={state} />
              <Encounter client={client} state={state} />
              <OfferBuilder client={client} state={state} target={offerTarget} />
              <EvolutionBuilder client={client} state={state} />
              <PracticeCapture client={client} state={state} />
              <QuestManager client={client} state={state} />
              <Bestiary client={client} state={state} />
              <Trackers client={client} state={state} />
              <MarksReview client={client} state={state} />
              <MergeBuilder client={client} state={state} />
              <Broadcast client={client} state={state} />
              <ChangeLog client={client} gmKey={gmKey} state={state} />
              <SkillText client={client} state={state} />
              <SkillLibrary client={client} state={state} />
              <ItemLibrary client={client} state={state} />
              <Shops client={client} state={state} />
              <LootTables client={client} state={state} />
              <CurrencyLedger client={client} state={state} />
              <TitleLibrary client={client} state={state} />
              <OriginLibrary client={client} state={state} />
              <RulesSettings client={client} state={state} />
              <CoDmSettings gmKey={gmKey} />
              <Feed live={live} state={state} />
            </div>
          </div>
          {viewed && (
            <div className="single-pane">
              <PlayerPane key={viewed.id} member={viewed} />
            </div>
          )}
          {tableOpened && (
            <div className="table-side" hidden={view.kind !== 'table'}>
              <TablePanes party={party} picked={picked} onPick={setPicked} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}

/** Header reminder of the play session and day (M4.3), visible from every view. */
function SessionChip({ state }: { state: CampaignState }) {
  const { running } = sessionSummary(state);
  return (
    <span
      className={`session-chip${running ? ' running' : ''}`}
      data-testid="session-chip"
      title={running ? undefined : 'Start a session in the Session window'}
    >
      {running ? `Session ${running.number}` : 'No session'} · Day {state.day}
    </span>
  );
}

/**
 * MT.6: how many banners are up on players' screens, beside the session chip,
 * with Remove all, so the GM never forgets a pinned banner below the fold.
 */
function BannersChip({ client, state }: { client: LiveClient; state: CampaignState }) {
  const timed = state.broadcasts.some((b) => b.display?.mode === 'timed' && !b.removed);
  const now = useTick(timed);
  const up = activeBanners(state.broadcasts, now, (b) => Date.parse(b.at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (up.length === 0) return null;
  const removeAll = async () => {
    setBusy(true);
    setError(null);
    for (const b of up) {
      const r = await client.command({ type: 'broadcast.remove', id: b.id });
      if (!r.ok) {
        setError(friendlyError(r.error));
        break;
      }
    }
    setBusy(false);
  };
  return (
    <span className="banners-chip" data-testid="banners-chip">
      <a href="#broadcast">{up.length === 1 ? '1 banner up' : `${up.length} banners up`}</a>
      <button
        type="button"
        className="secondary small"
        disabled={busy}
        onClick={() => void removeAll()}
      >
        Remove all
      </button>
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/** Runs a command and keeps its outcome for display. */
function useCommand(client: LiveClient) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const run = async (command: { type: string } & Record<string, unknown>) => {
    setBusy(true);
    const r = await client.command(command);
    setResult(r.ok ? r : { ok: false, error: friendlyError(r.error) });
    setBusy(false);
    return r;
  };
  return { busy, result, run };
}

function Outcome({ result, okText }: { result: CommandResult | null; okText: string }) {
  if (!result) return null;
  return result.ok ? (
    <p className="ok" role="status">
      {okText}
    </p>
  ) : (
    <p className="err" role="alert">
      {result.error}
    </p>
  );
}

function CreateCampaign({ client }: { client: LiveClient }) {
  const [name, setName] = useState('');
  const [defaults, setDefaults] = useState(true);
  const { busy, result, run } = useCommand(client);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run({ type: 'campaign.create', name, rules: DEFAULT_RULES });
    // The default class, race and skill libraries (M4.2; no professions, MQ.6); if this
    // fails or is left out, the library window offers it again.
    if (r.ok && defaults) await client.command({ type: 'library.seedDefaults' });
  };
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="new-campaign">
      <h2 id="new-campaign">New campaign</h2>
      <label>
        Campaign name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <label className="check">
        <input type="checkbox" checked={defaults} onChange={(e) => setDefaults(e.target.checked)} />
        Start with the default classes, Human race and their skills
      </label>
      <button type="submit" disabled={busy}>
        Create campaign
      </button>
      <Outcome result={result} okText="Campaign created" />
    </form>
  );
}

/** A class the form can start a character with: the library's, else the built-in starters. */
interface ClassChoice {
  id: string;
  name: string;
  description: string;
  skills: readonly { name: string; rarity: string; description?: string; flavor?: string }[];
  weights: Readonly<Record<string, number>>;
}

function CreateCharacter({
  client,
  gmKey,
  state,
}: {
  client: LiveClient;
  gmKey: string;
  state: CampaignState;
}) {
  const [name, setName] = useState('');
  const [image, setImage] = useState<Blob | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const library = entriesOf(state, 'class') as ClassChoice[];
  // Campaigns made before M4.2 may have no classes yet; the built-in six keep working.
  const classes: readonly ClassChoice[] = library.length > 0 ? library : STARTER_CLASSES;
  const races = entriesOf(state, 'race').map((r) => r.name);
  const raceChoices = races.length > 0 ? races : [state.rules.character.defaultRace];
  const [classId, setClassId] = useState('');
  const [race, setRace] = useState('');
  const { busy, result, run } = useCommand(client);
  const chosen = classes.find((c) => c.id === classId) ?? classes[0];
  const chosenRace = raceChoices.includes(race) ? race : (raceChoices[0] ?? '');
  const rarityName = (id: string) =>
    state.rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setUploadError(null);
    let portrait: string | undefined;
    if (image) {
      setUploading(true);
      const uploaded = await uploadPortrait(gmKey, image);
      setUploading(false);
      if (!uploaded.ok) {
        setUploadError(uploaded.error);
        return;
      }
      portrait = uploaded.portrait;
    }
    const r = await run({
      type: 'character.create',
      name,
      className: chosen.name,
      race: chosenRace,
      // Built-in starters carry their own skill text; library classes take it from the skill library.
      classSkills: chosen.skills.map((s) => ({
        name: s.name,
        rarity: s.rarity,
        ...('description' in s ? { description: s.description, flavor: s.flavor } : {}),
      })),
      classWeights: chosen.weights,
      ...(portrait === undefined ? {} : { portrait }),
    });
    if (r.ok) {
      setName('');
      setImage(null);
    }
  };
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="new-character">
      <h2 id="new-character">New character</h2>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <label>
        Starting class
        <select value={chosen?.id ?? ''} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Race
        <select value={chosenRace} onChange={(e) => setRace(e.target.value)}>
          {raceChoices.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <p className="muted">
          {chosen.description} Skills:{' '}
          {chosen.skills.map((s) => `[${s.name} (${rarityName(s.rarity)})]`).join(' ')}
          {` [${state.rules.skills.startingRaceSkill.name} (${rarityName(state.rules.skills.startingRaceSkill.rarity)})] (race skill, added automatically)`}
        </p>
      )}
      <PortraitPicker name={name} image={image} onImage={setImage} />
      <button type="submit" disabled={busy || uploading || !chosen}>
        {uploading ? 'Uploading portrait…' : 'Create character'}
      </button>
      {uploadError ? (
        <p className="err" role="alert">
          {uploadError}
        </p>
      ) : (
        <Outcome result={result} okText="Character created" />
      )}
    </form>
  );
}

/**
 * Writes a skill's System description and flavour (M3.5, D78) until the skill
 * library (M4.1) does it on grant. Picking a skill loads its current text.
 */
function SkillText({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [characterId, setCharacterId] = useState('');
  const [skillName, setSkillName] = useState('');
  // The draft belongs to one character's skill (`<id>/<name>`); null means the
  // fields show the stored text. It resets after a save (M3.5 review).
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [flavor, setFlavor] = useState('');
  const { busy, result, run } = useCommand(client);
  const character =
    state.characters[characterId] ?? state.characters[state.characterOrder[0] ?? ''];
  const skills = character?.skills ?? [];
  const current = skills.find((s) => s.name === skillName) ?? skills[0];
  const draftKey = character && current ? `${character.id}/${current.name}` : '';
  const loaded = draftFor !== null && draftFor === draftKey;
  const shownDescription = loaded ? description : (current?.description ?? '');
  const shownFlavor = loaded ? flavor : (current?.flavor ?? '');
  const edit = (field: 'description' | 'flavor', value: string) => {
    if (!loaded) {
      setDescription(current?.description ?? '');
      setFlavor(current?.flavor ?? '');
      setDraftFor(draftKey);
    }
    if (field === 'description') setDescription(value);
    else setFlavor(value);
  };
  const unchanged =
    current !== undefined &&
    shownDescription.trim() === (current.description ?? '') &&
    shownFlavor.trim() === (current.flavor ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!character || !current) return;
    const r = await run({
      type: 'skill.describe',
      characterId: character.id,
      skill: current.name,
      description: shownDescription,
      flavor: shownFlavor,
    });
    setReconnected(false);
    if (r.ok) setDraftFor(null);
  };
  // MR.4 (L17): a hand-written copy can be handed back to the library entry for
  // its current name and rarity; the button is disabled when there is none.
  const byRarity = state.rules.skills.libraryByRarity;
  // The entry Use library text would reconnect to (current rarity), and the one
  // an unedited copy follows now (a re-rated copy keeps its old text rarity).
  const entry =
    current &&
    librarySkill(state.skillLibrary, current.name, byRarity ? current.rarity : undefined);
  const reconnectable =
    entry !== undefined &&
    entry !== null &&
    (entry.description.trim() !== '' || entry.flavor.trim() !== '');
  const followed = current && entryForSkill(state.rules, state.skillLibrary, current);
  const handWritten = current?.textEdited === true;
  // MR.A: a copy re-rated at evolution follows its old rarity's entry; Use
  // library text moves it to the entry for its current rarity.
  const textRarity = current?.textRarity;
  const rerated = textRarity !== undefined && textRarity !== current?.rarity;
  const detached = handWritten || rerated;
  const textRarityName =
    state.rules.skills.rarities.find((r) => r.id === textRarity)?.name ?? textRarity;
  const [reconnected, setReconnected] = useState(false);
  const reconnect = async () => {
    if (!character || !current) return;
    const r = await run({
      type: 'skill.useLibraryText',
      characterId: character.id,
      skill: current.name,
    });
    setReconnected(r.ok);
    if (r.ok) setDraftFor(null);
  };
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="skill-text">
      <h2 id="skill-text">Skill text</h2>
      <label>
        Character
        <select
          value={character?.id ?? ''}
          onChange={(e) => {
            setCharacterId(e.target.value);
            setSkillName('');
            setDraftFor(null);
          }}
        >
          {state.characterOrder.map((id) => (
            <option key={id} value={id}>
              {state.characters[id]?.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Skill
        <select
          value={current?.name ?? ''}
          onChange={(e) => {
            setSkillName(e.target.value);
            setDraftFor(null);
          }}
        >
          {skills.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Description
        <textarea
          value={shownDescription}
          onChange={(e) => edit('description', e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </label>
      <label>
        Flavour
        <input
          value={shownFlavor}
          onChange={(e) => edit('flavor', e.target.value)}
          maxLength={1000}
        />
      </label>
      {byRarity && (
        <p className="muted hint">
          {state.rules.skills.handTextSurvivesUpgrade
            ? 'Saving here makes this copy the character’s own: library edits and upgrades keep its text until you press Use library text.'
            : 'Saving here makes this copy the character’s own: later library edits skip it until it reaches a rarity the library has text for.'}
        </p>
      )}
      {byRarity && current && (
        <p className="muted" data-testid="skill-text-source">
          {handWritten
            ? 'Hand-written text.'
            : followed
              ? rerated
                ? `Follows the ${textRarityName} library entry (re-rated at evolution).`
                : 'Follows the library entry.'
              : 'No library entry for this rarity.'}
        </p>
      )}
      <button type="submit" disabled={busy || !current || unchanged}>
        Save skill text
      </button>
      {byRarity && (
        <button
          type="button"
          className="secondary"
          style={{ marginLeft: 8 }}
          disabled={busy || !current || !detached || !reconnectable}
          title={
            !detached
              ? 'This copy already follows the library'
              : !reconnectable
                ? 'The library has no entry with text for this skill at its rarity'
                : 'Replace this copy’s text with the library entry’s and follow later edits'
          }
          onClick={() => void reconnect()}
        >
          Use library text
        </button>
      )}
      <Outcome result={result} okText={reconnected ? 'Library text in use' : 'Skill text saved'} />
    </form>
  );
}

function Broadcast({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [text, setText] = useState('');
  const [to, setTo] = useState('all');
  const [several, setSeveral] = useState<ReadonlySet<string>>(new Set());
  const [when, setWhen] = useState<'now' | 'day'>('now');
  const [day, setDay] = useState('');
  const [show, setShow] = useState<'list' | 'timed' | 'pinned'>('list');
  const [amount, setAmount] = useState('30');
  const [unit, setUnit] = useState<'seconds' | 'minutes'>('seconds');
  const { busy, result, run } = useCommand(client);
  const cancel = useCommand(client);
  const remove = useCommand(client);
  // MT.6: a timed banner lasts 5 s to 24 h.
  const amountValue = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : NaN;
  const seconds = unit === 'minutes' ? amountValue * 60 : amountValue;
  const timeOk =
    when === 'day' ||
    show !== 'timed' ||
    (Number.isSafeInteger(seconds) && seconds >= 5 && seconds <= 86_400);
  const display =
    when === 'day' || show === 'list'
      ? undefined
      : show === 'pinned'
        ? ({ mode: 'pinned' } as const)
        : ({ mode: 'timed', seconds } as const);
  const [okText, setOkText] = useState('Broadcast sent');
  const name = (id: string) => state.characters[id]?.name ?? id;
  const recipients: string[] | null =
    to === 'all'
      ? null
      : to === 'several'
        ? state.characterOrder.filter((id) => several.has(id))
        : [to];
  const dayValue = /^\d+$/.test(day.trim()) ? Number(day.trim()) : NaN;
  const dayOk = when === 'now' || (Number.isSafeInteger(dayValue) && dayValue > state.day);
  const noOne = recipients !== null && recipients.length === 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(
      when === 'now'
        ? { type: 'system.broadcast', text, characterIds: recipients, display }
        : { type: 'broadcast.schedule', text, characterIds: recipients, day: dayValue },
    );
    if (r.ok) {
      setOkText(when === 'now' ? 'Broadcast sent' : `Scheduled for day ${dayValue}`);
      setText('');
      setShow('list');
    }
  };
  const pending = state.scheduledBroadcasts;
  return (
    <form className="window" onSubmit={(e) => void submit(e)} aria-labelledby="broadcast">
      <h2 id="broadcast">System broadcast</h2>
      <label>
        Message
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={2000}
          rows={3}
        />
      </label>
      <div className="broadcast-row">
        <label>
          To
          <select aria-label="Recipients" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="all">Everyone</option>
            {state.characterOrder.map((id) => (
              <option key={id} value={id}>
                {name(id)}
              </option>
            ))}
            {state.characterOrder.length > 1 && <option value="several">Several…</option>}
          </select>
        </label>
        <label>
          When
          <select
            aria-label="When"
            value={when}
            onChange={(e) => setWhen(e.target.value as 'now' | 'day')}
          >
            <option value="now">Now</option>
            <option value="day">On a later in-game day</option>
          </select>
        </label>
        {when === 'now' && (
          <label>
            Show
            <select
              aria-label="Show"
              value={show}
              onChange={(e) => setShow(e.target.value as 'list' | 'timed' | 'pinned')}
            >
              <option value="list">In the message list</option>
              <option value="timed">Also as a banner for…</option>
              <option value="pinned">Also as a banner until I remove it</option>
            </select>
          </label>
        )}
        {when === 'now' && show === 'timed' && (
          <>
            <label>
              For
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                aria-label="Banner time"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Unit
              <select
                aria-label="Banner time unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'seconds' | 'minutes')}
              >
                <option value="seconds">seconds</option>
                <option value="minutes">minutes</option>
              </select>
            </label>
          </>
        )}
        {when === 'day' && (
          <label>
            Send on day
            <input
              type="number"
              inputMode="numeric"
              min={state.day + 1}
              step={1}
              value={day}
              placeholder={String(state.day + 1)}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
        )}
      </div>
      {to === 'several' && (
        <fieldset>
          <legend>Recipients</legend>
          {state.characterOrder.map((id) => (
            <label key={id} className="check">
              <input
                type="checkbox"
                checked={several.has(id)}
                onChange={(e) => {
                  const next = new Set(several);
                  if (e.target.checked) next.add(id);
                  else next.delete(id);
                  setSeveral(next);
                }}
              />
              {name(id)}
            </label>
          ))}
        </fieldset>
      )}
      {when === 'day' && (
        <p className="muted small">
          Today is day {state.day}. It is sent when the in-game day reaches the day you pick
          (Session panel: advance the day). Scheduled messages go to the message list only, not as
          banners.
          {day.trim() !== '' && !dayOk && (
            <span className="err" role="alert">
              {' '}
              Pick a whole day after day {state.day}.
            </span>
          )}
        </p>
      )}
      {!timeOk && (
        <p className="err" role="alert">
          A banner shows for 5 seconds to 24 hours.
        </p>
      )}
      <button type="submit" disabled={busy || !dayOk || !timeOk || noOne || text.trim() === ''}>
        {when === 'now' ? 'Send broadcast' : 'Schedule broadcast'}
      </button>
      {noOne && <p className="muted small">Tick at least one recipient.</p>}
      <Outcome result={result} okText={okText} />
      <LiveBanners
        state={state}
        name={name}
        busy={remove.busy}
        onRemove={(id) => void remove.run({ type: 'broadcast.remove', id })}
      />
      <Outcome result={remove.result} okText="Banner taken down" />
      {pending.length > 0 && (
        <section aria-labelledby="scheduled-broadcasts">
          <h3 id="scheduled-broadcasts">Scheduled (GM only until sent)</h3>
          <ul className="scheduled">
            {[...pending]
              .map((b, i) => ({ b, i }))
              .sort((x, y) => x.b.day - y.b.day || x.i - y.i)
              .map(({ b }) => (
                <li key={b.id} data-testid={`scheduled-${b.id}`}>
                  <strong>Day {b.day}</strong> · to{' '}
                  {b.characterIds === null ? 'everyone' : b.characterIds.map(name).join(', ')}:{' '}
                  <span className="scheduled-text">{b.text}</span>{' '}
                  <button
                    type="button"
                    className="secondary small"
                    disabled={cancel.busy}
                    aria-label={`Cancel the day ${b.day} broadcast to ${b.characterIds === null ? 'everyone' : b.characterIds.map(name).join(', ')}`}
                    onClick={() => void cancel.run({ type: 'broadcast.unschedule', id: b.id })}
                  >
                    Cancel
                  </button>
                </li>
              ))}
          </ul>
          <Outcome result={cancel.result} okText="Scheduled message cancelled" />
        </section>
      )}
    </form>
  );
}

/** MT.6: banners up on players' screens now, each with Remove. */
function LiveBanners({
  state,
  name,
  busy,
  onRemove,
}: {
  state: CampaignState;
  name: (id: string) => string;
  busy: boolean;
  onRemove: (id: string) => void;
}) {
  const timed = state.broadcasts.some((b) => b.display?.mode === 'timed' && !b.removed);
  const now = useTick(timed);
  // The server runs on this laptop, so its send times match this clock.
  const up = activeBanners(state.broadcasts, now, (b) => Date.parse(b.at));
  if (up.length === 0) return null;
  return (
    <section aria-labelledby="live-banners">
      <h3 id="live-banners">Banners on players’ screens</h3>
      <ul className="scheduled">
        {up.map((b) => (
          <li key={b.id} data-testid={`banner-${b.id}`}>
            <strong>
              {b.display?.mode === 'timed'
                ? `${Math.max(0, Math.ceil((Date.parse(b.at) + b.display.seconds * 1000 - now) / 1000))} s left`
                : 'Pinned'}
            </strong>{' '}
            · to {b.characterIds === null ? 'everyone' : b.characterIds.map(name).join(', ')}:{' '}
            <span className="scheduled-text">{b.text}</span>{' '}
            <button
              type="button"
              className="secondary small"
              disabled={busy}
              aria-label={`Remove the banner: ${b.text}`}
              onClick={() => onRemove(b.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Feed({ live, state }: { live: LiveSnapshot; state: CampaignState }) {
  const rows = feedRows(live.notifications, state);
  return (
    <section className="window feed" aria-labelledby="feed">
      <h2 id="feed">System feed</h2>
      {rows.length === 0 ? (
        <p className="muted">Level-ups and broadcasts appear here.</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={row.key}>
              <span className="who">{row.who}</span> {row.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
