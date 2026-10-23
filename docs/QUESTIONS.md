# Questions for Luke

Runs never wait on these; each lists the default in use. Runs append new
questions here. **Luke answers in `docs/ANSWERS.md`**, which runs never edit,
so GitHub won't block his commits. Answers marked (applied) are already in
DESIGN/ROADMAP; do not re-apply them.

1. **Laptop OS?** Default: build Windows, macOS and Linux.
   Answer (Luke, 2026-10-22): Windows. (applied, D97)
2. **Currency name?** Default: "Credits".
   Answer (Luke, 2026-10-22): Credits. (default kept)
3. **Grade gap on rolls** (open decision in DESIGN §7)? Default: pure ratio
   odds, switchable in settings.
   Answer (Luke, 2026-10-22): Default for now, switchable later. Superseded the same day in chat: grade walls are the default. (applied, L1)
4. **XP per level by grade** (G 100, F 150, E 250, D 400, C 650, B 1,000,
   A 1,500) OK? Default: yes.
   Answer (Luke, 2026-10-22): Too low and too flat; ramp it like the power gap. ×3 per grade (G 100 … A 72,900); no XP from targets two or more grades below. (applied, L2)
5. **One-time stat bonus at each evolution?** Default: none.
   Answer (Luke, 2026-10-22): Yes, set by the System (GM) at each evolution. (applied, D98)
6. **What opens an evolution?** Default: race level at the top of the grade,
   which means a character who ignores their profession (from E-grade on)
   can't evolve until it catches up. Alternative: class level alone opens it.
   Answer (Luke, 2026-10-22): Race level at the top of the grade. (default kept)
7. **Can the GM read players' private journals?** Default: no, only entries
   the player marks shareable.
   Answer (Luke, 2026-10-22): Correct. (default kept)
8. **Session reports to GitHub?** Needs a second private repo (e.g.
   `the-system-campaign`) and a token in the app's settings. Default: export
   to a folder only.
   Answer (Luke, 2026-10-22): Folder export for now. (default kept; M9.4 deferred, D108)
9. **Starting World Stability?** DESIGN gives the 0–100 range but no start.
   Default: 100 (the world starts healthy and the infection drags it down).
   Answer (Luke, 2026-10-22): Starts at 100%; rarely used. (default kept)
10. **Class spread rounding.** DESIGN §4 says "largest-remainder rounding".
    Applied per level, that always rounds toward the same stats (4 points
    over 9 equal stats would always go to Strength–Vitality). Default: a
    cumulative split that hands each point to the stat furthest below its
    share so far; totals stay exact and fair over time (D35). OK to update
    DESIGN §4 to say so?
    Answer (Luke, 2026-10-22): OK to update DESIGN §4. (applied, D35 kept)
11. **Party pool bars: numbers or bars only?** Players see their own HP/MP/
    Stamina as numbers. For other party members the default is a bar only
    (a percentage), because max HP/MP/Stamina would reveal their Vitality,
    Wisdom and Endurance (D39). Alternative: show "340/400" for everyone.
    Answer (Luke, 2026-10-22): Bar with a percentage. (default kept)
12. **GM from another device?** The GM console is meant to run on the host
    laptop (key stays on that machine). Running it from a second device works
    but sends the key over plain wifi. Default: allowed, not recommended.
    Answer (Luke, 2026-10-22): Correct. (default kept)
13. **Starter class.** The walking skeleton ships one built-in class, Archer
    (Basic Archery, Basic Stealth, Archer’s Eye; Agility and Perception
    weighted 3, Strength 2, others 1). Default: keep it until the class
    library (M4.2) lets you define your own. Want different starter classes?
    Answer (Luke, 2026-10-22): A pool of starter classes from the class library: the books' six (Q38). (applied, L5)
14. **Refill pools on level-up?** When a level raises max HP/MP/Stamina
    (e.g. Endurance up → Stamina 100/110), current values stay where they
    were. Default: no refill (the GM heals or rests the party). Alternative:
    a level-up fills the pool (or adds the gained max).
    Answer (Luke, 2026-10-22): Level-ups never refill; an evolution fills all pools. (applied, D99)
15. **Do item and title bonuses raise max HP/MP/Stamina?** E.g. a ring with
    +1.0 Vitality. Default: yes, pool maxima use effective stats from M3.7 on
    (D60); until then only base stats count.
    Answer (Luke, 2026-10-22): Yes. A full pool stays full when its max rises; otherwise current is unchanged (85/100 +20 → 85/120; 100/100 +20 → 120/120). Item bonuses are flat only, capped at 20% of base; title percentages are additive. (applied, D100, L6)
