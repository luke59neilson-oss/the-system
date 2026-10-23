import { execute, pendingRulesMigrations } from '@the-system/engine';
import { StoreError, type CampaignStore } from './store';

/**
 * Applies the rules migrations a stored campaign needs (MR.3, L16) as GM
 * commands, so each lands in the log like any other change and replays
 * exactly. A campaign on the current rules is left untouched.
 */
export function migrateOnLoad(
  store: CampaignStore,
  now: () => string,
  newId: () => string,
): CampaignStore {
  for (const command of pendingRulesMigrations(store.campaign.state)) {
    const result = execute(store.campaign, command, {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId,
    });
    if (!result.ok) throw new StoreError(`Rules migration failed: ${result.error}`);
    store.appendAll(result.events);
  }
  return store;
}
