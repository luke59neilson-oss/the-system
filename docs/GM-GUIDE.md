# GM guide

How to run a session of The System. The rules themselves are in
[`DESIGN.md`](DESIGN.md); every number there is a default you can change in
**Rules settings**. Players get [`PLAYER-QUICKSTART.md`](PLAYER-QUICKSTART.md);
when something will not connect, see [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).

## Install and start

1. Download the newest preview from the repo's **Releases** page: the
   Windows installer (`TheSystem-…-win-x64-setup.exe`) or the Linux
   `AppImage`. Release builds do not include macOS (D97).
2. Run it. The app is not code-signed, so Windows shows "Windows protected
   your PC" the first time: **More info → Run anyway** (TROUBLESHOOTING has
   the details). Allow it through the firewall on **Private** networks.
3. Double-click **The System**. A "Starting The System…" splash appears,
   then the GM console opens. The console only works in this window (or
   through the GM link below); players can never open it.

The campaign is saved on every change. Quitting the app backs it up first.

## First time: a campaign and characters

- **New campaign**: give it a name and leave **Start with the default
  classes, Human race and their skills** ticked (the six starting classes,
  Human, Identify). The new campaign opens at once.
- To try things out first, **Load demo campaign** at the top switches to a
  sample party; **Back to my campaign** returns. Nothing in the demo touches
  your campaign.
- **Import content** → pick `docs/content-packs/tutorial.json` to load the
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
   - **Item library** (**Give** / **Take**), **Loot tables** (**Roll**),
     **Ledger** (**Grant** / **Fine** currency), **Title library**
     (**Award title**), **Trackers** (hunger, regions, survivor factions).
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
  evolution** (one rarity down by default). At E-grade add profession offers.
  Then **Release evolution**; the player picks the path.
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
   ([`CONTENT-FORMAT.md`](CONTENT-FORMAT.md)).
3. Save Claude's reply as a `.json` file and open it in **Import content**.
   The preview lists each entry; tick what to apply. A menu or evolution for
   a level not yet reached cannot be ticked: keep the file for later.

## Rules settings

Every number in DESIGN.md (stat budgets, XP per level, grade gates, Identify
range, the grade-gap mode, currency name, …) is in **Rules settings**.
**Save rules** applies them to the campaign; **Reset to defaults** goes back
to DESIGN.md's values.

## Backups and moving laptops

Copy the app's `data` folder (TROUBLESHOOTING → "Where the campaign is
saved"). Each campaign's `backups` folder holds a copy from every session end
and every quit.
