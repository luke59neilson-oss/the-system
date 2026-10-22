import { useEffect, useMemo, useRef, useState } from 'react';
import { portraitUrl, type CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { PortraitBadge } from '../PortraitBadge';
import { themeClass } from '../player/sheet';
import { PORTRAIT_ACCEPT, shrinkPortrait, uploadPortrait } from './portraitUpload';

/**
 * Picks an image for a new character (M4.4): shrinks it at once and shows a
 * preview; the caller uploads `image` when the form is submitted.
 */
export function PortraitPicker({
  name,
  image,
  onImage,
}: {
  name: string;
  image: Blob | null;
  onImage: (image: Blob | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      onImage(await shrinkPortrait(file));
    } catch (e) {
      onImage(null);
      setError(e instanceof Error ? e.message : 'Could not read that image');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return (
    <div className="portrait-picker">
      <PortraitBadge name={name || '?'} src={preview} />
      <div>
        <button type="button" className="secondary" onClick={() => inputRef.current?.click()}>
          {image ? 'Change portrait' : 'Add portrait'}
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept={PORTRAIT_ACCEPT}
          data-testid="portrait-file"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        {image && (
          <button type="button" className="secondary" onClick={() => onImage(null)}>
            Remove
          </button>
        )}
        <p className="muted small">Optional. PNG, JPEG or WebP; shrunk to 512 px.</p>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** A party row's portrait with Change and Remove (M4.4); each change is an undoable event. */
export function PortraitCell({
  client,
  gmKey,
  state,
  characterId,
}: {
  client: LiveClient;
  gmKey: string;
  state: CampaignState;
  characterId: string;
}) {
  const c = state.characters[characterId];
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!c) return null;
  const theme = state.rules.grades.find((g) => g.id === c.grade)?.theme ?? null;
  const set = async (portrait: string | null) => {
    const r = await client.command({ type: 'character.setPortrait', characterId, portrait });
    if (!r.ok) setError(friendlyError(r.error));
  };
  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await uploadPortrait(gmKey, await shrinkPortrait(file));
      if (!uploaded.ok) setError(uploaded.error);
      else if (uploaded.portrait !== c.portrait) await set(uploaded.portrait);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that image');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return (
    <div className="portrait-cell">
      <PortraitBadge
        name={c.name}
        src={portraitUrl(c.portrait)}
        className={`${themeClass(theme)} portrait-small`}
      />
      <button
        type="button"
        className="secondary small"
        disabled={busy}
        aria-label={`Change ${c.name}’s portrait`}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Uploading…' : 'Change'}
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept={PORTRAIT_ACCEPT}
        disabled={busy}
        data-testid={`portrait-file-${characterId}`}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {c.portrait !== null && (
        <button
          type="button"
          className="secondary small"
          disabled={busy}
          aria-label={`Remove ${c.name}’s portrait`}
          onClick={() => {
            setError(null);
            void set(null);
          }}
        >
          Remove
        </button>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
