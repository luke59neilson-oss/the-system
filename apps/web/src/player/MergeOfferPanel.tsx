import { useState } from 'react';
import type { PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { isConnectionError } from './selection';

/**
 * A merge the GM sent (ROADMAP MT.2, DESIGN §6, Q62): the System offers to
 * fuse two of the player's skills into one. Accept applies it (the merge DING
 * follows); Decline keeps both originals. Shown only to the owner while the
 * offer is open.
 */
export function MergeOfferPanel({ view, client }: { view: PlayerView; client: LiveClient | null }) {
  const offer = view.me.mergeOffer;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (offer === null) return null;
  const rarityName = (id: string | null) =>
    id === null ? null : (view.rules.rarities.find((r) => r.id === id)?.name ?? id);
  const rarity = rarityName(offer.rarity);
  const [first, second] = offer.skills;
  const answer = async (accept: boolean) => {
    if (!client) return;
    setBusy(true);
    setError(null);
    const result = await client.command({
      type: 'skill.answerMerge',
      characterId: view.me.id,
      offerId: offer.offerId,
      accept,
    });
    setBusy(false);
    if (result.ok) return;
    setError(
      isConnectionError(result.error)
        ? 'Connection lost. Check your skills once you are back: your answer may already be in.'
        : friendlyError(result.error),
    );
  };
  return (
    <section
      className="window merge-offer-window"
      aria-labelledby="merge-offer-heading"
      data-testid="merge-offer"
    >
      <h2 id="merge-offer-heading">Skill Merge</h2>
      <p>
        The System offers to merge <span className="skill-name">[{first}]</span> and{' '}
        <span className="skill-name">[{second}]</span> into{' '}
        <span className="skill-name">
          [{offer.name}
          {rarity ? ` (${rarity})` : ''}]
        </span>
        .
      </p>
      {offer.description && <p className="skill-text">{offer.description}</p>}
      {offer.flavor && <p className="skill-flavor muted">{offer.flavor}</p>}
      <p className="muted">
        Accepting consumes both skills; the new skill starts at 0 marks. Declining keeps both.
      </p>
      {client && (
        <p className="merge-offer-actions">
          <button type="button" disabled={busy} onClick={() => void answer(true)}>
            Accept merge
          </button>{' '}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void answer(false)}
          >
            Decline
          </button>
        </p>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
