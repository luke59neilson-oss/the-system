# The System — Game Design Source of Truth

This file holds the game rules the software must implement. Every number here is a
**default in the rules config**, editable by the GM in the app. When code and this
file disagree, this file wins until Luke changes it.

Source docs (claude.ai): "Progression Rules Reference" and the chat design thread,
October 2026.

## 1. Tone and table

- 3–4 players, in person, one GM (Luke). Laptops on the GM's wifi.
- Loose, story-first play in the style of the Dungeons and Daddies podcast; numbers sit in the
  background. The software carries the math so the table doesn't have to.
- Style source: Zogarth's *The Primal Hunter* (the System, status screens,
  "DING!" notifications, skill rarities, evolutions). Setting: Earth gets
  integrated; no Zogarth gods or other galaxies.

## 2. Characters

- **Nine stats:** Strength, Agility, Endurance, Vitality, Toughness, Wisdom,
  Intelligence, Perception, Willpower. Everyone starts at **10** in every stat.
- **Display in tenths:** modifier = stat ÷ 10, shown with one decimal
  (10 → 1.0, 23 → 2.3).
- **Derived pools (default, open decision):** HP = 10 × Vitality,
  MP = 10 × Wisdom, Stamina = 10 × Endurance.
- **Pools when maxima change:** if a maximum rises (level, item, title,
  evolution bonus), a **full pool stays full**; any other pool keeps its
  current value. Level-ups never refill pools. If a maximum falls, the
  current value clamps to it, and the pool stays full only if it was full
  before the drop (Luke, Q41: no healing by swapping gear). Examples: 85/100
  HP equips +20 → 85/120; 100/100 → 120/120; 110/120 removes a +20 charm →
  100/100, puts it back on → 100/120; 120/120 → 100/100 → 120/120.
- **Tracks:** Class level, Profession level, Race level.
  - Race level = average of class and profession levels (rounded down).
  - Before a character has a profession, race level = class level.
  - **Professions** become available at the **E-grade evolution**. There is
    no standard list: the GM offers each character professions tailored to
    what they have done (practice log). The player picks one or chooses
    "none for now"; offered professions stay listed in a Professions tab and
    can be taken later, until one is chosen and the list locks (greyed out).
    While a character has none, the GM may add offers at any later evolution
    (Q46). A profession starts at the character's class level when taken.
  - **Class levels** grant the class spread; **race levels** grant free
    points; **profession levels** grant no stats directly (they raise race
    level and add profession skill options).
  - **Grade** is the highest grade the character has evolved into. Class and
    profession levels cannot pass the top level of the current grade
    (4, 14, 49, 99, 149, 199, 240).
  - **No banked XP; XP overflows.** XP for a track that is at the grade's top
    goes to the other track instead (class XP levels the profession, and
    profession XP levels the class), so whatever isn't ready yet catches up.
    This applies to every campaign, including ones created before the rule
    (Q49).
    When both tracks are at the top (or the class is at the top and there is
    no profession), the XP has nowhere to go and is lost; the GM's XP preview
    says so before the award is confirmed.
  - **Evolution becomes available** when race level reaches the top of the
    current grade (config `evolutionGate: "race"`, Luke confirmed) **and no
    skill selection is pending**: every selection a character has earned must
    be chosen first. The GM releases it and the player chooses.
  - **Evolution refills HP, MP and Stamina** and grants a **one-time stat
    bonus** that the GM, as the System, sets for each evolution option (any
    mix of stats, or +N to all).
  - Skill selections trigger from **class level**. XP needed per level uses
    the character's **current grade**. Level 240 is the campaign cap for now.
- Every character starts with the race skill **Identify (Common)** and 3 class
  skills from their starting class.

## 3. Grades and pacing

Pacing target: ~6 race levels per session (range 4–8), 40-session campaign.
Evolutions are **held** at each threshold until the GM releases them. Nothing
banks while they wait: XP overflows to the track that isn't capped yet, and is
lost once both are (§2).