16. **Does the GM keep a stock?** The GM side of gifts and trades is
    unlimited (a shop or quest reward conjures the goods; what players hand
    to the GM leaves play). Default: unlimited. Alternative: a GM stash
    inventory that GM trades draw from.
    Answer (Luke, 2026-10-22): Unlimited. (default kept)
17. **Journal privacy on disk.** The GM screen never shows a player's
    unshared journal entry, but the campaign files and backup export on the
    host laptop contain them (a restore needs them). Default: accept that.
    Alternative: players' journals stored encrypted with a per-player
    passphrase (lost passphrase = lost journal).
    Answer (Luke, 2026-10-22): Correct. (default kept)
18. **Marks past the threshold.** A skill at its grade ceiling banks marks
    (e.g. 10 marks on a Rare skill that needs 8 for Epic). After the
    evolution, the upgrade resets marks to 0, so the 2 extra are lost.
    Default: lost. Alternative: carry the excess into the next rarity.
    Answer (Luke, 2026-10-22): Marks are player effort, so the excess carries over. (applied, D101)
19. **Merging two at-ceiling skills.** A merge result above the grade's
    rarity ceiling is refused (two Rare skills cannot merge at F-grade).
    Default: refused until the next evolution. Alternative: merges may
    exceed the ceiling by one step.
    Answer (Luke, 2026-10-22): Correct. (default kept)
20. **Must every evolution transform a skill?** DESIGN §6 says evolutions
    transform 1–2 skills, so each released option must name at least one
    transform (config `skills.evolutionTransforms`, min 1). A transform may
    keep the name and only raise the rarity. Default: at least one. Set the
    minimum to 0 in rules settings (M4.9) to allow plain evolutions.
    Answer (Luke, 2026-10-22): Evolutions rarely transform; when two compatible skills were used together often enough, the GM is prompted with that merge during the evolution. (applied, D102)
21. **Capstone before evolving?** The capstone selection (levels 10, 45, …)
    is meant to be "the last selection before each evolution", but nothing
    stops the GM releasing the evolution before the capstone pick is made.
    Default: allowed (the pick stays pending and keeps its own grade's
    ceiling). Alternative: refuse to release an evolution while a selection
    is pending.
    Answer (Luke, 2026-10-22): No evolution while any selection is pending. Passed-over options stay selectable later, newest on top. (applied, D103)
