import { useState, type FormEvent } from 'react';
import type { CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  balances,
  currencyCommands,
  ledgerRows,
  parseAmount,
  sendOutcome,
  type SendResult,
} from './currencyModel';
import { shortTime } from './sessionModel';

type Outcome = { ok: boolean; text: string } | null;

/** Ledger rows shown before "Show all". */
const LEDGER_PAGE = 20;

/**
 * GM currency (ROADMAP M6.3, DESIGN §7 "Items"): grant or fine one or more
 * characters with a reason the player sees, and a ledger of every balance
 * change (grants, fines, gifts, trades, loot). The ledger is GM-only.
 */
export function CurrencyLedger({ client, state }: { client: LiveClient; state: CampaignState }) {
  const currency = state.rules.economy.currencyName;
  const rows = balances(state);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [filter, setFilter] = useState('');
  const [all, setAll] = useState(false);
  const live = chosen.filter((id) => rows.some((r) => r.id === id));
  const shownFilter = filter === '' || rows.some((r) => r.id === filter) ? filter : '';
  const ledger = ledgerRows(state, shownFilter === '' ? null : shownFilter);
  const shown = all ? ledger : ledger.slice(0, LEDGER_PAGE);

  const toggle = (id: string) => {
    setOutcome(null);
    setChosen(live.includes(id) ? live.filter((x) => x !== id) : [...live, id]);
  };
  const send = async (sign: 1 | -1) => {
    const plan = currencyCommands(state, live, amount, sign, reason);
    if ('problem' in plan) return setOutcome({ ok: false, text: plan.problem });
    setBusy(true);
    const results: SendResult[] = [];
    const failedIds: string[] = [];
    for (const command of plan.commands) {
      const id = command.type === 'holdings.adjust' ? command.characterId : '';
      const name = rows.find((row) => row.id === id)?.name ?? '';
      const r = await client.command(command);
      results.push({ name, error: r.ok ? null : friendlyError(r.error) });
      if (!r.ok) failedIds.push(id);
    }
    setBusy(false);
    setOutcome(sendOutcome(results, parseAmount(amount) ?? 0, sign, currency));
    // Only the refused stay chosen, so pressing again never repeats a success.
    setChosen(failedIds);
    if (failedIds.length === 0) {
      setAmount('');
      setReason('');
    }
  };
  // Enter never sends: a grant and a fine each need their own button.
  const submit = (e: FormEvent) => e.preventDefault();

  return (
    <section className="window currency-ledger" aria-labelledby="currency-ledger">
      <h2 id="currency-ledger">{currency}</h2>
      {rows.length === 0 ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <form onSubmit={submit}>
          <fieldset className="currency-who" disabled={busy}>
            <legend>Who</legend>
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                className="secondary currency-balance"
                aria-pressed={live.includes(r.id)}
                onClick={() => toggle(r.id)}
              >
                <span>{r.name}</span>
                <span className="muted" data-testid="currency-balance">
                  {r.balance} {currency}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setOutcome(null);
                setChosen(live.length === rows.length ? [] : rows.map((r) => r.id));
              }}
            >
              {live.length === rows.length ? 'Clear' : 'Everyone'}
            </button>
          </fieldset>
          <fieldset className="currency-fields" disabled={busy}>
            <label>
              {currency} each
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setOutcome(null);
                  setAmount(e.target.value);
                }}
              />
            </label>
            <label>
              Reason (the player sees this)
              <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            </label>
          </fieldset>
          <div className="currency-actions">
            <button type="button" disabled={busy} onClick={() => void send(1)}>
              Grant
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void send(-1)}
            >
              Fine
            </button>
          </div>
        </form>
      )}
      {outcome && (
        <p className={outcome.ok ? 'ok' : 'err'} role={outcome.ok ? 'status' : 'alert'}>
          {outcome.text}
        </p>
      )}
      <h3 id="currency-ledger-list">Ledger</h3>
      <label>
        Show
        <select value={shownFilter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Everyone</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {ledger.length === 0 ? (
        <p className="muted">No {currency} has changed hands yet.</p>
      ) : (
        <table className="ledger" aria-labelledby="currency-ledger-list">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">What</th>
              <th scope="col">Change</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} data-testid="ledger-row">
                <td>{shortTime(r.at)}</td>
                <td>{r.name}</td>
                <td>
                  {r.kind}
                  {r.detail !== '' && <span className="muted"> · {r.detail}</span>}
                </td>
                <td className={r.delta.startsWith('+') ? 'ledger-in' : 'ledger-out'}>{r.delta}</td>
                <td>{r.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ledger.length > LEDGER_PAGE && (
        <button type="button" className="secondary" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${ledger.length}`}
        </button>
      )}
    </section>
  );
}
