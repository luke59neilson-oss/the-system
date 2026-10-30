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
    Answer (Luke, 2026-10-25, in chat): bundle portraits into backups and
    exports, and show the character's portrait at the top of the status
    window. (applied, L19; MT.10)

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
    Answer (Luke, 2026-10-25, in chat): not asked; the default numbers stand.
    (L19)

54. **No portable Windows build.** Your first download stopped halfway and the
    portable `.exe` started anyway and hung (QF.11). The installer checks
    itself and says "integrity check failed" instead. Default (D140): Windows
    gets only the installer; the release notes list each file's size and
    SHA-256 so a short download is easy to spot. Alternative: bring back a
    portable build with its own integrity check (more to build and test).
    Answer (Luke, 2026-10-25, in chat): not asked; installer only stands (Luke
    uses Windows only). (L19)

55. **What a player can ask for in a trade.** So that a proposal never reveals
    what another player holds (QF.9), a player may ask only for items they have
    seen: ones they hold or wear, or ones offered to them or by them in a
    trade. Asking for 4 of something the other player holds 1 of is now
    accepted and only fails when they accept. The trade screen already asks
    only for currency ("ask in person and let them offer"). Default (D143):
    this rule. Alternative: let players ask for any item in the library by
    name, which would tell them which items exist.
    Answer (Luke, 2026-10-25, in chat): items the asker has seen (default
    kept). (applied, L19)

56. **Does Identify drop at evolution too?** MR.1 re-rates every skill one
    rarity down by default, and that includes the race skill Identify, so a
    Common Identify becomes Inferior at the G → F evolution and shows less
    about the same targets until it climbs back (it keeps its marks). The GM
    can keep it in the release. Default (D149): Identify drops like any other
    skill. Alternative: race skills (or Identify alone) keep their rarity by
    default.
    Answer (Luke, 2026-10-25, in chat): see Q64. (applied, L19; MT.1)

57. **Faster reviews (efficiency check, Tier 2).** (a) The builder pastes its
    own `npm run check` and e2e results with the commit SHA into the review
    prompt, and the reviewer re-runs only what it doubts; (b) two small,
    independent items (no engine, save format or golden changes, no `Mx.A`)
    share one reviewer. Each saves a few minutes of a blocking review per run.
    Default: no change (reviewers re-run everything, one item each).
    Not put to Luke (the build was complete); default kept: no change. (L19)

58. **Efficiency guard on Highs.** Trials are reverted when the number of
    High review findings rises, but recent Highs all came from sweep-found
    QF items, so two harmless changes (D119, D132) were reverted on noise
    (D150). Count only non-QF items for that guard? Default: no change.
    Not put to Luke (the build was complete); default kept: no change. (L19)

59. **GM sheet edits: levels, XP and grade.** The M4.5 sheet editor edits
    name, base stats, current pools, skill nicknames and the Unique tag, and
    can return an assigned free-point batch to the player. It does not set
    class/profession level, XP or grade directly: those would skip the class
    spread, free points, selections and evolutions, so they change only
    through XP awards and evolutions (and undo). Should the GM have a raw
    "set level" override anyway? Default: no (D157).
    Answer (Luke, 2026-10-25, in chat): add the override. (applied, L19; MT.5)

60. **When a scheduled System broadcast goes out.** M4.7 schedules a
    broadcast for a later **in-game day**: it is sent the moment the GM
    advances the day counter to that day (or past it), so it survives app
    restarts and undo, and needs no clock. It does not schedule by real
    time ("in 20 minutes") or for "the start of the next session". Want
    either of those too? Default: in-game day only (D159).
    Answer (Luke, 2026-10-25, in chat): the GM can add, change, send, override
    and overrule anything, whenever; broadcasts go out when the GM sends them,
    and can show for a set time or stay as a banner until removed. (applied,
    L19; MT.6, MT.7)

