# Playtest report (realistic first session and a bit of a second)

Worktree: /home/claude/review/playtest (origin/main f656f8c2, built with `npm run build`, nothing committed).
Server: built bundle, fresh temp data dir, `GM_KEY` set, `THE_SYSTEM_E2E_FAKE_AI=1` (fake co-DM works; no paid API called).
Driver: one Chromium, GM page 1366x768 plus up to six phone pages 390x844. I played about 45 minutes of table time (session 1, restart, kill -9, session 2).
Screenshots: /home/claude/review/findings/playtest-shots/ (133 files). Scripts: see the end.

No High findings. 4 Medium, 10 Low. Console and server output stayed clean (the only console errors were the expected ERR_CONNECTION_REFUSED while I stopped the server, and one deliberate 400 from a too-short fake API key).

One thing I got wrong and retracted: I first thought players get no notice of the End-scene prompt. They do (status window, "End of scene · What did you practise? · [Answer]", `PlayerScreen.tsx:593`). It is not a finding.

## Findings (most severe first)

### playtest-1 · Medium · Award XP form keeps "who" and "target grade" after an award; only Amount and Reason clear
Steps: Session tab, Award XP, tick only Brock, amount 1, Award. Look at the form again: Brock is still the only ticked participant. Also: award with Target's grade = G once, then do the next award (earlier in my run: "Undo me", Miranda, 100 XP).
Happened: after each award the amount, reason and typed shares clear, but the participant ticks and the Target's grade select stay. My next whole-table award would have gone to one character; and an award I typed for Miranda was logged as "100 class XP for Undo me, enemy grade G" because the G target from the fight before was still set (an F-grade character would silently get a third). The status line just says "XP awarded". The preview rows do show it, but a GM typing a number and pressing Award at the table will not re-read the rows.
Expected: reset participants (to everyone) and Target grade after a successful award, or say "Awarded to Brock only" / name the target in the result line.
Screenshots: playtest-shots/126-award-sticky-participants.png (Brock only ticked after a Brock-only award), playtest-shots/71-xp-mixed-grades.png.
Likely code: apps/web/src/gm/XpAward.tsx:113-118 (clears amount, reason, typed; `excluded` at :29 and the target/enemy-grade state are kept).
Confidence: certain (reproduced twice).

### playtest-2 · Medium · The session report (and "Copy for Claude") leaves out spell casts, GM-given skills and damage/healing
Steps: GM gives Miranda the spell Ember Dart (Edit sheet, Give a skill); she casts it twice from her phone; End session 1; open exports/main/session-01.md (or Copy for Claude).
Happened: the Timeline has no line for the skill being given, the casts, or the HP/MP changes (Brock took 45 damage; Miranda spent 80 MP). The Practice section lists Jake's and Brock's entries but not Miranda's two "Cast [Ember Dart]" entries, although the GM's own Marks review for Session 1 shows "[Ember Dart] used 2x" and the Practice review queue lists them. Session 2's log likewise has no line for Brock's damage or Tomas's skill grant (only the final Party sheet shows the skill).
Expected: casts are practice entries that feed mastery marks; the report exists so Claude can draft skill menus and marks from it, so casts should appear (at least in Practice), and a GM-given skill should be a timeline line.
Likely code: packages/engine/src/report/sessionLog.ts, `describeEvent` has no case for `skill.cast`, `skill.granted`, `pools.set`; the practice list keeps only ids seen in `practice.logged` events (about lines 560-600, `practiceIds`), so cast-made entries are filtered out.
Files: /tmp/pt-data/exports/main/session-01.md and .json (data dir is temporary; rerun the scripts to regenerate).
Confidence: certain for the missing casts and skill grant; likely that pools.set is intentionally omitted (but the damage log is also useful).

