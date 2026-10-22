# Questions for Luke

Runs never wait on these; each lists the default in use. Luke: write your
answer under any question and the next run will follow it.

1. **Laptop OS?** Default: build Windows, macOS and Linux.
   Answer:
2. **Currency name?** Default: "Credits".
   Answer:
3. **Grade gap on rolls** (open decision in DESIGN §7)? Default: pure ratio
   odds, switchable in settings.
   Answer:
4. **XP per level by grade** (G 100, F 150, E 250, D 400, C 650, B 1,000,
   A 1,500) OK? Default: yes.
   Answer:
5. **One-time stat bonus at each evolution?** Default: none.
   Answer:
6. **What opens an evolution?** Default: race level at the top of the grade,
   which means a character who ignores their profession (from E-grade on)
   can't evolve until it catches up. Alternative: class level alone opens it.
   Answer:
7. **Can the GM read players' private journals?** Default: no, only entries
   the player marks shareable.
   Answer:
8. **Session reports to GitHub?** Needs a second private repo (e.g.
   `the-system-campaign`) and a token in the app's settings. Default: export
   to a folder only.
   Answer:
9. **Starting World Stability?** DESIGN gives the 0–100 range but no start.
   Default: 100 (the world starts healthy and the infection drags it down).
   Answer:
10. **Class spread rounding.** DESIGN §4 says "largest-remainder rounding".
    Applied per level, that always rounds toward the same stats (4 points
    over 9 equal stats would always go to Strength–Vitality). Default: a
    cumulative split that hands each point to the stat furthest below its
    share so far; totals stay exact and fair over time (D35). OK to update
    DESIGN §4 to say so?
    Answer:
11. **Party pool bars: numbers or bars only?** Players see their own HP/MP/
    Stamina as numbers. For other party members the default is a bar only
    (a percentage), because max HP/MP/Stamina would reveal their Vitality,
    Wisdom and Endurance (D39). Alternative: show "340/400" for everyone.
    Answer:
12. **GM from another device?** The GM console is meant to run on the host
    laptop (key stays on that machine). Running it from a second device works
    but sends the key over plain wifi. Default: allowed, not recommended.
    Answer:
13. **Starter class.** The walking skeleton ships one built-in class, Archer
    (Basic Archery, Basic Stealth, Archer’s Eye; Agility and Perception
    weighted 3, Strength 2, others 1). Default: keep it until the class
    library (M4.2) lets you define your own. Want different starter classes?
    Answer:
14. **Refill pools on level-up?** When a level raises max HP/MP/Stamina
    (e.g. Endurance up → Stamina 100/110), current values stay where they
    were. Default: no refill (the GM heals or rests the party). Alternative:
    a level-up fills the pool (or adds the gained max).
    Answer:
15. **Do item and title bonuses raise max HP/MP/Stamina?** E.g. a ring with
    +1.0 Vitality. Default: yes, pool maxima use effective stats from M3.7 on
    (D60); until then only base stats count.
    Answer:
16. **Does the GM keep a stock?** The GM side of gifts and trades is
    unlimited (a shop or quest reward conjures the goods; what players hand
    to the GM leaves play). Default: unlimited. Alternative: a GM stash
    inventory that GM trades draw from.
    Answer:
17. **Journal privacy on disk.** The GM screen never shows a player's
    unshared journal entry, but the campaign files and backup export on the
    host laptop contain them (a restore needs them). Default: accept that.
    Alternative: players' journals stored encrypted with a per-player
    passphrase (lost passphrase = lost journal).
    Answer:
18. **Marks past the threshold.** A skill at its grade ceiling banks marks
    (e.g. 10 marks on a Rare skill that needs 8 for Epic). After the
    evolution, the upgrade resets marks to 0, so the 2 extra are lost.
    Default: lost. Alternative: carry the excess into the next rarity.
    Answer:
19. **Merging two at-ceiling skills.** A merge result above the grade's
    rarity ceiling is refused (two Rare skills cannot merge at F-grade).
    Default: refused until the next evolution. Alternative: merges may
    exceed the ceiling by one step.
    Answer:
