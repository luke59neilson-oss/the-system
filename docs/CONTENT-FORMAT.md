# Content files

How to write content that The System can import: skill library entries, items,
titles, bestiary entries, drafted skill selection menus and drafted evolution
options. The usual loop (D9): the GM copies a session report for Claude
(Session window → **Copy for Claude**), asks Claude to draft content in this
format, saves Claude's answer as a `.json` file, and imports it. Nothing in a
file applies until the GM approves it (M9.3).

- Machine-readable schema: [`content-format.schema.json`](content-format.schema.json)
  (JSON Schema draft 2020-12, generated from `packages/engine/src/content/format.ts`).
- Examples (each one is checked by the tests): [`content-examples/`](content-examples/).
- Content packs, ready to import: [`content-packs/tutorial.json`](content-packs/tutorial.json),
  the five-session tutorial on the Host (DESIGN §8). Import it into a new
  campaign before session 1 (GM console → Import content).

## Asking Claude for content

Paste the session report and something like:

> Using The System's content format (`format` "the-system/content", `version`
> 1; spec in docs/CONTENT-FORMAT.md), draft a level 10 skill selection menu
> for Jake with three options, one Rare. Reply with only the JSON.

The report's **Party** section lists every character's sheet at the end of
the session: levels, grade, titles, skills with their exact names, rarities
and marks, open skill menus and any evolution released but not chosen.
Transforms and re-rates must name skills exactly as written there.

**When to import a drafted menu or evolution:** once the character can take
it. A menu applies only at or below the character's class level, and an
evolution only once the evolution is due (race level at the top of the grade,
every selection chosen); earlier, the preview marks the entry and it cannot
be ticked. Keep the file and import it after the level-up.

## The file

One JSON object. `format` and `version` are required; every section is an
optional list, so a file can carry one menu or a whole region's worth of
content.

```json
{
  "format": "the-system/content",
  "version": 1,
  "title": "Rake Canyons",
  "notes": "For the GM: what this file is for.",
  "skills": [],
  "items": [],
  "titles": [],
  "bestiary": [],
  "skillOffers": [],
  "evolutions": [],
  "quests": [],
  "regions": [],
  "gmNotes": [],
  "hunger": { "enabled": true }
}
```

Rules that apply everywhere:

- **Unknown keys are errors.** A typo such as `"rarty"` is reported with its
  path (`skills[0].rarty`) rather than ignored.
- **Ids come from the campaign's rules** (Settings). The defaults:
  - Rarities: `inferior`, `common`, `uncommon`, `rare`, `epic`, `ancient`,
    `legendary`, `mythical` (`divine` is reserved and refused).
  - Stats: `strength`, `agility`, `endurance`, `vitality`, `toughness`,
    `wisdom`, `intelligence`, `perception`, `willpower`.
  - Equipment slots: `ring`, `necklace`, `chest`, `legs`, `boots`, `bracers`,
    `mask`, `cloak`, `gloves`, `mainHand`, `offHand`.
  - Grades: `G`, `F`, `E`, `D`, `C`, `B`, `A`.
- **Characters** are named by id or by name (any case); an exact id wins. Two
  characters with the same name need the id.
- **Skills** in transforms and re-ratings are named exactly as on the sheet
  (the starting `Archer’s Eye` uses a curly apostrophe).
- Sizes (the same limits the app enforces): names up to 80 characters;
  descriptions and title text up to 2,000; flavour and Identify tier text up
  to 1,000; effects and notes up to 4,000; tags up to 40 characters, 12 per
  skill; up to 500 entries per section, 10 options per menu or evolution, 8
  Identify tiers and 12 bonuses per entry; rules ids up to 40 characters. Stat values are whole numbers, 0
  or more (bonuses may be negative).
- Lists may not repeat themselves: a stat twice in one bonus list, two menu
  options with the same name, two evolution options with the same id, a
  skill transformed twice, or a profession listed twice is an error.
- The file check reports at most 50 errors (then "…and N more").
- The JSON Schema cannot express a few rules that the app still checks: a
  title bonus needs `flat` or `percent`, a bestiary entry takes `grade` and
  `level` together, and the no-repeats rule above. The app's own check is
  the authority.
- The shape check knows nothing about the campaign. Whether each id,
  character and skill exists is checked when the file is imported, and the
  GM sees every problem before anything changes.

## Sections

### `skills`: skill library entries

One entry per skill name **and** rarity (DESIGN §6): a Rare and an Epic
"Hunter's Mark" are two entries, so an upgrade picks up the higher rarity's
text.

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Official System name. |
| `rarity` | yes | Rarity id. |
| `tags` | no | Up to 12 short tags. |
| `description` | no | What the owner reads on their sheet. |
| `flavor` | no | Flavour line. |
| `effects` | no | Mechanical effects; shown to the skill's owner only, never other players. |

### `items`: item library entries

| Key | Required | Meaning |
| --- | --- | --- |
| `name`, `rarity` | yes | |
| `description` | no | |
| `slot` | no | Equipment slot id; omit or `null` for loot that is not worn. |
| `bonuses` | no | `[{ "stat": "toughness", "flat": 2 }]`. **Flat only**: items never give percentages, and the total item bonus on a stat is capped at 20% of its base (DESIGN §4). |