### playtest-3 · Medium · End-of-scene prompt survives "End session"; practice answered between sessions belongs to no session and never reaches marks or the report
Steps: Session 1 running; Encounter/Practice: End scene. Brock and Jake answer. End session 1 with Miranda and Ana still unanswered. Miranda (phone) answers "Flung fire at the stalkers" with Ember Dart; she sees "Practice sent to the GM for review." Start session 2.
Happened: Miranda's and Ana's prompts are still on their phones after the session ended (Ana's was still waiting 30 minutes later, in session 2). Miranda's entry is stored with `"sessionId":null` (events.jsonl line 87). Marks review "Session 1" shows Ember Dart "used 2x" (not 3) and "Session 2" shows nothing logged for her, and session-01.md/json never lists it. So the GM can never confirm a mark from something the player was told was sent for review. It does appear in "To review", so the GM has no hint it is orphaned.
Expected: End session clears (or closes) the open scene prompt; or an answer given while no session runs is attached to the session that just ended / refused with "no session running".
Likely code: packages/engine/src/events/reducer.ts:2405 `session.ended` returns without clearing `scenePrompt` (set at `scene.ended`, :2417).
Confidence: certain (data seen in events.jsonl and marks review).

### playtest-4 · Medium · The broadcast "To" setting does not reset after sending, so a later table-wide message can go to one player
Steps: Session tab, System broadcast: To "Sister Ana", message, Send. Type the next message ("Day three dawns red over the Crown." scheduled for day 3, meant for everyone) without touching "To".
Happened: Message clears but To still says Sister Ana. It was scheduled "to Sister Ana" (the scheduled list does say "Day 3 · to Sister Ana"). Players on the table never got it; the confirmation just says "Broadcast sent" / "Scheduled for day 3" without a name. I fell into this on my first pass.
Expected: reset To to Everyone after a send, or put the recipient into the confirmation ("Sent to Sister Ana").
Likely code: apps/web/src/gm/GmScreen.tsx:855-858 (`setText('')`, `setShow('list')` but not `setTo('all')`, state at :814).
Screenshot: playtest-shots/86-sched-broadcast.png (the form still showing the earlier choice when I reached it).
Confidence: certain.

### playtest-5 · Low · Trades: equipped items silently missing from the item list; stale offers stay open with a reason-less refusal
Steps: Brock wears the Grazer Hide Vest. Propose a trade: the item select shows only "(none)" (no hint that the vest is equipped). Unequip, offer vest for 5 credits to Miranda. Brock equips the vest again. Miranda taps Accept.
Happened: "That trade can no longer go through" (no reason). The offer stays in both Trades lists; neither player is told the offer is dead, Brock still sees "You offer Miranda [Grazer Hide Vest] for 100 Scrip [Withdraw]" while wearing it. (Related: undoing an accepted trade in the GM change log reopens the offer on both phones with no line explaining why; that is consistent undo behaviour, just silent.)
Expected: say "[Name] is equipped / no longer held" and offer a way to clear dead offers.
Screenshot: playtest-shots/117-stale-trade-accept.png.
Confidence: certain.

### playtest-6 · Low · Undo refusal does not say which later change blocks it
Steps: Change log, Undo then Confirm undo on "400 class XP for Canyon stalker ambush" (or on the GM giving Miranda the spell after she cast it).
Happened: "Can't undo this: a later change depends on it. Undo the later changes first." With 30+ later changes the GM cannot tell which.
Expected: name the first blocking change (or link it).
Screenshot: playtest-shots/67-undo-refusals.png.
Confidence: certain (documented in the GM guide, but still a dead end at the table).

### playtest-7 · Low · Capstone check ignores a Rare option that is already carried over on the menu
Steps: Jake reaches class level 10 (F capstone, ceiling Rare). Passed-over options on the builder include [Hawk Patience (Rare)]. Fill three new Common/Common/Uncommon options.
Happened: Send menu stays disabled with "Level 10 is the F-grade capstone: offer at least one rare option", although the player's menu would list a Rare option under "Passed over earlier". It says "the menu" but means "the new options".
Expected: count carried-over options, or word it "add at least one NEW Rare option".
Screenshot: playtest-shots/108-capstone-no-rare.png.
Likely code: packages/engine/src/evolution/model.ts:301-315 (`reachesCeiling` is computed from `options` only).
Confidence: certain on behaviour; whether it is the intended rule is a design call.

### playtest-8 · Low · Many level-ups at once means many separate free-point rounds on a phone
Steps: Jake gains levels 6-10 in one award (+15 points); he already had 9 unassigned.
Happened: the Assign panel says "Race level 2: 2 points (8 more batches waiting)": nine Review/Confirm rounds, each with its own stat taps, for 24 points. By design (batches), but heavy after a big award.
Expected (nice to have): a way to assign more than one batch in a go.
Screenshot: playtest-shots/73-brock-assign.png (Brock with three batches).
Confidence: certain.

### playtest-9 · Low · Stale status lines stay on screen
- Import content: after a generated shop was ready, the window showed the new preview and "Applied 33 entries" from the tutorial import an hour earlier. (playtest-shots/90-generated.png)
- Encounter: "Shared with the table" stayed under Progress clocks long after the contest.
- New character form keeps "Character created"; Broadcast keeps "Broadcast sent" while the form is switched to Schedule.
- Brock's phone keeps "The GM changed your evolution; open it again to see the new paths." until he reopens it (a fresh page does not show it).
Confidence: certain. Low because each is only noise.

### playtest-10 · Low · Party card "Remove" (portrait) is one click with no confirm, next to the character name
Steps: Home, Party; the first card shows "Change | Remove" above the name (only characters with a portrait). I clicked "Remove" expecting a character delete confirm; Jake's portrait was gone at once (change log row "Jake's portrait was removed", undoable, I undid it).
Expected: label "Remove portrait" visibly (the aria-label is already "Change Jake's portrait") or confirm.
Screenshot: playtest-shots/122-remove-confirm.png.
Confidence: certain.

### playtest-11 · Low · "Reveal" of a bestiary entry tells the players nothing
Steps: Bestiary, Canyon stalker, Reveal to Everyone who does not know it.
Happened: "Canyon Stalker" appears in each player's Identify list, but no toast or log line. Identify output for a Common-rarity viewer is "[Canyon Stalker (F) – lvl 7]" followed by a second line "[Canyon Stalker – lvl 7]" (looks like a duplicate; the tutorial entry has no text for Common). Out-of-range viewers get "[??? – lvl ???]" correctly.
Screenshot: playtest-shots/83-jake-identify.png.
Confidence: certain. (The GM probably narrates it, so Low.)

### playtest-12 · Low · GM party card shows "XP 0 / 100" for a character at the grade top
Steps: Award Jake 300 XP at G level 1-4 (50 XP lost), or look at Brock/Ana at G level 4 with an unreleased evolution.
Happened: the card reads "XP 0 / 100" as if progressing; the Award XP box (correctly) says "at the grade's top ... 400 lost".
Expected: "at the grade's top" on the card too.
Screenshot: playtest-shots/20-home-after-jake-cap.png.
Confidence: certain.

### playtest-13 · Low · Wording: "No Credits has changed hands yet."
Credits ledger empty state (currency name plural + "has"). Appears with any plural currency name. Screenshot: playtest-shots/03-session-tab.png (bottom left of Credits window).

### playtest-14 · Low · End-of-scene answer form shows its error before the player has typed
Steps: on a phone with the End-of-scene prompt, tick a skill without typing the action.
Happened: a red role="alert" "Say what you did" appears at once (screen readers would announce it). The text field label is "This scene's practice" while its placeholder says "What did you do?".
Screenshot: playtest-shots/61-brock-practice.png.

## Played through without problems
- GM: new campaign (default classes), tutorial.json import (33 entries applied), four characters with different classes and one portrait (non-square image shown cropped in the circle), a 5th and a 6th character created mid-campaign (new phone sees the pinned banner, revealed quest, party), start/end session, advance day, "Load demo" is guarded by a confirm.
- Players: join list, pick, "Welcome back · Continue as", reconnect after server SIGTERM restart and after kill -9 (stale LOCK taken over, 123 events intact, every page identical to before), a phone offline while the GM awarded XP, whispered, then reconnected (DING, log and messages all caught up), live page vs fresh load compared section by section for all five phones (identical apart from local UI state).
- XP: preview for even splits, solo, mixed grades with a G target (F character gets 150 -> "gains 50"), overflow ("75 lost", "400 XP will be lost: those tracks are at the top"), multi-level DINGs (toast "+1 more"), level-up timing, free-point batches ("N more batches waiting"), the Typical-session helper.
- Evolution to F: builder with two options, re-rating select un-ticks the approval, Release is disabled until approved; player evolution flow with re-rated skill preview; re-release while a player sits on the confirm screen shows "The GM changed your evolution; open it again" (graceful).
- Skill menus: build, send, choose; passed-over options listed under "Passed over earlier"; undo of a player's choice brings "Skill selection 1 waiting" back.
- Items, gifts, trades: GM give with reason, equip/unequip (+0.1 shows "(+0.1)" in stats), credits grant to everyone, player gift, trade propose/accept (balances correct: 190/290, 310/210), GM shop sell (co-DM fake shop applied), decline path.
- Spell: library entry with MP cost, GM grants it, "Cast (40 MP)" until 30/130, "Not enough MP" text, log lines "Cast [Ember Dart]: -40 MP (70 left)".
- Quests: hidden quest, "only these characters" notice (others see nothing), reveal (all see it, "New quest"), complete, World Stability action x3 (100 -> 85, phones update), timers count down on day advance.
- Broadcasts: pinned banner, 20 s banner (expired by itself, survived a restart as pinned), whisper to one, "Several...", scheduled for day 3 (sent on advance), co-DM loading screen banner removed on Apply.
- Contest roll: unshared (GM only) then shared (Jake sees the result card; Brock sees nothing). Logged as practice.
- End scene: players' prompt in the status window, answers (with/without skills) reach "To review".
- Merge: offer, decline, second offer, accept ("Skills merged" DING, both originals consumed).
- Marks: Session 1 review after the session ended, confirm mark live-updates an open skill dialog (1 / 4 marks).
- Titles (award, duplicate refused, undo), Rules settings (currency rename live on phones), Notes (private journal), Identify range (??? for out-of-grade), Sound toggle and slider, Table view, View as, tab memory after reload, GM overflow check on all four tabs (none), phone horizontal overflow check on all pages (none; a 60-character name and an 80-character skill name wrap cleanly).
- Undo of: player trade acceptance, broadcast (pinned banner), title, XP award (refused with dependency), player's skill choice, portrait removal; all reflected on phones.
- Speed: tab switches 95-200 ms, GM award to phone update about 475 ms.
- Co-DM (fake mode): key save, test connection ($0.001, 1 call), generate shop and NPC with loading screen, apply. Listening needs a microphone (headless: "No microphone" message) so skipped.

## Scripts
Worktree /home/claude/review/playtest/playtest-scripts/ (untracked, nothing committed):
- server.sh (start/stop/kill the built server on 127.0.0.1:31333, data dir /tmp/pt-data, fake AI on)
- driver.mjs (persistent Chromium + pages, HTTP port 31400), run.sh (POST a JS snippet; `run.sh -f file.js`)
- snippets/*.js (every step above, e.g. e2.js End scene, m3-m5.js merge, ev1-ev3.js evolution, c2-c3.js contest, b2-b4.js broadcasts, u2/u4/un1/un2.js undo, eq3.js live-vs-fresh comparison, kl1.js kill -9)