20. **Must every evolution transform a skill?** DESIGN §6 says evolutions
    transform 1–2 skills, so each released option must name at least one
    transform (config `skills.evolutionTransforms`, min 1). A transform may
    keep the name and only raise the rarity. Default: at least one. Set the
    minimum to 0 in rules settings (M4.9) to allow plain evolutions.
    Answer:
21. **Capstone before evolving?** The capstone selection (levels 10, 45, …)
    is meant to be "the last selection before each evolution", but nothing
    stops the GM releasing the evolution before the capstone pick is made.
    Default: allowed (the pick stays pending and keeps its own grade's
    ceiling). Alternative: refuse to release an evolution while a selection
    is pending.
    Answer:
22. **Lower-grade ⅓: flat or per grade?** In the "lower-grade side ÷3"
    grade-gap mode, an F-grade side against an A-grade side gets the same
    ×⅓ as F against E. Default: flat ⅓ whenever the grades differ (DESIGN
    §7 wording). Alternative: ⅓ per grade step. (The "multiplier" mode
    multiplies the whole stat value by the grade's factor.)
    Answer:
23. **Can party members see each other's titles?** DESIGN §9 lists Titles
    on the player's own status screen; it doesn't say whether the party sees
    them. Default: owner only (titles may carry stat bonuses in M6.4).
    Alternative: titles are public, like name, class and grade.
    Answer:
24. **Profession start level when XP is banked.** At the E-grade evolution
    the profession starts at the class level *before* banked class XP
    applies (Cook 14 while class jumps to 24, race 19). Default: before
    (D64 order). Alternative: after, so the profession starts at the new
    class level.
    Answer:
25. **Declining an offered profession.** When an evolution offers
    professions, the player must pick one. Default: must pick (the GM can
    re-release with none). Alternative: allow "none for now".
    Answer:
26. **GM notes in session logs.** GM notes stay out of the session log
    and report unless the GM tags them `export`. Default: the `export`
    tag. Alternative: a separate "include in report" toggle on GM notes
    (the M4 notes screen could show the tag as a toggle either way).
    Answer:
27. **Hidden quests in the session log.** The session log is a GM-only
    file and includes hidden quests and the GM's reasons. Default: include
    them (the log is GM prep material for Claude). Alternative: leave
    hidden quests and reasons out so the file could be shown to players.
    Answer:

28. **Rejoin automatically?** A phone that played Jake shows "Continue as
    Jake" at the top of the join screen (one tap). Default: no automatic
    jump, so "Switch character" always reaches the list (D74). Alternative:
    opening the join URL goes straight to the last character.
    Answer:
29. **What pops up as a DING?** New level-ups and System messages pop up
    one at a time; free-point changes only go to the history. Sound is off
    until a player turns it on. Default: as described (D76). Alternative:
    sound on by default, or pop-ups for free points too.
    Answer:
30. **Who writes skill text?** Skills now show a System description and
    flavour line. Default: the GM writes it (per skill, per character for
    now; the skill library in M4.1 will reuse it), and the built-in Archer
    skills ship with original text (D78). Alternative: players may write
    their own flavour line.
    Answer:
31. **Should a skill selection DING?** When the GM offers a menu, the
    player's sheet shows a "Skill selection · 1 waiting" badge, but no
    pop-up or history line. Default: badge only (D80). Alternative: a
    System notification such as *'DING!' Skill selection available* when a
    menu is offered and *Skill acquired: [Name (Rarity)]* when chosen.
    Answer:
32. **Gear and pools; gift and trade pop-ups.** Equipping a Vitality item
    raises max HP but does not heal; unequipping lowers current HP to the
    new maximum (D81). Gifts received and trade offers/answers pop up on the
    player's screen like System messages (D82). Default: as described.
    Alternatives: equipping fills the gained amount; gifts and trades appear
    only in the history.
    Answer:
