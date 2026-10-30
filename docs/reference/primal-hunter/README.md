# Primal Hunter reference lists

Starter lists of names from Zogarth's *The Primal Hunter*, for keeping the
campaign's naming and tone close to the books. The co-DM uses them as
examples when it generates content (ROADMAP MU.6); they are GM-only and are
never sent to players.

| File | Rows | What |
|---|---|---|
| `skills.csv` | 83 | Class, profession and race skills, spells, bloodline, titles (almost all Jake's) |
| `items.csv` | 195 | Weapons, armor, accessories, artifacts, consumables, ingredients, materials |
| `creatures.csv` | 101 | Races, beast species, monsters, named beasts and bosses |
| `professions-classes.csv` | 32 | Classes, evolution chains, professions, race tiers |

Compiled 2026-10-30 by research agents from what could be reached:
system-codex.com (most items and Jake's skills and chains), Goodreads quote
pages, Royal Road chapter titles and early chapters, and book summary sites.
The fan wiki could not be reached, so these are **not complete**: coverage
is strongest for Jake and the early books, thin for other characters and
books 9–15.

## Columns to know

- `summary`: one line in our own words. No book or wiki text is copied.
- `confidence`: `verified` = the name (and, where given, rarity) was seen on
  the source in `source_url`; `recall` = from memory, unconfirmed. Many
  verified rows still have summaries inferred from the name, and some
  creature rows rest on AI-written book summaries (worth a check: Nahoom rat,
  Galesong Hawk, Hawkie, Sylphie's family names).
- `theme_tags`: semicolon-separated. **`god-tied`** marks anything tied to a
  god or Primordial (Malefic Viper blessings and the like). The campaign's
  Earth has no gods (DESIGN §1), so the co-DM never uses those as-is.

## Patterns worth keeping (from the research)

- **Naming:** a class keeps its root word and gains a descriptor each
  evolution (Hunter → Ambitious Hunter → Avaricious …); later grades add an
  "of ⟨place or idea⟩" ending or stacked hyphenated prefixes. Professions
  start as a plain craft word; the books add a god's name ("of the Malefic
  Viper"), which here becomes an affinity, place or deed.
- **Skills** either rise in rarity under the same name or evolve into a
  renamed skill (Powershot → Infused Powershot → Arcane Powershot). Costs are
  rarely numeric in the books (stamina grows with charge time; a cooldown
  scales with Perception).
- **Items** show rarity, a level requirement, flat stat bonuses and named
  enchantments; stronger gear has fewer, larger stats and more enchantments;
  Self-Repair is common. Book numbers climb steeply by rarity (about +5 at
  Common, +25–75 at Rare, hundreds at Ancient), far above this campaign's
  scale (DESIGN §4), so use them for flavour, not numbers.
- **Identify lines:** `[Species – lvl N]`; sentient beings show race and grade
  (`Human (F)`); far stronger targets show question marks.

Add rows freely; keep summaries in your own words.
