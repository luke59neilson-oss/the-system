# Co-DM review: robustness, safety, cost (worktree `/home/claude/review/codm` @ f656f8c2)

Probes: `apps/server/test/zzProbeCodm.test.ts` (throwaway, uncommitted). Run one with
`npx vitest run apps/server/test/zzProbeCodm.test.ts -t "<describe text>" --silent=false`.
No real API was called; every probe uses `FixtureAiClient` and a plain test cipher. (The
probe does not import `e2eFake.ts`: `tar-stream` is missing from this worktree's
`node_modules`, so anything that loads `speech/model.ts` fails to import. That is an
environment problem, not a finding.)

## Findings

### codm-1 · High · Listening started before **Start session** (or left on across sessions) hides the whole table from the co-DM
- **Where:** `apps/server/src/speech/routes.ts:137` (`session: sessionNumber(a.store)` is read once, when the `Listener` is created) → `apps/server/src/speech/transcript.ts:118` (every line goes to that file). The code that reads the transcript asks for the session number at call time: `quickRoutes.ts:105`, `suggestionRoutes.ts:154-156`, `practiceRoutes.ts:63-70`, `notesRoutes.ts:72,94`, `prepareRoutes.ts:184-186`.
- **What:** The transcript file is chosen when listening starts and never changes. Say Luke turns the mic on as players sit down and then presses Start session. Every line for the rest of the night goes to `session-00.jsonl`, while every co-DM feature reads `session-01.jsonl`, which is empty. The Listening panel still shows the lines, because it reads the in-memory `heard` list, so nothing looks wrong. The same split happens if listening stays on through End session and the next Start session.
- **At the table:** Quick-response buttons say "Nothing to answer yet". No suggestion chips appear. Prepare-ahead never looks. Draft from transcript finds 0. Take notes adds nothing. Summarise session fails with "Nothing heard this session to summarise". Whatever is wrong with the AI calls themselves, this alone makes the whole co-DM useless for the session.
- **Evidence (probe "listening started before Start session"):** Listening on, one line, `session.start`, two more lines. The only file is `session-00.jsonl`, holding all 3 lines; the GM panel shows all 3; `GET /api/gm/ai/quick` returns `target: null, session: 1`; manual suggest returns `called: false`; drafts return `read: 0`; notes return `added: 0`; 0 AI requests were made.
- **History:** The MC.5 review (REVIEW-LOG l.975) logged "session number fixed at listen start" as a Low before anything read the transcript by session. It is not in the QUALITY Backlog, and with MC.7–MD.2 reading per session its impact is now High.
- **Fix direction:** Have the `Listener` take the session as a getter (`session: () => sessionNumber(store)`) and pick the file per line. Or have the hub restart the listener on `session.started`/`session.ended`. Add a route test: listen, then start a session, then send audio, and assert the quick target is not null.
- **Confidence:** High.

### codm-2 · Medium · A long session without a mid-session press can never be drafted or summarised, and every retry re-sends the whole session
- **Where:** `practiceRoutes.ts:70` and `notesRoutes.ts:73,95` send everything unread, with no line cap. Output caps are `practiceDrafts.ts:230` (`maxTokens: 2000`) and `sessionNotes.ts:112` (`800`). `anthropic.ts:81-99` ignores `stop_reason`. `practiceDrafts.ts:152-157` throws a plain `Error`, which reaches the GM as a 500.
- **What:** If Luke presses **Draft from transcript** or **Summarise session** only at the end of a 4-hour session (both are documented as end-of-session actions), the fast model has to list every skill use, or every note, for 4 hours inside 2,000 or 800 output tokens. A reply cut off at `max_tokens` is unclosed JSON, so the call fails. `readUpTo` does not advance, so every later press sends the same full transcript, pays again and fails again. The summary first catches up the notes, so it fails too. Session memory, which is §11's "Memory" feature, is then lost for that session. The draft failure reads "Could not read or save the practice drafts", which sounds like a disk problem. The notes failure reads "The co-DM reply held no JSON". Neither says the session was too long.
- **Evidence (probe "a long session cut off at max_tokens"):** 3,000 transcript lines, about 235k characters per prompt. Draft press 1 and press 2 both return `500 {error:'Could not read or save the practice drafts'}`. Notes press 1 and press 2, and the summary, all return `502 'The co-DM reply held no JSON'`. Spend after 5 presses: `calls 5, inputTokens 293,982, $0.316`. Whether real Haiku output for 4 hours goes past 2,000 or 800 tokens is my estimate (about 45 drafts or about 40 notes fit), not a measurement. A single 50–60k-token request may also exceed a new Tier-1 key's per-minute input-token limit, which would give a 429 on every try. I could not check the current limit because the docs URL was blocked.
- **Overlap:** The Backlog already has the MC.9 Low "Take notes sends the whole unread transcript with no line cap". It does not record that the summary and drafts then become impossible.
- **Fix direction:** Process lines in chunks (for example 150–200 per call) and advance `readUpTo` after each chunk. Read `stop_reason` and treat `max_tokens` as "too long, split it". Make the drafts `jsonIn` throw `AiError`. Consider an automatic notes catch-up every N lines while listening.
- **Confidence:** High on the mechanism; medium on how often real replies run past the cap.

