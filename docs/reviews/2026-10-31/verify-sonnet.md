# Verification of codm-1..6, coord-1, docs-1..5 (sonnet verifier, worktree `/home/claude/review/codm` @ f656f8c2)

Test file (mine, independent of `zzProbeCodm.test.ts`): `/home/claude/review/codm/apps/server/test/zzVerify.test.ts`
Run: `npx vitest run apps/server/test/zzVerify.test.ts --silent=false` (add `-t "codm-1"` etc. to select).
Every `it` asserts the CORRECT behaviour, so a failure is the evidence. On f656f8c2: 13 fail (bugs present), 3 pass (a control and two
sanity checks). No real API was called (FixtureAiClient, FixtureSpeechToText, plain test cipher). Not committed. The worktree has only the two
untracked probe files.

Summary

| ID | Verdict | My severity |
|---|---|---|
| codm-1 | CONFIRMED | High (agree) |
| codm-2 | CONFIRMED (mechanism); max_tokens trigger by real Haiku is unmeasured | Medium (agree) |
| codm-3 | PARTLY | Low (lowered) |
| codm-4 | CONFIRMED | Medium (agree) |
| codm-5 | CONFIRMED | Low (lowered) |
| codm-6 | PARTLY (text absence confirmed, impact not) | Low (lowered) |
| coord-1 | CONFIRMED (code); "defaults cost 10x" is a product choice, not a code fault | Low (lowered) |
| docs-1 | CONFIRMED | Medium (agree) |
| docs-2 | CONFIRMED | Low (lowered) |
| docs-3 | CONFIRMED | Low (lowered) |
| docs-4 | PARTLY | Low (lowered) |
| docs-5 | CONFIRMED | Low (lowered) |

---

## codm-1 · CONFIRMED · High (agree)
Evidence (test "V codm-1: transcript file follows the session"):
- Code: `speech/routes.ts:137` passes `session: sessionNumber(a.store)` once when the `Listener` is built; `speech/transcript.ts:118` writes every line to
  `transcriptFile(dir, this.options.session)`. Nothing restarts the listener on session start/end (grep of `apps/server/src` and `apps/web/src`: no hook; the
  web `ListenPanel` only stops listening when the panel unmounts, `ListenPanel.tsx:130-141`). Readers ask at call time: `quickRoutes.ts:105`,
  `practiceRoutes.ts:63-69`, `notesRoutes.ts:72,94`.
- Run: listen on, 1 line, `session.start`, 1 more line. Output: `session-00: ['Line one before any session.', 'Line two after session one starts. Can I climb the wall?']  session-01: []`;
  `GET /api/gm/ai/quick` gives `target: null`. Second case, listening left on, `session.end`, `session.start` (session 2): `session-02: []`, `session-01: []`, so the line went to the old file again.
- Control (passes): `session.start` first, then listen, then audio gives `session-01: ['Can I climb the wall?']` and quick `target: {text:'Can I climb the wall?'}`. So the bug depends on click order.
- Why High and not Medium: it is silent (the Listening panel shows the lines from memory), it kills every transcript-fed co-DM feature for the night, and the docs do not say "start the session first" (GM-GUIDE.md:209-225, 302-308). The workaround (toggle the mic after Start session) is trivial but nobody is told. Only the multi-session-same-day case is rare, because a server restart resets the listener.
Acceptance check: with listening on, run `session.start` then send audio: the line is in `session-01.jsonl` and `GET /api/gm/ai/quick` returns a non-null `target`; and with listening still on, `session.end` + `session.start` + audio puts the line in `session-02.jsonl`. (Pre-session talk may stay in `session-00`.) The "V codm-1" tests in `zzVerify.test.ts` encode exactly this.

