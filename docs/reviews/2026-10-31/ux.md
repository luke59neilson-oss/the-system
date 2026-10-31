# UX and accessibility review (origin/main f656f8c2)

Scope: screenshots in docs/screens (1366x768, 1920x1080, 390x844), apps/web/src/styles.css, themes.css, and the TSX aria and wording. Contrast was computed with a script (WCAG relative luminance), composited over the .window panel rgba(20,28,44,0.86) on the page gradient stops #15203a and #0b0f17 (the lighter and darker). No live app run. Tap-target sizes are from CSS box maths (font size times 1.45 line height, plus padding), not measured in a browser.

## Findings (most important first)

**ux-1 | Medium | GM home at 1366x768 hides the join QR and address below the fold; order differs from DESIGN §9a**
- Where: docs/screens/MU.1/gm-home-1366x768.png (QR cut off at the bottom edge, join address below the fold). apps/web/src/gm/GmScreen.tsx:243 puts "Needs you" first, then the party, then JoinPanel.tsx:39 ("Players join").
- What: DESIGN §9a lists the join address and QR second, after the campaign and session line. At 1366x768 the GM must scroll before the table can scan the code, and the address is not visible at all. At 1920x1080 the QR fits (MU.1/gm-home-1920x1080.png).
- Fix: move the join address and QR into a compact strip under the header or in the top row beside Needs you, and follow the §9a order.
- Confidence: high.

**ux-2 | Medium | Phone evolution dialog pushes the choice and the Evolve action below the fold**
- Where: docs/screens/M9.A/player-evolution-choice-390x844.png (the dialog runs past the 844 px viewport; the second path is cut mid-bonus line and Evolve is not on screen). apps/web/src/player/EvolutionChoice.tsx:115-130 renders the full re-rating list before the paths.
- What: a player reads a long paragraph and a list of re-rated skills before reaching Choose, then must scroll the dialog to reach Evolve, with no cue that more follows.
- Fix: collapse the re-rating list into a details element below the paths; keep Evolve in a footer inside the dialog that does not scroll away; add a scroll cue. This overlaps the backlog item on the evolution bonus grid at 390 px, but this one is about action order.
- Confidence: medium-high (Evolve position inferred from render order; not seen in a screenshot).

**ux-3 | Medium | Phone tap targets for core actions are below 44 px**
- Where: apps/web/src/styles.css:200-209 (base button: padding 7 px 14 px, line height 1.45, about 36 px tall); :925-932 (.sound-toggle: padding 3 px 10 px, 0.8rem, about 25 px); :1052 (stepper, 40 px). "Switch character" and "Refresh" are text-size links and buttons of about 22-36 px. Screens: docs/screens/MT.3/player-status-390x844.png (Sound: off), M3.4/player-assign-390x844.png (steppers, Review, Cancel), M3.1/join-390x844.png (Refresh).
- What: players tap Choose, Confirm, Review, the steppers, Sound and Switch character with a thumb, and most are well under the 44 px design target. This overlaps the accepted REVIEW-LOG item at line 512 (about 22 px [Take]/[Choose]); I raise it because it applies to the sheet's controls in general, not one merge screen.
- Fix: in the max-width 700 px block, set min-height 44 px (and a minimum width) on button, .sound-toggle, .continue-link and the stepper, with more space between stacked buttons.
- Confidence: high for the CSS values; not measured in a browser.

**ux-4 | Medium | Input and control borders fail WCAG 1.4.11 (3:1)**
- Where: apps/web/src/styles.css:181 (input, select, textarea border #3b5682): 2.29:1 on the panel, 2.47:1 on the field #0e1524. :513 (.view-as-btn border #3b5682): 2.18:1 on the page background. Screens: docs/screens/MU.1/gm-session-1366x768.png (Amount, Reason and the Track select are outlined only by this border) and MU.1/gm-home-1366x768.png (the Jake and Table view buttons).
- What: the field and button edges are the only sign that a control is there, and they are below 3:1.
- Fix: use #5a7fb8 (the --border token, 4.72:1 on the page background), or a 2 px edge. Re-check on the panel.
- Confidence: high (computed). Text contrast passes; see the list at the end.

**ux-5 | Medium | Internal jargon in the evolution explanation and the player log**
- Where: apps/web/src/player/EvolutionChoice.tsx:117-123 ("Your skills are re-rated for F-grade: same power, new label. Text and mastery marks stay; the next upgrade costs the new rarity's marks ... A skill a path transforms follows that path instead ..."); apps/web/src/format.ts:124 (`Skill [s] re-rated` in the player log). Screen: docs/screens/M9.A/player-evolution-choice-390x844.png.
- What: "re-rated", "transforms", "mastery marks" and "starts the skill again at 0" are internal terms. A player at the table must parse a six-line paragraph to know what they are agreeing to.
- Fix: plain statements, for example "Your skills keep their text and progress. Their rarity label changes for F-grade. An upgrade starts that skill's progress at 0." Log line: "[X] is now Rare (was Common)". Check the wording with Luke before shipping.
- Confidence: high.

**ux-6 | Medium | The XP button "Use for 1" shows a participant count, and the XP amount is only in a hover tooltip**
- Where: apps/web/src/gm/XpAward.tsx:182-200. The visible text is `Use for {group.length}`, the number of chosen participants of that grade. The suggested amount is only in the `title` tooltip (line 193). Screen: docs/screens/MU.1/gm-session-1366x768.png (the button after "Grade reference ... each").
- What: during play the GM sees "Use for 1" and cannot tell that it fills the Amount box with a typical session's XP for those players. The amount is visible only on hover, which touch and keyboard users do not get.
- Fix: show the amount in the label, for example "Fill 600 XP (typical session, 1 player)", and keep the room-left cap note as it is.
- Confidence: high on the label and tooltip; medium-high on the user impact.

**ux-7 | Medium | role="alert" is used for whole windows and for warnings**
- Where: apps/web/src/gm/GmScreen.tsx:84 and :196 (`section className="window" role="alert"`, wrapping a multi-sentence notice); apps/web/src/gm/MergeBuilder.tsx:235 (`p className="warn" role="alert"`); apps/web/src/gm/ContentImport.tsx:264 and :284 (lists of problems with role="alert").
- What: role="alert" makes a screen reader interrupt with the whole section's text, and it presents warnings as errors. The player-side alerts (PlayerScreen.tsx:195 and similar) are short error lines and are fine.
- Fix: put role="alert" only on a short error sentence; use role="status" for warnings and notices; do not put roles on section wrappers.
- Confidence: medium-high (from grep and the surrounding markup; no screen reader run).

**ux-8 | Low | GM-only wording and a game term reach players**
- Where: apps/web/src/player/contest.ts:26 ("A grade wall decides it: no roll.") shown on the contest pop-up (docs/screens/M7.3/player-contest-popup-390x844.png). The join screen text "On the GM's laptop? Open the GM console (needs the GM link from the desktop app or server terminal)." (docs/screens/M3.1/join-390x844.png) is shown to every player.
- What: "grade wall" is a rules term that nobody explains at the table. "server terminal" is for the GM and reads as a technical error to a player.
- Fix: contest: "Too far apart in grade: the higher grade wins, no roll." Join: show the GM-console sentence only to the GM, or drop it from the player screen.
- Confidence: high.

**ux-9 | Low | Silver and platinum frames read alike on screen**
- Where: docs/screens/themes/silver-1366x768.png and platinum-1366x768.png (the status frames look almost identical at ring width). Tokens (themes.css): silver metal #d4d8de vs platinum metal #b2d5f5 give a CIE76 ΔE of 16.8, which passes DESIGN's ΔE 10 check. The highlight edges #ffffff and #f2f9ff differ by ΔE 4.6, and the highlight is what dominates the ring.
- What: the distinction rests on a faint blue cast and brushed streaks. The most visible part of the ring is nearly the same colour, so the change is hard to see in play, which is the thing DESIGN §3 asks to avoid.
- Fix: give platinum a clearly blue highlight edge, or add a check on the rendered ring (M8.3 measures tokens and the ring's metal, not what is drawn).
- Confidence: medium.

**ux-10 | Low | Small text on the phone status screen**
- Where: apps/web/src/styles.css:924 (.feed .when, 0.75rem = 12 px, the notification timestamps); :367 (.choices .tag, 12 px); :888 (.pane-mode .skills, 12 px); :931 (.sound-toggle, 12.8 px). Screens: docs/screens/MT.3/player-status-390x844.png and M3.3/player-ding-390x844.png.
- What: timestamps and tags at 12 px are hard to read at arm's length on a phone in a dim room.
- Fix: a 13-14 px floor on phones for these; the dense layout can stay.
- Confidence: medium.

**ux-11 | Low | Undo: change-log rows with no Undo button give no reason**
- Where: apps/web/src/gm/ChangeLog.tsx:256-257 (`NO_UNDO.has(r.type) ? null : ...`). The file's comment at lines 37-38 says why these rows have no undo.
- What: the GM expects an undo on each change, sees nothing on some rows, and gets no explanation.
- Fix: show a muted "Cannot be undone" in that cell, using the reason the code already has.
- Confidence: medium (not seen in a screenshot).

**ux-12 | Low | The Sound toggle announces its state twice**
- Where: apps/web/src/player/PlayerScreen.tsx:153-161 (`aria-pressed` together with the visible text "Sound: on" or "Sound: off").
- What: a screen reader says "Sound: off, toggle button, not pressed", so the state is given twice in different words.
- Fix: use the label "Sound" with aria-pressed only, or keep the visible state word and drop aria-pressed.
- Confidence: medium.

## Already covered, accepted or in the backlog (not repeated above)
- DING toast covers the running log and "Full history" at 390 px (QUALITY Backlog, Sweep B UX).
- Timed banners show raw seconds; "Remove all" banners has no confirm (Backlog, sweep C UX).
- Evolution bonus grid has no phone breakpoint (Backlog, sweep B UX); the practice review list has no CSS; Library and settings stacks ten windows.
- The join address shows 127.0.0.1 with no wifi hint (REVIEW-LOG accepted, M10 and M3 items).
- About 22 px [Take]/[Choose] tap targets (REVIEW-LOG line 512), overlapping ux-3.

## What looks good
- Text contrast passes on the player panel in all seven themes. The lowest body-text pairs are bronze headings 5.47:1 (lightened from the raw metal on purpose, per themes.css), Inferior grey 6.01:1, muted 7.67:1 and placeholder on field 8.27:1. The automated scan (e2e/M8.3.spec.ts) covers rendered text at 1366 and 390 too.
- Rarity is printed as text in brackets ([Name (Rarity)]), so colour is never the only cue.
- Focus ring: 2 px accent outline at 9.3:1 on the panel, with a keyboard walk in M8.3.
- Live regions: DING layer aria-live polite (PlayerScreen.tsx:1214), banner stack aria-live polite, points-left aria-live, and "[The System is listening]" as role="status".
- Phone sheet order: single column, status first, then quests and the running log, then party and inventory (styles.css:432-483). The Assign panel with labelled +/- steppers fits at 390 (M3.4/player-assign-390x844.png).
- DING wording matches DESIGN §9 ("*'DING!' Class: [Archer] has reached level 4 - Stat points allocated*").
- Join screen: character rows are large (about 70 px), and each grade ring is labelled with its grade in text (M3.1/join-390x844.png).
- Destructive GM actions mostly confirm: shop removal, lore delete, offer withdrawal and regenerate (Shops.tsx:61, LoreView.tsx:56, EvolutionBuilder.tsx:103, CoDmPanel.tsx:100).
- The GM 1920x1080 home fits: Needs you, party, join QR and New character are all visible (MU.1/gm-home-1920x1080.png).

Memory: no stored memory was used for this review.
