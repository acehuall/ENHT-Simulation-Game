# Design: Simulation Timelines from Resolved Outcomes

Status: **implemented** (branch `simulation-timelines-from-outcomes`). This
document is kept as the architectural reference; §9's invariants are enforced
at runtime by `runTimelineSelfTest()` in `src/debug/timeline-selftest.js`.
Constraint: everything described here stays plain-JS globals loaded by ordered
classic `<script>` tags (no modules, no build step, runs from `file://`).

Implementation deltas from the original design:

- The visual-cue interpreter lives in its own file,
  `src/engine/timeline-visuals.js`, rather than inside `render()` /
  `agent-renderer.js`.
- The board report is split three ways: `src/ui/report-view.js` (pure
  rendering), `src/ui/report-overlay.js` (modal state and wiring), and
  `src/engine/decision-controller.js` (decision guards, applying decisions,
  quarter progression).
- Decisions are stored per quarter in `GAME.decisionByQuarterId` (not a
  single `GAME.lastOutcome`); `getPlaybackOutcomeForQuarter()` picks the
  most recent prior decision for whichever quarter is playing.
- Q2–Q4 quarter data and drama profiles exist for every option; unknown
  quarter/option ids log a console warning before falling back.

---

## 1. Problem

Today the simulation *invents* the story instead of *retelling* one:

- `STAT_EVENTS` (`src/data/scenario-data.js`) is a single fixed script —
  norovirus at t=8, **"Agency cover arrives"** at t=18, Ward 4 incident at
  t=28 — replayed every quarter. If the board chose *Rapid Discharge*, the
  sim still shows agency cover arriving and still credits its stat effects.
- `render()` (`src/engine/simulation.js`) hard-codes visual theatre: the
  Ward 4 incident flash at t=28–35, the mood emote on a `clock%7` cycle
  (unrelated to actual PatSat), the fixed toast schedule.
- `syncQuarterControls()` (`src/ui/controls.js`) hard-codes the banner text
  `"the board has decided: AGENCY COVER"`.
- `chooseOption()` (`src/report/round-end-report.js`) only updates report
  text. `GAME.lastOutcome` and `GAME.selectedOptionId` exist in
  `game-state.js` but are never written, so a decision never reaches the sim.

Result: stat movement and on-map events can contradict the decision the
player just made.

## 2. Core concept

Split the pipeline into three stages with a one-way data flow:

```
  RESOLVE                COMPILE                    PLAY BACK
  (board room)           (pure function)            (dumb renderer)

  option chosen   ──▶   compileTimeline(outcome)  ──▶  metrics engine reads
  endStats fixed         produces TIMELINE              TIMELINE.statEvents;
  GAME.lastOutcome                                      render() draws
                                                        TIMELINE.visualEvents
```

**Rule 1 — the sim never decides stat movement.** All *net* stat change comes
from the resolved outcome. The compiler may add drama (dips and recoveries)
but every drama offset is zero-sum, so the quarter always lands exactly on
`endStats`.