22. **Lower-grade ⅓: flat or per grade?** In the "lower-grade side ÷3"
    grade-gap mode, an F-grade side against an A-grade side gets the same
    ×⅓ as F against E. Default: flat ⅓ whenever the grades differ (DESIGN
    §7 wording). Alternative: ⅓ per grade step. (The "multiplier" mode
    multiplies the whole stat value by the grade's factor.)
    Answer (Luke, 2026-10-22): Per grade step, compounding. Refined the same day: ⅓ at one grade apart, automatic at two or more. (applied, L1)
23. **Can party members see each other's titles?** DESIGN §9 lists Titles
    on the player's own status screen; it doesn't say whether the party sees
    them. Default: owner only (titles may carry stat bonuses in M6.4).
    Alternative: titles are public, like name, class and grade.
    Answer (Luke, 2026-10-22): Correct. (default kept)
24. **Profession start level when XP is banked.** At the E-grade evolution
    the profession starts at the class level *before* banked class XP
    applies (Cook 14 while class jumps to 24, race 19). Default: before
    (D64 order). Alternative: after, so the profession starts at the new
    class level.
    Answer (Luke, 2026-10-22): Moot: there is no banked XP. XP for a capped track levels the other track. (applied, L3)
25. **Declining an offered profession.** When an evolution offers
    professions, the player must pick one. Default: must pick (the GM can
    re-release with none). Alternative: allow "none for now".
    Answer (Luke, 2026-10-22): Allow "none for now"; a Professions tab keeps the offers until one is chosen, then locks (greyed). (applied, D105)
26. **GM notes in session logs.** GM notes stay out of the session log
    and report unless the GM tags them `export`. Default: the `export`
    tag. Alternative: a separate "include in report" toggle on GM notes
    (the M4 notes screen could show the tag as a toggle either way).
    Answer (Luke, 2026-10-22): Correct. (default kept)
27. **Hidden quests in the session log.** The session log is a GM-only
    file and includes hidden quests and the GM's reasons. Default: include
    them (the log is GM prep material for Claude). Alternative: leave
    hidden quests and reasons out so the file could be shown to players.
    Answer (Luke, 2026-10-22): Correct, plus players get a notice when a hidden quest exists. (applied, D106)

28. **Rejoin automatically?** A phone that played Jake shows "Continue as
    Jake" at the top of the join screen (one tap). Default: no automatic
    jump, so "Switch character" always reaches the list (D74). Alternative:
    opening the join URL goes straight to the last character.
    Answer (Luke, 2026-10-22): Correct. (default kept)
29. **What pops up as a DING?** New level-ups and System messages pop up
    one at a time; free-point changes only go to the history. Sound is off
    until a player turns it on. Default: as described (D76). Alternative:
    sound on by default, or pop-ups for free points too.
    Answer (Luke, 2026-10-22): Correct. (default kept)
30. **Who writes skill text?** Skills now show a System description and
    flavour line. Default: the GM writes it (per skill, per character for
    now; the skill library in M4.1 will reuse it), and the built-in Archer
    skills ship with original text (D78). Alternative: players may write
    their own flavour line.
    Answer (Luke, 2026-10-22): Correct. (default kept)
31. **Should a skill selection DING?** When the GM offers a menu, the
    player's sheet shows a "Skill selection · 1 waiting" badge, but no
    pop-up or history line. Default: badge only (D80). Alternative: a
    System notification such as *'DING!' Skill selection available* when a
    menu is offered and *Skill acquired: [Name (Rarity)]* when chosen.
    Answer (Luke, 2026-10-22): Correct. (default kept)
32. **Gear and pools; gift and trade pop-ups.** Equipping a Vitality item
    raises max HP but does not heal; unequipping lowers current HP to the
    new maximum (D81). Gifts received and trade offers/answers pop up on the
    player's screen like System messages (D82). Default: as described.
    Alternatives: equipping fills the gained amount; gifts and trades appear
    only in the history.
    Answer (Luke, 2026-10-22): Covered by Q15. (applied, D100; gift/trade pop-ups kept)
33. **Identify: level gap and "who knows what".** DESIGN §7 picks the tier by
    Identify rarity only; the demo Identify text says the result also depends
    on "your level and theirs", and the books hide details of much stronger
    targets. Entities are also known per character (the GM reveals them),
    not party-wide. Default: rarity only, per-character knowledge (D84).
    Alternatives: hide tiers when the target's grade is above the viewer's;
    everything revealed to one party member is known to all.
    Answer (Luke, 2026-10-22): Lower grade always; higher grade never; same grade up to 1.5 × the viewer's level. (applied, D107)
34. **Who may edit party notes.** Party notes can be changed or deleted only
    by their author or the GM (M1.8, D62), so a player cannot fix a typo in a
    teammate's note. Default: author or GM only (D85). Alternative: any party
    member may edit party notes (a shared wiki), with the GM able to undo.
    Answer (Luke, 2026-10-22): Correct. (default kept)
35. **Montage focus and marks.** DESIGN §6 says a montage focus counts as
    that skill's one mark for the session. The app logs the focus as a
    "montage" practice entry but does not award a mark by itself. Default:
    the GM awards the mark in the end-of-session review (D86). Alternative:
    a focus naming a skill awards its mark automatically.
    Answer (Luke, 2026-10-22): Correct. (default kept)

36. **Warnings before an evolution.** The evolution screen warns about mastery
    marks a transform resets, skill selections still waiting, a reshaped
    class spread, and that the choice is final. It does
    not stop the player evolving with a selection still open. Default: warn
    only (D88). Alternative: refuse to evolve until every waiting selection
    is chosen (see also Q21).
    Answer (Luke, 2026-10-22): Switch to the alternative: refuse to evolve until every selection is chosen. (applied, D103)

37. **What the skill library fills, and when.** A character who gains a
    skill gets the library entry's description and flavour by matching the
    official name only; an Uncommon Identify still gets the Common entry's
    text, and editing the library later does not change skills already
    granted. Effects text stays GM-only. Default: as described (D90).
    Alternatives: one entry per name and rarity; library edits update every
    character's copy that has not been individually edited; show effects to
    the skill's owner.
    Answer (Luke, 2026-10-22): All three alternatives: entries per name and rarity; edits update unedited copies; effects shown to the owner. (applied, L4)

38. **Default classes, races and professions.** New campaigns start with six
    starting classes (Archer, Warrior, Mage, Healer, Rogue, Brawler), the
    Human race and five professions (Alchemist, Cook, Blacksmith, Tailor,
    Scribe), each with short GM-facing descriptions; a race is a name and
    description only (no race stat lean or extra race skill), and players do
    not see class, race or profession descriptions yet. Default: as
    described (D91). Alternatives: a different starting set; races with
    their own stat weights or skills; show the descriptions to players on
    the status screen or the evolution profession picker.
    Answer (Luke, 2026-10-22): Replace the six with the books' six (Warrior Light/Medium/Heavy, Archer, Caster, Healer). No default professions: tailored per player once unlocked. (applied, D105, L5)

39. **Session log between sessions.** The running log now covers only a
    started session; changes made between sessions (prep, XP awarded after
    the session ended) appear in no session file, only in the event log.
    Default: nothing is written between sessions, and the GM console nudges
    the GM to start a session (D92). Alternatives: a "between sessions"
    file; fold between-session changes into the next session's report.
    Answer (Luke, 2026-10-22): Correct. (default kept)

40. **Portraits: where they show and travel.** Portraits show on the join
    list, the GM party table and players' party views, not on a player's
    own status window (DESIGN §9 has no portrait row). Exports and backups
    carry the event log only, so portraits do not travel with an export.
    Removing a portrait does not unpublish its file (anyone who saw the URL
    can still load it).
    Default: as described (D95). Alternatives: a portrait at the top of the
    status window; bundle the portraits folder into backups and exports.
    Answer:

41. **Pools after a maximum falls and rises again.** DESIGN §2 read
    literally: a falling maximum clamps the pool, and a pool at its maximum
    is full, so it rises with the maximum next time. Example: 110/120 HP with
    a +20 charm; take the charm off → 100/100; put it back on → 120/120. A
    player could heal a little by swapping gear. Older campaigns (created
    before this build) keep the old rule (a rising maximum never changes the
    pool) until the GM turns the rule on in the rules settings (M4.9).
    Default: as described (D111). Alternatives: remember that a pool was
    clamped and do not treat it as full; apply the new rule to old campaigns
    too.
    Answer (Luke, 2026-10-22): Agreed: close the loophole; a clamped pool stays full only if it was full before the drop. (applied, L7)

42. **Cap on title percentages?** Titles give percentage bonuses and stack
    additively (D115). The engine also caps the total percentage per stat
    (default +25%). Default: keep the +25% cap. Alternative: no cap on title
    percentages, or a different cap.
    Answer (Luke, 2026-10-22): No cap; titles will be few, far between and hard to earn. (applied, L8)

43. **Marks when an evolution transform raises a skill's rarity.** A
    transform is the System's gift at an evolution, not an upgrade the player
    paid for. Built default: the gain spends the marks each skipped step
    would cost, and the rest carry on (10 marks on an Inferior skill that
    becomes Uncommon keep 3; 5 marks keep 0). Same-rarity transforms keep
    every mark. Default: as described (D114). Alternatives: a transform
    keeps every mark (the gain is free); or it resets them to 0 (the old
    rule).
    Answer (Luke, 2026-10-22, in chat): evolutions downgrade many skills,
    since what is Rare at D-grade is not Rare at C-grade. Each skill drops one
    rarity by default and the GM adjusts each; same text, lower label; marks
    all kept. Every upgrade (by marks or by a transform) is a new skill to
    learn and starts at 0 marks. (applied, L14, L15; MR.1, MR.2)

44. **Asking the GM for items in a trade.** A player can propose a trade with
    the GM side ("40 Credits for the Bow"). Because the GM holds the whole
    item library, a player who guesses an item id could name an item they
    have never seen and get its definition sent to their screen (QF.2). Draft
    default on `wip/QF.2`: a player's trade with the GM may ask only for
    currency; the GM offers items by proposing the trade from the GM side.
    Alternative: a player may ask the GM only for items they have already
    seen (held, equipped, or in an earlier trade).
    Answer (Luke, 2026-10-22, in chat): currency only (default kept).
    (applied, L18)

45. **Asking another player for items.** A trade proposal may ask only for
    items the other player holds now (QF.2). So a player who guesses an item
    id can learn whether another player carries it, and the proposal then
    shows them its name and description. Built default: allowed (trading is
    open between players, and the ids are not shown anywhere). Alternative:
    a player may ask another player only for currency, or only for items the
    asker has already seen.
    Answer (Luke, 2026-10-22, in chat): yes, any item (default kept; QF.9
    hides holdings). (applied, L18)

46. **More profession offers after "none for now".** A character who declined
    every offered profession at the E-grade evolution keeps those offers in
    the Professions tab. Built default (MQ.6, D121): the GM may also offer new
    professions with any later evolution (D, C, ...) while the character still
    has none; they join the same list. The GM can also grant any profession
    directly. Alternative: offers happen only at the E-grade evolution.
    Answer (Luke, 2026-10-22, in chat): yes, at any later evolution (default
    kept). (applied, L18)

47. **Who gets a hidden quest's notice.** DESIGN §7 says the "affected
    players" get a detail-free notice that a hidden quest exists. Quests have
    no participant list, so each quest now has a GM-chosen notice list.
    Default (used now): everyone in the party, unless the GM names
    characters; the notice appears again if the quest is hidden again or
    reopened. Alternative: notify only characters the GM names (default
    nobody), or tie it to who is in the scene. (D122)
    Answer (Luke, 2026-10-22, in chat): the whole party unless the GM names
    characters (default kept). (applied, L18)

48. **Identify range details.** DESIGN §7: same grade only if the target's
    level is at most 1.5 × the viewer's level. Defaults used (MQ.8, D123):
    "the viewer's level" is their race level; targets without a grade and
    level (a place, an energy) are always in range; a known target out of
    range still shows its name in the Identify list, with `[??? – lvl ???]`
    instead of its text. Alternatives: class level; hide out-of-range
    targets from the list entirely.
    Answer (Luke, 2026-10-22, in chat): race level; name with [??? – lvl ???]
    (default kept). (applied, L18)

49. **Existing campaigns and the no-banking rule.** XP overflow (MQ.11)
    is on for new campaigns. Campaigns created before it keep banking XP at
    the grade top, so their logs replay exactly as played. Default (D124):
    they keep banking until the GM switches the rule in Rules settings
    (M4.9). Alternative: switch every campaign over automatically.
    Answer (Luke, 2026-10-22, in chat): switch every campaign automatically.
    (applied, L16; MR.3)

50. **Hand-written skill text and the library.** Once you write a
    character's skill text by hand (Skill text form), library edits no
    longer change that copy, even after it upgrades. Default (D125): it
    stays hand-written for good (until an evolution renames the skill).
    Alternative: a "Use library text" button that hands it back to the
    library.
    Answer (Luke, 2026-10-22, in chat): add the Use library text button.
    (applied, L17; MR.4)

51. **Hand-written skill text when a skill upgrades (follows Q50).** The
    MQ.A review pointed at DESIGN §6: "an upgrade picks up the higher
    rarity's text automatically". Default now (D133): when a skill changes
    rarity and the library has text for the new rarity, the copy takes it,
    replacing your hand-written text for the old rarity; library edits at the
    same rarity still leave hand-written copies alone. Alternative: keep your
    hand-written text through upgrades too (Q50's earlier default).
    Answer (Luke, 2026-10-22, in chat): keep the hand-written text through
    upgrades. (applied, L17; MR.4)

52. **Identify at level 0.** A brand-new character (race level 0) can
    identify nothing of its own grade above level 0, since 1.5 × 0 = 0: a
    level-1 G-grade rat shows `[??? – lvl ???]` until their first level-up.
    Default: the rule as written (DESIGN §7); leave grade and level blank on
    tutorial-start creatures if you want them readable. Alternative: treat a
    level-0 viewer as level 1 for this rule.
    Answer (Luke, 2026-10-22, in chat): keep the rule as written (default
    kept). (applied, L18)

53. **Note and trade limits.** To stop one phone flooding everyone's
    screen (QF.3), each character may keep up to 300 notes with 150,000
    characters in all (about 25,000 words), and have 10 trades they proposed
    open at once; a player-logged practice entry is at most 500 characters
    and 5,000 per character. The GM has no limits. Default: these numbers (they live in
    the rules config). Alternative: tell me other numbers.
    Answer:

54. **No portable Windows build.** Your first download stopped halfway and the
    portable `.exe` started anyway and hung (QF.11). The installer checks
    itself and says "integrity check failed" instead. Default (D140): Windows
    gets only the installer; the release notes list each file's size and
    SHA-256 so a short download is easy to spot. Alternative: bring back a
    portable build with its own integrity check (more to build and test).
    Answer:
