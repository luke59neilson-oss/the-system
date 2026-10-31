# GM overrides (MT.7, DESIGN §7 GM authority, Q60)

The GM can add, change, send, override and overrule anything, whenever. This
file lists **every refusal** the engine can give a command (from
`node scripts/gm-refusals.mjs`, which reads every rule error in
`packages/engine/src`) and, for each, the GM's way through. A unit test
(`scripts/gm-overrides.test.ts`) fails when a refusal is added to the engine
without a line here.

Two guarantees have no override, by design:

- **Players never receive GM-only data.** No command can send GM-only data to
  a player; projections strip it whatever the GM does (canary test).
- **The event log is never rewritten.** Every change, override included, is a
  new event; an undo is an `event.undone` event, and an event another depends
  on is undone after its dependants (`cannot undo … because a later event
  depends on it`).

Categories:

- **Rule**: a game rule the app enforces. The GM's way through is named, or
  with the control the GM uses.
- **State**: the action does not fit the campaign as it is now (already done,
  not offered, not running). The way through is the step that comes first.
- **Data**: the command names something that does not exist or is malformed;
  there is no rule to overrule, only the input to fix.
- **Permission**: limits on players and the System, never on the GM.

Keys write each `${…}` value as `…`. Locations are the first place the
refusal is raised.


## Rule

