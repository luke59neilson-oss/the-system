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

## Asking Claude for content

Paste the session report and something like:

> Using The System's content format (`format` "the-system/content", `version`
> 1; spec in docs/CONTENT-FORMAT.md), draft a level 10 skill selection menu
> for Jake with three options, one Rare. Reply with only the JSON.

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
  "evolutions": []
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
- **Characters** are named by their name (any case) or id.
- **Skills** in transforms and re-ratings are named exactly as on the sheet
  (the starting `Archer’s Eye` uses a curly apostrophe).
- Sizes: names up to 100 characters, texts up to 4,000, up to 500 entries per
  section, 10 options per menu or evolution, 8 Identify tiers, 12 bonuses.
- The file check reports at most 50 errors (then "…and N more").
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
| `bonuses` | no | `[{ "stat": "agility", "percent": 5, "flat": 2 }]`; each bonus needs `percent`, `flat` or both. Percentages add, never compound (DESIGN §4). |

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

A menu for one character's skill selection (DESIGN §6). It reaches the player
only when the GM approves it and sends it as that selection's offer.

| Key | Required | Meaning |
| --- | --- | --- |
| `character` | yes | Name or id. |
| `level` | yes | The class level of the selection (5, 10, 15…). |
| `options` | yes | 1–10 `{ "name", "rarity", "kind"?, "description"? }`. `kind` is `class` (default) or `profession`. The capstone selection before an evolution must include one option at the grade's rarity ceiling. |

### `evolutions`: drafted evolution options

Options for one character's next evolution (DESIGN §2, §6), released by the
GM in the evolution builder.

| Key | Required | Meaning |
| --- | --- | --- |
| `character` | yes | Name or id. |
| `options` | yes | 1–10 options, below. |
| `professions` | no | Professions offered (at the profession unlock grade, E). |
| `rerate` | no | Skill name → rarity after the evolution. Skills not named drop one rarity (never below Inferior). |

Each option:

| Key | Required | Meaning |
| --- | --- | --- |
| `className` | yes | The evolved class's name. |
| `id` | no | Defaults to `o1`, `o2`… by position. |
| `description` | no | |
| `transforms` | no | `[{ "skill": "<current name>", "name": "<new name>", "rarity", "merge"? }]`. Rare by design; `merge` names a second skill consumed into it. |
| `classWeights` | no | New class spread weights, `{ "perception": 2, "agility": 2 }`. |
| `statBonus` | no | One-time stat bonus on evolving, `{ "agility": 10 }`. |

## Versions

`version` is 1, the only version so far. A file made for a newer app
version is refused with a message saying so.