| Grade | Race levels | Reached by session | Selection interval | Capstone level | Rarity ceiling | Theme |
| --- | --- | --- | --- | --- | --- | --- |
| G | 0–4 | 1 | none (starting kit) | — | Rare | Dull aluminum |
| F | 5–14 | 1 | every 5 class levels (5, 10) | 10 | Rare | Dull bronze |
| E | 15–49 | 3 | every 5 (15…45) | 45 | Epic | Shiny copper |
| D | 50–99 | 9 | every 10 (50…90) | 90 | Ancient | Shiny silver |
| C | 100–149 | 17 | every 10 (100…140) | 140 | Legendary | Shiny gold |
| B | 150–199 | 25 | every 10 (150…190) | 190 | Legendary | Shiny platinum |
| A | 200–240 | 34 | every 10 (200…240) | 240 | Mythical | Prismatic diamond |

Total: 29 skill selections + starting kit. S-grade and godhood are out of scope
for now but the data model must not block adding grades.

Theme note: silver and platinum look alike on screens. Platinum gets a cooler,
blue-white tint and a heavier brushed texture so the change is visible.

## 4. Stat budget per level (same for every class)

| Grade | Class spread (automatic) per class level | Free points per race level | Total |
| --- | --- | --- | --- |
| G | 4 | 2 | 6 |
| F | 5 | 3 | 8 |
| E | 8 | 4 | 12 |
| D | 12 | 6 | 18 |
| C | 18 | 9 | 27 |
| B | 27 | 13 | 40 |
| A | 40 | 20 | 60 |

- Class spread follows the class's stat weights. Each point goes to the stat
  furthest below its weighted share of all spread received so far (ties in
  stat order), so totals are exact every level and fair over time (D35,
  Luke approved).
- Free points: each level-up's free points are assigned **once**, then that
  batch locks. Later level-ups grant new, unlocked points. The GM can
  override.
- Each evolution may reshape the class spread toward stats the character used
  (GM chooses, guided by the practice log).
- **Bonuses (Luke, 2026-10-22):**
  - **Titles** give a set percentage bonus (the GM sets it per title; a title
    may also give flat stats). Characters can earn many.
  - **Items** give flat stat bonuses only, never percentages. The total item
    bonus on a stat is capped at **20% of that stat's base value**; anything
    above the cap is ignored and shown as capped.
  - **All percentages are additive**, never compounding: they are summed, then
    applied once. Effective stat = (base + capped item bonus) × (1 + sum of
    title percentages). Example: base Vitality 100, items +30 (capped to +20),
    titles +10% and +5% → (100 + 20) × 1.15 = 138.
  - **No cap on title percentages** (Luke, Q42): titles are rare and hard
    to earn. The config may still set one, but the default is none.
- Check values (all tracks leveling together, starting total 90):
  total stats = 194 at level 14, 614 at level 49, 1,514 at 99, 2,864 at 149,
  4,864 at 199, **7,324 at 240**.

## 5. XP

- The GM awards XP as a **number** per fight/event/task.
- Default split: even percentage across the chosen participants; the GM can
  include/exclude party members and adjust percentages before confirming.
- Class XP comes from fights and challenges; profession XP from crafting and
  profession acts. Race level is derived.
- Optional bonus for defeating enemies above the character's level
  (default +10% per level of difference, capped at +100%).