61. **A merge offered at an evolution.** M5.2 lets the GM offer a ready
    merge as part of an evolution option: the two skills become one new
    skill when the player picks that option. It counts as the one merge of
    the grade being left (so a character who merged earlier in that grade
    cannot get another at the evolution), and the merged skill is then
    re-rated with the rest at the *next* evolution, not this one. Should an
    evolution merge count against the new grade instead? Default: the grade
    being left (D168).
    Not put to Luke; default kept: an evolution merge counts against the grade
    being left. (L19)

62. **Who accepts a merge?** M5.4 lets the GM build a merge from a merge
    alert (two skills logged together 3 times, both at least Uncommon) and
    send it: it applies at once and the player gets the System's merge DING.
    Should the player be able to accept or decline a merge first (keeping
    both originals), like a selection menu? Default: the GM's send applies
    it; the GM asks at the table first (D171).
    Answer (Luke, 2026-10-25, in chat): the player accepts or declines.
    (applied, L19; MT.2)

63. **End-of-scene prompt for players?** M5.5's "End scene" walks the GM's
    console through the party one character at a time. Should it also ask
    each player, on their own screen, to log what they practised? Default:
    no; players keep their own practice panel (D172).
    Answer (Luke, 2026-10-25, in chat): prompt the players too. (applied, L19;
    MT.9)

64. **Should evolutions re-rate race skills like Identify?** DESIGN §6 drops
    every kept skill one rarity at evolution by default, so Identify (Common)
    becomes Inferior at the F evolution unless the GM keeps it, and the
    Identify tier the player sees drops with it. Should race skills (or just
    Identify) keep their rarity by default? Default: the rule as written; the
    GM can keep Identify in the evolution builder's re-rating list (M5.A
    review).
    Answer (Luke, 2026-10-25, in chat): no automatic drop: the GM sets every
    skill's new rarity, each shown at its rarity going into the evolution, and
    must approve the list before the evolution can be released; Identify never
    drops. (applied, L19; MT.1)

65. **Should players see their own currency ledger?** M6.3 keeps the ledger
    (every grant, fine, gift, trade and loot with the balance after) on the
    GM's console; a player sees their balance and a notice for each grant or
    fine, with the GM's reason. Should players also get a "Credits history"
    of their own entries? Default: no; the notices are in their history (D176).
    Answer (Luke, 2026-10-25, in chat): yes, show players their Credits
    history. (applied, L19; MT.4)

66. **Do a title's flat stats get multiplied by title percentages?** The
    engine computes (base + capped items + title flats) × (1 + Σ title %), so
    a title's +10 flat also grows with a +50% title. DESIGN §4 only names base
    and items inside the brackets. Default: keep flats inside (as built);
    the other reading adds them after the multiplier (M6 milestone review).
    Answer (Luke, 2026-10-25, in chat): inside: title percentages grow title
    flats (default kept). (applied, L19)

67. **How much of a contest's odds should players see?** When the GM shares a
    contest roll (M7.3), each player on it gets a pop-up with their own value,
    their chance as a whole percent, and Success/Failure. Against a bestiary
    NPC that lets a player estimate the NPC's stat to a few percent. Default:
    show the whole-percent chance (DESIGN §7 shows ratio odds; the GM chooses
    what to share). Other options: coarse words ("likely", "even",
    "unlikely"), or no odds against NPCs (D182).
    Deferred (Luke, 2026-10-26): to be settled in a separate encounters-and-combat
    discussion; the player rolls in some situations and the GM in others. Current
    behaviour stays until then.
    Answer:

68. **Should hunger do anything on its own?** The hunger tracker (M7.4) is
    bookkeeping: the GM sets each character's step (Fed … Starving, renamable)
    or moves everyone one step with a button. Default: no automatic change
    when the day advances and no penalty from hunger; the GM narrates it.
    Options: every new day moves everyone one step hungrier; a step adds a
    penalty (for example to Stamina) (D184).
    Answer (Luke, 2026-10-25, in chat): no hunger tracker at all; like ammo,
    hunger is narrated now and then, not a mechanic. (applied, L19; MT.3)

