import { useState, type FormEvent } from 'react';
import type { CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { balances, currencyCommands, ledgerRows } from './currencyModel';
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

  const toggle = (id: string) =>
    setChosen(live.includes(id) ? live.filter((x) => x !== id) : [...live, id]);
  const send = async (sign: 1 | -1) => {
    const plan = currencyCommands(state, live, amount, sign, reason);
    if ('problem' in plan) return setOutcome({ ok: false, text: plan.problem });
    setBusy(true);
    const failed: string[] = [];
    for (const command of plan.commands) {
      const r = await client.command(command);
      if (!r.ok) {
        const id = command.type === 'holdings.adjust' ? command.characterId : '';
        const name = rows.find((row) => row.id === id)?.name ?? '';
        failed.push(`${name}: ${friendlyError(r.error)}`);
      }
    }
    setBusy(false);
    if (failed.length > 0) return setOutcome({ ok: false, text: failed.join('; ') });
    const names = rows
      .filter((r) => live.includes(r.id))
      .map((r) => r.name)
      .join(', ');
    const n = amount.trim();
    setOutcome({
      ok: true,
      text: sign > 0 ? `Granted ${n} ${currency} to ${names}` : `Fined ${names} ${n} ${currency}`,
    });
    setAmount('');
    setReason('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(1);
  };

  return (
    <section className="window currency-ledger" aria-labelledby="currency-ledger">
      <h2 id="currency-ledger">{currency}</h2>
      {rows.length === 0 ? (
        <p className="muted">No characters yet.</p>
      ) : (
        <form onSubmit={submit}>
          <fieldset className="currency-who">
            <legend>Who</legend>
            {rows.map((r) => (
              <label key={r.id} className="check currency-balance">
                <input
                  type="checkbox"
                  checked={live.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
                <span>{r.name}</span>
                <span className="muted" data-testid="currency-balance">
                  {r.balance} {currency}
                </span>
              </label>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => setChosen(live.length === rows.length ? [] : rows.map((r) => r.id))}
            >
              {live.length === rows.length ? 'Clear' : 'Everyone'}
            </button>
          </fieldset>
          <div className="currency-fields">
            <label>
              Amount
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-describedby="currency-each"
              />
            </label>
            <span className="muted currency-each" id="currency-each">
              {currency} each
            </span>
            <label>
              Reason (the player sees this)
              <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
          <div className="currency-actions">
            <button type="submit" disabled={busy}>
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