- XP needed per level triples each grade (the books' ×3): G 100, F 300,
  E 900, D 2,700, C 8,100, B 24,300, A 72,900. The GM ramps awards to match;
  the "typical session ≈ 6 levels" helper shows the amount for each grade.
- **XP across grades:** defeating something one grade below the character
  gives ⅓ of the award; two or more grades below gives **0 XP** (no farming
  weaker grades). The app shows the GM a "typical session ≈ 6 levels"
  helper.

**XP award box (Luke, 2026-10-30):** each participant's row shows their
grade, levels, XP now and per level at their grade, and XP to the next
level; the typed award shows each share and roughly how many levels it is
per player, with a reference line ("F: 1 level = 300 XP; a typical session
≈ 6 levels = 1,800 each").

## 6. Skills

- **Rarity ladder:** Inferior → Common → Uncommon → Rare → Epic → Ancient →
  Legendary → Mythical (Divine reserved). Unique is a tag for one-of-a-kind skills.
- **Selections:** at the class levels in §3. Menu of 3–4 options, built by the
  GM (often from imported files Claude drafts) using the practice log. The
  level-up can happen mid-session; the choice can wait for downtime.
- **Passed-over options stay available.** Every later menu lists the new
  options first and older unchosen options below them (scrollable); still
  one pick per selection. An option leaves the list when chosen, withdrawn by
  the GM, already owned, or above the current rarity ceiling.
- **Capstone:** the last selection before each evolution must include at
  least one option at the grade's rarity ceiling.
- **Profession options** appear inside class menus once a profession exists.
- **Evolutions rarely transform skills.** Transforms are optional (config
  minimum 0). When two compatible skills have been used together often enough
  (the merge alert), the evolution builder prompts the GM to offer that merge
  as part of the evolution.
- **Evolutions re-rate skills (Luke, Q43; Q56/Q64).** What was Rare at
  D-grade is not Rare at C-grade, so every evolution includes a re-rating of
  every skill the character keeps. Nothing drops on its own: the evolution
  builder lists each skill at the rarity it had going into the evolution, the
  GM sets each one's new rarity (raise within the new grade's ceiling, keep,
  or lower, never below Inferior) and approves the list, and the evolution
  cannot be released until that approval is given. **Identify never drops.**
  The skill's text and effects do not change (same power, new label), and a
  lowered skill keeps all its marks, so a well-practised skill may climb
  straight back with its next upgrade (after which it starts at 0).
- **Spells are skills with costs (Luke, 2026-10-30).** Any skill (per name
  and rarity in the library) can carry a cost (mana, stamina or health, an
  amount), a cooldown, range and casting notes, and a "spell" tag; the GM
  creates them in the skill library. A player taps **Cast** on their phone:
  the pool goes down (refused when it is too low), and the use is logged as
  practice for the GM's review; the GM can undo or adjust. Cooldowns are
  shown, not enforced.
- **Skill names:** the System gives the official name; the player may add a
  nickname ("Jake Juice"). Show both.
- **Skill library (Luke, Q37):** one entry per skill name **and rarity**, so an
  upgrade picks up the higher rarity's text automatically. Editing a library
  entry updates every character's copy the GM has not personally edited. A
  copy the GM has hand-written keeps its text through library edits and
  upgrades until the GM presses **Use library text** (Q50, Q51). A downgrade
  at evolution never changes a copy's text. A
  skill's **effects** text is shown to its owner (never to other players), like
  the books' skill descriptions.

### Mastery marks (upgrades outside selections)

A mark is earned when a skill is used in a way that mattered (risk, creativity,
turning point). GM confirms marks in the end-of-session review.

| Upgrade | Marks |
| --- | --- |
| Inferior → Common | 3 |
| Common → Uncommon | 4 |
| Uncommon → Rare | 6 |
| Rare → Epic | 8 |
| Epic → Ancient | 10 |
| Ancient → Legendary | 12 |
| Legendary → Mythical | 15 |

- Max one mark per skill per session (a montage focus counts as that mark).
- A skill at its grade's rarity ceiling banks marks until the next evolution.
- **Every upgrade starts at 0 marks** (Luke, 2026-10-22): an upgraded skill
  is new to the character, so there is no familiarity to carry. That covers
  an upgrade by marks (extra marks beyond the threshold are not kept) and
  any evolution transform. Only a skill that drops a rarity at evolution
  keeps its marks: it is the same skill with a lower label.

### Merges

- Unlocks when two skills have been logged working together 3 times.
- Both skills must be at least Uncommon. Max one merge per character per grade.
- Result: one skill, one rarity above the higher of the two, doing both jobs.
  Originals are consumed; marks start at 0.
- The GM sends a merge as an offer: the player accepts or declines it on
  their screen, and declining keeps both originals (Q62).

## 7. Play tools

- **Resolution:** ratio odds, chance = yours ÷ (yours + theirs). The app
  rolls and shows results.
- **Grade walls (default mode, Luke 2026-10-22).** A higher grade is a
  different order of being.
  - **Same grade:** plain ratio odds.
  - **One grade apart:** the lower side's stat counts ×⅓ in the roll, and its
    hits deal ⅓ damage. Only a strong late-stage lower grade against a weak,
    barely evolved higher grade has a real chance.
  - **Two or more grades apart:** no roll. The higher grade succeeds, and the
    lower grade's attacks deal no damage.
  - **No strength in numbers across grades:** lower-grade characters cannot
    pool their power against a higher grade; each acts alone, and anything
    two or more grades below cannot touch it at all. A thousand G-grades are
    nothing to an A-grade.
  - **A fight against a higher grade is a clock, never one roll.** With ⅓,
    a peak E against a fresh D wins about 24% of single rolls but about 10% of
    a best-of-five fight; a mid-E against a mid-D about 2%.
  - Other modes stay available in settings: none (pure ratio odds); grade
    multiplier per 10 points (G×1, F×3, E×5, D×10, C×20, B×40, A×80).
- **Progress clocks** with N segments. **Montage:** available when a clock is
  half filled with no failures; player gives a one-line focus (saved to the
  practice log); GM narrates the rest and adds one cost.
- **Practice log:** quick-add (character, action, skill/stat), end-of-scene
  prompt (the GM's console walks the party, and each player's screen asks
  what they practised, for the GM to review; Q63), end-of-session review (repeats flagged, skill pairs counted, marks
  confirmed), selection alert (within 5 levels), merge alert.
- **Titles:** percentage stat bonuses (optionally flat stats too), awarded by
  the GM, shown to the player with System-style text. Rules in §4.
- **Identify:** entities carry descriptions per minimum Identify rarity; the
  player sees the best tier their Identify rarity unlocks. **Who can be
  identified:** anything of a lower grade always; nothing of a higher grade;
  the same grade only if its level is at most 1.5 × the viewer's level.
  Otherwise Identify shows `[??? – lvl ???]`. The viewer's level is their
  race level; targets without a grade and level (a place, an energy) are
  always in range; a known target out of range keeps its name in the
  Identify list with `[??? – lvl ???]` instead of its text (Q48). So a
  level-0 character identifies nothing of its own grade above level 0 until
  its first level-up (Q52).
- **Quests:** text, timer/day counter, and an optional **World Stability %**
  (starts at 100) with GM-defined rules (action tags → deltas) and a
  visible/hidden toggle. **Hidden quests:** when one exists, the affected
  players get a System notice that a hidden quest exists and can be
  triggered, with no details: the whole party, unless the GM names
  characters; the notice appears again if the quest is hidden again or
  reopened (Q47).
- **No hunger tracker** (Luke, Q68): like ammo, hunger is narrated now and
  then to ground the players, never tracked by the app.
- **Items:** rarity, description, effects (flat stat bonuses only, capped per
  §4); equipment slots (Zogarth's 10):
  2 rings, necklace, chest, legs, boots, bracers, mask, cloak, gloves; plus
  weapon slots (main hand, off hand). Inventory, a configurable currency, and
  giving/trading between players and the GM. A player's trade with the GM
  asks only for currency (the GM offers items from the GM side); between
  players a proposal may ask only for items the asker has seen (held, worn,
  or offered in a trade), so it reveals nothing about the item library or
  what the other player holds (Q44, Q45, Q55). Players see their own Credits
  history (Q65).
- **Factions** are GM-only until the GM reveals one; a revealed faction
  shows players its name and standing (Q69).
- **Player log:** every change the GM makes to a character (items, Credits,
  stats, pools, skills, titles, quests, overrides) reaches the player as a
  notification, and the player's main screen keeps a running log of them,
  newest first, beside the full history. View as shows the GM exactly what
  the player sees, pop-ups and log included (sound muted).
- **Notes:** player private journal, party shared notes, GM private notes;
  tags linking notes to characters, NPCs, regions, quests; search. The GM
  cannot read a private journal entry unless the player marks it shareable.
- **Logging for Claude:** the app autosaves a running session log (practice
  entries, notable events, shareable notes, XP, level-ups, quest and stability
  changes) to the exports folder every few minutes and on quit, plus a full
  report at session end. "Notable events" = level-ups, selections,
  evolutions, titles, mark upgrades, merges, item transfers, GM broadcasts,
  stability changes.
- **GM authority (Luke, Q60):** the GM can add, change, send, override and
  overrule anything, whenever. Where the app enforces a rule, the GM has an
  override (a new, logged, undoable event), including setting a character's
  level, XP and grade directly with a warning that lists what the change
  skips (Q59). Two guarantees stay absolute: players never receive GM-only
  data, and the event log is never rewritten.
- **Broadcasts** go out when the GM sends them (scheduling by in-game day
  stays optional). Each can show for a set time or stay as a banner until the
  GM removes it (Q60).
- **Backups and exports** carry the event log and the portraits folder
  (Q40).
- **GM security:** GM actions always require a GM key that the desktop app
  injects into its own window. The key never appears in the join URL or QR.
  The server checks Origin on WebSocket upgrade and denies GM HTTP routes by
  default.

## 9a. GM console layout (Luke, 2026-10-30)

No single long page. The console opens on a **home dashboard**: the campaign
and session (day, session running or not), the join address and QR, one card
per character (portrait, grade, levels, XP to next level, pool bars), and
what needs the GM (selections waiting, evolutions to build, practice drafts,
merge answers, players' requests), each a link to where it is handled. Three
tabs hold everything else, each a set of panels instead of one scroll:

- **Session:** the party at a glance with a quick **Award XP**; the co-DM
  (quick responses, suggestions, listening, generation, loading screen);
  encounters and contests; quests and World Stability; broadcasts; loot and
  shops; trackers; notes; View as; the change log with undo.
- **Progression:** the full XP award; skill offers; marks review; merges;
  the evolution builder; professions; the practice log review; titles.
- **Library & settings:** skills and spells, classes, races, professions,
  items, titles, NPCs and the bestiary, factions, loot tables, the reference
  lists, content import, rules settings, co-DM settings, campaigns and
  backups.

## 9. Status screen (player sheet layout)

Follows the books' status window, in this order; values update live. The
character's portrait, if any, sits at the top (Q40).

```
Status
Name: <name>
Race: [Human (F) – lvl 12]
Class: [<class name> – lvl 14]
Profession: [<profession name> – lvl 10]      (row hidden before E-grade)
Health Points (HP): 340/400
Mana Points (MP): 210/210
Stamina: 180/200
Stats
Strength 2.3 · Agility 3.1 · Endurance 2.0 · Vitality 4.0 · Toughness 1.8
Wisdom 2.1 · Intelligence 1.4 · Perception 3.7 · Willpower 1.2
Free points: 3   [Assign]
Titles: [Forerunner], [Rapid Spread]
Class Skills: [Name (Rarity)] …   (rarity-colored, nickname shown beside)
Profession Skills: …
Race Skills: [Identify (Common)]
```

- A framed "System window": translucent panel, thin glowing border, the grade
  metal as the frame and accent, monospace-leaning headings, bracketed names.
- Notifications use the books' wording: `*'DING!' Class: [Archer] has reached
  level 5 - Stat points allocated, +3 free points*`.
- Supported viewports: 1366×768 and 1920×1080 laptops; 390×844 phones must
  remain usable (single column).
- Theme check: silver and platinum accent colors differ by at least ΔE 10.

## 10. Starting classes (the books' six; Luke 2026-10-22)

Every class gets the same budget (§4); the books' per-level stat lines become
the class weights. Each starts with two Inferior proficiencies and one Common
signature skill. Archer's three are the books' own; Healer's are from the fan
wiki; the Warriors' and Caster's are originals in the same style. Write
original description and flavour text for every skill.

| Class | Weights (from the books' per-level lines) | Starting skills |
| --- | --- | --- |
| Warrior (Light) | Agi 2, End 1, Str 1, Vit 1 | Basic Light Weapons (Inferior): rapiers, daggers, hatchets, thrown weapons · Basic Footwork (Inferior): dodging and evasion · Swift Strike (Common): a fast strike that is hard to read |
| Warrior (Medium) | Agi 1, End 1, Vit 1, Str 1, Tough 1 | Basic Weapons (Inferior): most light and heavy weapons · Basic Guard (Inferior): parrying and blocking · Measured Blow (Common): a balanced strike that exploits an opening |
| Warrior (Heavy) | Str 2, Tough 1, Vit 1, End 1 | Basic Heavy Weapons (Inferior): two-handed weapons and weapon-and-shield · Basic Shield (Inferior) · Brace (Common): plant your feet to absorb a blow or hold a line |
| Archer | Per 2, Agi 1, End 1, Str 1 | Basic Archery (Inferior) · Basic One-Handed Weapon (Inferior) · Archer's Eye (Common) |
| Caster | Int 2, Wis 1, Will 1, Per 1 | Basic Catalyst Proficiency (Inferior): staves, idols, relics, wands · Mana Bolt (Inferior) · Mana Sense (Common): feel mana and spellwork nearby |
| Healer | Will 2, Wis 2, Int 1 | Basic Magic-Tool Proficiency (Inferior) · Heal (Inferior) · Regenerate (Common) |

Short GM-facing descriptions, paraphrased: Light: speed, evasion, finesse.
Medium: balanced, wide weapon range. Heavy: power and survivability, few
ranged options. Archer: ranged, fast and flexible. Caster: non-attuned magic,
wide but limited, fragile. Healer: mends, cleanses and supports; weak alone.

## 8. Tutorial (first content pack)

Five sessions (levels 0–30), 30 in-game days, on a colossal cosmic humpback
whale with its own star and moons. Players are cell-sized; terrain is anatomy.
They believe they are purging an evil curse; they are actually the infection
and the curse is the whale's immune response.

- Quest: "The world is dying. Find what is killing it. Delve to the heart of
  the world and purge the infection. Time remaining: 30 days."
- Regions: The Crown (snout knolls, spawn) → Rake Canyons (old scar canyons) →
  Twin Spouts (blowholes; descend on the inhale) → Stormlung (airway caves,
  Beast Lord 1) → Red Rivers (vessels, Beast Lord 2, the reveal) → Marrow Halls
  (Beast Lord 3) → The Drum (heart, finale).
- World Stability drops when they cleanse curse zones or kill immune
  "pale hunters"; rises when they kill System-placed beasts.
- Identify tiers on the curse energy: Common "[Malignant Miasma]", Uncommon
  "[Fever]", Rare "[The Host's Response]".
- Title hint: "[Rapid Spread] — You have propagated through the Host faster
  than any before you."
- NPC survivors form factions; survivors become the Earth-arc cast.
- The tutorial pack's hidden quest "The Host's Response" imports switched
  off, so players get no "a hidden quest exists" notice until the GM turns
  it on (Q72).

## 11. Co-DM: live listening and generation (Luke, 2026-10-25)

Goal: "no loading screens". Claude listens along, keeps the session log,
and offers the GM things to generate or throw in; the GM picks, generation
runs while the GM narrates, and nothing reaches players until the GM
approves it. Example: the party says they want an herbalist; the GM clicks
"Generate herbalist shop", walks them across town, and approves a shop with
a name, a keeper NPC, wares and a hook.

- **Setup:** Luke's own Anthropic API account and key (pay-as-you-go,
  separate from the Claude subscription). The key is entered in the GM app's
  settings, stored encrypted on the GM laptop, never in the repo, never sent
  to players. A spend counter shows the session's API cost. Without a key,
  the rest of the app works and the co-DM panel says what it needs.
- **Models:** a fast, cheap model for listening and suggestions (Claude
  Haiku) and a stronger one for generation (Claude Sonnet); both settable.
- **Listening:** a mic toggle on the GM console with a clear indicator, and a
  "the System is listening" mark on players' screens while it is on (the
  players have agreed). Speech is transcribed on the laptop (the Claude API
  does not take audio); audio is never saved, only text. The transcript is
  GM-only, kept per session in the campaign folder.
- **Who said what:** each player can enrol a short voice sample, and
  transcript lines get a speaker when the match is confident. Attribution in
  order of trust: things done in the app (a contest roll for a character),
  the GM naming the character, the voice match.
- **Practice drafts:** the co-DM drafts practice entries from the transcript
  (character, skill, what happened, quote, time, confidence) into the
  end-of-session review. Nothing counts until the GM confirms; marks stay
  one per skill per session. Things done in the app log practice directly.
- **Suggestions:** every minute or two the co-DM reads the recent transcript
  plus the campaign context (party, region, NPCs, shops, quests) and offers
  a few chips with the quote that prompted them: **Generate** (a shop, NPC,
  place, encounter, item or quest hook the table just mentioned),
  **Complication** (chaos to throw in), **Callback** (bring back an earlier
  NPC or thread). A text box lets the GM ask for anything directly.
- **Generation** writes content in the existing format
  (`docs/CONTENT-FORMAT.md`) and goes through the existing preview and
  approve import, so the rules' checks apply (flat item bonuses, the 20% cap,
  rarity ceilings, grades). Kinds: shops (name, keeper NPC, wares with
  prices, an optional quest or complication), NPCs, places, encounters
  (bestiary entries at sensible grades), items, quest hooks.
- **Quick responses (Luke, 2026-10-30):** ten buttons in two fixed rows on
  the co-DM panel, keys 1–0, so the GM learns them by feel.
  - **Slots 1–5 never change:** 1 **Yes, and…** (it works, plus something),
    2 **Yes, but…** (it works, at a cost), 3 **No, but…** (it doesn't; here is
    another way), 4 **In character** (a few lines in the voice of the NPC
    being spoken to, with a legend, rumour or hook where it fits), 5
    **Twist** (something unexpected happens). Names and the instruction
    behind each can be edited in settings; these are the defaults.
  - **Slots 6–10** are the co-DM's picks (the suggestion chips), in stable
    positions: a new pick fills an empty or dismissed slot and never
    reshuffles the others.
  - A button answers the most recent player question or attempt, shown as
    the quote it answers; clicking a transcript line points the buttons at
    that line instead, and with listening off the GM types the line.
  - Each answer is one line the GM can say as-is plus 2–3 short beats (a
    hook, a detail, a name) to riff on. Answers are made on click with the
    fast model and appear as they are written; **Richer** re-asks the strong
    model. Nothing is pre-drafted (Luke chose click-only).
  - **Keep** saves an answer (or any part of it) as a GM lore note tagged to
    the NPC, place and session; the co-DM includes kept lore for the NPC and
    place in later prompts and does not contradict it. Lore stays GM-only
    unless the GM shares the note.
- **Shops** are GM-side: the GM narrates, and a purchase is a GM trade that
  the shop's price list fills in.
- **Loading screen:** a System-styled broadcast ("[The System is
  constructing the area…]") the GM sends while something generates; it
  stays until the GM removes it, or until the generated content is approved
  if the GM chose that.
- **Prepare ahead** (optional): when the table heads somewhere, the co-DM
  drafts likely content in the background, ready to approve.
- **Memory:** approved content is ordinary campaign data, so later sessions
  can call back to it; at session end the co-DM writes a summary (what
  happened, who did what, open threads, NPCs met) into the session log.
- **Limits:** the co-DM never changes the campaign on its own; every change
  is the GM's approval, and GM-only rules cover all of it. Build runs never
  call the paid API: AI and speech sit behind interfaces with recorded
  fixtures for tests, and Luke checks the live path with his key.