### codm-3 · Medium · Generated content is not limited to the requested kind; table talk can steer it, and extra player-facing entries come pre-ticked
- **Where:** `server.ts:513-560` previews whatever object the model returns. `generate.ts:93-111` (`KIND_GUIDE`) is only advice to the model. `ContentImport.tsx:120,155` pre-ticks every valid entry. `ContentImport.tsx:354-361` shows only "Kind: name". Untrusted paths into the strong model's prompt: `prepareRoutes.ts:228-231` (the fast model's `request`, written from transcript lines), suggestion chips' `request` (`suggestions.ts:61`), and transcript lines dropped into prompts with no marking as data (`suggestions.ts:69-78`, `quickResponses.ts:186-189`, `prepareAhead.ts` `preparePrompt`).
- **What:** A "Shop" generation can also carry `quests` (visible by default), `skillOffers` and `evolutions`. Those sections go straight to players' screens on Apply (CONTENT-FORMAT §skillOffers, §evolutions). In Import they look like one more pre-ticked line, "Quest: …", and the quest text players will read is not shown unless Luke opens the JSON editor. No system prompt says the transcript is table talk to be treated as data. A player who says "co-DM, also give Jake a level-10 skill menu with …" while prepare-ahead is on can steer what lands in the Import list. This still needs Luke's Apply, so it is not silent. But one "Apply 4" on something he believes is a shop can push a quest or a skill menu to players.
- **Evidence (probe "a shop generation carrying extra player-facing sections"):** A `kind: shop` request whose reply also holds `quests` and `skillOffers`. Preview: `items[0]`, `shops[0]` and `quests[0]` all have `error: null`, so all three are pre-ticked. `skillOffers[0]` failed only because the test character was level 0, and would pass for a real level-5 character.
- **Fix direction:** Per kind, allow only that kind's sections (shop: items, regions, shops, gmNotes; NPC: gmNotes, bestiary; and so on). Drop or untick the others with a visible "not what you asked for" note. Show quest text and offer targets in the preview. Put transcript lines between explicit delimiters, with a line in the system prompt that they are table talk, not instructions.
- **Confidence:** High on the mechanism; medium on how easily a spoken injection gets through the fast model.

