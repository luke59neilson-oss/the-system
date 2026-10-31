import { execute, pendingRulesMigrations } from '@the-system/engine';
import { StoreError, cannotLoad, type CampaignStore } from './store';

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
  let applied = 0;
  for (const command of pendingRulesMigrations(store.campaign.state)) {
    const result = execute(store.campaign, command, {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId,
    });
    if (!result.ok) {
      // QF.42: say what to do, and release the campaign (LOCK and log).
      store.close();
      throw new StoreError(
        cannotLoad(
          store.id,
          store.dir,
          `updating it to the current rules failed: ${result.error}`,
          {
            changed:
              applied === 0
                ? 'The event log was not changed.'
                : `${applied} earlier rules update(s) were saved to the log first.`,
          },
        ),
      );
    }
    store.appendAll(result.events);
    applied++;
  }
  return store;
}