### `titles`: title library entries

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Shown as `[Name]`. |
| `text` | no | System-style text shown to the player. |
| `bonuses` | no | `[{ "stat": "agility", "percent": 5, "flat": 2 }]`; each bonus needs `percent`, `flat` or both. `percent` is **whole percent**: `5` means +5% (−99 to 10,000). Percentages add, never compound (DESIGN §4). |

### `bestiary`: things players can Identify

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | The GM's own name; never sent to players. |
| `label` | no | The name players see in their Identify list (defaults to `name`). |
| `tiers` | yes | 1–8 `{ "minRarity": "uncommon", "text": "…" }`: a player sees the best tier their Identify rarity unlocks (DESIGN §7). |
| `grade`, `level` | no | Both or neither. Decide who can Identify it at all (lower grade always; same grade up to 1.5 × the viewer's level; higher never). Omit for places and energies. |
| `stats` | no | GM-only stat block: `{ "strength": 30 }`. |
| `notes` | no | GM-only notes. |

### `skillOffers`: drafted selection menus

A menu for one character's skill selection (DESIGN §6). Applying it offers
it to that character at once: it is on the player's screen as soon as the GM
clicks Apply, and it replaces a menu offered at that level and not chosen yet.
The preview says whose screen it goes to, lists its options and says what it
replaces, so the GM checks it before ticking it.

| Key | Required | Meaning |
| --- | --- | --- |
| `character` | yes | Name or id. |
| `level` | yes | The class level of the selection (5, 10, 15…). |
| `options` | yes | `{ "name", "rarity", "kind"?, "description"? }`. `kind` is `class` (default) or `profession`. The default rules want **3–4 options** (Settings → menu size). The capstone (the last selection before an evolution: level 10 at F, 45 at E, 90 at D, 140, 190, 240) must include one option at the grade's rarity ceiling (Rare at G–F, Epic at E, Ancient at D, Legendary at C–B, Mythical at A). Options above the ceiling are refused. |

### `evolutions`: drafted evolution options

Options for one character's next evolution (DESIGN §2, §6). Applying the
entry releases the evolution at once, as the evolution builder's Release
does: the player can take it straight away, and it replaces an evolution
already released and not chosen yet. The preview says whose screen it goes
to, lists its options and says what it replaces.

| Key | Required | Meaning |
| --- | --- | --- |
| `character` | yes | Name or id. |
| `options` | yes | Options, below; the default rules want **3–4**. |
| `professions` | no | Professions offered (at the profession unlock grade, E). |
| `rerate` | no | Skill name → rarity after the evolution. Skills not named drop one rarity (never below Inferior). |

Each option:

| Key | Required | Meaning |
| --- | --- | --- |
| `className` | yes | The evolved class's name. |
| `id` | no | Defaults to `o1`, `o2`… by position. |
| `description` | no | |
| `transforms` | no | `[{ "skill": "<current name>", "name": "<new name>", "rarity", "merge"? }]`. Evolutions rarely transform skills: the default rules allow at most 2 per option, and a transform never lowers a skill's rarity. `merge` names a second skill consumed into it; the merged skill is exactly one rarity above the higher of the two, and both must be at least Uncommon (DESIGN §6). |
| `classWeights` | no | New class spread weights, `{ "perception": 2, "agility": 2 }`. |
| `statBonus` | no | One-time stat bonus on evolving, `{ "agility": 10 }`. |

### `quests`: quests

| Key | Required | Meaning |
| --- | --- | --- |
| `title` | yes | |
| `text` | no | What players read. |
| `visible` | no | Default `true`. A hidden quest gives players only a System notice that one exists (DESIGN §7). |
| `days` | no | Timer in in-game days, counted from the day the GM imports it. Omit for none. |
| `stability` | no | A World Stability meter: `{ "initial": 100, "visible": true, "rules": { "kill-pale-hunter": -2 } }`. Rules map an action tag (lower case, no spaces around it) to a non-zero change; the GM applies actions in the Quests window. |

### `regions`: map regions

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Unique within the campaign. |
| `notes` | no | GM-only notes. |

### `gmNotes`: GM private notes

| Key | Required | Meaning |
| --- | --- | --- |
| `title` | yes | |
| `body` | no | |
| `tags` | no | Up to 12 short tags. |

Players never see GM notes.

### `hunger`: the hunger tracker (one object, not a list)

| Key | Required | Meaning |
| --- | --- | --- |
| `enabled` | no | Turn the tracker on (`true`) or off. |
| `steps` | no | 2–10 hunger levels from fed to starving. |

Importing a setting the campaign already has is refused as "nothing to change".

## Importing twice

The preview catches what would double up. Skills, titles and regions the
campaign already has, and a hunger setting it already uses, show an error and
cannot be ticked. Items and bestiary entries may share names, so a second
copy only gets a note. Quests and GM notes can repeat: untick
them when importing a file again (the preview notes a quest or GM note whose title the campaign already has).

## Versions

`version` is 1, the only version so far. A file made for a newer app
version is refused with a message saying so.