69. **Should players see the survivor factions?** Factions (M7.4) are GM-only
    (name, region, head count, standing toward the party, notes); players see
    only the current region's name. Default: GM-only, shared through notes or
    broadcasts. Option: a "known to players" toggle that shows a faction's name
    and standing (D184).
    Answer (Luke, 2026-10-25, in chat): add a reveal toggle. (applied, L19;
    MT.8)

70. **Should a contest between two player characters hide each side's stat?**
    When the GM shares a contest between two characters, each player sees
    their own stat value and the rounded chance, which together reveal the
    other player's stat (roughly). Default: keep it as is; the GM chooses to
    share, like the party's pool bars (sweep D, Low). Option: show players
    only the chance in words when both sides are characters (D186).
    Deferred (Luke, 2026-10-26): to be settled in a separate encounters-and-combat
    discussion; the player rolls in some situations and the GM in others. Current
    behaviour stays until then.
    Answer:

71. **Efficiency trials: should unrelated guards be judged against a noise band? (Tier 2, LOOP §9.4)**
    The D183 trial (blocking agents launched together) lifted sweep-run end
    minutes 42 → 52, but the round-2 share went 5/10 → 7/10 and main CI
    red/day 1 → 2, so §9.2 reverted it (D194). The auditor traced both guard
    moves to causes D183 cannot touch. Proposal: when a trial starts, list
    the guards it could move; judge those strictly and the rest against a
    band (round-2 ±2 of 10, red/day ±1), reverting on an out-of-band move only
    if it persists at the next check; and restore D183. Default: no change
    (D183 stays reverted).
    Not put to Luke (the build was complete); default kept: no change. (L19)

72. **Tutorial pack numbers (M9.5).** The tutorial pack (`docs/content-packs/tutorial.json`)
    needed numbers DESIGN §8 does not give. Defaults used: World Stability
    starts at 100 and players see it; cleansing a curse zone −5, killing a
    pale hunter −2, killing a System-placed beast +1, killing a Beast Lord
    +5. Beast Lords: Gale Warden F-grade lvl 14, Clotmother E lvl 22,
    Ossuary King E lvl 28. [Rapid Spread] gives +5% Agility and +5%
    Endurance; a second title [Lordbreaker] gives +3% Strength and +2
    Strength. The hidden quest "The Host's Response" is there for the reveal;
    players see "a hidden quest exists" from day 1 (DESIGN §7), so untick it
    at import and add it later if that gives the twist away. Stability starts
    at its maximum, so the + actions only matter once something has lowered it.
    Every value is an ordinary library entry: change it in the app, or tell
    me and the pack changes (D197).
    Answer (Luke, 2026-10-25, in chat): import the hidden quest switched off.
    (applied, L19; MT.11)

73. **macOS build (M10.2).** M10.2's text asks for a macOS dmg, but D97
    (your Q1 answer: you use Windows) dropped macOS from the release, and the
    workflow builds Windows and Linux only. Default: keep it that way and read
    M10.2's "all three artifacts" as the two D97 keeps. Since the repo went
    public (L10) macOS runners cost nothing, so say "add macOS" if any player
    or co-GM uses a Mac and it goes back in (unsigned dmg).
    Answer (Luke, 2026-10-25, in chat): Windows only; there is no co-GM.
    Default kept. (applied, L19)

74. **Build complete (M11.5).** The final review came back clean, so
    `docs/DONE.md` is written and the hourly build runs now stop at once.
    Default: they stay stopped. To start them again (to apply answers in
    ANSWERS.md, add M9.4 GitHub sync, or new roadmap items), delete
    `docs/DONE.md` on GitHub; the next hourly run picks up from there.
    Answer (Luke, 2026-10-25, in chat): new work added (MT, MC); DONE.md
    removed so the runs resume. (applied, L19, L20)

