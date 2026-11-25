# Trust in Balance

A pixel-art board game in the browser for NHS work experience and team workshops. Players run Northbrook General, a fictional hospital, for one year: four crises, one decision each, six board roles whose goals pull against each other, and three red lines that must never break.

The reports are the game: players read RPG-style stat bars that show the pressure already coming, watch the board table react to each proposal, predict the hit by tapping a bar, watch the hospital and a money waterfall play out step by step, and get a *Northbrook Gazette* front page every quarter. The year ends with an inspection stamp, a balance chart and a wall of front pages.

**Play:** download or clone the folder and double-click `index.html` in Edge or Chrome. Keep `src` and `assets` next to it. It needs no install, no account, no server and no internet connection. For a projector, use F11.

## A session

| | Group (3–6 players, one screen) | Solo |
|---|---|---|
| Time | about 45 minutes | about 15 minutes |
| Setup | "A group round one screen", give each player a role (or select all six) | "Just me", pick one role |
| Facilitator | Turn on **Facilitator** in the top bar: each quarter shows a prompt and a timer | Not needed |

Each quarter:

1. **A crisis hits.** A title card over the live hospital, three pieces of evidence and the board pack. The stat bars show where each measure is, its red-line notch, and (striped) the pressure already coming whatever you do.
2. **Argue, then pick a proposal.** Each illustrated card shows its cost in coins: now, later and ongoing. Highlighting one makes the board react (YES! / NO! / HMM) based on each role's own measure. The rest of the effects are hidden: that is the judgement.
3. **Lock it in with two taps:** tap the stat bar you expect to take the biggest hit, and pick who checks on it. Calling it right earns +2 confidence next quarter.
4. **Watch it play out.** The camera zooms into your decision, then steps through anything agreed earlier, any regulator response, outside pressure and knock-on effects, with the stat bars and a money waterfall building as you go. If you misclick, the lock-in screen has a Back button: there is no undo once the replay starts. At the end the Gazette prints, the verdict stamps land, and **What if we'd chosen…** shows the alternate timeline.

At year-end: an inspection stamp over a hospital that celebrates or hosts inspectors, a headline, a balance radar (start vs end), red-line badges, and tabs for the four front pages, the journey heat-strip, the board, next year's invoice and a four-question learning check.

See [docs/FACILITATOR.md](docs/FACILITATOR.md) for a printable crib, timings and what to watch for. **Facilitator notes → Print role cards** prints one card per role.

## What it teaches

| Idea | Where players meet it |
|---|---|
| Who pays for a decision | Stances on each option; role goals that conflict; "What if we'd chosen…" |
| Costs over time | Commitments that land next quarter; ongoing costs into next year; a money forecast that counts what is already committed |
| Knock-on effects | Workforce below 50 hurts safety, access below 42 crowds corridors, a deficit beyond £3.5m worries the public: each one shown as its own replay step |
| Owning a decision | Predict the biggest hit, name the right reviewer, see the review callback next quarter |

## The rules

Red lines, knock-on effects and the foresight credit live in the `rules` object in `src/content.js`; role targets sit with each role in the same file; status bands are in `engine.band`.

- **Red lines** (checked at every quarter end): safety ≥ 55, access ≥ 35, deficit no worse than £5.0m. Breaking one brings a regulator response the next quarter and caps the year-end rating at *Requires improvement* (two or more: *Inadequate*).
- **Roles:** each has three goals weighted 3/2/1. One is a headline target, one a never-below line, and one belongs to a colleague. A role is satisfied when it meets its headline goal and at least one other. No route through the year satisfies all six.
- **Rating:** the average role score of the players at the table, capped by red-line breaches.

## Changing the numbers

Edit `src/content.js`, then run:

```
npm run balance     # plays all 256 possible years and checks the design targets
npm test            # engine rules, including that every balance check passes
```

`tools/balance.cjs` checks the targets an independent reviewer set:
- every option is the best choice for at least one role, and within 12% of its quarter's average
- no simple strategy beats 60% of years (always A/B/C/D, and every spend rank, by total cost and by cost now)
- red lines break in 20–40% of years, from at least four causes
- at least three pairs of roles conflict
- every goal can be met and missed

## Development

No build step. Plain HTML, CSS and JavaScript, loaded with `defer` so it works from `file://`. Fonts (DotGothic16, Tiny5, VT323, Press Start 2P) are bundled under the SIL Open Font License; the **Aa** button switches to a plain system font for anyone who finds pixel type hard to read.

```
src/content.js   scenario text, roles, rules, quiz items, facilitator notes, word list
src/engine.js    pure, deterministic model (no DOM): ledger, red lines, scoring, rating
src/pixel.js     canvas pixel art: hospital, 16 option scenes, crisis dressings, previews, title, portraits
src/views.js     HTML templates (pure functions)
src/app.js       state, saving, events, focus
tools/balance.cjs  balance report and design checks
tests/           node:test engine tests and a Playwright browser smoke test
```

```
npm ci
npm test
npx playwright install chromium   # once
npm run test:browser              # or PW_EXECUTABLE=/path/to/chrome npm run test:browser
```

Progress saves in the browser's local storage on the device. The game makes no network requests. All people, places and figures are fictional.

## History

Version 3 merges two earlier builds: the original pixel-art *Trust in Balance* (live hospital, role objectives, realistic board pack) and the *Northbrook Boardroom* rewrite (carry-forward ledger, counterfactuals, learning checks). It was then rebuilt twice from independent reviews and simulated playtests, the second time as a full pixel-art visual overhaul. See [docs/REVIEW.md](docs/REVIEW.md) for the scores and what is still unproven.