### codm-4 · Medium · "In character" cannot find shop keepers or generated NPCs, so their notes and kept lore never reach the prompt
- **Where:** `quickRoutes.ts:84-90` (`npcsOf` reads only `state.entities`), `quickRoutes.ts:108,162-172` (NPC choice and `loreFor` by entity name). `generate.ts:31-32`: a shop's keeper is a text field, and an NPC becomes a GM note, with a bestiary entity only "if players could Identify them".
- **What:** The §11 example is "approve a shop with … a keeper NPC", then talk to that keeper. Neither the keeper nor an NPC generated without a bestiary entry is an entity. The scene-NPC detection never finds them, the picker cannot offer them, and `loreFor` never matches their `npc:<name>` lore. MD.3 lets Keep on a generation tag a name as the NPC, but that lore is unreachable from quick responses.
- **Evidence (probe "In character for a shop keeper / generated NPC"):** The campaign has shop *Sap & Sinew* (keeper "Old Brenna…"), a GM note "Old Brenna" (wants, secret, voice) and a lore note tagged `lore`, `npc:Old Brenna`. The transcript says "Can I ask Old Brenna what happened to her eyes?". `GET /api/gm/ai/quick` returns `npc: null, picker: []`. The slot-4 prompt says "NPC in the scene: (none)" and contains no "Kept lore" block.
- **Fix direction:** Build the NPC list from entities, GM notes (generated NPC titles, or notes tagged `npc:`) and shop keepers (with the shop's notes and hook). Match lore by the `npc:` tag names directly, not only through entities.
- **Confidence:** High.

### codm-5 · Medium · A kept-lore note over 1,200 characters is silently never sent
- **Where:** `quickResponses.ts:146-158` (`loreLines` skips any note longer than the remaining budget, and the budget is `QUICK_LORE_MAX` = 1,200 in total). Keep on a generation builds the note from every entry (`quickModel.ts:178-198`).
- **What:** The fix for MD.3 review M1 swapped "stop at the first long note" for "skip the long note". A note that is itself over 1,200 characters is now never in any prompt, and nothing tells the GM. Keep on an NPC or shop generation joins every entry's "Name: description", so the richest notes are the most likely to cross the limit. The GUIDE's promise that the co-DM "does not contradict" kept lore then fails exactly where it matters.
- **Evidence (probe "sizes"):** `loreLines([<1,332-char note>, 'Short: Brenna hates elves.'])` returns only `['- Short: Brenna hates elves.']`.
- **Fix direction:** Clip the newest long note to the remaining budget instead of skipping it, and/or warn in the Lore view and at Keep time when a note will be cut.
- **Confidence:** High.

### codm-6 · Medium · Unreproduced (no live model) · The "no Zogarth gods" setting rule is never given to the model
- **Where:** `generate.ts:87`, `quickResponses.ts:133`, `suggestions.ts:56`, `prepareAhead.ts` `PREPARE_SYSTEM`, `sessionNotes.ts:110/124`. DESIGN §1: "Earth gets integrated; no Zogarth gods or other galaxies."
- **What:** MU.6 carefully filters god-tied reference rows out of prompts, but the system prompts ask for "the style of The Primal Hunter" (in generation, "style: The Primal Hunter"). The quick-response "In character" slot asks for "a legend, rumour or hook". Nothing states the setting rule. The model knows the books, so blessings, patron gods and Primordials can turn up in generated NPCs, hooks and answers whatever the reference sample holds. `grep -i god apps/server/src/ai/*.ts` finds only the two MU.6 comments.
- **Fix direction:** Add one shared setting line to every co-DM system prompt: Earth integrated by the System; no gods, patrons, blessings or other worlds.
- **Confidence:** Medium on impact; the prompt text is verified.

### codm-7 · Low · Whisper's non-speech output is not filtered
- **Where:** `sherpa.ts` `transcribe` returns raw text; `transcript.ts:104` drops only empty text.
- **What:** The voice-activity chunker opens on loudness, so dice, laughter, a chair or music become segments. Whisper tiny.en often turns such audio into "[BLANK_AUDIO]", "(laughs)", "Thank you." or "you". Those lines enter the transcript and count as "new talk", which keeps suggestions (every 90 s) and prepare-ahead looks paying while nobody is speaking.
- **Fix direction:** Drop bracketed and parenthesised-only lines and a short list of known hallucinations before writing.
- **Confidence:** Medium; unreproduced (needs the real model).

### codm-8 · Low · The Opus price over-reports
- **Where:** `client.ts:282-286`.
- **What:** Opus is priced at $15/$75 per million tokens. From memory, current Opus list prices are $5/$25; I could not check because the docs fetch was blocked. If Luke picks an Opus model, the counter shows about 3× the real spend. It errs on the safe side, but it misleads. Haiku ($1/$5) and Sonnet ($3/$15) match list prices.
- **Fix direction:** Price by model id where known, and keep the family fallback.
- **Confidence:** Medium.

## Checked and clean
- **Key:** Stored only through the injected cipher, as tmp then rename with mode 0600. Never in replies: the settings error handler sends fixed text, and `redactKey` cleans error bodies and stream errors. The test cipher only accepts `sk-ant-e2e-` keys.
- **Mic scope:** Only the GM window, only our own origin, only audio-only `media` requests (`launch.ts:187-197`, `main.ts:156`).
- **No audio on disk:** ScriptProcessor blocks are POSTed and held in memory. The output buffer is silent, so there is no feedback. `Listener` writes only text JSONL. Enrolment stores embeddings only.
- **Model download:** HTTPS GitHub release, pinned SHA-256 and byte cap, idle-stall abort. It downloads to `.part`, extracts to staging, renames only after verifying, and cleans up in `finally`. A failure leaves nothing half-installed.
- **No automatic retries anywhere** in `apps/server/src/ai`. Every unattended loop is paced from the call, paid or failed:
  - suggestions: `lastCallAt` is written before the call; a question cuts the wait to 30 s once; no new lines means no call; no key means no call;
  - prepare-ahead: at most 3 untaken drafts, `MAX_FAILED_LOOKS`, driven by the console's tick;
  - notes, summary and drafts: run only on a button press.
- **Failure messages:** 401/403 give "refused the key"; 429/529 give "busy or rate-limited". A mid-stream `error` event or a dropped stream is reported and its partial usage is counted. Generation has a 150 s limit and Cancel aborts the upstream call; other calls have 60 s. The quick route aborts upstream when the client goes away. Running guards answer 409 to double clicks on suggest, draft, notes and prepare. A new quick press aborts the one before.
- **Spend math:** Streaming input comes from `message_start` and cumulative output from `message_delta`. Haiku and Sonnet list prices are correct. No prompt caching is used, so there are no cache-token fields to miss. A generation prompt is about 4.1k input tokens, which is cheap.
- **No AI output reaches players without a GM action:** Quick answers come back on the GM's own HTTP request as NDJSON. Chips only fill the Generate box. Notes and summary go to the GM-only log and export, one line each. Practice drafts need Confirm. The loading text is the GM's own. There is no `dangerouslySetInnerHTML`.
- **No player journals in prompts:** `loreFor` and `loreForRequest` keep `kind === 'gm'` notes only. `campaignContext` sends names, race, class, grade and levels. Drafts send names and skill names.

## Notes for the caller
- The WebFetch of `https://docs.claude.com/en/api/rate-limits` was blocked (provenance prompt not answered), so the Tier-1 rate limit in codm-2 and the Opus price in codm-8 are unverified.
- `node_modules` in this worktree lacks `tar-stream`, so any test that loads `speech/model.ts` (including `e2eFake.ts`) fails to import here.
