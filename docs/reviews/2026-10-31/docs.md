# Docs review (haiku) — saved by the coordinator from the agent's hand-back

Worktree /home/claude/review/docs @ f656f8c2. Probes in /home/claude/review/docs/.docs-review/.

- docs-1 Medium: GM-GUIDE.md:32 says campaigns and backups sit in the header on every tab; GM-GUIDE.md:323-328 describes export/import; DESIGN.md §9a lists "campaigns and backups". Code: CampaignSwitch.tsx:55-63 has only Load demo / Back to my campaign; GET /api/gm/export (server.ts:432) has no caller in apps/web or apps/desktop; no import route; no backup control. Backups are automatic at session end and quit (desktop main.ts:128-140, 223-224). => missing GM controls (backup now, export, restore/import) or wrong docs.
- docs-2 Medium: CONTENT-FORMAT.md:225 says a shared item name is refused; commands.ts:1763-1767 resolves to the most recent definition (D237/QF.29). Probe check-dupes.ts.
- docs-3 Medium: GM-OVERRIDES.md:275 lists a wares refusal that does not exist; scripts/gm-overrides.test.ts checks engine→doc only (add doc→engine). Probe check-overrides.mts.
- docs-4 Medium: GM-GUIDE.md:194-195 says import applies the 20% item cap and rarity ceilings; the cap is applied at play (bonuses/effective.ts:9-11), not at import; an over-cap item previews "ok".
- docs-5 Medium: GM-OVERRIDES.md:39-40 names an "Edit holdings" control that does not exist; real controls: Credits ledger Grant/Fine, Item library Give/Take.
- docs-6 Low: Table view shows max 4 panes (perspective.ts:8); guide says every player.
- docs-7 Low: DESIGN §9a tab contents differ from tabsModel.ts:16-47 (titles, factions, notes).
- docs-8 Low: PLAYER-QUICKSTART lacks spells/Cast.
- docs-9 Low: label names differ (Import content, Evolutions, Practice, Send merge offer).
- docs-10 Low: quoted UI text differs (typical session line; "Connected (<model>)").
- docs-11 Low: Take notes / Summarise session are inside a closed "Session notes" block in the Co-DM panel.
- docs-12 Low: CONTENT-FORMAT.md:12 says each example is checked by tests; evolution.json and skill-offer.json are only parse-checked.

Clean: tab table vs tabsModel, ~90 UI labels present, install/downloads, troubleshooting ports and paths, co-DM numbers, speech model sizes, player quickstart labels, all DESIGN numbers vs rules defaults (XP, grades, ceilings, budgets, marks, merges, Identify), tutorial pack applies (33 entries; hidden quest notice false), content limits, schema, GM-OVERRIDES completeness engine→doc.
