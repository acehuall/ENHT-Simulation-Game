# Opportunities register (25 Nov 2026)

Sources: all 33 PRs on `acehuall/ENHT-Simulation-Game` (31 merged, #7 and #10 closed unmerged), the
unmerged branch `claude/document-implementation-review-h18gpo`, `Game_Spec.md`, `Stats_Spec`/BPS-001
(July), and the v4 independent review and simulated group session (November).

Status key: **v6** = done in this build · **carried** = already in v5 · **later** = parked, with the reason.

| # | Opportunity | Source | Status |
|---|---|---|---|
| 1 | Money chart readable at projector distance (labelled, scaled to the quarter) | v4 group #3, Priya | v6: horizontal money bridge with full step names and values |
| 2 | Previous-quarter comparison on the dashboard | PR #33 (radar vs last quarter) | v6: ▲/▼ change since the quarter opened on every stat row |
| 3 | Benchmark bands / per-figure tones | PR #29, PR #31, BPS-001 | v6: band word (Strong … Critical) on each stat row |
| 4 | Year-end chart people can read ("it's a hexagon") | v4 group, Tom | v6: start → year-end dumbbell chart with numbers and red lines replaces the radar |
| 5 | A running score during the year | v4 group, Kai; PR #28 health score | v6: "On this course" rating from Q2, counting costs and knock-ons already coming, with red-line warnings |
| 6 | Metrics with real-world meaning | Stats_Spec phase 1, BPS-001 X-series | v6: each 0–100 measure shows an illustrative NHS equivalent (A&E 4-hour %, harm-free care %, sickness %, FFT %, complaints) |
| 7 | Story continuity between quarters | Game_Spec §5, v4 reviewer | v6: memo strip under the map from Q2: last front page, what it set in motion, red lines and knock-ons close by |
| 8 | Facilitator hotkeys | PR #17, Game_Spec §14 | v6: A–D pick, Enter lock in, 1–5 / Q–Y / Enter in the lock-in, → next step, S skip, N next quarter, F facilitator |
| 9 | Map labels and signs clipped at the frame edge | v4 group #5 | v6 |
| 10 | Money total overflowing the status panel in the replay | v4 group #5 | v6 |
| 11 | Two-step confirm before a quarter commits | PR #30, BPS-001 X1 | carried (lock-in dialog with Back) |
| 12 | Year-end CQC-style rating and 256-path calibration | PR #23 | carried (rating + `tools/balance.cjs`) |
| 13 | Role objectives that conflict | PR #22 | carried |
| 14 | Threshold alerts / red lines | PR #20 | carried |
| 15 | Plain-font accessibility | v4 group #4 | carried (choice on the welcome screen) |
| 16 | Swap-in scenario pool for repeat groups | Game_Spec §8, Sam (CFO playtest) | later: every new scenario needs its own 256-route balance pass |
| 17 | Hand-vote tally / multi-team leaderboard | Game_Spec §13 | later: needs a real pilot to know if facilitators want it |
| 18 | Quarter state machine (PR #10, unmerged) | PR #10 | not needed: v5's single-file controller already guards each transition |
