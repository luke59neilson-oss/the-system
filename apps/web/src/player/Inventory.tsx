import { useEffect, useRef, useState } from 'react';
import type { PlayerTrade, PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  bonusText,
  bundleText,
  equipTarget,
  itemLabel,
  openTrades,
  parties,
  partyName,
  slotRows,
  wholeNumber,
} from './inventory';
import { cssToken } from './sheet';

type Form = { kind: 'give'; itemId: string | null } | { kind: 'trade' } | null;

/**
 * The player's inventory (ROADMAP M3.7, DESIGN §7 "Items"): currency,
 * equipment, items, gifts and trades. `client` is null in the GM's View-as
 * panes, which show the same window read-only.
 */
export function Inventory({ view, client }: { view: PlayerView; client: LiveClient | null }) {
  const rules = view.rules;
  const inv = view.inventory;
  const me = view.viewerId;
  const [form, setForm] = useState<Form>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (done === null) return;
    // The clicked button may be gone (equipped, unequipped, form closed):
    // keep keyboard users in the window, then let the message fade.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) heading.current?.focus();
    });
    const timer = setTimeout(() => setDone(null), 8000);
    return () => clearTimeout(timer);
  }, [done]);
  useEffect(() => {
    // The view that removes the clicked button can land after the result.
    if (done !== null && document.activeElement === document.body) heading.current?.focus();
  }, [inv, done]);
  const send = async (command: { type: string } & Record<string, unknown>, ok: string) => {
    if (!client) return false;
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await client.command(command);
    setBusy(false);
    if (result.ok) {
      setDone(ok);
      return true;
    }
    setError(friendlyError(result.error));
    return false;
  };
  const slots = slotRows(rules, inv);
  const worn = slots.filter((s) => s.itemId !== null);
  const held = Object.entries(inv.items);
  const trades = openTrades(inv, me);
  const label = (id: string) => itemLabel(rules, inv.itemDefs[id], id);
  const rarityClass = (id: string) => `rarity-${cssToken(inv.itemDefs[id]?.rarity ?? '')}`;
  return (
    <section
      className="window inventory-window"
      aria-labelledby="inventory-heading"
      data-testid="inventory"
    >
      <h2 id="inventory-heading" tabIndex={-1} ref={heading}>
        Inventory
      </h2>
      <dl className="rows">
        <dt>{rules.currencyName}</dt>
        <dd data-testid="currency">{inv.currency}</dd>
      </dl>
      <h3 id="equipment-heading">Equipment</h3>
      {worn.length === 0 ? (
        <p className="muted">Nothing equipped.</p>
      ) : (
        <ul className="items" aria-labelledby="equipment-heading" data-testid="equipment">
          {worn.map((s) => {
            const def = s.itemId === null ? undefined : inv.itemDefs[s.itemId];
            return (
              <li key={s.key} className={rarityClass(s.itemId ?? '')} data-testid={`slot-${s.key}`}>
                <span className="slot-label">{s.label}:</span>{' '}
                <span className="skill-name">{label(s.itemId ?? '')}</span>
                {def && def.bonuses.length > 0 && (
                  <span className="muted item-bonus"> {bonusText(rules, def)}</span>
                )}
                {client && (
                  <button
                    type="button"
                    className="assign-btn"
                    disabled={busy}
                    aria-label={`Unequip ${def?.name ?? s.itemId ?? ''}`}
                    onClick={() =>
                      void send(
                        { type: 'item.unequip', characterId: me, slot: s.slot, index: s.index },
                        `Unequipped ${label(s.itemId ?? '')}.`,
                      )
                    }
                  >
                    [Unequip]
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <h3 id="items-heading">Items</h3>
      {held.length === 0 ? (
        <p className="muted">No items.</p>
      ) : (
        <ul className="items" aria-labelledby="items-heading" data-testid="items">
          {held.map(([id, count]) => {
            const def = inv.itemDefs[id];
            const target = def ? equipTarget(rules, inv, def) : null;
            return (
              <li key={id} className={rarityClass(id)} data-testid={`item-${id}`}>
                <span className="skill-name">{label(id)}</span>
                {count > 1 && <span> ×{count}</span>}
                {def && def.bonuses.length > 0 && (
                  <span className="muted item-bonus"> {bonusText(rules, def)}</span>
                )}
                {def?.description && <p className="muted item-desc">{def.description}</p>}
                {client && (
                  <span className="item-actions">
                    {target && (
                      <button
                        type="button"
                        className="assign-btn"
                        disabled={busy}
                        aria-label={`Equip ${def?.name ?? id}`}
                        onClick={() =>
                          void send(
                            { type: 'item.equip', characterId: me, itemId: id, ...target },
                            `Equipped ${label(id)}.`,
                          )
                        }
                      >
                        [Equip]
                      </button>
                    )}
                    <button
                      type="button"
                      className="assign-btn"
                      disabled={busy}
                      aria-label={`Give ${def?.name ?? id}`}
                      onClick={() => {
                        setDone(null);
                        setError(null);
                        setForm({ kind: 'give', itemId: id });
                      }}
                    >
                      [Give]
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {client && (
        <p className="inventory-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDone(null);
              setError(null);
              setForm({ kind: 'give', itemId: null });
            }}
          >
            Give {rules.currencyName}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDone(null);
              setError(null);
              setForm({ kind: 'trade' });
            }}
          >
            Propose a trade
          </button>
        </p>
      )}
      {client && form?.kind === 'give' && (
        <GiveForm
          key={form.itemId ?? 'currency'}
          view={view}
          itemId={form.itemId}
          busy={busy}
          onCancel={() => setForm(null)}
          onGive={async (to, amount) => {
            const what =
              form.itemId === null ? { currency: amount } : { items: { [form.itemId]: amount } };
            const text = bundleText(rules, inv, {
              currency: form.itemId === null ? amount : 0,
              items: form.itemId === null ? {} : { [form.itemId]: amount },
            });
            if (
              await send(
                { type: 'gift.give', characterId: me, to, ...what },
                `Gave ${text} to ${partyName(view, to)}.`,
              )
            ) {
              setForm(null);
            }
          }}
        />
      )}
      {client && form?.kind === 'trade' && (
        <TradeForm
          view={view}
          busy={busy}
          onCancel={() => setForm(null)}
          onPropose={async (to, give, get) => {
            if (
              await send(
                { type: 'trade.propose', characterId: me, to, give, get },
                `Trade offered to ${partyName(view, to)}.`,
              )
            ) {
              setForm(null);
            }
          }}
        />
      )}
      {error && (
        <p className="err" role="alert" data-testid="inventory-error">
          {error}
        </p>
      )}
      {done && (
        <p className="muted" role="status" data-testid="inventory-done">
          {done}
        </p>
      )}
      <h3 id="trades-heading">Trades</h3>
      {trades.incoming.length + trades.outgoing.length === 0 ? (
        <p className="muted">No open trades.</p>
      ) : (
        <ul className="items trades" aria-labelledby="trades-heading" data-testid="trades">
          {trades.incoming.map((t) => (
            <li key={t.id} data-testid="trade-incoming">
              <TradeText view={view} trade={t} />
              {client && (
                <span className="item-actions">
                  <button
                    type="button"
                    className="assign-btn"
                    disabled={busy}
                    onClick={() =>
                      void send(
                        { type: 'trade.accept', tradeId: t.id, characterId: me },
                        `Trade with ${partyName(view, t.from)} done.`,
                      )
                    }
                  >
                    [Accept]
                  </button>
                  <button
                    type="button"
                    className="assign-btn"
                    disabled={busy}
                    onClick={() =>
                      void send(
                        { type: 'trade.decline', tradeId: t.id, characterId: me },
                        `Declined the trade from ${partyName(view, t.from)}.`,
                      )
                    }
                  >
                    [Decline]
                  </button>
                </span>
              )}
            </li>
          ))}
          {trades.outgoing.map((t) => (
            <li key={t.id} data-testid="trade-outgoing">
              <TradeText view={view} trade={t} />
              {client && (
                <button
                  type="button"
                  className="assign-btn"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      { type: 'trade.cancel', tradeId: t.id, characterId: me },
                      `Withdrew the trade offer to ${partyName(view, t.to)}.`,
                    )
                  }
                >
                  [Withdraw]
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {trades.closed.length > 0 && (
        <details className="locked-points" data-testid="past-trades">
          <summary>Past trades</summary>
          <ul>
            {[...trades.closed].reverse().map((t) => (
              <li key={t.id}>
                <TradeText view={view} trade={t} /> — {t.status}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function TradeText({ view, trade }: { view: PlayerView; trade: PlayerTrade }) {
  const rules = view.rules;
  const inv = view.inventory;
  const give = bundleText(rules, inv, trade.give);
  const get = bundleText(rules, inv, trade.get);
  if (trade.from === view.viewerId) {
    return (
      <span>
        You offer {partyName(view, trade.to)} {give} for {get}
      </span>
    );
  }
  const from = partyName(view, trade.from);
  return (
    <span>
      {from.charAt(0).toUpperCase() + from.slice(1)} offers you {give} for {get}
    </span>
  );
}

function PartySelect({
  view,
  value,
  onChange,
  id,
}: {
  view: PlayerView;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {parties(view).map((p) => (
        <option key={p.id ?? ''} value={p.id ?? ''}>
          {p.id === null ? 'The GM' : p.name}
        </option>
      ))}
    </select>
  );
}

function GiveForm({
  view,
  itemId,
  busy,
  onCancel,
  onGive,
}: {
  view: PlayerView;
  itemId: string | null;
  busy: boolean;
  onCancel: () => void;
  onGive: (to: string | null, amount: number) => Promise<void>;
}) {
  const rules = view.rules;
  const inv = view.inventory;
  const max = itemId === null ? inv.currency : (inv.items[itemId] ?? 0);
  const [to, setTo] = useState(view.party[0]?.id ?? '');
  const [amount, setAmount] = useState(itemId === null ? '' : '1');
  const n = wholeNumber(amount, max);
  const what =
    itemId === null ? rules.currencyName : itemLabel(rules, inv.itemDefs[itemId], itemId);
  return (
    <form
      className="inventory-form"
      data-testid="give-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (n !== null && n > 0) void onGive(to === '' ? null : to, n);
      }}
    >
      <h4>Give {what}</h4>
      <label htmlFor="give-to">To</label>
      <PartySelect id="give-to" view={view} value={to} onChange={setTo} />
      <label htmlFor="give-amount">{itemId === null ? 'Amount' : 'How many'}</label>
      <input
        id="give-amount"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-describedby="give-max"
      />
      <span id="give-max" className="muted">
        (you have {max})
      </span>
      <span className="form-buttons">
        <button type="submit" disabled={busy || n === null || n === 0}>
          Give
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </span>
    </form>
  );
}

function TradeForm({
  view,
  busy,
  onCancel,
  onPropose,
}: {
  view: PlayerView;
  busy: boolean;
  onCancel: () => void;
  onPropose: (
    to: string | null,
    give: { currency: number; items: Record<string, number> },
    get: { currency: number; items: Record<string, number> },
  ) => Promise<void>;
}) {
  const rules = view.rules;
  const inv = view.inventory;
  const held = Object.keys(inv.items);
  const [to, setTo] = useState(view.party[0]?.id ?? '');
  const [giveCurrency, setGiveCurrency] = useState('0');
  const [giveItem, setGiveItem] = useState('');
  const [giveCount, setGiveCount] = useState('1');
  const [getCurrency, setGetCurrency] = useState('0');
  const gc = wholeNumber(giveCurrency, inv.currency);
  const ic = giveItem === '' ? 0 : wholeNumber(giveCount, inv.items[giveItem] ?? 0);
  const ask = wholeNumber(getCurrency, Number.MAX_SAFE_INTEGER);
  const valid =
    gc !== null && ic !== null && ask !== null && (gc > 0 || ic > 0) && (giveItem === '' || ic > 0);
  return (
    <form
      className="inventory-form"
      data-testid="trade-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || gc === null || ic === null || ask === null) return;
        void onPropose(
          to === '' ? null : to,
          { currency: gc, items: giveItem === '' ? {} : { [giveItem]: ic } },
          { currency: ask, items: {} },
        );
      }}
    >
      <h4>Propose a trade</h4>
      <label htmlFor="trade-to">With</label>
      <PartySelect id="trade-to" view={view} value={to} onChange={setTo} />
      <label htmlFor="trade-give-currency">You give ({rules.currencyName})</label>
      <input
        id="trade-give-currency"
        inputMode="numeric"
        value={giveCurrency}
        onChange={(e) => setGiveCurrency(e.target.value)}
      />
      <label htmlFor="trade-give-item">and item</label>
      <select id="trade-give-item" value={giveItem} onChange={(e) => setGiveItem(e.target.value)}>
        <option value="">(none)</option>
        {held.map((id) => (
          <option key={id} value={id}>
            {itemLabel(rules, inv.itemDefs[id], id)}
          </option>
        ))}
      </select>
      {giveItem !== '' && (
        <>
          <label htmlFor="trade-give-count">How many</label>
          <input
            id="trade-give-count"
            inputMode="numeric"
            value={giveCount}
            onChange={(e) => setGiveCount(e.target.value)}
          />
        </>
      )}
      <label htmlFor="trade-get-currency">You ask for ({rules.currencyName})</label>
      <input
        id="trade-get-currency"
        inputMode="numeric"
        value={getCurrency}
        onChange={(e) => setGetCurrency(e.target.value)}
      />
      <p className="muted form-note">
        You can ask for {rules.currencyName}; ask for items in person and let them offer.
      </p>
      <span className="form-buttons">
        <button type="submit" disabled={busy || !valid}>
          Offer
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </span>
    </form>
  );
}