**Rule 2 — the sim never shows an unscripted event.** `render()` draws only
what the compiled timeline (plus the quarter's ambient layer, §6) tells it to.
No visual can contradict the decision because every decision-related visual
is generated *from* the decision.

**Rule 3 — deterministic.** Compilation is a pure function of
`(outcome, quarterConfig)`. Any randomness uses a seed hashed from
`quarterId + optionId`, so scrubbing, restarting, and replaying a quarter
always produce the identical timeline.

## 3. Data shapes

### 3.1 Resolved outcome (produced in the board room)

Created the moment the player confirms an option; stored on
`GAME.lastOutcome` and pushed to `GAME.decisions`.

```js
/* resolveOutcome(quarter, option) -> */
{
  quarterId:  'Q1',                       /* quarter the decision closed   */
  optionId:   'hire_temporary_staff',
  optionTitle:'Hire Temporary Staff',
  decisionSummary: '...',                 /* from quarters-data.js         */
  startStats: {budget:0, waiting:68, ...},/* stats before the decision     */
  endStats:   {budget:-1.8, waiting:73, ...} /* start + effects, clamped   */
}
```

`endStats` is computed **once**, here, by `resolveOutcome()` (new function in
`game-state.js`): `clamp(startStats[k] + option.effects[k])` per metric.
Nothing downstream ever recomputes or adjusts it.

### 3.2 Compiled timeline (consumed by engine + renderer)

One global, `TIMELINE`, replaced wholesale at quarter start:

```js
{
  quarterId: 'Q2',                  /* the quarter now being played        */
  outcome:   {...},                 /* the resolved outcome it dramatizes  */
  banner:    {quarterLine:'Q2 · CAPACITY STRAIN',
              decisionLine:'the board has decided: HIRE TEMPORARY STAFF'},

  statEvents: [                     /* same shape metrics.js already eats  */
    {t:8,  name:'Flu admissions climb', toast:'&#9888; ...',
     effects:{waiting:+6, morale:-3, ...}},
    {t:16, name:'Agency staff arrive',  toast:'&#10010; ...',
     effects:{budget:-1.8, waiting:-4, ...}},
    {t:28, name:'Overtime bill lands',  toast:'...', effects:{...}}
  ],

  visualEvents: [                   /* typed cues, see §5 vocabulary       */
    {t0:0,  t1:45, type:'patientSurge',  mult:1.6, tint:'ill'},
    {t0:16, t1:45, type:'extraStaff',    role:'nurse', count:3,
                   entrance:'mainDoor'},
    {t0:28, t1:33, type:'signage',       tile:[26,4], text:'£'}
  ]
}
```

Invariant enforced by the compiler (and assertable in a debug check):

```
for every metric k:
    Σ statEvents[i].effects[k]  ===  endStats[k] − startStats[k]
```

`TOASTS` stops being a global derived from `STAT_EVENTS`; toasts come from
`TIMELINE.statEvents` exactly as they do today (same `{t, msg}` mapping).

## 4. The compiler — `src/engine/timeline-compiler.js` (new file)

`function compileTimeline(outcome, quarterEvent) { ... return timeline; }`

### 4.1 Beat structure

Every quarter dramatizes as three beats on the existing 45 s clock
(`QLEN`), finishing before the t=38 quarter-close stamp:

| Beat | t (approx) | Meaning |
|------|-----------|---------|
| **Pressure** | 6–10 | The quarter's ambient pressure bites (from `quarterEvent.pressureEvents` flavour: norovirus for Q1, bed-blocking for Q2, front-page story for Q3, cold snap for Q4). |
| **Response** | 14–18 | The board's decision visibly lands (agency staff arrive / clinics slow / discharge push / diverts begin / press briefing held). |
| **Consequence** | 26–30 | The cost or payoff of the decision (overtime bill, waiting-list letter, complaint, praise). |

Beat times get a small deterministic jitter (±2 s from the seeded RNG) so
quarters don't feel like carbon copies.

### 4.2 Splitting the resolved delta across beats

For each metric `k`, let `delta_k = endStats[k] − startStats[k]`. Each option
carries a **dramatization profile** (data, §4.3) giving per-beat weights
`w_b,k` with `Σ_b w_b,k = 1`, plus zero-sum drama offsets `o_b,k` with
`Σ_b o_b,k = 0`:

```
effects_b,k = delta_k * w_b,k + o_b,k
```

- The weights shape *where* the movement happens (e.g. for
  `hire_temporary_staff`, most of the safety gain lands in the Response
  beat, all of the budget hit in Consequence).
- The offsets are pure theatre — e.g. Pressure pushes waiting +6 and
  Response pulls it back −6 on top of the real delta — so the chart bends
  and dips like it does today, but the endpoint is mathematically pinned to
  `endStats`.
- After computing all beats, the compiler runs a clamp pre-check: replay the
  cumulative values against each metric's `min/max`; if an intermediate
  value would clamp (which would break the sum invariant, because
  `metrics.js` clamps at snapshot time), scale that metric's offsets down
  until it fits.

### 4.3 Dramatization profiles — `src/data/outcome-drama-data.js` (new file)

Pure data keyed by `optionId`, with a `_default` fallback so a new option is
never blocked on drama authoring:

```js
var OUTCOME_DRAMA = {
  hire_temporary_staff: {
    beats: [
      {slot:'pressure',    name:'Staff sickness bites',
       toast:'&#9888; 3 nurses off sick', weights:{waiting:0.6, morale:0.5},
       offsets:{waiting:+5, safety:-3}},
      {slot:'response',    name:'Agency staff arrive',
       toast:'&#10010; Agency cover arrives',
       weights:{safety:0.8, patsat:0.7, morale:0.5, waiting:0.4},
       offsets:{waiting:-5, safety:+3}},
      {slot:'consequence', name:'Agency invoice lands',
       toast:'&#163; Agency costs hit the budget',
       weights:{budget:1.0, rep:1.0, /* remainder */}}
    ],
    visuals: [ /* see §7 */ ]
  },
  slow_non_essential_care: { ... },
  rapid_discharge:         { ... },
  divert_to_other_trusts:  { ... },
  _default: { /* generic pressure/response/consequence with even weights */ }
};
```

Unlisted weight remainders are assigned to the Consequence beat so columns
always sum to 1. Note the "Agency cover arrives" beat now exists **only**
inside `hire_temporary_staff` — it can never appear for another choice,
which is the whole point.

### 4.4 Q1 first run (no prior decision)

The very first quarter has no resolved outcome to dramatize. Rather than
special-casing the engine, `scenario-data.js` defines a **scripted default
outcome** — effectively today's opening story converted into the new shape:

```js
var DEFAULT_OUTCOME = {
  quarterId:'Q0', optionId:'status_quo', optionTitle:'Status Quo',
  startStats:{budget:0, waiting:68, patsat:63, morale:58, safety:66, rep:60},
  endStats:  {budget:-1.8, waiting:69, patsat:65, morale:61, safety:68, rep:60}
};
```

`main.js` boots with `TIMELINE = compileTimeline(DEFAULT_OUTCOME,
QUARTER_EVENTS.Q1)`. One pipeline, zero special cases downstream. The
existing `STAT_EVENTS` global is then deleted (its numbers live on as the
`status_quo` drama profile); the legacy `TICKS` table goes with it.

## 5. Visual event vocabulary

`render()` gains one small interpreter that replaces every hard-coded
theatre block: each frame it walks `TIMELINE.visualEvents`, and for each cue
where `t0 <= simT < t1` calls the matching draw/spawn helper. Cue types
(initial set — each is a small function in `agent-renderer.js` /
`prop-renderer.js`):

| Type | Params | Draws |
|------|--------|-------|
| `patientSurge` | `mult`, `tint` | Extra patient agents spawned at quarter start (see §6 Q1); optional illness tint via existing `getPatientVisualState` path. |
| `extraStaff` | `role`, `count`, `entrance`, `t0` | New nurse/doctor agents walk in through the main door at `t0` and join ward loops. |
| `staffExit` | `role`, `count`, `t0` | Staff visibly leave (for cuts/slowdown options). |
| `wardIncidentFlash` | `tile`, `t0`, `t1` | Today's warning-triangle flash, at an arbitrary tile — emitted only when the timeline contains an incident beat. |
| `pressScrum` | `count`, `flashLights` | Reporter NPCs outside the entrance (§6 Q3) with camera-flash pulses. |
| `pressBriefing` | `tile`, `t0` | Podium + suit NPC + reporters clustered facing it: the visible "we held a press conference" cue. |
| `signage` | `tile`, `text`, `t0`, `t1` | Small pixel sign/banner (e.g. "CLINIC CLOSED", "£"). |
| `ambulanceDivert` | `t0` | Ambulance pulls up, pauses, drives off-screen without unloading. |
| `dischargeStream` | `count`, `t0` | A stream of patient agents walking out the exit. |
| `snowfall` | — | Q4 ambient particle overlay. |
| `moodEmote` | (none — metric-driven) | The seated patient's emote reads `getMetricValue('patsat')` against a threshold (~60) instead of the current `clock%7` cycle, so the face agrees with the chart. |

Two hard-coded blocks in `render()` are *kept* as pure ambience because they
carry no story meaning: the N-sign flicker and the EKG.

## 6. Quarter ambient layers (decision-independent)

These extend `QUARTER_EVENTS` (`src/data/quarter-events.js`) — they belong to
the quarter itself and appear regardless of any decision. The compiler
copies them into `TIMELINE.visualEvents` (t0=0, t1=QLEN) so the renderer
still has a single list to walk.

New per-quarter fields: `ambientVisuals:[...cues]`, `patientSpawnMult`.

| Quarter | Ambient layer |
|---------|--------------|
| **Q1 — Infection Pressure** | `patientSpawnMult: 1.5` — extra patient agents spawn on the existing entrance→triage paths (staggered `startAt`, reusing `agents-data.js` path templates). A portion (~half) spawn with the **ill condition and green tint** — the `patientIllnessTint` / `getPatientVisualState()` machinery already does the tinting; the new part is the spawn multiplier. Waiting-row chairs visibly fuller. |
| **Q2 — Capacity Strain** | `patientSpawnMult: 1.3`, plus corridor trolley-bed props along the main corridor and a queue cue at the entrance. No illness tint. |
| **Q3 — Media Pressure** | The two existing reporter NPCs become a `pressScrum` cue with `count:4` and `flashLights:true` — **white camera-flash pulses** (1-frame bright rects at seeded intervals, ~every 1.5–3 s per reporter) plus a news-van prop at the road edge. |
| **Q4 — Winter Surge** | `snowfall` overlay, `patientSpawnMult: 1.6`, ambulance arrivals more frequent, entrance-path patients in coats (palette swap). |

## 7. Decision visual layers (from the chosen option)

Each drama profile in `OUTCOME_DRAMA` carries a `visuals` list; the compiler
stamps beat times into them (a visual anchored to `slot:'response'` gets that
beat's compiled `t`). This is where "the sim shows what you chose" lives:

**Q1 options:**

| Option | Visuals |
|--------|---------|
| Hire Temporary Staff | `extraStaff {role:'nurse', count:3}` at the Response beat — **three new nurses walk in the main door** and station in wards; ill-patient tints fade faster (treatment capacity up). |
| Slow Non-Essential Care | `signage {"CLINIC CLOSED"}` on the outpatient wing + `staffExit` from that wing; its waiting chairs empty out. |
| Rapid Discharge | `dischargeStream {count:4}` — visible run of patients exiting; beds flip to empty sooner. |
| Divert to Other Trusts | `ambulanceDivert` — ambulance arrives, waits, leaves without unloading; fewer entrance spawns in the back half of the quarter. |

**Q3 options** (option data for Q2–Q4 doesn't exist yet in
`quarters-data.js` — this table is the authoring target for when it does):

| Option (indicative) | Visuals |
|--------|---------|
| Hold Press Briefing | `pressBriefing` at the Response beat — podium outside the entrance, reporters cluster and face it, flash frequency spikes then **scrum disperses** (t1 on the `pressScrum` cue pulled earlier). Toast: "Trust statement published". |
| Ignore / No Comment | Scrum persists all quarter, flash rate ramps up toward the Consequence beat; `signage` newspaper-front-page prop at t≈28. |
| Restrict Access | Security NPC at door; reporters pushed back a tile; occasional flash through windows. |

The same pattern extends to Q2 (capacity options → beds/portacabin props)
and Q4 (winter options → gritters, extra ambulances, discharge lounge).

## 8. Integration changes (file by file)

| File | Change |
|------|--------|
| `src/data/outcome-drama-data.js` | **New.** `OUTCOME_DRAMA` profiles (§4.3). |
| `src/engine/timeline-compiler.js` | **New.** `compileTimeline()`, seeded RNG helper, sum/clamp checks. |
| `src/data/scenario-data.js` | `STAT_EVENTS`, `TOASTS`, `TICKS` deleted; `DEFAULT_OUTCOME` added; `METRIC_DEFS` keeps defs but `start` becomes "new-game default" only. |
| `src/engine/metrics.js` | `_metricSnapshotAt()` reads `TIMELINE.statEvents` and bases each metric on `TIMELINE.outcome.startStats[k]` instead of `def.start`. Everything else (ramp, history, sampling) unchanged. |
| `src/engine/simulation.js` | Ward-4 flash, mood-emote cycle, toast lookup replaced by the visual-event interpreter + `TIMELINE`-driven toasts. |
| `src/ui/controls.js` | `syncQuarterControls()` banner text from `TIMELINE.banner` (kills the hard-coded "AGENCY COVER"). Quarter selector: switching quarter recompiles the timeline from the stored outcome for that quarter (or `DEFAULT_OUTCOME`). |
| `src/report/round-end-report.js` | On confirm: `resolveOutcome()` → `GAME.lastOutcome` / `GAME.decisions` / `GAME.stats = endStats` → advance quarter → `TIMELINE = compileTimeline(...)` → close report → `seekSimulation(0)`. |
| `src/engine/game-state.js` | `resolveOutcome(quarter, option)` added; it is the **only** place `endStats` is computed. |
| `src/data/quarter-events.js` | `ambientVisuals`, `patientSpawnMult` fields (§6). |
| `src/engine/agent-renderer.js` / `prop-renderer.js` | Draw helpers for the new cue types (flash pulses, podium, signage, ambulance, snow). |
| `index.html` | Script order: `outcome-drama-data.js` after `quarters-data.js`; `timeline-compiler.js` after `metrics.js`, before `simulation.js`. |

## 9. Invariants (testable by eye / debug console)

1. `Σ effects === endStats − startStats` per metric — compiler throws (or
   `console.warn`s) if violated.
2. At `simT = QLEN`, every ticker equals `endStats` exactly.
3. Grep-level check: no `t===28`-style literals or event names left in
   `simulation.js`; no option title appears outside data files.
4. Choosing option B then scrubbing the next quarter never shows an
   option-A visual or toast.
5. Replaying the same quarter twice renders an identical timeline
   (determinism).