## codm-2 · CONFIRMED (mechanism) · Medium (agree)
Evidence (test "V codm-2"): 3,000-line session-01 transcript, fake model returns a reply cut mid-array (valid JSON prefix, no close), as a max_tokens stop gives.
```
notes#1 502 {"error":"The co-DM reply held no JSON"}      notes#2 502 (same)
drafts#1 500 {"error":"Could not read or save the practice drafts"}   drafts#2 500 (same)
summary 502 {"error":"The co-DM reply held no JSON"}
prompt line counts per request: [3004, 3004, 3004, 3004, 3004]     maxTokens: [800, 800, 2000, 2000, 800]
```
- Every press re-sends all 3,000 lines (read position never moves) and the summary's catch-up fails too, so no summary.
- `anthropic.ts` never reads `stop_reason` (grep: no `stop_reason` in `apps/server/src/ai`). `practiceDrafts.ts:152-157` `jsonIn` throws a plain `Error`, so the GM sees 500 "Could not read or save…", a disk-sounding message. (Note the notes path wraps the SyntaxError as `AiError` -> 502.)
- Not measured: whether real Haiku output for a 4 h transcript exceeds 800 / 2,000 tokens. It is plausible (about 40 notes or 45 drafts fill the budget) but unproven. The "no cap, no advance, re-pay on any failed reply" part is certain regardless of the trigger. Cost per wasted press is cents (about 75k input tokens at Haiku prices), so the harm is the lost feature, not money.
Acceptance check: with a 3,000-line transcript, no single request to the fake client carries more than a bounded chunk (e.g. 200 lines) and `readUpTo` advances after each successful chunk; a reply cut at max_tokens (fixture with `stop_reason` surfaced) yields an `AiError` whose message says the stretch was too long (502), for drafts as well as notes. Test: "V codm-2" asserts `Math.max(lines per request) <= 400` (adjust the bound to the chosen chunk size).

## codm-3 · PARTLY · Low (lowered from Medium)
Confirmed:
- Test "V codm-3": a `kind: shop` reply that also holds `quests` previews `quests[0]` with `error: null, note: null`. The web client pre-ticks every entry with `error === null` (`ContentImport.tsx:120,155`), so the quest is ticked. Quests default to visible (CONTENT-FORMAT.md:200). The quest text is in `command.text` but the list shows only "Quest: <title> `quests[0]`" (`ContentImport.tsx:311,354-361`); the engine note for `quest.create` is only a duplicate-name warning (`preview.ts:92-95`). Nothing limits sections per kind (`KIND_GUIDE` is advice; the system prompt even says "using only the sections and keys in this JSON Schema", the full schema).
- No system prompt that receives transcript text (`SUGGEST_SYSTEM`, `QUICK_SYSTEM`, `PREPARE_SYSTEM`, `DRAFT_SYSTEM`) says the transcript is table talk and not instructions (my regex over the four texts: all false). Lines are only labelled "Transcript:" / "Recent table talk:".
Refuted: "offer targets aren't shown". For `skillOffers` and `evolutions` the preview note reads "Goes to <Name>'s screen on Apply: [options]" (`preview.ts:110-136`), so those are visible. In my run the skill offer was refused only because Jake is class level 0 ("has not reached class level 5 (is 0)"); with a level-5 character it would be applicable and pre-ticked, with that note.
Not tested: whether a spoken injection survives the fast model (needs a live model).
Why Low: each path needs several GM actions (chip "Use" -> Generate -> Apply, or Prepare "Review" -> Apply), the import header says "Written by the co-DM: read it before you apply it", and the only non-self-describing extra is a quest whose text is hidden. Real risk is one accidental quest to players.
Acceptance check: a `kind: shop` generation whose reply holds `quests`, `skillOffers`, `evolutions` produces no preview entries of those types (or they come back with a non-null error / are not pre-ticked with a visible "not what you asked for" note); where a quest entry is shown, its text and visibility are visible in the list; and each transcript-fed system prompt contains a sentence that transcript lines are table talk, not instructions. Test: the "V codm-3" pair in `zzVerify.test.ts`.

