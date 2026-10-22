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
   Answer (Luke, 2026-10-22): Default for now, switchable later. (default kept)
4. **XP per level by grade** (G 100, F 150, E 250, D 400, C 650, B 1,000,
   A 1,500) OK? Default: yes.
   Answer (Luke, 2026-10-22): Too low and too flat: XP should scale with power like stats do. Numbers being settled in chat; keep the current curve until then. (open)
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
    Answer (Luke, 2026-10-22): A pool of starter classes from the class library; see Q38. (open)
14. **Refill pools on level-up?** When a level raises max HP/MP/Stamina
    (e.g. Endurance up → Stamina 100/110), current values stay where they
    were. Default: no refill (the GM heals or rests the party). Alternative:
    a level-up fills the pool (or adds the gained max).
    Answer (Luke, 2026-10-22): Level-ups never refill; an evolution fills all pools. (applied, D99)
15. **Do item and title bonuses raise max HP/MP/Stamina?** E.g. a ring with
    +1.0 Vitality. Default: yes, pool maxima use effective stats from M3.7 on
    (D60); until then only base stats count.
    Answer (Luke, 2026-10-22): Yes. A full pool stays full when its max rises; otherwise current is unchanged (85/100 +20 → 85/120; 100/100 +20 → 120/120). Wants a cap on item stats like the books; cap being settled in chat. (partly applied, D100)
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
    Answer (Luke, 2026-10-22): Per grade step, compounding. (applied, D104)
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
    Answer (Luke, 2026-10-22): Asked for examples; discussing in chat. (open)
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
    Answer (Luke, 2026-10-22): Asked for examples; discussing in chat. (open)

38. **Default classes, races and professions.** New campaigns start with six
    starting classes (Archer, Warrior, Mage, Healer, Rogue, Brawler), the
    Human race and five professions (Alchemist, Cook, Blacksmith, Tailor,
    Scribe), each with short GM-facing descriptions; a race is a name and
    description only (no race stat lean or extra race skill), and players do
    not see class, race or profession descriptions yet. Default: as
    described (D91). Alternatives: a different starting set; races with
    their own stat weights or skills; show the descriptions to players on
    the status screen or the evolution profession picker.
    Answer (Luke, 2026-10-22): Match the book's starting classes (discussing in chat, open). No default professions: tailored per player once unlocked. (professions applied, D105)

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
    Answer:
