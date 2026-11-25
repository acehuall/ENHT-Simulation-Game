# Review history

How *Trust in Balance* got here, and what is still unproven. Each score comes from a fresh reviewer agent that had not seen the work being built. The playtests are **simulated** work-experience groups (a facilitator and five students played by agents). No real group has played this game yet.

## Score history

| Build | Who scored it | Overall /10 | Notes |
|---|---|---:|---|
| Original *Trust in Balance* (ENHT repo) | outside review | ~6.5 | Lovely live hospital and realistic board pack. Thin loop, hidden consequences. |
| *Northbrook Boardroom* rewrite | its own claim | 9.1 | Self-assessed. |
| *Northbrook Boardroom* rewrite | outside review | ~7.5 | Strong ledger and learning checks, but it read as a dashboard, not a game. |
| v1 merge of both | independent reviewer | 6.4 | Best parts of both, but it was crowded and the balance was exploitable. |
| v3 rebuild | independent reviewer | 7.2 | Balance tool, red lines, role objectives, matched quiz sets. |
| v4 visual overhaul | independent reviewer | 7.8 | One pixel identity; the Gazette, replay and debrief became the gameplay. Visuals 8.0. |
| v4 simulated group | Chloe + 5 students | Fun 6.6 · Clear 7.0 · Learned 6.2 | About 52 minutes against the 45 claimed. |

## Fixed after the v4 round (this build)

- **Peek exploit closed.** There's no undo once the replay starts. The lock-in screen's Back button handles misclicks.
- **YES! bubbles no longer a winning rule.** Stances now come from the visible "helps/hurts" tags on the card, and the rating judges the whole hospital (all six roles), not just the seats you filled. `tools/balance.cjs` checks all 63 seatings: the full board following the bubbles beats 45% of years, and 7 of 63 seatings beat 60%.
- **Sustained failure has teeth.** A red line left broken in two quarters now rates Inadequate.
- **Owner pick no longer prints the answer.** The prompt asks "Whose problem is it?"
- **Memo asks for action.** It shows the change since the call (e.g. 52 → 47) and what to do about it.
- **Every goal is visible at once.** The "All goals" button shows every seat's goals during the debate.
- **Readable by default.** Pixel or plain text is chosen on the welcome screen.
- **Overlays stopped covering the art.**
  - The crisis card sits opposite the crisis zone.
  - Inspectors appear at year-end for any rating below Good.
  - Floaters are hidden on phones.
- **Infographics you can read.**
  - The money waterfall is scaled to the quarter, with values on every bar.
  - The red line shows when it's close.
  - Replay signs name the step (Pressure, Knock-on…).
  - The step count matches between the dialogue and the stat panel.
- **Money story.**
  - Live budget goals say "forecast".
  - Next year's bill itemises each ongoing cost.
  - The lock-in explains that money is on its own track.
- **Facilitator.**
  - A whole-session clock (x/45:00) sits beside the quarter clock.
  - The prompt moves to the side column, so the proposals stay above the dock.
  - The Q4 "watch" note shows the actual room left before the money red line.
- **Quiz cues.** Answer positions are balanced (4 A / 4 B / 4 C per set), and the wrong answers are less obviously cynical.

## Known limits

- **No real pilot.** Every playtest was simulated. The 45-minute claim is realistic only if the facilitator uses "Skip" on replays from Q3; expect 50–55 minutes otherwise.
- **The cheapest option is the weakest each quarter** (10–11% below the quarter mean). Each is still the best choice for at least one role, and "always cheapest" beats only 1% of years. That fits the lesson (cheap fixes rarely hold), but a sharp group will spot the pattern.
- **Some seatings can still lean on the bubbles:** 7 of 63 small-board seatings beat 60% by following them. The full board can't.
- **Money still buys points up to the red line.** Spending more tends to raise role scores until the deficit bites.
- **The balance tool ignores predictions.** It sweeps decisions only; the +2 foresight credit isn't modelled.

None of the reviewers rated this a 9/10. A 9 needs a measured pilot with a real group, and probably one more balance pass on the cheap options.
