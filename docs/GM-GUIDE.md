# GM guide

How to run a session of The System. These guides, the rules and the
tutorial content pack are not installed with the app: they live in the
project on GitHub, https://github.com/luke59neilson-oss/the-system (folder `docs`). Open a file there to read it, or
use its **Download raw file** button to save it.

The rules themselves are in
[`DESIGN.md`](https://github.com/luke59neilson-oss/the-system/blob/main/docs/DESIGN.md); every number there is a default you can change in
**Rules settings**. Print [`PLAYER-QUICKSTART.md`](https://github.com/luke59neilson-oss/the-system/blob/main/docs/PLAYER-QUICKSTART.md) (one page) for each
player;
when something will not connect, see [`TROUBLESHOOTING.md`](https://github.com/luke59neilson-oss/the-system/blob/main/docs/TROUBLESHOOTING.md).

## Where everything is (the console's tabs)

The console opens on **Home**; three tabs hold everything else. The open tab
is remembered on this laptop. Click a tab, or focus the tab bar and use the
arrow keys (Home and End jump to the ends). A dashboard link (a selection
waiting, a banner) opens the tab that handles it.

| Tab | Windows |
| --- | --- |
| Home | Needs you (what waits on the GM, each a link to its window), Party (a card per character, with what needs you), Players join (address and QR), New character |
| Session | Session (start, end, day), Award XP, Listening, Co-DM (quick responses, picks, generate, lore), Import (approve generated content), Encounter, Quests, Broadcast, Shops, Credits ledger, Trackers, Change log, System feed |
| Progression | Award XP, Skill offers, Evolution builder, Practice log, Marks review, Merges |
| Library & settings | Skill text, Skill library, Item library, Loot tables, Title library, Classes, races and professions, Bestiary, Reference (Primal Hunter lists), Rules settings, Co-DM settings |

Award XP is the one window in two places: the same form on both tabs (a
half-typed award shows on either). Its participant rows are the Session
tab's party at a glance. Titles are awarded from the Title library;
professions are offered in the Evolution builder; factions live in
Trackers; campaigns and backups sit in the header on every tab. The list
mirrors `apps/web/src/gm/tabsModel.ts`.

## Install and start

1. Download the newest preview from the repo's **Releases** page: the
   Windows installer (`TheSystem-…-win-x64-setup.exe`) or the Linux
   `AppImage`. There is no macOS download (D97): a Mac needs a build made
   from the source code.
2. Run it. The app is not code-signed, so Windows shows "Windows protected
   your PC" the first time: **More info → Run anyway** (TROUBLESHOOTING has
   the details). The installer asks where to install; the defaults are
   fine. Allow the app through the firewall on **Private** networks. On
   Linux, make the AppImage executable first (right-click → Properties →
   allow executing, or `chmod +x TheSystem-*.AppImage`).
3. Double-click **The System**. A "Starting The System…" splash appears,
   then the GM console opens. The console only works in this window (or
   through the GM link below); players can never open it.

The campaign is saved on every change. Quitting the app backs it up first.

## First time: a campaign and characters

- **New campaign**: give it a name and leave **Start with the default
  classes, Human race and their skills** ticked (the six starting classes,
  Human, Identify), then press **Create campaign**. It opens at once.
- To try things out first, **Load demo campaign** at the top switches to a
  sample party; **Back to my campaign** returns. Nothing in the demo touches
  your campaign.
- **Import content** → pick `tutorial.json` (download it from
  `docs/content-packs/` on GitHub, see the top of this guide) to load the
  tutorial on the Host (quests, regions, bestiary, Identify text). Tick what
  to apply; nothing changes until you approve it.
- **New character**: one per player, with a name, **Starting class** and an
  optional portrait, then **Create character**. Everyone starts at 10 in
  every stat with Identify and their class's three skills.

## Getting players in

The **Players join** panel shows the join address and a QR code. Players on
the same wifi scan it or type the address and pick their character; no
passwords. If a player can't connect, open **Players can’t connect?** in the
same panel. **Open the GM console in another browser on this computer** gives
a link for Chrome or Safari next to the app: it unlocks the console, so never
send it to a player.

## Running a session

1. **Session → Start session N.** The header chip shows the session and the
   in-game day. While it runs the app autosaves a session log to the exports
   folder every few minutes.
2. Play. The console is a grid of windows; the ones you'll use most:
   - **Party** (top): every character's levels, pools and what is waiting on
     you (a skill menu to build, an evolution to release, free points). A
     waiting menu opens straight in **Skill offers**.
   - **Award XP**: pick the track (class or profession), the amount and who
     shares it (even by default; **Set shares by hand** to change). Fill in
     the target's grade and level for the grade rules and the above-level
     bonus. The preview shows each character's levels, overflow to the other
     track and any XP that would be *lost* before you press **Award XP**.
     The "Typical session" line suggests an award for ≈ 6 levels per grade.
   - **Encounter**: **Contest roll** (pick each side's stat; the grade-wall
     rules apply; **Share with the table** shows the result to players),
     **Damage and healing** on HP / MP / Stamina, and **Progress clocks**
     (**Start clock**, **Success +1**, **Failure**; **Offer montage** once a
     clock is half full with no failures).
   - **Practice**: quick-add what a character did and with which skill or
     stat. Players log their own too; both land in **To review**.
   - **System broadcast**: a message in System voice to everyone, now or at a
     set time (**Scheduled** messages stay GM-only until sent).
   - **Quests**: **New quest**, timers, World Stability (actions with
     deltas, **Apply action**, **Nudge**), visible or hidden. A hidden quest
     tells the party (or **Only these characters**) that a hidden quest
     exists, nothing more.
   - **Bestiary and NPCs**: entries with grade, level and Identify text per
     rarity; **Reveal** adds one to players' Identify lists.
   - **Reference** (Library & settings): search the Primal Hunter lists
     (skills, items, creatures, classes and professions) for names in the
     books' style. GM-only. The co-DM sees a few matching rows as naming
     examples, never the ones flagged god-tied. To add rows, edit the CSVs in
     `docs/reference/primal-hunter/` and run `npm run reference`.
   - **Item library** (**Give** / **Take**), **Loot tables** (**Roll**),
     **Ledger** (**Grant** / **Fine** currency), **Title library**
     (**Award title**), **Trackers** (regions, survivor factions; hunger is narrated, not tracked).
3. **View as**: the header switches between **GM**, any character (exactly
   what that player sees) and **Table view** (every player's screen side by
   side). Your half-filled GM forms survive the switch.

## Level-ups, skills and evolutions

- **Skill offers**: when a character reaches a selection level, build a menu
  of 3–4 options (**Add option**), see their **Practice log** for ideas, and
  **Send menu**. Older unchosen options carry over below the new ones. The
  last menu before an evolution needs one option at the grade's rarity
  ceiling. **Withdraw** takes a menu back before it is chosen.
- **Marks review**: confirm at most one mastery mark per skill per session
  (**Confirm mark**); when a skill has enough, **Upgrade** it.
- **Merges**: when two skills have worked together often enough, name the
  result and **Send merge**.
- **Evolutions**: due when race level reaches the top of the grade and every
  selection is chosen. Write the paths, each with a stat bonus (**Bonus per
  stat** or +N to all), optionally **Reshape the class spread** and add
  transforms; set each skill's re-rating under **Skills after the
  evolution** (each skill starts at the rarity it has now; Identify never
  drops) and tick **Approve this re-rating**. At E-grade add profession
  offers. Then **Release evolution**; the player picks the path.
- **Skill library** and **Skill text**: library text is per name and rarity
  and updates every copy you have not hand-edited; **Use library text**
  hands an edited copy back to the library.

## Mistakes

**Change log** lists every change, newest first. **Undo** (then **Confirm
undo**) reverses one; players see it vanish from their screens. A change
that a later one depends on cannot be undone until you undo the later ones
first.

## Ending a session and working with Claude

1. **Session → End session N…** backs up the campaign and writes the session
   report to the exports folder. Marks and repeat checks start fresh.
2. **Copy for Claude** (or **Copy log for Claude** mid-session) copies the
   report. Paste it into Claude and ask for skill menus, evolutions, items,
   titles or bestiary entries in The System's content format
   ([`CONTENT-FORMAT.md`](https://github.com/luke59neilson-oss/the-system/blob/main/docs/CONTENT-FORMAT.md) on GitHub; give Claude the link
   or paste the file).
3. Save Claude's reply as a `.json` file and open it in **Import content**.
   The preview lists each entry; tick what to apply. A menu or evolution for
   a level not yet reached cannot be ticked: keep the file for later.

## Co-DM (optional)

The co-DM is Claude helping you run the table: it listens along, keeps
notes, offers ideas and writes shops, NPCs, places, encounters, items and
quest hooks on request. It never changes the campaign on its own. Everything
it writes waits for your approval, and none of it reaches players until you
approve it. Everything except listening needs an Anthropic API key.

### API key, models and spend

- Open **Co-DM settings** on the GM console. Paste your **Anthropic API key**
  (your own pay-as-you-go API account, separate from a Claude subscription)
  and press **Save key**. It is stored encrypted on this laptop, never shown
  again, never written to logs and never sent to players. **Replace API key**
  or **Remove key** changes it.
- **Test connection** makes one tiny call to check the key works.
- **Fast model (suggestions, notes, drafts)** and **Strong model (generation)**
  can be changed; press **Save models**. The defaults are a Haiku model for
  quick reads and a Sonnet model for writing content.
- The spend counter ("This session: $… · N calls") adds up every paid call
  this session, from the API's own token counts. It shows in Co-DM settings
  and in the Co-DM panel and catches up on its own every 20 seconds, so
  suggestions, notes, drafts and prepare-ahead looks show without a button.
  It starts again from $0 when a new session starts (or one ends).
- Without a key the rest of the app works as before; the co-DM panel says
  what it needs.

### Generate on request

In the **Co-DM** panel pick a kind (Shop, NPC, Place, Encounter, Item, Quest
hook), type **What the table needs** ("an herbalist near the canyon gate"),
and press **Generate**. The strong model writes it in the content format and
it opens in **Import content**, where the usual checks apply (flat item
bonuses, the 20% item cap, rarity ceilings, grades). Edit it in **Edit the
generated content**, **Regenerate**, or tick and apply it. **Cancel** stops a
slow request. A **shop** goes into the library with its keeper, wares and
prices; **Sell** on a ware fills in a GM trade to the chosen character.

### Loading screen

Tick **Show players a loading screen while the co-DM works** before you
press Generate. Players see a pinned System broadcast ("[The System is
constructing the area…]", or your own **Loading text**) while you narrate.
It stays until you remove it from Broadcasts, or, with **Clear it when I
approve the content** ticked, until you apply the generated content. A
generation that fails or is cancelled takes it down.

### Listening

The **Listening** window turns the laptop's mic into a live, GM-only
transcript for the co-DM. Speech is turned into text on the laptop; no audio
is ever saved or sent anywhere, only the text lines, in the campaign folder
under `transcripts/session-NN.jsonl`. While the mic is on, players' screens
show "[The System is listening]".

You can turn the mic on before or after **Start session** and leave it on
across sessions: each line goes to the session running when it was said.
Talk before any session starts goes to `session-00.jsonl`, which the co-DM's
quick responses, suggestions, drafts and notes do not read.

- First time: press **Download speech model** (about 118 MB, English,
  once). It goes into your user folder (`models` beside the app's data), not
  the installer, and is checked before use. Then press **Start listening**
  and allow the microphone if Windows asks.
- Laptop needs: any 64-bit laptop from the last several years. The
  speech engine (Whisper tiny.en on 2 CPU threads) used about 6 seconds of
  CPU per minute of talk on a 2-core cloud machine, so it keeps up with the
  table with plenty to spare; CI measures it again on every push (job
  summary). Allow about 350 MB of RAM and 105 MB of disk for the model. It
  works offline.
- Put the laptop in the middle of the table; a cheap USB conference mic
  helps a lot in a noisy room.
- **Voices** (speaker labels): the speech model download also fetches a
  29 MB voice model (if you downloaded speech before it existed, press
  **Download voice model**). With the mic off, press **Enrol** beside a character and
  have that player read aloud for 5 seconds. Transcript lines then start
  with the character's name when the voice match is confident; an unsure
  match stays unnamed rather than guessing. Only a voice print (numbers) is
  kept, in the campaign folder under `speakers/`, never the recording.
  **Re-record** replaces a sample; **Delete** (that character's voice) removes it.
  A sample that is mostly silence is refused ("Could not hear a voice"), so
  the player should speak the whole time. If the panel says the voice
  samples file is damaged, move `speakers/speakers.json` out of the campaign
  folder and enrol everyone again; the app never overwrites it.
- **Practice drafts** (needs an API key): in the Practice window's review
  queue, under **Co-DM drafts**, press **Draft from transcript** at a break
  or at the end of the session. The fast model reads what was said since
  the last press and lists each use of a skill it heard, with the quote,
  session, time and how sure it is (the character is the one the line names,
  else the voice match, else the co-DM's guess, marked low). **Confirm** logs
  it as your own practice entry in the session it was heard in, even if you
  confirm it next session; **Dismiss** drops it. Nothing counts until you
  confirm, and marks stay one per skill per session. Contest rolls in the
  Encounter window log practice for their characters on their own, so talk
  within two minutes of a roll is not drafted again for that character.
  Drafts are kept in the campaign folder under `codm/`.
- **Suggestions** (needs an API key): the Co-DM panel's Suggestions list
  offers a few ideas from what the table just said, each with the line that
  prompted it: a thing to generate, a complication, or a callback to an
  earlier thread. It asks the fast model about every 90 seconds while there
  is new talk (change the pace in **Every**; **Suggest now** asks at once, at
  most once a minute). **Use** fills in the generate request below it, ready
  for **Generate**; **Dismiss** removes the idea for good. Calls show in the
  spend counter.

### Session notes and summary

- **Running notes** (needs an API key): in the Co-DM panel press **Take
  notes** at a break. The fast model reads the transcript heard since the
  last notes and adds short lines on what happened. They go into the
  session log and its export under "Co-DM notes".
- **Summary**: after **End session**, and before you start the next one,
  press **Summarise session**. The
  co-DM catches up the notes, then writes what happened, who did what, open
  threads and NPCs met. It goes into that session's log and export (the
  `.md` report and its `.json`), so **Copy for Claude** carries it. Press it
  again to rewrite the summary; the export follows. It is never written by
  an automatic paid call, only when you ask.
- Notes live in the campaign folder under `codm/notes-NN.json`. If one is
  damaged the session log still writes, just without it.

### Prepare ahead (optional, off by default)

Tick **Draft content for where the table is heading** in the Co-DM panel's
**Prepare ahead** box. While it is on and the GM console is open, the co-DM
looks at the new table talk every few minutes (**Look every** 2–30 minutes;
**Look ahead now** looks at once, at most every 2 minutes). When the party
is heading somewhere new, it drafts that place, shop or NPC in the
background. Each draft shows the line that prompted it. **Review** opens it
in Import content to approve or edit; it stays in the list until you
**Dismiss** it. At most three drafts wait at once. Each look and each draft
is a paid call and shows in the spend counter, which is why it is off by
default.

### Live checklist for your key

The build never calls the paid API; tests use recorded replies. The first
time you use your own key, check the live path once (a few cents):

1. Co-DM settings: save the key, press **Test connection** (expect "Connected"),
   and see the spend counter show 1 call.
2. Generate a Shop from a one-line request; it opens in Import content with
   no errors, and the spend counter goes up.
3. Turn on the loading screen, generate again, and check a player's screen
   shows it and that it clears when you apply.
4. Start listening, talk for a minute about visiting somewhere, and see a
   suggestion chip appear (or press **Suggest now**); press **Use**, then
   **Generate**.
5. In the Practice review queue press **Draft from transcript**; confirm one
   draft.
6. End the session and press **Summarise session**; open the session report
   in the exports folder and find "Co-DM summary".
7. Look at a player's screen throughout: they should see only the listening
   mark and anything you approved, never the transcript, chips, notes or
   drafts.
8. Speech: the tests check listening with a stand-in that hears scripted
   lines, so this is the first real check of on-laptop transcription. During
   step 4, read the transcript: it should follow what was said closely.

## Rules settings

Every number in DESIGN.md (stat budgets, XP per level, grade gates, Identify
range, the grade-gap mode, currency name, …) is in **Rules settings**.
**Save rules** applies them to the campaign; **Reset to defaults** goes back
to DESIGN.md's values.

## Backups and moving laptops

Copy the app's `data` folder (TROUBLESHOOTING → "Where the campaign is
saved"). Each campaign's `backups` folder holds a copy from every session end
and every quit, portraits included. A campaign export (the GM's export file)
carries the event log and the portraits, and importing it brings both back.
