import { useState } from 'react';
import type { CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Path = readonly (string | number)[];

/** "aboveLevelBonusPerLevel" → "Above level bonus per level". */
export function fieldLabel(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function setAt(root: Json, path: Path, value: Json): Json {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const copy = [...root];
    copy[head as number] = setAt(copy[head as number] ?? null, rest, value);
    return copy;
  }
  const obj = (root ?? {}) as { [key: string]: Json };
  return { ...obj, [head as string]: setAt(obj[head as string] ?? null, rest, value) };
}

/** Keys that other data points at, or that only the app may change (D161). */
const LOCKED_KEYS = new Set(['id', 'configVersion']);

function itemLabel(value: Json, index: number): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const name = value.name ?? value.id;
    if (typeof name === 'string') return name;
  }
  return `#${index + 1}`;
}

function Field({
  name,
  label,
  value,
  path,
  onChange,
  depth,
  open = false,
  onToggle = () => undefined,
}: {
  name: string;
  label: string;
  value: Json;
  path: Path;
  onChange: (path: Path, value: Json) => void;
  depth: number;
  open?: boolean;
  onToggle?: (name: string, open: boolean) => void;
}) {
  const id = `rules-${path.join('-')}`;
  if (value !== null && typeof value === 'object') {
    const entries: [string, string, Json][] = Array.isArray(value)
      ? value.map((v, i) => [String(i), itemLabel(v, i), v])
      : Object.entries(value).map(([k, v]) => [k, fieldLabel(k), v]);
    const body = entries.map(([k, l, v]) => (
      <Field
        key={k}
        name={k}
        label={l}
        value={v}
        path={[...path, Array.isArray(value) ? Number(k) : k]}
        onChange={onChange}
        depth={depth + 1}
      />
    ));
    if (depth === 0) {
      // Rendered only while open: a closed section adds no fields to the page.
      return (
        <details
          className="rules-section"
          open={open}
          onToggle={(e) => onToggle(name, e.currentTarget.open)}
        >
          <summary>{label}</summary>
          {open && <div className="rules-body">{body}</div>}
        </details>
      );
    }
    return (
      <fieldset className="rules-group">
        <legend>{label}</legend>
        {body}
      </fieldset>
    );
  }
  const locked = LOCKED_KEYS.has(name);
  if (typeof value === 'boolean') {
    return (
      <label className="rules-field check">
        <input
          type="checkbox"
          id={id}
          checked={value}
          disabled={locked}
          onChange={(e) => onChange(path, e.target.checked)}
        />{' '}
        {label}
      </label>
    );
  }
  return (
    <label className="rules-field">
      {label}
      <input
        id={id}
        type={typeof value === 'number' ? 'number' : 'text'}
        step="any"
        value={value === null ? '' : String(value)}
        readOnly={locked}
        onChange={(e) =>
          onChange(
            path,
            typeof value === 'number'
              ? e.target.value === ''
                ? Number.NaN
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </label>
  );
}

/**
 * M4.9: every rules-config value as a form. Save sends the whole edited
 * config as one `rules.set` (validated by the engine, undoable from the
 * change log); Reset puts back the DESIGN defaults after a confirm step.
 */
export function RulesSettings({ client, state }: { client: LiveClient; state: CampaignState }) {
  const current = JSON.stringify(state.rules);
  // null = no edits: the form shows the campaign's rules as they are now.
  const [edits, setEdits] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const onToggle = (name: string, isOpen: boolean) =>
    setOpened((prev) => {
      if (prev.has(name) === isOpen) return prev;
      const next = new Set(prev);
      if (isOpen) next.add(name);
      else next.delete(name);
      return next;
    });
  const draft: Json = edits ?? (JSON.parse(current) as Json);
  const dirty = JSON.stringify(draft) !== current;
  const onChange = (path: Path, value: Json) => {
    setEdits(setAt(draft, path, value));
    setStatus(null);
  };
  const send = (command: { type: string } & Record<string, unknown>, done: string) =>
    void client.command(command).then((res) => {
      if (res.ok) {
        setEdits(null);
        setError(null);
        setStatus(done);
      } else {
        setError(friendlyError(res.error));
        setStatus(null);
      }
    });
  const sections = draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  return (
    <section className="window rules-settings" aria-labelledby="rules-settings">
      <h2 id="rules-settings">Rules settings</h2>
      <p className="muted small">
        Every number the game uses. Changes apply from now on and show in the change log, where they
        can be undone. Ids stay fixed in a running campaign.
      </p>
      {Object.entries(sections).map(([k, v]) =>
        k === 'configVersion' ? null : (
          <Field
            key={k}
            name={k}
            label={fieldLabel(k)}
            value={v}
            path={[k]}
            onChange={onChange}
            depth={0}
            open={opened.has(k)}
            onToggle={onToggle}
          />
        ),
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="ok" role="status">
          {status}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => send({ type: 'rules.set', rules: draft }, 'Rules saved.')}
        >
          Save rules
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!dirty}
          onClick={() => {
            setEdits(null);
            setError(null);
          }}
        >
          Discard changes
        </button>
        {confirmReset ? (
          <>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setConfirmReset(false);
                send({ type: 'rules.reset' }, 'Rules reset to the defaults.');
              }}
            >
              Confirm reset
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmReset(false)}>
              Keep my rules
            </button>
          </>
        ) : (
          <button type="button" className="secondary" onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </button>
        )}
      </div>
    </section>
  );
}
