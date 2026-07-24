# ENHT Simulation Game
## Full Game Specification — v1.0

*A board-level decision simulation for NHS work experience students.*
*Working title alternatives: "State of the Trust", "Critical Decisions".*

**Setting:** the fictional **Northbrook General Hospital NHS Trust** (the "N" on the boardroom sign). A fictional trust keeps the game clear of any implied comment on real ENHT performance and avoids NHS identity/branding questions.

---

## 1. Core Game Concept

The work experience group *is* the trust board. Across four quarters (one in-game year), a crisis lands on the board table each quarter. The group debates four options, commits to one, then watches a ~45-second top-down pixel simulation of Northbrook General reacting to their decision — queues growing or shrinking, staff appearing or walking out, incidents flashing over beds — while live stat tickers animate toward their new values. After Q4, the trust receives a CQC-style rating stamp: **Outstanding, Good, Requires Improvement, or Inadequate**.

One shared screen (facilitator's laptop + projector), one group decision per quarter, 30–45 minutes per full session.

**Design pillars** (these settle every scope argument later):

1. **Stats are the game; the sim is the theatre.** All outcomes are computed from data the instant the option is confirmed. The simulation is a scripted dramatisation of those numbers, not an emergent system.
2. **Every option is defensible.** No correct answers — each option is best-in-class on at least one stat and worst on another. The learning is in the argument, not the answer.
3. **Deterministic.** No dice rolls in the core game. The facilitator can predict every outcome and debrief it with confidence, and two groups making identical choices get identical results (useful for competition).
4. **Data-driven content.** Scenarios live in one editable data file. Adding a scenario means writing text and numbers, not code — so colleagues can author content.

---

## 2. Learning Objectives

Each objective is deliberately delivered by a specific mechanic:

| Objective | Mechanic that teaches it |
|---|---|
| Trade-off thinking — no free lunches | Four options per crisis, each strong on one stat and weak on another |
| Short-term vs long-term consequences | Delayed modifiers ("Burnout: −4 morale/quarter for 2 quarters") shown as ongoing-effect chips |
| Systems thinking — metrics interact | Hidden coupling rules (e.g. low morale erodes safety) revealed in the final debrief |
| Financial sustainability | A deficit worse than −£3m caps the final rating regardless of other scores |
| "Doing nothing is a decision" | Disclosed quarterly headwinds: waiting performance and budget decay unless acted on |
| Real NHS literacy | Real-world framing: RTT 18-week standard, agency spend, never events, CQC bands — with simplified numbers |
| Consensus and governance | One choice per group, a "minute the decision" confirm step, optional rotating chair role |

---

## 3. Technical Recommendation & Dependencies

**Verdict: vanilla HTML + CSS + JavaScript with the Canvas API. Zero runtime dependencies. No build step.**

Why this beats the alternatives:

- **Python/Pygame** requires an install on every machine — a non-starter on locked-down NHS estate. A browser is already there.
- **Game engines (Unity/Godot)** are overkill for a 45-second scripted theatre piece and add export/hosting friction.
- **JS frameworks (React etc.)** need a build toolchain; this project's UI is four screens and a canvas.
- Deployment becomes: *copy folder → double-click `index.html` → press F11.* Works offline, on a USB stick, on a projector.

**Constraints that shape the architecture** (learned the hard way with `file://`):

- Opening from `file://` blocks ES module imports and `fetch()` in Edge/Chrome. Therefore: **plain `<script>` tags loaded in order**, and **all data (scenarios, map, config) as global-const `.js` files**, never fetched JSON.
- Bundle fonts locally (`.woff2` in `/assets/fonts`) — no Google Fonts CDN, since trust networks may block it and the game should run offline.
- `image-rendering: pixelated` on the canvas + integer scaling for crisp chunky pixels.
- Target: 1920×1080 projector, Edge/Chrome, mouse-only. Big type throughout (readable from the back of a room).

**Dependencies: none.** Charts are hand-rolled canvas (~120 lines covers tickers + line charts). If a charting library is ever wanted, bundle Chart.js locally — but it isn't needed for the MVP.

---

## 4. File Structure

```
trust-in-balance/
├── index.html            # single page, loads scripts in order
├── css/
│   └── style.css         # layout, screens, option cards, CRT/pixel styling
├── js/
│   ├── config.js         # stat definitions, weights, couplings, headwinds, timings
│   ├── scenarios.js      # ★ ALL scenario content — the file colleagues edit
│   ├── map.js            # tile grid, room zones, waypoint graph
│   ├── state.js          # game state, stat maths, resolution order, rating calc
│   ├── screens.js        # title / decision / quarter report / final report DOM
│   ├── charts.js         # ticker cards + line charts (canvas)
│   ├── sim/
│   │   ├── engine.js     # rAF loop, 45s director timeline, event triggers
│   │   ├── agents.js     # patient/staff state machines + waypoint movement
│   │   └── render.js     # canvas drawing: static map layer + dynamic sprite layer
│   └── main.js           # boot + top-level screen state machine
├── assets/
│   ├── img/boardroom.png # your existing pixel boardroom
│   ├── sprites/          # characters.png, tiles.png, emotes.png, ui.png
│   ├── fonts/            # PressStart2P.woff2, VT323.woff2
│   └── audio/            # (stretch) click.ogg, alert.ogg, ambience.ogg
└── CREDITS.md            # asset attribution (required for LimeZu / LPC assets)
```

Notes: `scenarios.js` is deliberately the only file anyone needs to touch to add content. The static map is drawn once to an offscreen canvas; per-frame rendering only redraws agents and effects on top.

---

## 5. Game Loop & Screen Flow

Top-level state machine:

```
TITLE → TEAM_SETUP → ┌────────────── ×4 quarters ──────────────┐ → FINAL_REPORT → CREDITS
                     │ BRIEFING → DECISION → CONFIRM →          │
                     │ SIMULATION (45s) → QUARTER_REPORT        │
                     └──────────────────────────────────────────┘
```

- **TITLE:** logo, "Press start". **TEAM_SETUP:** group enters a board name (appears on the final report — small thing, big buy-in).
- **BRIEFING/DECISION:** the boardroom screen (Section 10). No timer by default; optional 3-minute discussion countdown toggleable in `config.js`.
- **CONFIRM:** "Minute the decision?" modal restating the chosen option — a governance beat that prevents misclicks and makes the choice feel weighty.
- **SIMULATION:** the 45-second theatre piece, on a director timeline:

| t (s) | What happens |
|---|---|
| 0–3 | Letterboxed banner: "Q1 · WINTER — the board has decided…" |
| 3–38 | Hospital sim runs. Stat tickers tween old → new values with easing + light visual noise. Scenario set-pieces fire at ~t8, t18, t28 as toasts + on-map events ("3 nurses off sick" / green-faced sprites leave) |
| 38–45 | Sim dims, "Quarter closed" stamp, tickers settle on final values |

- **QUARTER_REPORT:** decision recap, stat deltas with arrows, active ongoing-effect chips, mini line chart. Facilitator advances when discussion is done.
- **FINAL_REPORT:** full four-quarter line chart, decision timeline, threshold-based board commentary, then the CQC-style rating stamp reveal (Section 10).

Simulation internals: `requestAnimationFrame` with delta-time; agents advance along waypoint paths; the director checks the timeline each tick and fires events. **Facilitator hotkeys:** `S` skip sim, `P` pause, `F` show facilitator notes for the current scenario, `R` restart (with confirm).

---

## 6. Decision Mechanics

**Option archetypes.** Every scenario's four options roughly map to: **Spend** (buy the problem away), **Squeeze** (extract more from staff/assets), **Sacrifice** (trade one service/metric to protect another), **Sidestep** (creative, partial, or do-minimal). This guarantees the trade-off shape without feeling formulaic.

**What players see per option:** a label, a two-line blurb, and 2–3 honest hint badges (e.g. `££ High cost`, `Staff risk`, `Slow burn`). Immediate first-order effects are hinted; **second-order and delayed effects stay hidden** until the quarter report — that gap is where the discussion lives.

**Delayed modifiers.** Options can attach ongoing effects: `{ stat, perQuarter, quarters, label }`. These display as chips on report screens ("🔥 Burnout — morale −4/q, 1 quarter left") so consequences are visible, attributable, and teach the short/long-term lesson. *Authoring rule: Q4 scenarios use immediate effects only (nothing left for delayed effects to tick into).*

**Scenario data schema** (`scenarios.js`):

```js
{
  id: "q1_norovirus",
  quarter: 1,
  title: "Winter Pressure",
  subtitle: "Norovirus takes out 14% of the nursing workforce",
  briefing: "60–90 words, written as an email from the Director of Operations…",
  options: [
    {
      key: "A",
      label: "Bring in agency cover",
      blurb: "Fill every gap with agency nurses at premium winter rates.",
      badges: ["££ High cost", "Low risk"],
      effects:  { budget:-1.8, waiting:+1, patsat:+2, morale:+3, safety:+2, rep:0 },
      delayed:  [],   // e.g. { stat:"morale", perQuarter:-4, quarters:2, label:"Burnout" }
      simEvents:["staff_sick_exit", "agency_arrive"],
      debrief:  "Buys stability with money the trust doesn't have. Classic winter reality."
    },
    // B, C, D …
  ],
  facilitatorNotes: "Push them on: what would the staff-side unions say about D?"
}
```

**Authoring guardrails:** every option must be the *best* choice on at least one stat; total weighted value across the four options should be roughly comparable (a dominated option is occasionally fine — spin over substance being weak is itself a lesson — but never a dominant one); one option per scenario should carry a delayed effect.

---

## 7. Stats & Scoring System

Six core stats. All 0–100 except Budget (£m, −10 to +10):

| Stat | Start | What moves it | How the sim shows it |
|---|---|---|---|
| **Budget position** (£m) | 0.0 | Every choice; −£0.5/q headwind | Ticker only (MVP); litter/decor at extremes (stretch) |
| **Waiting times** (% within 18 wks) | 68 | Capacity choices; −4/q headwind | Number of patients queued in the Wait Room |
| **Patient satisfaction** | 63 | Choices + coupled to Waiting | Share of red/angry vs green/happy mood emotes |
| **Staff morale** | 58 | Workforce choices | Staff walk speed; time spent in Staff Room |
| **Safety / care quality** | 66 | Clinical-risk choices; coupled to Morale | Red "⚠ incident" flashes over occupied beds |
| **Reputation** | 60 | Public-facing choices; coupled to Budget | Press sprites at the entrance when low |

**Quarterly resolution order** (in `state.js`, in this exact order): ① apply chosen option's immediate effects → ② tick delayed modifiers → ③ apply headwinds → ④ apply couplings → ⑤ clamp to ranges.

**Headwinds — disclosed on screen every quarter:** Waiting −4, Budget −£0.5. Demand grows and costs rise; standing still is falling behind.

**Couplings — hidden during play, revealed in the final debrief:**

1. `patsat += round((waiting − 65) / 8)` — patients feel the waits.
2. `if (morale < 45) safety −= 3` — exhausted staff make mistakes.
3. `if (budget ≤ −3.0) rep −= 2` — deficits make headlines.

**Final rating.** Score `= 0.25·Safety + 0.20·Waiting + 0.20·PatSat + 0.20·Morale + 0.15·Rep`, then budget adjustment: final surplus ≥ +£1m → +5; deficit ≤ −£3m → −10.

> **⚠ Waiting is a composite access index where LOWER IS BETTER** (68 start, 100 = access collapse), as authored in `scenario-data.js` (`goodUp:false`) and built into every band, threshold, alert and objective from phases 1–4. This paragraph's formula and the caps below therefore evaluate in **rating space**, where each metric is direction-normalised so higher is always better: waiting is flipped `(min+max)−value` before it is weighted or cap-tested, and only there (`toRatingSpace` in `engine/rating.js`). An earlier draft of this section read waiting as higher-is-better and is corrected here; re-authoring waiting the other way would invalidate all of phases 1–4, so the metric definition stands and the score adapts to it.

**Caps (the sustainability lesson, enforced), all evaluated in rating space:** any core stat < 25 in rating space → capped at *Requires Improvement* (for waiting the dangerous end is **high**, so this fires when raw waiting is **above 75**, not below 25); Safety < 30 → automatic *Inadequate* (raw and rating space coincide for a higher-is-better metric); Budget ≤ −£6m → capped at *Requires Improvement* (read on raw budget). Caps only ever push a rating **down**, never up. They read the **year-end** closing position, not per-quarter minima — unlike the `floor` objectives, which latch.

| Score | Rating | Stamp colour |
|---|---|---|
| ≥ 72 | ★ OUTSTANDING | Teal |
| 52–71 | GOOD | Green |
| 34–51 | REQUIRES IMPROVEMENT | Amber |
| < 34 | INADEQUATE | Red |

Sanity check: with waiting direction-corrected, starting stats score **56.1** — `0.25·66 + 0.20·(100−68) + 0.20·63 + 0.20·58 + 0.15·60` — solidly *Good* under the rebased bands, with headroom to climb or crash. (The old table's 63.3 only held by scoring a near-critical access position as above-average; the bands are rebased so the design intent — "starting stats score solidly Good" — is preserved rather than the arithmetic.) A balanced-but-unspectacular run lands *Good*; *Outstanding* requires accepting real pain somewhere and managing it.

---

## 8. Round / Scenario Examples

Fully specced numbers for Q1 and Q2; summarised for Q3–Q4; plus a swap-in pool.

### Q1 — "Winter Pressure" (staff illness)
*Norovirus. 14% of nursing staff off. The wards are short tonight.*

| Opt | Choice | Bud | Wait | PatSat | Morale | Safety | Rep | Delayed |
|---|---|---|---|---|---|---|---|---|
| A | Agency cover at premium rates | −1.8 | +1 | +2 | +3 | +2 | 0 | — |
| B | Incentivised overtime | −0.6 | +1 | +1 | +2 | −2 | 0 | Burnout: morale −4/q × 2q |
| C | Close a ward, cancel electives | +0.2 | −9 | −5 | +1 | +5 | −4 | — |
| D | Stretch staffing ratios, carry on | 0 | +2 | −2 | −5 | −8 | −1 | Incident backlog: safety −3 × 1q |

Sim set-pieces: green-faced staff sprites exit (t8) · A: teal agency scrubs arrive (t15) · C: one ward's lights go dark, beds empty · D: hurried staff, first ⚠ flashes.
Facilitator notes: A vs B is the real agency-spend debate every trust has each winter. Ask who would defend D publicly.

### Q2 — "The Boiler Gives Out" (estates/utilities failure)
*The main plant in Utilities is condemned. Backup is holding — for now.* (Your floor plan's Utilities room becomes the set.)

| Opt | Choice | Bud | Wait | PatSat | Morale | Safety | Rep | Delayed |
|---|---|---|---|---|---|---|---|---|
| A | Full emergency replacement | −2.5 | 0 | 0 | 0 | +3 | +1 | — |
| B | Patch repair | −0.7 | 0 | 0 | 0 | −2 | 0 | Recurring faults: budget −0.6/q × 2q |
| C | Raid the ward-refurb capital pot | 0 | 0 | −4 | −3 | +3 | 0 | — |
| D | Decant services, close theatres 2 wks | −0.4 | −7 | −3 | 0 | +2 | −3 | — |

Sim set-pieces: lights-flicker overlay across the map · hi-vis engineer sprite working in Utilities · B: flicker persists faintly all quarter · D: Surgery room dark, Wait Room fills.

### Q3 — "The Elective Recovery Deal" (government waiting-list initiative)
*NHSE offers £2m tied to +20% elective activity this quarter.*
**A** Full commit, weekend lists (Bud +1.6, Wait +12, PatSat +4, Morale −6, Safety −3, Rep +3; delayed Weekend fatigue: morale −2/q × 2q) · **B** Partial, +10% (Bud +0.7, Wait +6, PatSat +2, Morale −2, Safety −1, Rep +1) · **C** Decline (Rep −4, Morale +2, PatSat −1) · **D** Outsource to a private provider (Bud −0.5, Wait +10, PatSat +2, Morale −3, Rep −2).
Sim: patient spawn rate rises; "WEEKEND LISTS" banner; extra theatre activity; D: branded private-provider sprites in Surgery.

### Q4 — "Never Event" (PR crisis)
*A retained-swab never event leaks to the local paper alongside missed sepsis screening claims.* (Immediate effects only — final quarter.)
**A** Full transparency, public apology + improvement plan (Bud −0.8, Rep +3, Safety +5, PatSat +1, Morale +1) · **B** Minimal holding statement (Rep −6, PatSat −2, Morale −2) · **C** Commission an external review (Bud −0.5, Rep −1, Safety +2, Morale −1) · **D** Counter-PR campaign, "Northbrook Cares" (Bud −1.0, Rep +1, PatSat +1, Morale −3).
Sim: press pack with camera flashes at the entrance; patients with 📰 emotes; A: press disperse by t30.

### Swap-in pool (so repeat groups can't crib answers)
Junior doctors' strike ballot · **Cyber attack** (systems down — very NHS, see WannaCry 2017) · CQC inspection announced · Heatwave A&E surge · Car-park charges row · Whistleblower goes to the press · Capital bid: second MRI vs ward refurb. Quarter tags are suggestions only; the facilitator can reorder or randomise.

---

## 9. Simulation Screen Design

```
┌─────────────────────────────────────────────┬───────────────────┐
│                                             │ BUDGET   −£1.8m ▼ │
│                                             │ WAITING   68→69 ▲ │
│         HOSPITAL CANVAS (≈70% width)        │ PAT SAT   63→65 ▲ │
│      30×17 tiles @ 32px = 960×544 int.,     │ MORALE    58→61 ▲ │
│      integer-scaled to fit, pixelated       │ SAFETY    66→68 ▲ │
│                                             │ REP          60 — │
│  toast: "⚠ 3 nurses off sick"               │ ┌───────────────┐ │
│                                             │ │ mini sparkline│ │
│  Q1 ▓▓▓▓▓▓░░░░░  0:27                       │ └───────────────┘ │
└─────────────────────────────────────────────┴───────────────────┘
```

**The map is your floor plan, encoded.** `map.js` holds a 2D char array (`#` wall, `.` floor, `B` bed, `D` desk, `W` waiting chair, `M` MRI, `S` surgery slot…) plus a zone/waypoint list:

| Zone (from your plan) | Role in sim | Capacity |
|---|---|---|
| NW wing: Back Room, Bed ×2, Maternity | General + maternity wards | 2 beds each |
| NE wing: Utilities, Back Room, Staff Room, Canteen | Staff areas + estates set-piece location | — |
| Centre: Reception Desk · small W room → "Manager's Office" · Wait Room (E) | Patient intake + queue | Desk 1, Wait 8 chairs |
| SW wing: Bed ×4 | Main wards | 2 beds each |
| SE wing: Bed, MRI, Bed, Surgery | Diagnostics + theatres | MRI 1, Surgery 1 |
| **Addition needed:** main entrance — double doors, bottom-centre of the corridor | Spawn/exit + press/picket location | — |

**Agents** (waypoint graph movement — predefined node paths between rooms; no pathfinding needed for MVP):

- **Patient lifecycle:** spawn at Entrance → Desk → sit in Wait Room → assigned Bed/MRI/Surgery → treated (mood emote overhead) → exit. Visual queue length steers toward `clamp((100 − waiting)/6, 2, 14)`; agents spawn/despawn to approach the target, so the room visibly fills or clears as the stat moves.
- **Staff** (doctor white coat, nurse NHS-blue scrubs, porter): loop between Staff Room, Desk and ward waypoints; pause at occupied beds (♥ particle). `staffSpeed = 0.8 + morale/250`; low morale means slower walks and longer Staff Room stops. Headcount is set per-scenario (strike/illness events remove or add sprites).
- **Set-piece extras:** hi-vis engineer, teal agency nurse, press with camera flash, picketer with placard.

**Stat → sim parameter mapping** (the whole "theatre" contract):

| Stat | Drives |
|---|---|
| Waiting | Wait Room queue target |
| Morale | Staff speed + break frequency |
| Safety | ⚠ flash rate over beds ≈ `max(0, 70 − safety)/12` per 30s |
| PatSat | % of red vs green mood emotes |
| Rep | Press sprites at entrance when < 45 |
| Budget | Ticker only (MVP) |

Rendering: two layers — static map pre-drawn to an offscreen canvas; agents/effects/flicker drawn per frame on top. ~40 agents max; performance is a non-issue. Whole hospital fits on screen at once (matches your plan), so no camera/scrolling code at all.

---

## 10. Decision & Report Screen Design

**Decision screen** — your boardroom image is the star:

```
┌────────────────────────────────────────────────────────────────┐
│ £0.0m — │ Wait 68 ▼ │ Sat 63 │ Morale 58 │ Safety 66 │ Rep 60  │  ← persistent stat strip
├────────────────────────────────────────────────────────────────┤
│              [ boardroom.png — slow Ken Burns pan ]            │
│         Q1 · WINTER PRESSURE — norovirus hits the wards        │
├────────────────────────────────────────────────────────────────┤
│  Briefing (styled as an email from the Director of Ops)…       │
├───────────────┬───────────────┬───────────────┬────────────────┤
│ A · Agency    │ B · Overtime  │ C · Close a   │ D · Stretch    │
│ cover         │ bonus         │ ward          │ the ratios     │
│ ££ High cost  │ £ Med cost    │ Waits ▼▼      │ No spend       │
│ Low risk      │ Slow burn     │ Rep risk      │ Safety risk    │
└───────────────┴───────────────┴───────────────┴────────────────┘
```

Your boardroom PNG is a very wide banner (~3.5:1), so it sits as a hero strip with a blurred, darkened copy of itself filling behind — no awkward cropping. **Faking the "looping video":** a 20-second CSS Ken Burns pan-zoom, a 2-frame flicker on the N sign, and an optional CSS scanline overlay. Reads as alive, costs kilobytes, works offline. (A real looping `.mp4` is a drop-in later if ever wanted.)

**Quarter report:** chosen option restated → six delta rows with arrows → ongoing-effect chips → sparkline per stat.

**Final report:** four-quarter line chart (all six stats) → decision timeline → threshold-based board commentary ("Your staff would follow you anywhere — shame about the money") → then the reveal: screen dims, drumroll pause, and the rating **stamps down** with a screen shake (`INADEQUATE` in red should sting; `OUTSTANDING` in teal should feel earned). Include a print stylesheet so `Ctrl+P` produces a one-page takeaway certificate with the board's name on it.

---

## 11. Visual & Audio Assets — What's Needed & Where From

**Needed:** ~8–10 character sprites (doctor, nurse, patient ×3 gowns, porter, engineer, agency nurse, press, picketer) with 4-direction × 3–4-frame walk cycles · ~20 tiles (floor, wall, bed, desk, waiting chair, MRI, surgery table, plants, doors) · 6–8 mood emotes (8×8) · UI 9-slice panel + arrows + stat icons · 4 CQC rating stamps · your boardroom PNG.

**Sources (all engine-free, all legal):**

- **LimeZu — "Modern Interiors"** (itch.io): the closest match to the Escapists-adjacent chunky top-down feel. 16/32px interiors *including hospital objects* (beds, medical kit) plus walking characters. Free tier with attribution; a few dollars unlocks everything; non-commercial use is fine. **Primary recommendation.**
- **Kenney.nl** (CC0): roguelike/RPG indoor packs, UI packs, icon packs. Zero-attribution, zero-friction licensing — ideal inside the NHS. Good fallback and UI source.
- **Universal LPC Spritesheet Generator** (sanderfrenken.github.io): compose doctors/nurses/patients with full walk cycles in-browser and export a PNG. CC-BY-SA/GPL → list contributors in `CREDITS.md`.
- **Piskel** (free, browser): draw the bespoke bits — CQC stamps, emotes, the picket sign.
- ⚠ **The Escapists itself:** Team17's commercial IP — sprite rips exist online but don't ship them, even internally. The packs above get the same look legitimately.

**Fonts:** *Press Start 2P* (headers/stamps) + *VT323* (body) — both SIL OFL; download and bundle locally.

**Audio (optional, stretch):** Kenney's UI audio pack (CC0) for clicks/alerts; a CC0 ambient loop from freesound; a tannoy "ding" before toasts. **Muted by default** — projector setups are unpredictable and the facilitator is talking over it anyway.

---

## 12. MVP Scope — Three Build Phases

Each phase is one or two focused Claude Code sessions, and each ends *runnable* — so even if you stop after Phase A, the workshop still works.

**Phase A — "Playable ugly" (the actual MVP core).** Full screen flow, all stat maths (resolution order, headwinds, couplings, rating + caps), 4 scenarios with real numbers, tickers and line charts, quarter + final reports with stamp text. The "sim" is a static image of the floor plan with tickers animating for 20s. *Acceptance test: a complete 4-quarter session runs end-to-end from `file://` on a trust laptop, on a projector, with no console errors.*

**Phase B — "Living hospital."** Tile map from your floor plan, agents as coloured shapes with role labels moving on waypoints, patient lifecycle, queue-target logic, the 45s director timeline, 3 set-pieces per scenario, toasts. *Acceptance: an observer can tell which option was picked purely from watching the sim.*

**Phase C — "Escapists dressing."** Sprites + walk animations, mood emotes, boardroom Ken Burns + N-sign flicker, stamp-slam animation, screen transitions, sound toggle, print certificate. *Acceptance: a 15-year-old says "oh nice" unprompted.*

**Explicitly NOT in MVP:** audio, A* pathfinding, random events, save/load, multiple simultaneous teams, difficulty settings. Realistic effort at spare-time pace: A ≈ 1–2 evenings, B ≈ 2–3, C ≈ 2. Comfortably a two-week side project.

---

## 13. Stretch Features

- **Advisor voices** (cheap, high teaching value): on option hover, one-line takes from a pixel CFO, Medical Director and HR Director — three lenses on every choice, pure content in `scenarios.js`.
- **Multi-team leaderboard:** deterministic scoring means two groups' final ratings are directly comparable; a simple results screen ranks board names.
- **Scenario randomiser + difficulty:** draw 4 from the pool; "hard mode" = stronger headwinds, tighter budget.
- **Hand-vote tally:** facilitator keys in votes per option before confirming — makes dissent visible for the debrief.
- **A\* pathfinding, ambulances at the entrance, day/night tint, litter-when-broke** — sim flavour.
- **Random micro-events** (±3 wildcards) once groups know the deterministic version.
- **Historical mode:** replay real(ish) events — WannaCry, winter 2017/18 — with a "what actually happened" debrief card.

---

## 14. Facilitator Toolkit

- **Suggested session script (40 min):** 5' intro & roles → 4 × (3' discussion + 1' sim + 2' quarter-report reactions) → 10' final report + coupling reveal + debrief.
- **Hotkeys:** `S` skip sim · `P` pause · `F` facilitator notes overlay for the current scenario · `R` restart.
- **Rotate a "Chair"** each quarter who must summarise the argument and call the vote — stops one loud voice running the board.
- **Debrief prompts live in the data** (`facilitatorNotes`), surfaced with `F` — e.g. "Would you have defended option D to the local paper?"
- Two-group competition: run sessions back-to-back or on two laptops; compare stamps.

---

## 15. Risks & Gotchas

- **`file://` quirks** — the plain-script-tag + data-as-JS architecture exists *because* of this. Test on an actual trust laptop in Edge during Phase A, not at the end.
- **Asset licences** — LimeZu/LPC require attribution: keep `CREDITS.md` and a small credits screen. Kenney (CC0) needs nothing. Never ship Escapists rips.
- **Branding** — fictional Northbrook General throughout; don't use the real trust logo or imply real performance data.
- **Scope creep on the sim** — the moment someone says "shouldn't the patients *actually* affect the stats?", point at Pillar 1. The sim is theatre.
- **Group dynamics** — the Chair rotation and hand-vote features exist to manage the one student who wants to speedrun it.

---

*End of specification v1.0 — next step: Phase A build session.*