75. **Narrower round-2 reviews? (efficiency, Tier 2; 2026-10-25 auditor).**
    A round-2 reviewer would get the round-1 findings and the fix diff, and
    re-run `npm run check` plus the specs for the touched files instead of
    the whole suite (est. 2–4 minutes and 30–40% of reviewer tokens per
    round 2; risk: a regression outside the fixed files waits for CI).
    Default: no change (round 2 reviews as before).
    Answer (Luke, 2026-10-26, in chat): no change; round-2 reviews stay as
    they are. (applied, L21)

76. **GM override and skipped selections (MT.5).** When you set a character's
    class level directly (say 0 → 12), the selections at levels 5 and 10
    become due as usual, so you still build their menus and the player picks;
    nothing else on the way is granted (no stat spread, free points or
    evolution bonus). Default: selections stay due. Option: the override
    skips them too (the character never gets those picks). (D214)
    Answer (Luke, 2026-10-26, in chat): selections stay due (default kept).
    (applied, L21)

77. **Bound sweep reviewers (efficiency check 2026-10-26).** A quality-sweep
    reviewer once took 46 minutes and pushed a run past the 52-minute stop.
    Option: give sweep reviewers a scope or time budget (about 15 minutes) and
    launch sweeps only in a run's first 5 minutes. Default: no change. (D220)
    Answer (Luke, 2026-10-26, in chat): no change; sweep reviewers stay
    unbounded. (applied, L21)

78. **How sure before a line gets a name? (MC.6, D241)** Speaker labels
    prefer silence to a wrong name: a line is named only when the voice is
    clearly closest (similarity at least 0.6 and 0.1 ahead of the next
    voice). With only one player enrolled there is no next voice, so that
    player's lines need 0.7, which keeps the GM's own lines from taking
    their name but may leave some of theirs unnamed. These numbers have not
    been tried on real voices yet; your first session with the mic will
    show it. Default: keep 0.6 / 0.1 and the stricter bar for one voice.
    Option: lower them if too few lines get names.

79. **Which line do the quick responses answer? (MD.1, D256)** The buttons
    answer the newest line that reads as a player's question or attempt (ends
    with "?", or "I try…", "can we…", "I sneak…"); with none, the newest line.
    The "NPC in the scene" is the one last named aloud (by your name for it or
    the name players know); the laptop cannot tell who is voicing whom, so
    the picker changes it. Your button names, instructions and order are
    saved on the laptop, so they are the same in every campaign. Default:
    as described. Option: per-campaign button settings.

80. **How the co-DM's row of five fills (MD.2, D258).** Chips sit in five
    fixed slots (keys 6–9 and 0). A slot keeps its chip until you dismiss
    it; when you do, the newest waiting idea from "More" takes that slot at once, and nothing else moves. One look can now offer
    up to six ideas (five plus one waiting). A new player question or
    attempt makes the co-DM look again 30 seconds after its last look,
    instead of waiting for your interval (at most two looks a minute, a
    fraction of a cent each on the fast model). With no API key it never
    looks. Default: as described. Options: leave a dismissed slot empty
    until the next look; a longer wait after a question.

81. **Sharing kept lore (MD.3, D260).** Keep saves an answer or a
    generated item as a GM note tagged lore, the NPC, the place and the
    session; the co-DM reads it for that NPC or place and is told not to
    contradict it. GM notes can never be shared with players, so to share a
    legend you copy it into a party note. Default: as described. Option: a
    "Share with the party" button on a lore note that makes that party copy
    for you.

83. **CI on wip branches instead of long local e2e runs? (efficiency, Tier 2;
    2026-10-30 auditor).** Run the same CI on `wip/**` pushes with the e2e
    split into 2 shards, and let a run accept a green CI result on its pushed
    wip commit in place of a full local e2e run at close-out and `Mx.A`. Local
    full runs on the 2-CPU workspace often get cut off and slow the reviewer
    beside them. Cost: more Actions minutes on wip pushes. Default: no change.
