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
  marked *Planned (MT.7)* while its override is being built.
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
| `…: rarity "…" is not allowed at …-grade (ceiling …)` | packages/engine/src/character/model.ts:204 | Planned (MT.7): `skill.setRarity` sets any skill above the ceiling after creation; or raise the ceiling in Rules |
| `Professions unlock at …-grade` | packages/engine/src/character/model.ts:360 | Planned (MT.7): `character.grantProfession` with `override: true` grants one before E-grade |
| `Not enough … (has …)` | packages/engine/src/economy/model.ts:140 | Edit holdings (`holdings.adjust`) sets currency and items directly |
| `Not enough […] (has …, needs …)` | packages/engine/src/economy/model.ts:149 | Edit holdings (`holdings.adjust`) sets currency and items directly |
| `Approve the skill re-rating first: the GM sets each kept skill's rarity and approves the list (DESIGN §6)` | packages/engine/src/events/commands.ts:1279 | One click: the GM sets and approves the re-rating in the evolution builder (the approval is the GM's own act) |
| `… must be between 0 and …` | packages/engine/src/events/reducer.ts:964 | Pools stay within their maximum; raise the maximum through stats (`character.setStats`) |
| `the race level … points are already assigned and locked` | packages/engine/src/events/reducer.ts:1027 | Free-point override (`freePoints.override`) rewrites or clears any batch |
| `assign exactly … points (got …)` | packages/engine/src/events/reducer.ts:1038 | Free-point override (`freePoints.override`) rewrites or clears any batch |
| `… would drop below 0` | packages/engine/src/events/reducer.ts:1044 | Set stats directly (`character.setStats`) |
| `"…" does not qualify for a montage yet` | packages/engine/src/events/reducer.ts:1509 | Planned (MT.7): `montage.offer` with `override: true` skips the half-filled, no-failure check |
| `Class level … grants no skill selection` | packages/engine/src/evolution/model.ts:224 | Planned (MT.7): `skill.grant` gives a skill outside the selection schedule |
| `… has not reached class level … (is …)` | packages/engine/src/evolution/model.ts:226 | Planned (MT.7): `skill.grant` gives a skill outside the selection schedule |
| `[…] is above the …-grade ceiling (…)` | packages/engine/src/evolution/model.ts:258 | Planned (MT.7): `skill.setRarity` sets any rarity after the fact; or raise the ceiling in Rules |
| `Level … is the …-grade capstone: offer at least one … option` | packages/engine/src/evolution/model.ts:268 | Planned (MT.7): `skill.grant` gives any skill without a capstone menu; the menu rule itself stays (DESIGN §6) |
| `No selection is offered at level …` | packages/engine/src/evolution/model.ts:366 | Planned (MT.7): `skill.grant` gives a skill outside the selection schedule |
| `[…] is a race skill and never drops a rarity` | packages/engine/src/evolution/model.ts:477 | Planned (MT.7): `skill.setRarity` (and `skill.grant`) change race skills too, with a warning that Identify never drops by default |
| `[…] cannot be raised above the …-grade ceiling (…)` | packages/engine/src/evolution/model.ts:480 | Planned (MT.7): `skill.setRarity` sets any rarity after the fact; or raise the ceiling in Rules |
| `[…] is a race skill and cannot be merged away at evolution` | packages/engine/src/evolution/model.ts:498 | Planned (MT.7): `skill.setRarity` (and `skill.grant`) change race skills too, with a warning that Identify never drops by default |
| `[…] is a race skill and keeps its name at evolution` | packages/engine/src/evolution/model.ts:510 | Planned (MT.7): `skill.setRarity` (and `skill.grant`) change race skills too, with a warning that Identify never drops by default |
| `[…] must be … (one above the higher merged skill)` | packages/engine/src/evolution/model.ts:576 | Planned (MT.7): `skill.setRarity` after the evolution sets the final rarity |
| `[…] cannot drop to a lower rarity` | packages/engine/src/evolution/model.ts:581 | Planned (MT.7): `skill.setRarity` after the evolution sets the final rarity |
| `… can merge … time(s) per grade (… done at …-grade)` | packages/engine/src/evolution/model.ts:598 | Planned (MT.7): `skill.merge` with `override: true` skips the joint-use count, minimum rarity and once-per-grade checks |
| `[…] must be at least … to merge` | packages/engine/src/evolution/model.ts:618 | Planned (MT.7): `skill.merge` with `override: true` skips the joint-use count, minimum rarity and once-per-grade checks |
| `[…] and […] were logged together … times (need …)` | packages/engine/src/evolution/model.ts:623 | Planned (MT.7): `skill.merge` with `override: true` skips the joint-use count, minimum rarity and once-per-grade checks |
| `… cannot evolve yet (… level … of …)` | packages/engine/src/evolution/model.ts:660 | Set levels with the level/XP/grade override (`character.setProgression`) to reach the gate |
| `Professions are offered from the …-grade evolution on, to a character without one` | packages/engine/src/evolution/model.ts:683 | Planned (MT.7): `character.grantProfession` with `override: true` |
| `… has a skill selection to choose first (class level …); an evolution cannot be … until then` | packages/engine/src/evolution/model.ts:903 | Planned (MT.7): `evolution.release` with `override: true` releases with a selection pending |
| `[…] is …, which has no mark upgrade` | packages/engine/src/skills/model.ts:176 | Planned (MT.7): `skill.setRarity` upgrades any skill directly |
| `[…] already earned its mark this session` | packages/engine/src/skills/model.ts:182 | Planned (MT.7): `skill.awardMark` with `override: true` gives a second mark in a session |
| `[…] cannot be upgraded past …` | packages/engine/src/skills/model.ts:211 | Planned (MT.7): `skill.setRarity` upgrades any skill directly |
| `[…] needs … marks (has …)` | packages/engine/src/skills/model.ts:216 | Planned (MT.7): `skill.setRarity` upgrades any skill directly |
| `[…] is at the …-grade ceiling; its marks bank until the next evolution` | packages/engine/src/skills/model.ts:219 | Planned (MT.7): `skill.setRarity` upgrades any skill directly |
| `Already merged at …-grade` | packages/engine/src/skills/model.ts:269 | Planned (MT.7): `skill.merge` with `override: true` skips the joint-use count, minimum rarity and once-per-grade checks |
| `The merged skill would be above the …-grade ceiling` | packages/engine/src/skills/model.ts:277 | Planned (MT.7): `skill.setRarity` sets any rarity after the fact; or raise the ceiling in Rules |

## State

| Refusal | Where | GM way through |
| --- | --- | --- |
| `Character already has a profession` | packages/engine/src/character/model.ts:356 | The character has one: a profession is chosen once (DESIGN §2); to change it, undo the choice in the change log |
| `… already has the profession […]` | packages/engine/src/character/model.ts:383 | The character has one: a profession is chosen once (DESIGN §2); to change it, undo the choice in the change log |
| `"…" is not one of your offered professions` | packages/engine/src/character/model.ts:388 | Offer it first (Professions offers / evolution builder) |
| `… already has the profession […]; the offers are locked` | packages/engine/src/character/model.ts:400 | The character has one: a profession is chosen once (DESIGN §2); to change it, undo the choice in the change log |
| `"…" is not offered to …` | packages/engine/src/character/model.ts:407 | Offer it first (Professions offers / evolution builder) |
| `… slot … does not exist` | packages/engine/src/economy/model.ts:171 | Equip/unequip from the right slot; holdings can be edited directly |
| `[…] is already equipped there` | packages/engine/src/economy/model.ts:182 | Equip/unequip from the right slot; holdings can be edited directly |
| `No […] in the inventory` | packages/engine/src/economy/model.ts:184 | Equip/unequip from the right slot; holdings can be edited directly |
| `Nothing is equipped in …` | packages/engine/src/economy/model.ts:196 | Equip/unequip from the right slot; holdings can be edited directly |
| `The libraries already hold every default entry` | packages/engine/src/events/commands.ts:859 | Nothing left to seed |
| `A mark needs a play session` | packages/engine/src/events/commands.ts:1211 | Start a session (Session panel); marks are counted per session |
| `XP overflow is already on` | packages/engine/src/events/commands.ts:1616 | Already on |
| `A session is already running; end it first` | packages/engine/src/events/commands.ts:1629 | End or start the session first |
| `No session is running` | packages/engine/src/events/commands.ts:1634 | End or start the session first |
| `trade "…" is already …` | packages/engine/src/events/reducer.ts:326 | The trade is over; propose a new one |
| `… already holds […]` | packages/engine/src/events/reducer.ts:900 | Titles are held once; award a different title |
| `no free-point batch for race level …` | packages/engine/src/events/reducer.ts:1021 | No such batch: free points come with race levels; set them with the free-point override |
| `the race level … points are not assigned` | packages/engine/src/events/reducer.ts:1024 | No such batch: free points come with race levels; set them with the free-point override |
| `that broadcast has no banner to remove` | packages/engine/src/events/reducer.ts:1085 | Nothing to remove |
| `that banner was already removed` | packages/engine/src/events/reducer.ts:1086 | Nothing to remove |
| `day … has already begun; send it now instead` | packages/engine/src/events/reducer.ts:1093 | Send it now instead |
| `[…] is equipped by "…"; unequip it first` | packages/engine/src/events/reducer.ts:1156 | Unequip it first (the GM can unequip on any sheet) |
| `a montage focus cannot be removed; edit it` | packages/engine/src/events/reducer.ts:1488 | Edit the entry instead |
| `this montage was not offered to that character` | packages/engine/src/events/reducer.ts:1541 | The montage is not open for that character |
| `this montage is closed` | packages/engine/src/events/reducer.ts:1543 | The montage is not open for that character |
| `a focus was already given` | packages/engine/src/events/reducer.ts:1544 | The montage is not open for that character |
| `this montage is already closed` | packages/engine/src/events/reducer.ts:1583 | The montage is not open for that character |
| `this quest has no World Stability` | packages/engine/src/events/reducer.ts:1976 | Edit the quest to add World Stability or the rule, or nudge it |
| `the quest is already …` | packages/engine/src/events/reducer.ts:1998 | Already in that status |
| `a session is already running` | packages/engine/src/events/reducer.ts:2232 | End or start the session first |
| `no session is running` | packages/engine/src/events/reducer.ts:2248 | End or start the session first |
| `session "…" is not running` | packages/engine/src/events/reducer.ts:2249 | End or start the session first |
| `The level … selection was already chosen` | packages/engine/src/evolution/model.ts:232 | Pick from the current menu; the GM can re-offer or withdraw options |
| `… has no profession for […]` | packages/engine/src/evolution/model.ts:264 | Profession skills and XP need a profession first |
| `… already has […]` | packages/engine/src/evolution/model.ts:337 | Pick from the current menu; the GM can re-offer or withdraw options |
| `[…] is not a passed-over option of …` | packages/engine/src/evolution/model.ts:348 | Pick from the current menu; the GM can re-offer or withdraw options |
| `The level … menu was offered again; choose from the new one` | packages/engine/src/evolution/model.ts:368 | Pick from the current menu; the GM can re-offer or withdraw options |
| `"…" is not on the level … menu` | packages/engine/src/evolution/model.ts:379 | Pick from the current menu; the GM can re-offer or withdraw options |
| `"…" is on the pending level … menu; re-offer that menu or pick another name` | packages/engine/src/evolution/model.ts:557 | Re-offer that menu or pick another name |
| `No evolution is released for …` | packages/engine/src/evolution/model.ts:733 | Release (or re-release) the evolution first |
| `The evolution was released again; choose from the new options` | packages/engine/src/evolution/model.ts:736 | Release (or re-release) the evolution first |
| `No evolution option "…"` | packages/engine/src/evolution/model.ts:739 | Release (or re-release) the evolution first |
| `… can no longer evolve to …-grade` | packages/engine/src/evolution/model.ts:742 | Release (or re-release) the evolution first |
| `"…" is not an offered profession` | packages/engine/src/evolution/model.ts:751 | Offer it first (Professions offers / evolution builder) |
| `No profession is offered with this evolution` | packages/engine/src/evolution/model.ts:754 | Offer it first (Professions offers / evolution builder) |
| `… already has the profession […]; evolve with none` | packages/engine/src/evolution/model.ts:760 | The character has one: a profession is chosen once (DESIGN §2); to change it, undo the choice in the change log |
| `… has no profession, so profession level and XP stay 0` | packages/engine/src/progression/override.ts:82 | Profession skills and XP need a profession first |
| `… has no profession` | packages/engine/src/progression/xp.ts:306 | Profession skills and XP need a profession first |
| `[…] has no World Stability` | packages/engine/src/quests/model.ts:87 | Edit the quest to add World Stability or the rule, or nudge it |
| `[…] is …` | packages/engine/src/quests/model.ts:89 | Already in that status |
| `[…] has no stability rule for "…"` | packages/engine/src/quests/model.ts:94 | Edit the quest to add World Stability or the rule, or nudge it |
| `[…] is already complete` | packages/engine/src/resolution/model.ts:252 | Remove or recreate the clock |
| `[…] has only … segment… left` | packages/engine/src/resolution/model.ts:265 | Remove or recreate the clock |
| `[…] is already …Unique` | packages/engine/src/skills/model.ts:89 | Already set |
| `That merge offer is no longer open` | packages/engine/src/skills/model.ts:336 | Send the merge again |
| `That merge offer is out of date: one of its skills has changed. Ask the GM to send it again` | packages/engine/src/skills/model.ts:347 | Send the merge again |

## Data

| Refusal | Where | GM way through |
| --- | --- | --- |
| `… is required` | packages/engine/src/character/model.ts:172 | Fix the input or define the thing first |
| `Unknown grade "…"` | packages/engine/src/character/model.ts:179 | Fix the input or define the thing first |
| `A starting class grants exactly … skills (got …)` | packages/engine/src/character/model.ts:190 | Fix the input or define the thing first |
| `Rules define no grades` | packages/engine/src/character/model.ts:195 | Fix the input or define the thing first |
| `Duplicate skill "…"` | packages/engine/src/character/model.ts:209 | Fix the input or define the thing first |
| `Unknown stat "…" in class weights` | packages/engine/src/character/model.ts:221 | Fix the input or define the thing first |
| `Class weight for … must be a whole number from 0 to 1000` | packages/engine/src/character/model.ts:224 | Fix the input or define the thing first |
| `Class weights must give at least one stat a weight above 0` | packages/engine/src/character/model.ts:231 | Fix the input or define the thing first |
| `Unknown race level rounding "…"` | packages/engine/src/character/model.ts:279 | Fix the input or define the thing first |
| `Unknown pool "…"` | packages/engine/src/character/model.ts:306 | Fix the input or define the thing first |
| `Stat "…" is missing or not a number` | packages/engine/src/character/model.ts:309 | Fix the input or define the thing first |
| `Cannot display stat value …` | packages/engine/src/character/model.ts:336 | Fix the input or define the thing first |
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
| `A participant has both a share and a weight; give one` | packages/engine/src/events/commands.ts:777 | Fix the input or define the thing first |
| `Give every participant a share, or none` | packages/engine/src/events/commands.ts:784 | Fix the input or define the thing first |
| `No loot table "…"` | packages/engine/src/events/commands.ts:841 | Fix the input or define the thing first |
| `Create a campaign first` | packages/engine/src/events/commands.ts:848 | Fix the input or define the thing first |
| `No random source to roll with` | packages/engine/src/events/commands.ts:1057 | Fix the input or define the thing first |
| `No campaign yet` | packages/engine/src/events/commands.ts:1352 | Fix the input or define the thing first |
| `Every character already knows this entity` | packages/engine/src/events/commands.ts:1555 | Fix the input or define the thing first |
| `Bad event: not plain JSON data` | packages/engine/src/events/envelope.ts:1038 | Fix the input or define the thing first |
| `Bad event: "__proto__" is not allowed as a key` | packages/engine/src/events/envelope.ts:1041 | Fix the input or define the thing first |
| `Bad event: …` | packages/engine/src/events/envelope.ts:1043 | Fix the input or define the thing first |
| `Event …: unknown type "…"` | packages/engine/src/events/envelope.ts:1045 | Fix the input or define the thing first |
| `Event …: … v… is newer than this app supports (v…); update the app` | packages/engine/src/events/envelope.ts:1048 | Fix the input or define the thing first |
| `Event …: no upcaster for … v… → v…` | packages/engine/src/events/envelope.ts:1056 | Fix the input or define the thing first |
| `Event …: upcasting … v… failed: …` | packages/engine/src/events/envelope.ts:1061 | Fix the input or define the thing first |
| `Event …: bad … payload: …` | packages/engine/src/events/envelope.ts:1066 | Fix the input or define the thing first |
| `Event … (event.undone): …` | packages/engine/src/events/log.ts:93 | Fix the input or define the thing first |
| `Event …: duplicate event id` | packages/engine/src/events/log.ts:111 | Fix the input or define the thing first |
| `Event … (event.undone): cannot undo … (…) because a later event depends on it: …` | packages/engine/src/events/log.ts:128 | Fix the input or define the thing first |
| `Event …: a log upcaster dropped it` | packages/engine/src/events/log.ts:169 | Fix the input or define the thing first |
| `Event …: a log upcaster must keep the original id on the first event` | packages/engine/src/events/log.ts:171 | Fix the input or define the thing first |
| `Line …: not valid JSON` | packages/engine/src/events/log.ts:330 | Fix the input or define the thing first |
| `Event … (…): …` | packages/engine/src/events/reducer.ts:228 | Fix the input or define the thing first |
| `unknown character "…"` | packages/engine/src/events/reducer.ts:235 | Fix the input or define the thing first |
| `unknown … "…"` | packages/engine/src/events/reducer.ts:257 | Fix the input or define the thing first |
| `unknown item "…"` | packages/engine/src/events/reducer.ts:274 | Fix the input or define the thing first |
| `unknown loot table "…"` | packages/engine/src/events/reducer.ts:320 | Fix the input or define the thing first |
| `unknown trade "…"` | packages/engine/src/events/reducer.ts:325 | Fix the input or define the thing first |
| `library skill "…" already exists` | packages/engine/src/events/reducer.ts:493 | Fix the input or define the thing first |
| `library class "…" already exists` | packages/engine/src/events/reducer.ts:503 | Fix the input or define the thing first |
| `library race "…" already exists` | packages/engine/src/events/reducer.ts:513 | Fix the input or define the thing first |
| `library profession "…" already exists` | packages/engine/src/events/reducer.ts:528 | Fix the input or define the thing first |
| `unknown library … "…"` | packages/engine/src/events/reducer.ts:545 | Fix the input or define the thing first |
| `nothing to change` | packages/engine/src/events/reducer.ts:561 | Fix the input or define the thing first |
| `the campaign already exists` | packages/engine/src/events/reducer.ts:795 | Fix the input or define the thing first |
| `invalid rules: …` | packages/engine/src/events/reducer.ts:797 | Fix the input or define the thing first |
| `the log must start with campaign.created` | packages/engine/src/events/reducer.ts:848 | Fix the input or define the thing first |
| `character "…" already exists` | packages/engine/src/events/reducer.ts:854 | Fix the input or define the thing first |
| `title "…" already exists` | packages/engine/src/events/reducer.ts:906 | Fix the input or define the thing first |
| `unknown library title "…"` | packages/engine/src/events/reducer.ts:922 | Fix the input or define the thing first |
| `unknown grade "…"` | packages/engine/src/events/reducer.ts:998 | Fix the input or define the thing first |
| `a participant is listed twice` | packages/engine/src/events/reducer.ts:1001 | Fix the input or define the thing first |
| `shares sum to …, not the award of …` | packages/engine/src/events/reducer.ts:1003 | Fix the input or define the thing first |
| `a recipient is listed twice` | packages/engine/src/events/reducer.ts:1061 | Fix the input or define the thing first |
| `there is no one to broadcast to yet` | packages/engine/src/events/reducer.ts:1064 | Fix the input or define the thing first |
| `no broadcast …` | packages/engine/src/events/reducer.ts:1084 | Fix the input or define the thing first |
| `broadcast … already exists` | packages/engine/src/events/reducer.ts:1098 | Fix the input or define the thing first |
| `no scheduled broadcast …` | packages/engine/src/events/reducer.ts:1123 | Fix the input or define the thing first |
| `item "…" already exists` | packages/engine/src/events/reducer.ts:1131 | Fix the input or define the thing first |
| `unknown library skill "…"` | packages/engine/src/events/reducer.ts:1169 | Fix the input or define the thing first |
| `nothing to add` | packages/engine/src/events/reducer.ts:1237 | Fix the input or define the thing first |
| `loot table "…" already exists` | packages/engine/src/events/reducer.ts:1248 | Fix the input or define the thing first |
| `loot table "…" changed since this roll; its picks no longer match` | packages/engine/src/events/reducer.ts:1275 | Fix the input or define the thing first |
| `nothing to adjust` | packages/engine/src/events/reducer.ts:1298 | Fix the input or define the thing first |
| `a gift needs currency or items` | packages/engine/src/events/reducer.ts:1322 | Fix the input or define the thing first |
| `trade "…" already exists` | packages/engine/src/events/reducer.ts:1342 | Fix the input or define the thing first |
| `a trade needs something on it` | packages/engine/src/events/reducer.ts:1343 | Fix the input or define the thing first |
| `name a skill or a stat` | packages/engine/src/events/reducer.ts:1425 | Fix the input or define the thing first |
| `a skill is listed twice` | packages/engine/src/events/reducer.ts:1426 | Fix the input or define the thing first |
| `… has no skill "…"` | packages/engine/src/events/reducer.ts:1429 | Fix the input or define the thing first |
| `unknown practice entry "…"` | packages/engine/src/events/reducer.ts:1455 | Fix the input or define the thing first |
| `montage "…" already exists` | packages/engine/src/events/reducer.ts:1505 | Fix the input or define the thing first |
| `unknown clock "…"` | packages/engine/src/events/reducer.ts:1507 | Fix the input or define the thing first |
| `a character is listed twice` | packages/engine/src/events/reducer.ts:1512 | Fix the input or define the thing first |
| `unknown montage "…"` | packages/engine/src/events/reducer.ts:1538 | Fix the input or define the thing first |
| `note "…" already exists` | packages/engine/src/events/reducer.ts:1592 | Fix the input or define the thing first |
| `a note needs a title or text` | packages/engine/src/events/reducer.ts:1598 | Fix the input or define the thing first |
| `unknown note "…"` | packages/engine/src/events/reducer.ts:1620 | Fix the input or define the thing first |
| `clock "…" already exists` | packages/engine/src/events/reducer.ts:1834 | Fix the input or define the thing first |
| `contest "…" already exists` | packages/engine/src/events/reducer.ts:1873 | Fix the input or define the thing first |
| `character "…" is listed twice` | packages/engine/src/events/reducer.ts:1882 | Fix the input or define the thing first |
| `the outcome does not match the roll` | packages/engine/src/events/reducer.ts:1892 | Fix the input or define the thing first |
| `the outcome does not match the wall` | packages/engine/src/events/reducer.ts:1895 | Fix the input or define the thing first |
| `quest "…" already exists` | packages/engine/src/events/reducer.ts:1913 | Fix the input or define the thing first |
| `stability must start between … and …` | packages/engine/src/events/reducer.ts:1922 | Fix the input or define the thing first |
| `unknown quest "…"` | packages/engine/src/events/reducer.ts:1956 | Fix the input or define the thing first |
| `region "…" already exists` | packages/engine/src/events/reducer.ts:2018 | Fix the input or define the thing first |
| `unknown region "…"` | packages/engine/src/events/reducer.ts:2036 | Fix the input or define the thing first |
| `the party is already there` | packages/engine/src/events/reducer.ts:2044 | Fix the input or define the thing first |
| `faction "…" already exists` | packages/engine/src/events/reducer.ts:2056 | Fix the input or define the thing first |
| `unknown faction "…"` | packages/engine/src/events/reducer.ts:2078 | Fix the input or define the thing first |
| `entity "…" already exists` | packages/engine/src/events/reducer.ts:2097 | Fix the input or define the thing first |
| `unknown entity "…"` | packages/engine/src/events/reducer.ts:2127 | Fix the input or define the thing first |
| `"…" already knows …` | packages/engine/src/events/reducer.ts:2172 | Fix the input or define the thing first |
| `… holds … … XP, not …` | packages/engine/src/events/reducer.ts:2223 | The migration must match the current XP |
| `session "…" already exists` | packages/engine/src/events/reducer.ts:2234 | Fix the input or define the thing first |
| `undo is applied by the event log, not the reducer` | packages/engine/src/events/reducer.ts:2259 | Fix the input or define the thing first |
| `a region is already called "…"` | packages/engine/src/events/reducer.ts:2302 | Fix the input or define the thing first |
| `Unknown character "…"` | packages/engine/src/events/reducer.ts:2357 | Fix the input or define the thing first |
| `… already has a skill "…"` | packages/engine/src/evolution/model.ts:191 | Fix the input or define the thing first |
| `"…" was a skill of …'s; pick a new name` | packages/engine/src/evolution/model.ts:194 | Fix the input or define the thing first |
| `A selection menu has …–… options (got …)` | packages/engine/src/evolution/model.ts:236 | Fix the input or define the thing first |
| `Every option needs a name` | packages/engine/src/evolution/model.ts:246 | Fix the input or define the thing first |
| `"…" is on the menu twice` | packages/engine/src/evolution/model.ts:247 | Fix the input or define the thing first |
| `"…" is a skill name in the released evolution` | packages/engine/src/evolution/model.ts:254 | Fix the input or define the thing first |
| `[…] is re-rated twice` | packages/engine/src/evolution/model.ts:473 | Fix the input or define the thing first |
| `An option needs a class name` | packages/engine/src/evolution/model.ts:524 | Fix the input or define the thing first |
| `Option "…" transforms … skills (an evolution transforms …–…)` | packages/engine/src/evolution/model.ts:528 | Fix the input or define the thing first |
| `[…] is transformed twice` | packages/engine/src/evolution/model.ts:540 | Fix the input or define the thing first |
| `[…] needs a new name` | packages/engine/src/evolution/model.ts:543 | Fix the input or define the thing first |
| `Two transforms are named "…"` | packages/engine/src/evolution/model.ts:551 | Fix the input or define the thing first |
| `[…] would be a reserved rarity (…)` | packages/engine/src/evolution/model.ts:569 | Fix the input or define the thing first |
| `Merge two different skills` | packages/engine/src/evolution/model.ts:613 | Fix the input or define the thing first |
| `The merged skill needs a new name, not […]` | packages/engine/src/evolution/model.ts:630 | Fix the input or define the thing first |
| `An evolution has 1–… options (got …)` | packages/engine/src/evolution/model.ts:666 | Fix the input or define the thing first |
| `Two options share an id` | packages/engine/src/evolution/model.ts:669 | Fix the input or define the thing first |
| `A profession needs a name` | packages/engine/src/evolution/model.ts:688 | Fix the input or define the thing first |
| `A profession is offered twice` | packages/engine/src/evolution/model.ts:690 | Fix the input or define the thing first |
| `Unknown stat "…" in the stat bonus` | packages/engine/src/evolution/model.ts:912 | Fix the input or define the thing first |
| `The … bonus must be a whole number of 0 or more` | packages/engine/src/evolution/model.ts:914 | Fix the input or define the thing first |
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
| `The library already has […]…` | packages/engine/src/skills/library.ts:72 | Fix the input or define the thing first |
| `[…] already uses the library text` | packages/engine/src/skills/library.ts:191 | Fix the input or define the thing first |
| `The library has no entry with text for […] at its rarity` | packages/engine/src/skills/library.ts:200 | Fix the input or define the thing first |
| `A nickname is at most … characters` | packages/engine/src/skills/model.ts:51 | Fix the input or define the thing first |
| `The nickname is unchanged` | packages/engine/src/skills/model.ts:55 | Fix the input or define the thing first |
| `[…] already has that text` | packages/engine/src/skills/model.ts:75 | Fix the input or define the thing first |
| `The merged skill needs a name` | packages/engine/src/skills/model.ts:282 | Fix the input or define the thing first |
| `The library already has […]` | packages/engine/src/titles/index.ts:49 | Fix the input or define the thing first |

## Permission

| Refusal | Where | GM way through |
| --- | --- | --- |
| `Event … (…): players cannot cause this event` | packages/engine/src/events/envelope.ts:1003 | Applies to players (or the System), not the GM |
| `Event … (…): players may only act on their own character` | packages/engine/src/events/envelope.ts:1009 | Applies to players (or the System), not the GM |
| `the system does not write notes` | packages/engine/src/events/reducer.ts:352 | Applies to players (or the System), not the GM |
| `notes are written as yourself` | packages/engine/src/events/reducer.ts:354 | Applies to players (or the System), not the GM |
| `players log practice with source "player"` | packages/engine/src/events/reducer.ts:1420 | Applies to players (or the System), not the GM |
| `source "player" is for entries a player logs` | packages/engine/src/events/reducer.ts:1423 | Applies to players (or the System), not the GM |
| `only a player keeps a journal` | packages/engine/src/events/reducer.ts:1593 | Applies to players (or the System), not the GM |
| `only the GM writes GM notes` | packages/engine/src/events/reducer.ts:1594 | Applies to players (or the System), not the GM |
| `… notes are … shared` | packages/engine/src/events/reducer.ts:1596 | Applies to players (or the System), not the GM |
| `only the author can change this note` | packages/engine/src/events/reducer.ts:1627 | Applies to players (or the System), not the GM |
| `only journal entries can change who reads them` | packages/engine/src/events/reducer.ts:1638 | Applies to players (or the System), not the GM |