## codm-4 · CONFIRMED · Medium (agree)
Evidence (test "V codm-4"): shop "Thorn Stall" with keeper "Marta Vell: one-eyed…", GM note "Torvald Ash" (generated-NPC shape), lore note tagged `lore`, `npc:Marta Vell`; transcript line names both. Result: `GET /api/gm/ai/quick` -> `npc: null, picker: []`; slot-4 prompt has `NPC in the scene: (none)` and no "Kept lore" block (the string "never sells to elves" is absent). Code: `quickRoutes.ts:84-90` `npcsOf` maps `state.entities` only; `postSchema.npc` is an entity id (`quickRoutes.ts:71-72`), so the GM cannot pick a non-entity either; `loreFor` is called with `npc?.name`.
Mitigation that exists: an NPC generation that also yields a bestiary entry (KIND_GUIDE npc) does become an entity and works; the GM can add a bestiary entry by hand. Shop keepers and note-only NPCs never work. DESIGN §11 describes exactly the shop-keeper case.
Fix note for the builder: `shops[].keeper` is free text ("Name: look, manner"), so a name has to be derived (text before the first colon or a documented rule).
Acceptance check: with a shop whose keeper is "Marta Vell: …", a GM note titled "Torvald Ash", and a transcript naming either, `GET /api/gm/ai/quick` returns a non-null `npc` and a picker that lists both, and the slot-4 prompt contains that NPC's notes and the `npc:<name>` lore body. Test: "V codm-4".

## codm-5 · CONFIRMED · Low (lowered from Medium)
Evidence (test "V codm-5"): note of 1,332 chars: `loreLines([long])` -> 0 lines; `loreLines([long, 'Short: Marta hates elves.'])` -> only the short one. `quickResponses.ts:149-158` `if (used + line.length > QUICK_LORE_MAX) continue;`. The web app has no warning (grep of `apps/web/src/gm` for 1,200 / too long / clipped: none). It is a deliberate behaviour pinned by `loreFor.test.ts:26` ("skips a note too long for the budget", a 4,000-char note), so a fix must change that test.
Why Low: silent and real, but the GM edits the note at Keep time, most generated notes are under about 1,000 chars (my estimate, not measured), and splitting the note is a workaround.
Acceptance check: `loreLines([<1,332-char note>])` returns one line, clipped to at most `QUICK_LORE_MAX` characters in total (with an ellipsis), and `loreLines([long, short])` keeps both within the budget; or Keep refuses/warns above the budget. Update `loreFor.test.ts:26` accordingly.

## codm-6 · PARTLY · Low (lowered from Medium)
Evidence (test "V codm-6"): I built the generation request (system 13,038 chars including the JSON Schema; user message 1,430 chars) and captured the notes and summary systems through a spy client, plus `QUICK_SYSTEM`, `SUGGEST_SYSTEM`, `PREPARE_SYSTEM`, `DRAFT_SYSTEM`. Regex for `gods?|patron|blessing|galax|primordial|Earth|integrat` over each system prompt: no match in any of the seven. The only hit is "integration" inside a reference-example row in the generation user message ("…entered the first tutorial at integration"), not a setting rule. `grep -i god apps/server/src/ai/*.ts` finds only the two MU.6 comments. So the factual claim (no prompt states the rule) is confirmed. Impact (does Haiku/Sonnet then invent gods/blessings?) is NOT reproducible without a live model.
Why Low: the GM reviews all generated content before Apply and reads quick answers aloud himself; the reference rows are already filtered. A one-line fix, but there is no demonstrated failure.
Acceptance check: a shared setting sentence (Earth is integrated by the System; no gods, patrons, blessings or other worlds) is present in `buildGenerateRequest(...).system`, `QUICK_SYSTEM`, `SUGGEST_SYSTEM` and `PREPARE_SYSTEM`; a unit test asserts each contains it. Test: "V codm-6" (fails now).

