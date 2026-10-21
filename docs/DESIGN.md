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
- **Tracks:** Class level, Profession level, Race level.
  - Race level = average of class and profession levels (rounded down).
  - Before a character has a profession, race level = class level.
  - Professions are first offered at the **E-grade evolution** and start at the
    character's current class level (the System credits what it already saw).
  - **Class levels** grant the class spread; **race levels** grant free
    points; **profession levels** grant no stats directly (they raise race
    level and add profession skill options).
  - **Grade** is the highest grade the character has evolved into. Class and
    profession levels cannot pass the top level of the current grade
    (4, 14, 49, 99, 149, 199, 240); extra XP banks.
  - **Evolution becomes available** when race level reaches the top of the
    current grade (config `evolutionGate: "race"`; alternative `"class"`, see
    QUESTIONS). The GM releases it, the player chooses, and banked XP then
    applies at the new grade.
  - Skill selections trigger from **class level**. XP needed per level uses
    the character's **current grade**. Level 240 is the campaign cap for now.
- Every character starts with the race skill **Identify (Common)** and 3 class
  skills from their starting class.

## 3. Grades and pacing

Pacing target: ~6 race levels per session (range 4–8), 40-session campaign.
Evolutions are **held** at each threshold until the GM releases them; XP keeps
banking but levels don't advance past the cap until the evolution is done.

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

- Class spread follows the class's stat weights (largest-remainder rounding so
  the total is exact).
- Free points: each level-up's free points are assigned **once**, then that
  batch locks. Later level-ups grant new, unlocked points. The GM can
  override.
- Each evolution may reshape the class spread toward stats the character used
  (GM chooses, guided by the practice log).
- Percentage bonuses are capped (default cap +25% per stat, configurable).
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
- XP needed per level (default, by grade): G 100, F 150, E 250, D 400,
  C 650, B 1,000, A 1,500. The app shows the GM a "typical session ≈ 6 levels"
  helper.

## 6. Skills

- **Rarity ladder:** Inferior → Common → Uncommon → Rare → Epic → Ancient →
  Legendary → Mythical (Divine reserved). Unique is a tag for one-of-a-kind skills.
- **Selections:** at the class levels in §3. Menu of 3–4 options, built by the
  GM (often from imported files Claude drafts) using the practice log. The
  level-up can happen mid-session; the choice can wait for downtime.
- **Capstone:** the last selection before each evolution must include at
  least one option at the grade's rarity ceiling.
- **Profession options** appear inside class menus once a profession exists.
- **Evolutions** transform 1–2 existing skills.
- **Skill names:** the System gives the official name; the player may add a
  nickname ("Jake Juice"). Show both.

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
- Marks reset after an upgrade.

### Merges

- Unlocks when two skills have been logged working together 3 times.
- Both skills must be at least Uncommon. Max one merge per character per grade.
- Result: one skill, one rarity above the higher of the two, doing both jobs.
  Originals are consumed; marks start at 0.

## 7. Play tools

- **Resolution (proposed):** ratio odds, chance = yours ÷ (yours + theirs).
  The app rolls and shows results. Grade-gap handling is an open decision, so
  support three modes in config: none; grade bonus multiplier per 10 points
  (G×1, F×3, E×5, D×10, C×20, B×40, A×80); lower-grade opponents at ⅓.
- **Progress clocks** with N segments. **Montage:** available when a clock is
  half filled with no failures; player gives a one-line focus (saved to the
  practice log); GM narrates the rest and adds one cost.
- **Practice log:** quick-add (character, action, skill/stat), end-of-scene
  prompt, end-of-session review (repeats flagged, skill pairs counted, marks
  confirmed), selection alert (within 5 levels), merge alert.
- **Titles:** flat and/or percentage stat bonuses, awarded by GM, shown to the
  player with System-style text.
- **Identify:** entities carry descriptions per minimum Identify rarity; the
  player sees the best tier their Identify rarity unlocks.
- **Quests:** text, timer/day counter, and an optional **World Stability %**
  with GM-defined rules (action tags → deltas) and a visible/hidden toggle.
- **Hunger tracker** (tutorial): optional per campaign; fades at E-grade.
- **Items:** rarity, description, effects; equipment slots (Zogarth's 10):
  2 rings, necklace, chest, legs, boots, bracers, mask, cloak, gloves; plus
  weapon slots (main hand, off hand). Inventory, a configurable currency, and
  giving/trading between players and the GM.
- **Notes:** player private journal, party shared notes, GM private notes;
  tags linking notes to characters, NPCs, regions, quests; search. The GM
  cannot read a private journal entry unless the player marks it shareable.
- **Logging for Claude:** the app autosaves a running session log (practice
  entries, notable events, shareable notes, XP, level-ups, quest and stability
  changes) to the exports folder every few minutes and on quit, plus a full
  report at session end. "Notable events" = level-ups, selections,
  evolutions, titles, mark upgrades, merges, item transfers, GM broadcasts,
  stability changes.
- **GM security:** GM actions always require a GM key that the desktop app
  injects into its own window. The key never appears in the join URL or QR.
  The server checks Origin on WebSocket upgrade and denies GM HTTP routes by
  default.

## 9. Status screen (player sheet layout)

Follows the books' status window, in this order; values update live.

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