| Refusal | Where | GM way through |
| --- | --- | --- |
| `…: rarity "…" is not allowed at …-grade (ceiling …)` | packages/engine/src/character/model.ts:206 | `skill.setRarity` (Edit sheet → "Set rarity") sets any skill above the ceiling after creation; or raise the ceiling in Rules |
| `Professions unlock at …-grade` | packages/engine/src/character/model.ts:373 | `character.grantProfession` with `override: true` (Edit sheet → "Grant a profession now") grants one before E-grade, at the class level |
| `Not enough … (has …)` | packages/engine/src/economy/model.ts:140 | Edit holdings (`holdings.adjust`) sets currency and items directly |
| `Not enough […] (has …, needs …)` | packages/engine/src/economy/model.ts:149 | Edit holdings (`holdings.adjust`) sets currency and items directly |
| `Approve the skill re-rating first: the GM sets each kept skill's rarity and approves the list (DESIGN §6)` | packages/engine/src/events/commands.ts:1335 | One click: the GM sets and approves the re-rating in the evolution builder (the approval is the GM's own act) |
| `Not enough … to cast […]: … of …` | packages/engine/src/events/commands.ts:889 | Set the pool (Edit sheet → pools, `character.setPools`) first, or log the use as practice without spending (`practice.log`); cooldowns are never enforced |
| `not enough …: … of …` | packages/engine/src/events/reducer.ts:1721 | The replay check behind the one above (a recorded cast the pool cannot pay); same way through |
| `… must be between 0 and …` | packages/engine/src/events/reducer.ts:973 | Not a rule to overrule: a pool is a value within its maximum. Raise the maximum through stats (`character.setStats`), then set the pool |
| `the race level … points are already assigned and locked` | packages/engine/src/events/reducer.ts:1036 | Free-point override (`freePoints.override`) rewrites or clears any batch |
| `assign exactly … points (got …)` | packages/engine/src/events/reducer.ts:1047 | Free-point override (`freePoints.override`) rewrites or clears any batch |
| `… would drop below 0` | packages/engine/src/events/reducer.ts:1053 | Set stats directly (`character.setStats`) |
| `"…" does not qualify for a montage yet` | packages/engine/src/events/reducer.ts:1518 | `montage.offer` with `override: true` (Encounter → clock → "Early montage (override)") skips the half-filled, no-failure check |
| `Class level … grants no skill selection` | packages/engine/src/evolution/model.ts:268 | `skill.grant` (Edit sheet → "Give a skill") gives a skill outside the selection schedule |
| `… has not reached class level … (is …)` | packages/engine/src/evolution/model.ts:270 | `skill.grant` (Edit sheet → "Give a skill") gives a skill outside the selection schedule |
| `[…] is above the …-grade ceiling (…)` | packages/engine/src/evolution/model.ts:302 | `skill.setRarity` (Edit sheet → "Set rarity") sets any rarity after the fact; or raise the ceiling in Rules |
| `Level … is the …-grade capstone: offer at least one … option` | packages/engine/src/evolution/model.ts:312 | `skill.grant` (Edit sheet → "Give a skill") gives any skill without a capstone menu; the menu rule itself stays (DESIGN §6) |
| `No selection is offered at level …` | packages/engine/src/evolution/model.ts:410 | `skill.grant` (Edit sheet → "Give a skill") gives a skill outside the selection schedule |
| `[…] is a race skill and never drops a rarity` | packages/engine/src/evolution/model.ts:521 | `skill.setRarity` (Edit sheet → "Set rarity") (and `skill.grant`) change race skills too, with a warning that Identify never drops by default |
| `[…] cannot be raised above the …-grade ceiling (…)` | packages/engine/src/evolution/model.ts:524 | `skill.setRarity` (Edit sheet → "Set rarity") sets any rarity after the fact; or raise the ceiling in Rules |
| `[…] is a race skill and cannot be merged away` | packages/engine/src/skills/model.ts:295 | Send the merge with **Override** (GM); afterwards `skill.grant` of Identify (kind race) gives it back, even though the practice log still counts the name (QF.39) |
| `[…] is a race skill and cannot be merged away at evolution` | packages/engine/src/evolution/model.ts:542 | Leave the race skill out of the transform; after the evolution, `skill.grant` gives the new race skill and `skill.setRarity` changes the old one. Identify is never consumed by an evolution itself (DESIGN §6) |
| `[…] is a race skill and keeps its name at evolution` | packages/engine/src/evolution/model.ts:554 | Leave the race skill out of the transform; after the evolution, `skill.grant` gives the new race skill and `skill.setRarity` changes the old one. Identify is never consumed by an evolution itself (DESIGN §6) |
| `[…] must be … (one above the higher merged skill)` | packages/engine/src/evolution/model.ts:620 | `skill.setRarity` (Edit sheet → "Set rarity") after the evolution sets the final rarity |
| `[…] cannot drop to a lower rarity` | packages/engine/src/evolution/model.ts:625 | `skill.setRarity` (Edit sheet → "Set rarity") after the evolution sets the final rarity |
| `… can merge … time(s) per grade (… done at …-grade)` | packages/engine/src/evolution/model.ts:642 | Release the evolution without that merge transform, then `skill.merge` with `override: true` after it (Merges window), which skips this check |
| `[…] must be at least … to merge` | packages/engine/src/evolution/model.ts:662 | Release the evolution without that merge transform, then `skill.merge` with `override: true` after it (Merges window), which skips this check |
| `[…] and […] were logged together … times (need …)` | packages/engine/src/evolution/model.ts:667 | Release the evolution without that merge transform, then `skill.merge` with `override: true` after it (Merges window), which skips this check |
| `… cannot evolve yet (… level … of …)` | packages/engine/src/evolution/model.ts:706 | Set levels with the level/XP/grade override (`character.setProgression`) to reach the gate |
| `Professions are offered from the …-grade evolution on, to a character without one` | packages/engine/src/evolution/model.ts:729 | `character.grantProfession` with `override: true` (Edit sheet → "Grant a profession now") |
| `… has a skill selection to choose first (class level …); an evolution cannot be … until then` | packages/engine/src/evolution/model.ts:950 | `evolution.release` with `override: true` (evolution builder → "GM override: release now anyway"); the player then evolves without choosing first, and the selections stay due |
| `[…] is …, which has no mark upgrade` | packages/engine/src/skills/model.ts:209 | `skill.setRarity` (Edit sheet → "Set rarity") upgrades any skill directly |
| `[…] already earned its mark this session` | packages/engine/src/skills/model.ts:215 | `skill.awardMark` with `override: true` gives a second mark in a session (Marks review → "Extra mark (override)") |
| `[…] cannot be upgraded past …` | packages/engine/src/skills/model.ts:244 | `skill.setRarity` (Edit sheet → "Set rarity") upgrades any skill directly |
| `[…] needs … marks (has …)` | packages/engine/src/skills/model.ts:249 | `skill.setRarity` (Edit sheet → "Set rarity") upgrades any skill directly |
| `[…] is at the …-grade ceiling; its marks bank until the next evolution` | packages/engine/src/skills/model.ts:252 | `skill.setRarity` (Edit sheet → "Set rarity") upgrades any skill directly |
| `Already merged at …-grade` | packages/engine/src/skills/model.ts:304 | `skill.merge` with `override: true` (Merges window → "GM override: merge any two skills"; the player still accepts or declines) skips the joint-use count, minimum rarity and once-per-grade checks |
| `The merged skill would be above the …-grade ceiling` | packages/engine/src/skills/model.ts:320 | `skill.merge` with `override: true` (Merges window) merges past the grade ceiling |
| `the … list (ids and order) cannot change in a running campaign` | packages/engine/src/events/reducer.ts:731 | No override, by guarantee 2: stored events name grades, stats, pools, rarities and slots by id and position, so changing the list would change what the log means. Rename entries and change their numbers freely; a new list needs a new campaign |
| `XP overflow always stays on` | packages/engine/src/events/reducer.ts:735 | No rules switch (Luke, Q49/L16: overflow applies to every campaign); the GM sets XP and levels directly with the level/XP/grade override (`character.setProgression`) |
| `XP overflow is turned on by the rules migration when the campaign opens, which moves banked XP first` | packages/engine/src/events/reducer.ts:735 | Reopen the campaign so the migration runs; then the level/XP/grade override sets anything directly |
| `these rules do not fit the campaign as it is: ……` | packages/engine/src/events/reducer.ts:792 | Bring the named characters inside the new rules first (level/XP/grade override, "Set rarity", Edit holdings), then save the rules |
| `The merged skill would be above the highest rarity a skill can have` | packages/engine/src/skills/model.ts:314 | No rarity exists to give (past Mythical, or the reserved Divine; DESIGN §6). Give the merged skill with `skill.grant` at Mythical and remove the originals by re-rating, or make the rarity unreserved in Rules |
| `[…] cannot be equipped` | packages/engine/src/economy/model.ts:174 | Edit the item in the item library to give it a slot |
| `[…] goes in a … slot, not …` | packages/engine/src/economy/model.ts:174 | Edit the item in the item library to change its slot |

## State

| Refusal | Where | GM way through |
| --- | --- | --- |
| `Character already has a profession` | packages/engine/src/character/model.ts:362 | `character.grantProfession` with `override: true` (Edit sheet → "Replace profession") replaces it; the new one starts at the class level |
| `… already has the profession […]` | packages/engine/src/character/model.ts:367 | `character.grantProfession` with `override: true` (Edit sheet → "Replace profession") replaces it; the new one starts at the class level (a player taking an offer cannot) |
| `"…" is not one of your offered professions` | packages/engine/src/character/model.ts:401 | Offer it first (Professions offers / evolution builder) |
| `… already has the profession […]; the offers are locked` | packages/engine/src/character/model.ts:413 | `character.grantProfession` with `override: true` (Edit sheet → "Replace profession") sets any profession |
| `"…" is not offered to …` | packages/engine/src/character/model.ts:420 | Offer it first (Professions offers / evolution builder) |
| `… slot … does not exist` | packages/engine/src/economy/model.ts:171 | Equip/unequip from the right slot; holdings can be edited directly |
| `[…] is already equipped there` | packages/engine/src/economy/model.ts:182 | Equip/unequip from the right slot; holdings can be edited directly |
| `No […] in the inventory` | packages/engine/src/economy/model.ts:184 | Equip/unequip from the right slot; holdings can be edited directly |
| `Nothing is equipped in …` | packages/engine/src/economy/model.ts:196 | Equip/unequip from the right slot; holdings can be edited directly |
| `The libraries already hold every default entry` | packages/engine/src/events/commands.ts:888 | Nothing left to seed |
| `A mark needs a play session` | packages/engine/src/events/commands.ts:1261 | Start a session (Session panel); marks are counted per session |
| `XP overflow is already on` | packages/engine/src/events/commands.ts:1679 | Already on |
| `A session is already running; end it first` | packages/engine/src/events/commands.ts:1692 | End or start the session first |
| `No session is running` | packages/engine/src/events/commands.ts:1697 | End or start the session first |
| `trade "…" is already …` | packages/engine/src/events/reducer.ts:328 | The trade is over; propose a new one |
| `… already holds […]` | packages/engine/src/events/reducer.ts:909 | Titles are held once; award a different title |
| `no free-point batch for race level …` | packages/engine/src/events/reducer.ts:1030 | No such batch: free points come with race levels; set them with the free-point override |
| `the race level … points are not assigned` | packages/engine/src/events/reducer.ts:1033 | No such batch: free points come with race levels; set them with the free-point override |
| `that broadcast has no banner to remove` | packages/engine/src/events/reducer.ts:1094 | Nothing to remove |
| `that banner was already removed` | packages/engine/src/events/reducer.ts:1095 | Nothing to remove |
| `day … has already begun; send it now instead` | packages/engine/src/events/reducer.ts:1102 | Send it now instead |
| `[…] is equipped by "…"; unequip it first` | packages/engine/src/events/reducer.ts:1165 | Unequip it first (the GM can unequip on any sheet) |
| `a montage focus cannot be removed; edit it` | packages/engine/src/events/reducer.ts:1497 | Edit the entry instead |
| `this montage was not offered to that character` | packages/engine/src/events/reducer.ts:1550 | The montage is not open for that character |
| `this montage is closed` | packages/engine/src/events/reducer.ts:1552 | The montage is not open for that character |
| `a focus was already given` | packages/engine/src/events/reducer.ts:1553 | The montage is not open for that character |
| `this montage is already closed` | packages/engine/src/events/reducer.ts:1592 | The montage is not open for that character |
| `this quest has no World Stability` | packages/engine/src/events/reducer.ts:2010 | Edit the quest to add World Stability or the rule, or nudge it |
| `the quest is already …` | packages/engine/src/events/reducer.ts:2032 | Already in that status |
| `a session is already running` | packages/engine/src/events/reducer.ts:2275 | End or start the session first |
| `no session is running` | packages/engine/src/events/reducer.ts:2291 | End or start the session first |
| `session "…" is not running` | packages/engine/src/events/reducer.ts:2292 | End or start the session first |
| `The level … selection was already chosen` | packages/engine/src/evolution/model.ts:276 | Pick from the current menu; the GM can re-offer or withdraw options |
| `… has no profession for […]` | packages/engine/src/evolution/model.ts:227 | Profession skills and XP need a profession first |
| `… already has […]` | packages/engine/src/evolution/model.ts:381 | Pick from the current menu; the GM can re-offer or withdraw options |
| `[…] is not a passed-over option of …` | packages/engine/src/evolution/model.ts:392 | Pick from the current menu; the GM can re-offer or withdraw options |
| `The level … menu was offered again; choose from the new one` | packages/engine/src/evolution/model.ts:412 | Pick from the current menu; the GM can re-offer or withdraw options |
| `"…" is not on the level … menu` | packages/engine/src/evolution/model.ts:423 | Pick from the current menu; the GM can re-offer or withdraw options |
| `"…" is on the pending level … menu; re-offer that menu or pick another name` | packages/engine/src/evolution/model.ts:601 | Re-offer that menu or pick another name |
| `No evolution is released for …` | packages/engine/src/evolution/model.ts:780 | Release (or re-release) the evolution first |
| `The evolution was released again; choose from the new options` | packages/engine/src/evolution/model.ts:783 | Release (or re-release) the evolution first |
| `No evolution option "…"` | packages/engine/src/evolution/model.ts:786 | Release (or re-release) the evolution first |
| `… can no longer evolve to …-grade` | packages/engine/src/evolution/model.ts:789 | Release (or re-release) the evolution first |
| `"…" is not an offered profession` | packages/engine/src/evolution/model.ts:798 | Offer it first (Professions offers / evolution builder) |
| `No profession is offered with this evolution` | packages/engine/src/evolution/model.ts:801 | Offer it first (Professions offers / evolution builder) |
| `… already has the profession […]; evolve with none` | packages/engine/src/evolution/model.ts:807 | `character.grantProfession` with `override: true` (Edit sheet → "Replace profession") sets any profession |
| `… has no profession, so profession level and XP stay 0` | packages/engine/src/progression/override.ts:82 | Profession skills and XP need a profession first |
| `… has no profession` | packages/engine/src/progression/xp.ts:306 | Profession skills and XP need a profession first |
| `[…] has no World Stability` | packages/engine/src/quests/model.ts:87 | Edit the quest to add World Stability or the rule, or nudge it |
| `[…] is …` | packages/engine/src/quests/model.ts:89 | Already in that status |
| `[…] has no stability rule for "…"` | packages/engine/src/quests/model.ts:94 | Edit the quest to add World Stability or the rule, or nudge it |
| `[…] is already complete` | packages/engine/src/resolution/model.ts:252 | Remove or recreate the clock |
| `[…] has only … segment… left` | packages/engine/src/resolution/model.ts:265 | Remove or recreate the clock |
| `[…] is already …Unique` | packages/engine/src/skills/model.ts:89 | Already set |
| `[…] is already …` | packages/engine/src/skills/model.ts:114 | Already that rarity |
| `That merge offer is no longer open` | packages/engine/src/skills/model.ts:382 | Send the merge again |
| `That merge offer is out of date: one of its skills has changed. Ask the GM to send it again` | packages/engine/src/skills/model.ts:393 | Send the merge again |
| `… has no portrait` | packages/engine/src/events/reducer.ts:868 | Nothing to remove |
| `… already has that portrait` | packages/engine/src/events/reducer.ts:868 | Nothing to change |
| `a walled contest has no roll` | packages/engine/src/events/reducer.ts:1923 | A malformed stored contest; share it again from the roller |
| `this contest needs a roll` | packages/engine/src/events/reducer.ts:1923 | A malformed stored contest; share it again from the roller |
| `That item is not available` | packages/engine/src/events/commands.ts:1773 | Players see one message that names nothing (QF.9); the GM gives items with Edit holdings (`holdings.adjust`) |
| `That trade can no longer go through` | packages/engine/src/events/commands.ts:1801 | A side no longer holds its part; the GM moves items and currency with Edit holdings |
| `A grade wall settles this contest; it has no roll` | packages/engine/src/resolution/model.ts:328 | Fix the input (the roller fills it in) |
| `This contest needs a roll` | packages/engine/src/resolution/model.ts:328 | Fix the input (the roller fills it in) |

## Data

| Refusal | Where | GM way through |
| --- | --- | --- |
| `The skill needs a name` | packages/engine/src/evolution/model.ts:222 | Fix the input or define the thing first |
| `… is required` | packages/engine/src/character/model.ts:174 | Fix the input or define the thing first |
| `Unknown grade "…"` | packages/engine/src/character/model.ts:181 | Fix the input or define the thing first |
| `A starting class grants exactly … skills (got …)` | packages/engine/src/character/model.ts:192 | Fix the input or define the thing first |
| `Rules define no grades` | packages/engine/src/character/model.ts:197 | Fix the input or define the thing first |
| `Duplicate skill "…"` | packages/engine/src/character/model.ts:211 | Fix the input or define the thing first |
| `Unknown stat "…" in class weights` | packages/engine/src/character/model.ts:223 | Fix the input or define the thing first |
| `Class weight for … must be a whole number from 0 to 1000` | packages/engine/src/character/model.ts:226 | Fix the input or define the thing first |
| `Class weights must give at least one stat a weight above 0` | packages/engine/src/character/model.ts:233 | Fix the input or define the thing first |
| `Unknown race level rounding "…"` | packages/engine/src/character/model.ts:281 | Fix the input or define the thing first |
| `Unknown pool "…"` | packages/engine/src/character/model.ts:308 | Fix the input or define the thing first |
| `Stat "…" is missing or not a number` | packages/engine/src/character/model.ts:311 | Fix the input or define the thing first |
| `Cannot display stat value …` | packages/engine/src/character/model.ts:338 | Fix the input or define the thing first |
| `A loot table needs an entry` | packages/engine/src/economy/loot.ts:63 | Fix the input or define the thing first |
| `…: weight must be above 0` | packages/engine/src/economy/loot.ts:66 | Fix the input or define the thing first |
| `…: unknown item "…"` | packages/engine/src/economy/loot.ts:69 | Define the item first |
| `…: min … is above max …` | packages/engine/src/economy/loot.ts:71 | Fix the input or define the thing first |
| `…: items need min 1` | packages/engine/src/economy/loot.ts:72 | Fix the input or define the thing first |
| `The random source must return [0, 1)` | packages/engine/src/economy/loot.ts:99 | Fix the input or define the thing first |
| `The table rolls … times, not …` | packages/engine/src/economy/loot.ts:106 | Fix the input or define the thing first |
| `No entry … on the table` | packages/engine/src/economy/loot.ts:113 | Fix the input or define the thing first |
| `A "nothing" pick has count 0` | packages/engine/src/economy/loot.ts:115 | Fix the input or define the thing first |
| `Entry … gives …–…, not …` | packages/engine/src/economy/loot.ts:119 | Fix the input or define the thing first |
| `Unknown rarity "…"` | packages/engine/src/economy/model.ts:98 | Fix the input or define the thing first |
| `Rarity "…" is reserved` | packages/engine/src/economy/model.ts:99 | Fix the input or define the thing first |
| `Unknown equipment slot "…"` | packages/engine/src/economy/model.ts:101 | Fix the input or define the thing first |
| `Items give flat stat bonuses only: remove the percentage on …` | packages/engine/src/economy/model.ts:106 | Fix the input or define the thing first |
| `Stat "…" is listed twice` | packages/engine/src/economy/model.ts:110 | Fix the input or define the thing first |
| `… overflow` | packages/engine/src/economy/model.ts:142 | Fix the input or define the thing first |
| `Unknown item "…"` | packages/engine/src/economy/model.ts:146 | Fix the input or define the thing first |
| `[…] overflow` | packages/engine/src/economy/model.ts:153 | Fix the input or define the thing first |
| `A participant has both a share and a weight; give one` | packages/engine/src/events/commands.ts:806 | Fix the input or define the thing first |
| `Give every participant a share, or none` | packages/engine/src/events/commands.ts:813 | Fix the input or define the thing first |
| `No loot table "…"` | packages/engine/src/events/commands.ts:870 | Fix the input or define the thing first |
| `Create a campaign first` | packages/engine/src/events/commands.ts:877 | Fix the input or define the thing first |
| `No random source to roll with` | packages/engine/src/events/commands.ts:1090 | Fix the input or define the thing first |
| `No campaign yet` | packages/engine/src/events/commands.ts:1410 | Fix the input or define the thing first |
| `Every character already knows this entity` | packages/engine/src/events/commands.ts:1613 | Fix the input or define the thing first |
| `Bad event: not plain JSON data` | packages/engine/src/events/envelope.ts:1071 | Fix the input or define the thing first |
| `Bad event: "__proto__" is not allowed as a key` | packages/engine/src/events/envelope.ts:1074 | Fix the input or define the thing first |
| `Bad event: …` | packages/engine/src/events/envelope.ts:1076 | Fix the input or define the thing first |
| `Event …: unknown type "…"` | packages/engine/src/events/envelope.ts:1078 | Fix the input or define the thing first |
| `Event …: … v… is newer than this app supports (v…); update the app` | packages/engine/src/events/envelope.ts:1081 | Fix the input or define the thing first |
| `Event …: no upcaster for … v… → v…` | packages/engine/src/events/envelope.ts:1089 | Fix the input or define the thing first |
| `Event …: upcasting … v… failed: …` | packages/engine/src/events/envelope.ts:1094 | Fix the input or define the thing first |
| `Event …: bad … payload: …` | packages/engine/src/events/envelope.ts:1099 | Fix the input or define the thing first |
| `Event … (event.undone): …` | packages/engine/src/events/log.ts:93 | Fix the input or define the thing first |
| `Event …: duplicate event id` | packages/engine/src/events/log.ts:111 | Fix the input or define the thing first |
| `Event … (event.undone): cannot undo … (…) because a later event depends on it: …` | packages/engine/src/events/log.ts:128 | Fix the input or define the thing first |
| `Cannot undo … (…): later XP awards would be lost at the old level cap: …. Undo those awards first, or set levels with an override` | packages/engine/src/events/log.ts:106 | Undo the later XP awards first (newest first), or set the levels you want with **Review override** (QF.40) |
| `Event …: a log upcaster dropped it` | packages/engine/src/events/log.ts:169 | Fix the input or define the thing first |
| `Event …: a log upcaster must keep the original id on the first event` | packages/engine/src/events/log.ts:171 | Fix the input or define the thing first |
| `Line …: not valid JSON` | packages/engine/src/events/log.ts:330 | Fix the input or define the thing first |
| `Event … (…): …` | packages/engine/src/events/reducer.ts:230 | Fix the input or define the thing first |
| `unknown character "…"` | packages/engine/src/events/reducer.ts:237 | Fix the input or define the thing first |
| `unknown … "…"` | packages/engine/src/events/reducer.ts:259 | Fix the input or define the thing first |
| `unknown item "…"` | packages/engine/src/events/reducer.ts:276 | Fix the input or define the thing first |
| `unknown loot table "…"` | packages/engine/src/events/reducer.ts:322 | Fix the input or define the thing first |
| `unknown trade "…"` | packages/engine/src/events/reducer.ts:327 | Fix the input or define the thing first |
| `library skill "…" already exists` | packages/engine/src/events/reducer.ts:495 | Fix the input or define the thing first |
| `library class "…" already exists` | packages/engine/src/events/reducer.ts:505 | Fix the input or define the thing first |
| `library race "…" already exists` | packages/engine/src/events/reducer.ts:515 | Fix the input or define the thing first |
| `library profession "…" already exists` | packages/engine/src/events/reducer.ts:530 | Fix the input or define the thing first |
| `unknown library … "…"` | packages/engine/src/events/reducer.ts:547 | Fix the input or define the thing first |
| `nothing to change` | packages/engine/src/events/reducer.ts:563 | Fix the input or define the thing first |
| `the campaign already exists` | packages/engine/src/events/reducer.ts:797 | Fix the input or define the thing first |
| `invalid rules: …` | packages/engine/src/events/reducer.ts:799 | Fix the input or define the thing first |
| `the log must start with campaign.created` | packages/engine/src/events/reducer.ts:850 | Fix the input or define the thing first |
| `character "…" already exists` | packages/engine/src/events/reducer.ts:856 | Fix the input or define the thing first |
| `title "…" already exists` | packages/engine/src/events/reducer.ts:915 | Fix the input or define the thing first |
| `unknown library title "…"` | packages/engine/src/events/reducer.ts:931 | Fix the input or define the thing first |
| `unknown grade "…"` | packages/engine/src/entities/model.ts:75 | Fix the input or define the thing first |
| `a participant is listed twice` | packages/engine/src/events/reducer.ts:1010 | Fix the input or define the thing first |
| `shares sum to …, not the award of …` | packages/engine/src/events/reducer.ts:1012 | Fix the input or define the thing first |
| `a recipient is listed twice` | packages/engine/src/events/reducer.ts:1070 | Fix the input or define the thing first |
| `there is no one to broadcast to yet` | packages/engine/src/events/reducer.ts:1073 | Fix the input or define the thing first |
| `no broadcast …` | packages/engine/src/events/reducer.ts:1093 | Fix the input or define the thing first |
| `broadcast … already exists` | packages/engine/src/events/reducer.ts:1107 | Fix the input or define the thing first |
| `no scheduled broadcast …` | packages/engine/src/events/reducer.ts:1132 | Fix the input or define the thing first |
| `item "…" already exists` | packages/engine/src/events/reducer.ts:1140 | Fix the input or define the thing first |
| `unknown library skill "…"` | packages/engine/src/events/reducer.ts:1178 | Fix the input or define the thing first |
| `nothing to add` | packages/engine/src/events/reducer.ts:1246 | Fix the input or define the thing first |
| `loot table "…" already exists` | packages/engine/src/events/reducer.ts:1257 | Fix the input or define the thing first |
| `loot table "…" changed since this roll; its picks no longer match` | packages/engine/src/events/reducer.ts:1284 | Fix the input or define the thing first |
| `nothing to adjust` | packages/engine/src/events/reducer.ts:1307 | Fix the input or define the thing first |
| `a gift needs currency or items` | packages/engine/src/events/reducer.ts:1331 | Fix the input or define the thing first |
| `trade "…" already exists` | packages/engine/src/events/reducer.ts:1351 | Fix the input or define the thing first |
| `a trade needs something on it` | packages/engine/src/events/reducer.ts:1352 | Fix the input or define the thing first |
| `name a skill or a stat` | packages/engine/src/events/reducer.ts:1434 | Fix the input or define the thing first |
| `a skill is listed twice` | packages/engine/src/events/reducer.ts:1435 | Fix the input or define the thing first |
| `[…] has no cost to cast` | packages/engine/src/events/commands.ts:886 | Give the library entry a cost (Skill library → Cost pool and amount), or log the use as practice (`practice.log`) |
| `… has no skill "…"` | packages/engine/src/events/reducer.ts:1438 | Fix the input or define the thing first |
| `no play session "…"` | packages/engine/src/events/reducer.ts:1454 | Fix the input or define the thing first |
| `unknown practice entry "…"` | packages/engine/src/events/reducer.ts:1464 | Fix the input or define the thing first |
| `montage "…" already exists` | packages/engine/src/events/reducer.ts:1514 | Fix the input or define the thing first |
| `unknown clock "…"` | packages/engine/src/events/reducer.ts:1516 | Fix the input or define the thing first |
| `a character is listed twice` | packages/engine/src/events/reducer.ts:1521 | Fix the input or define the thing first |
| `unknown montage "…"` | packages/engine/src/events/reducer.ts:1547 | Fix the input or define the thing first |
| `note "…" already exists` | packages/engine/src/events/reducer.ts:1601 | Fix the input or define the thing first |
| `a note needs a title or text` | packages/engine/src/events/reducer.ts:1607 | Fix the input or define the thing first |
| `unknown note "…"` | packages/engine/src/events/reducer.ts:1629 | Fix the input or define the thing first |
| `clock "…" already exists` | packages/engine/src/events/reducer.ts:1868 | Fix the input or define the thing first |
| `contest "…" already exists` | packages/engine/src/events/reducer.ts:1907 | Fix the input or define the thing first |
| `character "…" is listed twice` | packages/engine/src/events/reducer.ts:1916 | Fix the input or define the thing first |
| `the outcome does not match the roll` | packages/engine/src/events/reducer.ts:1926 | Fix the input or define the thing first |
| `the outcome does not match the wall` | packages/engine/src/events/reducer.ts:1929 | Fix the input or define the thing first |
| `quest "…" already exists` | packages/engine/src/events/reducer.ts:1947 | Fix the input or define the thing first |
| `stability must start between … and …` | packages/engine/src/events/reducer.ts:1956 | Fix the input or define the thing first |
| `unknown quest "…"` | packages/engine/src/events/reducer.ts:1990 | Fix the input or define the thing first |
| `region "…" already exists` | packages/engine/src/events/reducer.ts:2052 | Fix the input or define the thing first |
| `unknown region "…"` | packages/engine/src/events/reducer.ts:2070 | Fix the input or define the thing first |
| `the party is already there` | packages/engine/src/events/reducer.ts:2078 | Fix the input or define the thing first |
| `faction "…" already exists` | packages/engine/src/events/reducer.ts:2090 | Fix the input or define the thing first |
| `unknown faction "…"` | packages/engine/src/events/reducer.ts:2112 | Fix the input or define the thing first |
| `faction is already revealed` | packages/engine/src/events/reducer.ts:2134 | Nothing to do: players already see it (Trackers → "Hide from players" takes it back) |
| `faction is already hidden` | packages/engine/src/events/reducer.ts:2134 | Nothing to do: players already cannot see it (Trackers → "Reveal to players") |
| `shop "…" already exists` | packages/engine/src/events/reducer.ts | Fix the input or define the thing first |
| `unknown shop "…"` | packages/engine/src/events/reducer.ts | Fix the input or define the thing first |
| `no region named "…"` | packages/engine/src/events/commands.ts | Fix the input or define the thing first (add the region, or leave the place empty) |
| `… regions are named "…"` | packages/engine/src/events/commands.ts | Fix the input: use the region's id |
| `wares[…]: no item named "…" in the library` | packages/engine/src/events/commands.ts | Fix the input or define the thing first (define the item, or put it in the same file) |
| `wares[…]: … items are named "…": use the id` | packages/engine/src/events/commands.ts | Fix the input: use the item's id |
| `entity "…" already exists` | packages/engine/src/events/reducer.ts:2140 | Fix the input or define the thing first |
| `unknown entity "…"` | packages/engine/src/events/reducer.ts:2170 | Fix the input or define the thing first |
| `"…" already knows …` | packages/engine/src/events/reducer.ts:2215 | Fix the input or define the thing first |
| `… holds … … XP, not …` | packages/engine/src/events/reducer.ts:2266 | The migration must match the current XP |
| `session "…" already exists` | packages/engine/src/events/reducer.ts:2277 | Fix the input or define the thing first |
| `an end-of-scene prompt needs a character` | packages/engine/src/events/reducer.ts:2317 | Fix the input or define the thing first |
| `scene "…" already exists` | packages/engine/src/events/reducer.ts:2322 | Fix the input or define the thing first |
| `that scene prompt is closed` | packages/engine/src/events/reducer.ts:2329 | Nothing to answer: end a new scene to ask again |
| `… has already answered` | packages/engine/src/events/reducer.ts:2332 | Nothing to do: the answer is in; end a new scene to ask again |
| `undo is applied by the event log, not the reducer` | packages/engine/src/events/reducer.ts:2302 | Fix the input or define the thing first |
| `a region is already called "…"` | packages/engine/src/events/reducer.ts:2345 | Fix the input or define the thing first |
| `Unknown character "…"` | packages/engine/src/events/reducer.ts:2400 | Fix the input or define the thing first |
| `… already has a skill "…"` | packages/engine/src/evolution/model.ts:196 | Fix the input or define the thing first |
| `"…" was a skill of …'s; pick a new name` | packages/engine/src/evolution/model.ts:199 | Fix the input or define the thing first |
| `A selection menu has …–… options (got …)` | packages/engine/src/evolution/model.ts:280 | Fix the input or define the thing first |
| `Every option needs a name` | packages/engine/src/evolution/model.ts:290 | Fix the input or define the thing first |
| `"…" is on the menu twice` | packages/engine/src/evolution/model.ts:291 | Fix the input or define the thing first |
| `"…" is a skill name in the released evolution` | packages/engine/src/evolution/model.ts:298 | Fix the input or define the thing first |
| `[…] is re-rated twice` | packages/engine/src/evolution/model.ts:517 | Fix the input or define the thing first |
| `An option needs a class name` | packages/engine/src/evolution/model.ts:568 | Fix the input or define the thing first |
| `Option "…" transforms … skills (an evolution transforms …–…)` | packages/engine/src/evolution/model.ts:572 | Fix the input or define the thing first |
| `[…] is transformed twice` | packages/engine/src/evolution/model.ts:584 | Fix the input or define the thing first |
| `[…] needs a new name` | packages/engine/src/evolution/model.ts:587 | Fix the input or define the thing first |
| `Two transforms are named "…"` | packages/engine/src/evolution/model.ts:595 | Fix the input or define the thing first |
| `[…] would be a reserved rarity (…)` | packages/engine/src/evolution/model.ts:613 | Fix the input or define the thing first |
| `Merge two different skills` | packages/engine/src/evolution/model.ts:657 | Fix the input or define the thing first |
| `The merged skill needs a new name, not […]` | packages/engine/src/evolution/model.ts:674 | Fix the input or define the thing first |
| `An evolution has 1–… options (got …)` | packages/engine/src/evolution/model.ts:712 | Fix the input or define the thing first |
| `Two options share an id` | packages/engine/src/evolution/model.ts:715 | Fix the input or define the thing first |
| `A profession needs a name` | packages/engine/src/evolution/model.ts:734 | Fix the input or define the thing first |
| `A profession is offered twice` | packages/engine/src/evolution/model.ts:736 | Fix the input or define the thing first |
| `Unknown stat "…" in the stat bonus` | packages/engine/src/evolution/model.ts:959 | Fix the input or define the thing first |
| `The … bonus must be a whole number of 0 or more` | packages/engine/src/evolution/model.ts:961 | Fix the input or define the thing first |
| `The … library already has […]` | packages/engine/src/library/index.ts:55 | Fix the input or define the thing first |
| `A profession lists at most … skills` | packages/engine/src/library/index.ts:91 | Fix the input or define the thing first |
| `…: unknown rarity "…"` | packages/engine/src/library/index.ts:96 | Pick a rarity from the rules |
| `…: rarity "…" is reserved` | packages/engine/src/library/index.ts:98 | Fix the input or define the thing first |
| `… level must be a whole number of 0 or more` | packages/engine/src/progression/override.ts:69 | Fix the input or define the thing first |
| `… level … is above the …-grade top of …` | packages/engine/src/progression/override.ts:72 | The override would make an impossible sheet: change the grade in the same form |
| `… XP must be a whole number of 0 or more` | packages/engine/src/progression/override.ts:78 | Fix the input or define the thing first |
| `… level … is the …-grade top, so its XP is 0 (XP does not bank)` | packages/engine/src/progression/override.ts:90 | The override would make an impossible sheet: change the grade in the same form |
| `… XP must be below …, the XP for one level at …-grade` | packages/engine/src/progression/override.ts:95 | The override would make an impossible sheet: change the grade in the same form |
| `Nothing to change: the values are the current ones` | packages/engine/src/progression/override.ts:106 | Fix the input or define the thing first |
| `Amount must be a whole number ≥ 0` | packages/engine/src/progression/xp.ts:25 | Fix the input or define the thing first |
| `Nothing to split between` | packages/engine/src/progression/xp.ts:26 | Fix the input or define the thing first |
| `Weights must be whole numbers from 0 to …` | packages/engine/src/progression/xp.ts:28 | Fix the input or define the thing first |
| `At least one weight must be above 0` | packages/engine/src/progression/xp.ts:31 | Fix the input or define the thing first |
| `Class weight for … must be a whole number from 0 to …` | packages/engine/src/progression/xp.ts:64 | Fix the input or define the thing first |
| `Spread points must be a whole number ≥ 0` | packages/engine/src/progression/xp.ts:90 | Fix the input or define the thing first |
| `Class weights are all zero` | packages/engine/src/progression/xp.ts:93 | Fix the input or define the thing first |
| `A participant is listed twice` | packages/engine/src/progression/xp.ts:266 | Fix the input or define the thing first |
| `XP must be a whole number ≥ 0` | packages/engine/src/progression/xp.ts:304 | Fix the input or define the thing first |
| `Levels must be a whole number ≥ 0` | packages/engine/src/progression/xp.ts:456 | Fix the input or define the thing first |
| `Shares sum to …, not the award of …` | packages/engine/src/progression/xp.ts:492 | Fix the input or define the thing first |
| `A share must be a whole number ≥ 0` | packages/engine/src/progression/xp.ts:495 | Fix the input or define the thing first |
| `Action tag "…" must be lower-case with no spaces around it` | packages/engine/src/quests/model.ts:69 | Fix the input or define the thing first |
| `The delta for "…" must be non-zero and at most …` | packages/engine/src/quests/model.ts:74 | Fix the input or define the thing first |
| `Count must be 1 or more` | packages/engine/src/quests/model.ts:97 | Fix the input or define the thing first |
| `Nudge by a non-zero amount` | packages/engine/src/quests/model.ts:106 | Fix the input or define the thing first |
| `… must be a number ≥ 0 (got …)` | packages/engine/src/resolution/model.ts:62 | Fix the input or define the thing first |
| `Unknown grade-gap mode "…"` | packages/engine/src/resolution/model.ts:99 | Fix the input or define the thing first |
| `The RNG must return a number in [0, 1) (got …)` | packages/engine/src/resolution/model.ts:134 | Fix the input or define the thing first |
| `A clock has 1–… segments` | packages/engine/src/resolution/model.ts:241 | Fix the input or define the thing first |
| `Fill at least one segment` | packages/engine/src/resolution/model.ts:255 | Fix the input or define the thing first |
| `A failure counts once` | packages/engine/src/resolution/model.ts:258 | Fix the input or define the thing first |
| `A skill has at most … tags` | packages/engine/src/skills/library.ts:56 | Fix the input or define the thing first |
| `A tag is at most … characters` | packages/engine/src/skills/library.ts:60 | Fix the input or define the thing first |
| `A cost is a whole number from 1 to …` | packages/engine/src/skills/library.ts:161 | Fix the input or define the thing first |
| `… is at most … characters` | packages/engine/src/skills/library.ts:167 | Fix the input or define the thing first |
| `The library already has […]…` | packages/engine/src/skills/library.ts:72 | Fix the input or define the thing first |
| `[…] already uses the library text` | packages/engine/src/skills/library.ts:191 | Fix the input or define the thing first |
| `The library has no entry with text for […] at its rarity` | packages/engine/src/skills/library.ts:200 | Fix the input or define the thing first |
| `A nickname is at most … characters` | packages/engine/src/skills/model.ts:51 | Fix the input or define the thing first |
| `The nickname is unchanged` | packages/engine/src/skills/model.ts:55 | Fix the input or define the thing first |
| `[…] already has that text` | packages/engine/src/skills/model.ts:75 | Fix the input or define the thing first |
| `The merged skill needs a name` | packages/engine/src/skills/model.ts:325 | Fix the input or define the thing first |
| `The library already has […]` | packages/engine/src/titles/index.ts:49 | Fix the input or define the thing first |
| `unknown rarity "…"` | packages/engine/src/entities/model.ts:40 | Fix the input or define the thing first |
| `two tiers for rarity "…"` | packages/engine/src/entities/model.ts:41 | Fix the input: one Identify tier per rarity |
| `give both a grade and a level, or neither` | packages/engine/src/entities/model.ts:73 | Fix the input |
| `level must be at most …` | packages/engine/src/entities/model.ts:77 | Raise the campaign level cap in Rules, or fix the input |
| `Unknown stat "…" on …` | packages/engine/src/bonuses/effective.ts:85 | Fix the item or title: name a stat in the rules |
| `Bonus on … for … has neither flat nor percent` | packages/engine/src/bonuses/effective.ts:87 | Fix the item or title: give the bonus a value |
| `Flat bonus on … for … must be a whole number` | packages/engine/src/bonuses/effective.ts:90 | Fix the input |
| `Percent bonus on … for … must be above -100%` | packages/engine/src/bonuses/effective.ts:93 | Fix the input |
| `Bonus source "…" given twice` | packages/engine/src/bonuses/effective.ts:106 | Fix the input |
| `Stat "…" is missing or not a whole number` | packages/engine/src/bonuses/effective.ts:115 | Set stats directly (`character.setStats`) |
| `Bad command…` | packages/engine/src/events/commands.ts:1895 | A malformed command (the app never sends one); fix the input |

## Permission

| Refusal | Where | GM way through |
| --- | --- | --- |
| `Event … (…): players cannot cause this event` | packages/engine/src/events/envelope.ts:1036 | Applies to players (or the System), not the GM |
| `Event … (…): players may only act on their own character` | packages/engine/src/events/envelope.ts:1042 | Applies to players (or the System), not the GM |
| `the system does not write notes` | packages/engine/src/events/reducer.ts:354 | Applies to players (or the System), not the GM |
| `notes are written as yourself` | packages/engine/src/events/reducer.ts:356 | Applies to players (or the System), not the GM |
| `players log practice in the current session` | packages/engine/src/events/reducer.ts:1452 | Applies to players (or the System), not the GM |
| `players log practice with source "player"` | packages/engine/src/events/reducer.ts:1429 | Applies to players (or the System), not the GM |
| `source "player" is for entries a player logs` | packages/engine/src/events/reducer.ts:1432 | Applies to players (or the System), not the GM |
| `only a player keeps a journal` | packages/engine/src/events/reducer.ts:1602 | Applies to players (or the System), not the GM |
| `only the GM writes GM notes` | packages/engine/src/events/reducer.ts:1603 | Applies to players (or the System), not the GM |
| `… notes are … shared` | packages/engine/src/events/reducer.ts:1605 | Applies to players (or the System), not the GM |
| `only the author can change this note` | packages/engine/src/events/reducer.ts:1636 | Applies to players (or the System), not the GM |
| `only journal entries can change who reads them` | packages/engine/src/events/reducer.ts:1647 | Applies to players (or the System), not the GM |
| `only … can cancel this trade` | packages/engine/src/events/reducer.ts:1394 | Limits players only; the GM cancels any trade |
| `only … can answer this trade` | packages/engine/src/events/reducer.ts:1394 | Limits players only; the GM answers for anyone |
| `Not allowed: …` | packages/engine/src/events/commands.ts:1898 | Limits players (and the System) only; the GM may send every command |
| `A trade with the GM can ask only for currency; the GM offers items` | packages/engine/src/events/commands.ts:1775 | Limits players only (Q44); the GM offers items from the GM side |
| `A practice entry can be at most … characters` | packages/engine/src/events/commands.ts:1835 | Limits players only (sizes that keep the log and exports small, M11); the GM is not limited |
| `Practice log is full (… entries); ask the GM` | packages/engine/src/events/commands.ts:1839 | Limits players only (sizes that keep the log and exports small, M11); the GM is not limited |
| `Note limit reached (… notes); delete one to add another` | packages/engine/src/events/commands.ts:1850 | Limits players only (sizes that keep the log and exports small, M11); the GM is not limited |
| `Notes are full (… characters in all); shorten or delete a note first` | packages/engine/src/events/commands.ts:1871 | Limits players only (sizes that keep the log and exports small, M11); the GM is not limited |
| `Too many open trades (…); cancel one first` | packages/engine/src/events/commands.ts:1881 | Limits players only (sizes that keep the log and exports small, M11); the GM is not limited |
