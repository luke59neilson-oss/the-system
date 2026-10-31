# Coordinator verification (opus, by code reading)

- ux-1 CONFIRMED: GmScreen.tsx:244-267 renders NeedsYou, then PartyDashboard, then JoinPanel; DESIGN §9a puts the join address/QR right after the campaign/session line. Medium (players can't scan the QR at 1366×768 without the GM scrolling).
- ux-4 CONFIRMED: styles.css:181 input/select/textarea border #3b5682 (the --border token #5a7fb8 exists at :6). Contrast ratios as computed by the reviewer not re-computed. Medium.
- ux-6 CONFIRMED: XpAward.tsx:182-200 button text `Use for {group.length}`; the XP amount only in `title`. Medium (Luke's XP-context request).
- ux-2, ux-3, ux-5, ux-7: plausible from code/screenshots; not re-verified; treat as Medium UX polish items, to confirm in the fix item's own review.

## Performance (opus, code check of sonnet's measurements)
- perf-1 CONFIRMED in code: hub.ts:321-336 sends the whole `projectForGm(state)` on every GM snapshot (no change check) and the whole player view (stringified once to compare, then again to send). Medium.
- perf-3 CONFIRMED in code: no `bufferedAmount`, ping/pong or heartbeat anywhere in apps/server/src (only `terminate()` at shutdown, server.ts:378). Medium.
- perf-2, perf-4, perf-5: measured by the reviewer (timings on a loaded 2-CPU box; ratios trusted); not re-measured. Medium as measured.

## Playtest (opus, code check of sonnet's reproduced findings)
- playtest-1 CONFIRMED: XpAward.tsx:114-118 clears amount, reason and typed shares only; participant exclusions and the target grade persist. Medium.
- playtest-2 CONFIRMED: sessionLog.ts has no case for skill.cast / skill.granted / pools.set (grep empty). Medium.
- playtest-3 CONFIRMED: reducer.ts:2405-2415 `session.ended` does not clear `scenePrompt`. Medium.
- playtest-4 CONFIRMED: GmScreen.tsx:855-858 clears text and view, not the recipient. Medium.