## coord-1 · CONFIRMED (code) · Low (lowered from Medium)
Evidence (test "V coord-1", output verbatim):
```
defaults { fast: 'claude-haiku-4-5', strong: 'claude-sonnet-4-5' }
claude-haiku-4-5  {"input":1,"output":5}    claude-haiku-5-5  {"input":1,"output":5}
claude-sonnet-4-5 {"input":3,"output":15}   claude-sonnet-5-5 {"input":3,"output":15}
claude-opus-4-5   {"input":15,"output":75}  claude-opus-5-5   {"input":15,"output":75}   brand-new {"input":15,"output":75}
```
- `client.ts:68-89`: defaults are the 4.5 ids; `priceOf` takes the first family substring (`haiku`/`sonnet`/`opus`) and has no per-version or per-prompt-size pricing. The settings route accepts any id matching `[A-Za-z0-9._:@-]+` (`coDm.ts:27-28`), so `claude-haiku-5-5` is accepted.
- Using the prices you gave: choosing a 5.5 model makes the counter over-report by 10x (Haiku 5.5: 1/5 vs 0.10/0.50), 1.5x (Sonnet 5.5: 3/15 vs 2/10), 3.75x (Opus 5.5: 15/75 vs 4/20); Opus 4.5 and later (15/75 vs 5/25) is 3x over, which is codm-8. The over-report errs on the safe side. The Haiku 5.5 tier above 100k tokens ($0.50/$2.50) cannot be expressed: `costOf(model, usage)` does see `usage.inputTokens`, so the tier can be applied per call.
- For the shipped default ids the counter is correct (4.5 prices match). "Defaults cost about 10x" is a choice of default model, not a code defect.
- Why Low: a normal night is cents (suggestions every 90 s on Haiku); the cost of the error is a misleading counter and a pricier default. Pinned by tests that a fix must update: `ai.test.ts:32,35,56-59`, `coDm.test.ts:102,118,125-133`, `e2e/MC.1.spec.ts:62-63,149`.
Acceptance check: `priceOf('claude-haiku-5-5')` = 0.10/0.50 (and 0.50/2.50 when a call's input exceeds 100k tokens), `priceOf('claude-sonnet-5-5')` = 2/10, `priceOf('claude-opus-5-5')` = 4/20, `priceOf('claude-opus-4-5')` = 5/25, the 4.5 Haiku/Sonnet ids unchanged, an unknown id still falls back to the highest price; and `DEFAULT_AI_MODELS` names the chosen ids with the tests above updated. Test: "V coord-1" (asserts the Haiku 5.5 price).

## docs-1 · CONFIRMED · Medium (agree; the cheapest fix is a doc edit)
Evidence: GM-GUIDE.md:32 ("campaigns and backups sit in the header on every tab") and :323-328 ("A campaign export … importing it brings both back"). Code: `CampaignSwitch.tsx:55-63` offers only "Load demo campaign" / "Back to my campaign" (rendered once in `GmScreen.tsx:230`); `GET /api/gm/export` (`server.ts:432`) has no caller in `apps/web/src` or `apps/desktop/src` (grep for `api/gm/export`, `export` strings); `importCampaign` (`store.ts:642`) is referenced only by `store.test.ts`; there is no import route and no backup button; backups happen only at session end (`server.ts:162`) and on quit (desktop `main.ts:128-140,223`). DESIGN §9a also lists "campaigns and backups" under Library & settings (the guide says header; the two disagree with each other as well). The guide's first sentence (copy the `data` folder) still works, so a GM is not stranded.
Acceptance check: either (a) GM-GUIDE.md:32 and :323-328 and DESIGN §9a say what exists (automatic backups, demo switch; export only by the GM-key API route; no import), with no claim that an export can be imported; or (b) the console gets Export (downloads the `/api/gm/export` JSON) and Import (POST route that calls `importCampaign` with a new campaign id) with an e2e round trip. Ask Luke which.

## docs-2 · CONFIRMED · Low (lowered; one-line doc error)
Evidence (test "V docs", docs-2): defined two items named "Twin Blade", then `shop.define` with ware `"twin blade"`: accepted, `itemId` = the newer item (`v3`). Code: `commands.ts:1763-1767` (`findLast`, D237/QF.29; DECISIONS.md:264). CONTENT-FORMAT.md:225 says "a name two items share is refused: use the id". Content files cannot carry ids (D237), so the advice is unusable too.
Acceptance check: CONTENT-FORMAT.md:225 no longer contains "a name two items share is refused" and says the most recently defined item wins. Test: second assertion of docs-2.

## docs-3 · CONFIRMED · Low
Evidence (test "V docs", docs-3): I parsed every table row of `docs/GM-OVERRIDES.md` and compared with `listRefusals()` from `scripts/gm-refusals.mjs`: 338 doc rows, 337 engine keys, exactly one doc row with no engine refusal: `wares[…]: … items are named "…": use the id` (GM-OVERRIDES.md:275). `grep -rn "items are named\|use the id" packages/engine/src` finds only the character and region messages. The completeness test is one-way: `scripts/gm-overrides.test.ts:51-62` computes only `missing` (engine keys absent from the doc). (The other D237-era row, `wares[…]: no item named…`, is real.)
Acceptance check: the row at GM-OVERRIDES.md:275 is gone, and `scripts/gm-overrides.test.ts` gains a reverse check (every `| \`key\` |` row in the doc is in `listRefusals()` keys) that fails on the current doc.

## docs-4 · PARTLY · Low
Evidence (tests docs-4, docs-4b, docs-4c): `previewContent` on an item with `bonuses:[{stat:'strength',flat:5000}]` -> `error: null, note: null` (no cap at import; the cap is applied when worn, `bonuses/effective.ts:9-11`, and D174 says "applies on the sheet, not in the library"). A Mythical item for a G-grade party previews with no error (so "rarity ceilings" are not applied to items either; they apply to skill menus, CONTENT-FORMAT.md:166, and none of the Generate kinds produce skill menus). The flat-only rule IS enforced at import (a `percent` bonus is refused: "Unrecognized key"). So GM-GUIDE.md:194-195 ("the usual checks apply (flat item bonuses, the 20% item cap, rarity ceilings, grades)") is half right; the same wording is in `generate.ts:3-6` and DESIGN §11 ("so the rules' checks apply").
Why Low: an over-cap item cannot do harm because the sheet caps it; the GM just is not warned.
Acceptance check: GM-GUIDE.md:194-195 names what the preview enforces (format, flat-only bonuses, grades, skill-menu ceilings) and says the 20% item cap is applied on the sheet; or the preview gives a note for an over-cap item and a test pins it. Test: "V docs" docs-4 asserts the second option (adjust if the first is chosen).

## docs-5 · CONFIRMED · Low
Evidence (test "V docs", docs-5): no "Edit holdings" string in `apps/web/src`, `apps/desktop/src` or `e2e` (empty grep). It appears in `docs/GM-OVERRIDES.md` at lines 39, 40, 76, 146, 147 (the finding cited only 39-40). Real controls: currency ledger **Grant** / **Fine** (`CurrencyLedger.tsx:122,130`) and Item library **Give** / **Take** (`ItemLibrary.tsx:249,257`), both sending `holdings.adjust`. Those apply signed amounts, so "sets currency and items directly" is also loose.
Acceptance check: `grep -n "Edit holdings" docs/*.md` returns nothing, and the five rows name the real controls ("currency ledger -> Grant/Fine", "Item library -> Give/Take"). Test: docs-5 asserts the docs grep is empty.

---

## Not asked but noticed
- codm-8 (Opus price) is the same root cause as coord-1: `priceOf('claude-opus-4-5')` is 15/75 by my run.
- The only memory-derived fact I used: none (nothing from the user's memory was needed for this task).

## Test files kept
- `/home/claude/review/codm/apps/server/test/zzVerify.test.ts` (mine; 16 tests; 13 fail on purpose until fixed)
- `/home/claude/review/codm/apps/server/test/zzProbeCodm.test.ts` (previous reviewer's; untouched)
