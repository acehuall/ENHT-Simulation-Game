# Reporting model — design notes

Design reasoning for `src/data/reporting-model.js` and the finance half of
`src/ui/report-view.js`.

The source file keeps short comments that say *what a rule is* and warn against
reversing it. This document holds the *why*: the measurements, the alternatives
that were tried and rejected, and the defects each decision exists to prevent.
When the two disagree, the source is authoritative about behaviour and this
document is authoritative about intent.

Section numbers are referenced from the source, e.g. `see design notes §4`.

---

## 1 · What the layer is

A pure derivation layer turning the six board metrics (`budget`, `waiting`,
`morale`, `safety`, `patsat`, `rep`) into plausible NHS operational figures for
the Performance Analysis page of the board pack.

Constraints that are not negotiable:

- **ES5, vanilla, no build step, must run from `file://`.** No modules, no
  `let`/`const`/arrow functions/template literals in `src/`. Scripts load in
  order via `<script>` tags.
- **Load order.** `reporting-model.js` loads *after* `metric-semantics.js` (it
  needs `getMetricDef` / `getMetricBand`) and *before* `quarters-data.js`.
- **Rounding never enters derivation.** Every figure is a float;
  `report-view.js` rounds for display.
- **All tuning lives in `REPORTING_COEFFS`.** No magic numbers in function
  bodies.
- **Pure and deterministic.** No RNG, no DOM, no reads of live `METRIC_CUR`, no
  writes back into `stats`.

Direction is stated explicitly per figure rather than inferred from `goodUp`.
The single biggest risk in this file is a sign flip, because `waiting` worsens as
it rises while every other metric improves as it rises.

`ctx = {quarterId, optionId, outcome, history}` is the report snapshot, and is
optional. With a null ctx, derivation runs with no overrides and no authored
addends, so every figure sits exactly on its base.

### Blast radius

`deriveWorkforce`, `deriveOperational`, `deriveQuality`,
`deriveIncomeExpenditure`, `getReportSection` and `getOccupancyGauge` are
consumed by exactly one file, `src/ui/report-view.js`. Year-end scoring,
`report-infographics.js`, `metric-pressure.js` and `rating.js` do not read them.

---

## 2 · The calibration basis: player-visible snapshots

Every measured figure quoted in the source or here is measured on the
**player-visible snapshot set**, not on a synthetic sweep and not on every
derivable state.

The decision tree has 4 quarters × 4 options = 256 legal paths, each with 4
quarter closes, so 1024 snapshots are derivable. **Only 768 of them are ever
rendered.** A board pack reports the outcome of the quarter *before* the one it
asks about, so across a complete game a player reads the Q0 baseline and the Q1,
Q2 and Q3 closes. Confirming the Q4 decision opens the Year End overlay instead
of a fifth pack, and that overlay carries no derived operational or workforce
figures.

This is not a pedantic distinction. Calibrating on all four closes flatters the
model with a quarter of compounding nobody sees, and it once let an authored Q4
winter term of +26 beds carry a figure's clamp-utilisation number while being
invisible in play. Re-measured on the visible set, that revision's headline
figures were materially worse than reported: delayed transfers 57% of clamp → 45%,
and 3 bands reached → 2.

The suite asserts on the visible set and prints the full set alongside for
comparison. A separate test walks a complete game and asserts the quarters a pack
ever reports are exactly Q0–Q3, so if a later change adds the Q4 pack or an
operational section to the Year End overlay, it fails and points at the
calibration basis rather than silently changing it.

### Why the sample must carry its `ctx`

The exogenous and mechanism terms are ctx-keyed, so a figure evaluated with
`ctx = null` is a *different figure* from the one the board sees. Calibration and
correlation are both computed as `derive*(node.stats, node.ctx)`. Sampling with a
null ctx is the specific mistake that makes the DTOC work look ineffective and
hides a broken override interaction.

### Why per-metric envelopes are not a path

Taking the best and worst option per quarter per metric gives extremes that are
**not simultaneously attainable** — the options that damage one metric often
protect another. Measured: the worst-morale node has morale 37 and rep 44, not
33; the worst-rep node has rep 33 and morale 57, not 37. The lowest jointly
attainable `(morale − 58) + (rep − 60)` is −38, where multiplying the independent
extremes gives −48, a 21% overstatement. Any figure with two or more drivers must
be calibrated on the reachable node set, never by multiplying out an envelope
table.

---

## 3 · The layering rule (X9 / X10)

    LAYER 1  (_deriveAnchors)   reads SOURCE METRICS ONLY
               occupancy   <- waiting
               vacancyRate <- morale, budget
    LAYER 2  (everything else)  may read source metrics and the layer-1 anchors,
               and may NEVER read another layer-2 figure.

`deriveOperational()` must never call `deriveWorkforce()`, or the reverse.

### Why it exists

The model genuinely wants cross-tab drivers — cancelled operations should depend
on vacancy, sickness should depend on occupancy. Taken literally as function
calls that is `deriveOperational()` → `deriveWorkforce()` → `deriveOperational()`,
i.e. a stack overflow the first time the pack is opened. "Each bottoms out in
stats" is not sufficient; what matters is the call graph.

Resolving it by extracting the two shared anchors means a new figure needing
another figure as a driver is a layer-2 figure that reads the anchor. Do not
promote a second function to layer 1, and do not cross-call the two derive
functions. The suite carries a no-recursion smoke assertion because a cycle
manifests as `RangeError: Maximum call stack size exceeded`.

### Two load-bearing details

**(a) Anchors resolve through `_field()` first**, before any dependant reads
them, so an authored override on `occupancy` reaches length of stay, ambulance
handovers and cancelled operations too. Without it an author can put the pack
into a state where the occupancy row says 97% while length of stay is derived as
though it were 91%. This matches the precedent set by `getOccupancyGauge()`,
which deliberately calls `deriveOperational()` a second time rather than having
the view thread a value through — threading from the view is the route by which
two presentations drift apart.

**(b) Dependants read the PRE-CLAMP anchor** (`occupancyRaw` / `vacancyRateRaw`).
Occupancy saturates its `[82, 99]` clamp on a material share of legal paths — it
is the one figure at 100% clamp utilisation, by design. If dependants read the
clamped value they would all flatten at the same instant on every high-pressure
path, which is exactly the lockstep this layer exists to remove, rebuilt at the
top of the range. The clamped value is for display; the raw value is what the
rest of the model is made of.

---

## 4 · Operations (X10)

### The defect

Every figure was `base + k × (waiting − start)`, making five rows five views of
one number. Pre-clamp correlation between four of the five was exactly 1.
Post-clamp on the reachable nodes it ran 0.83–0.997, six pairs above 0.98, and
two figures could never reach their own `critical` band at all.

A naïve `|r| < 0.98` acceptance criterion would have been only 0.0033 away from
passing on `occupancy ↔ cancelledOps` before any change, and would have been
satisfied by a change that does almost nothing. The bar used instead is: no pair
≥ 0.95, and at least five of the ten pairs below 0.85.

### Driver assignment

| Figure | Layer | Drivers |
|---|---|---|
| Bed occupancy | 1 | `waiting` — unchanged; the anchor, and the gauge reads it |
| Length of stay | 2 | occupancy anchor + `morale` |
| Delayed transfers | 2 | `waiting` (weak) + `budget` + authored exogenous + mechanisms |
| Ambulance handovers | 2 | occupancy anchor + `safety` |
| Cancelled operations | 2 | occupancy anchor + vacancy anchor |

### Two coefficients that look odd and are not

Length of stay is deliberately **morale-led** (`kLosMor ≥ kLosOcc`) while
ambulance handovers are deliberately **occupancy-led** (`kHandOcc ≫ kHs`). That
asymmetry is the whole reason the two rows say different things: morale and
safety themselves correlate 0.88 across the legal paths, so two figures that are
*both* occupancy-led are two views of occupancy however different their second
driver reads on paper. Re-pointing length of stay at occupancy
(`kLosOcc 1.20, kLosMor 0.25`) puts the worst operations pair straight back to
0.96. Do not tidy them into one shape.

`kCancVac` is large (2.25) because the vacancy rate is a narrow-range figure. At
the proportionate-looking 0.60 the theatre-team term supplies about a seventh of
the variance, cancelled operations stays a relabelled occupancy, and the worst
operations pair measures 0.94.

### Delayed transfers: a known, measured shortfall

BPS-001 asked for `kDtoc` to be **weakened**, reasoning that a figure the trust
does not control should not track the waiting index. It is 0.65 — slightly
*stronger* than the 0.60 it replaced — and the reasoning still holds; the
coefficient was not what carried the collinearity. Measured: weakening it to the
suggested 0.35 leaves the worst operations correlation exactly where it is
(0.870) and drops clamp traversal from 47% to 41%. What broke the collinearity
was giving the figure three other drivers, not shrinking this one.

On the visible snapshots the figure traverses 47% of its authored `[0, 80]` clamp
against an acceptance bar of 55%, and the test says so in its own name. The only
lever that closes the gap is `kDtoc`, and at 0.80 the occupancy correlation
reaches 0.96 — buying the clamp figure by re-creating the defect the work exists
to remove. The clamp is the widest in the model and three quarters of authored
effects cannot span it. What the player needs is that the row separates the
options in front of them, and it does: the four Q1 options span 16.4 beds on it,
the widest of any figure.

### The one clamp that moved

`losClamp` floor 90 → 85. Measured at 90 with the second driver in place, 12.5%
of visible snapshots sat exactly on the floor, over the 10% budget, because 10
points of downward headroom against a base of 100 is not enough once the figure
has two drivers and a discharge mechanism. At 85 it is 2.1%. `good ≤ 95` is
unaffected, so no band boundary changed.

---

## 5 · Workforce (X9)

### The defect

Vacancy, turnover and sickness were all `base + k × (morale − start)` — one
variable in three costumes, pairwise correlations exactly 1.0000. Vacancy and
turnover reached only 2 of their 4 authored bands, and no workforce figure could
reach `critical` on any path the game contains. The first pack a player ever
opens showed a Workforce tab that was one colour and nearly one number across all
four Q1 options.

### Driver assignment

| Figure | Layer | Drivers |
|---|---|---|
| Vacancy rate | 1 | `morale` + one-sided budget pressure |
| Turnover | 2 | `morale` + `rep` |
| Sickness | 2 | `morale` + occupancy anchor |
| Survey score | 2 | `morale` + `safety` + `rep` |

Turnover is deliberately **not** coupled to vacancy — that would re-import the
collinearity being removed.

### Coefficient sizing

The primary coefficients roughly doubled, because the old ones traversed only
26–35% of the clamps authored for them.

`kVacBudget` is 1.00, not a proportionate-looking 0.25. Budget swings over a ~9
point range against morale's ~40, so a coefficient in proportion to the two rates
leaves the financial term contributing a fifth of the movement. Measured at 0.25
the worst workforce pair is 0.91 and the figure traverses 51% of its clamp; at
1.00 they are 0.87 and 58%. Read it as a percentage point of vacancy held per £1m
of deficit.

`kSurvSafety` (0.07) is the dominant second term for the survey, not `kRep`
(0.02). The Staff Survey's best-known question is whether staff would be happy
for a friend or relative to be treated at the trust, which tracks safety at least
as much as morale, and safety moves over a far wider range than reputation.
`kRep` was retuned down but must stay strictly positive — reputation moving the
survey is authored behaviour and is asserted. Most of what `kRep` used to do was
making the survey a second view of turnover.

### Why bank & agency is not here

It is an I&E expenditure line with a plan and a variance, so it is derived once
under `finance`. A second copy of the same coefficients was kept in step by
comment alone, which is how Finance and Workforce end up reporting different
agency spend for the same quarter two clicks apart.

---

## 6 · Finance (X11)

### 6.1 The plan-balance invariant

    income      95.0 + 2.5 + 10.5 + 0.0  = 108.0
    expenditure 68.0 + 6.0 + 12.0 + 22.0 = 108.0

At the opening board position every line derives to its own plan, every variance
is zero and the surplus is exactly 0. That is what makes the pack's first page
readable as "this is the plan, and nothing has happened yet". If you re-pitch any
base, re-pitch another to match; the suite asserts it.

### 6.2 The plug moved off an operational line

`Other operating income` used to be the balancing plug, so the single line with
no narrative behind it absorbed every other line's error. Worked at
`budget −2, morale 48, waiting 78` — an ordinary bad-but-not-catastrophic Q3 —
every derived line was adverse and the plug was **+2.5 favourable, the largest
positive number on the page**, favourable precisely because everything else had
gone wrong. A board reading down the column found the only good news sitting on
the only line nobody could explain.

The plug is now `Reserves movement`, which is the one line on an NHS I&E where a
board expects elasticity. Every operational income line is derived and
defensible, so nothing on the page is favourable merely because something else
went wrong. The plug is solved, not derived, and is deliberately **not** wrapped
in `_field()` — an authored override there would break the identity the function
guarantees.

The same position on the new schedule, with favourability read in each line's own
direction:

| Line | Plan | Actual | Fav | Tone |
|---|---|---|---|---|
| Clinical income | 95.0 | 93.50 | −1.50 | warn |
| Private patients | 2.5 | 2.50 | 0.00 | neutral |
| Other operating income | 10.5 | 10.50 | 0.00 | neutral |
| Reserves movement | 0.0 | 2.80 | −2.80 | warn |
| Pay expenditure | 68.0 | 69.30 | −1.30 | warn |
| Bank & agency | 6.0 | 7.20 | −1.20 | warn |
| Drugs | 12.0 | 12.48 | −0.48 | warn |
| Clinical supplies | 22.0 | 22.32 | −0.32 | warn |

Nothing is favourable. The plug is the largest *adverse* variance, which is the
true statement: the position was covered by drawing £2.8m of reserves.

### 6.3 Three fields that were one

| Field | Job | Read by |
|---|---|---|
| `kind` | grouping and arithmetic sign | totalling loop, `_perfFinancePanel`, `_finRow` CSS class, `_finMoney` convention |
| `goodWhen` | direction of good | tone, variance sign |
| `signedValue` | display sign | Actual column only |

`kind` was doing all of it. The favourability jobs break the moment a line's
block and its direction of good disagree — which happens as soon as the plug
becomes a reserves movement: an income-block line where a larger actual is worse.
Under the old rule that line rendered green while the reserves drained, which is
the decorative-colour failure X3 was raised to remove, reintroduced on the line
that most needs reading correctly.

`signedValue` exists for the same line for a different reason. `_finMoney()`
applies `Math.abs()` and re-signs from the block: income plain, expenditure with
an explicit minus. That is right for the seven conventional lines and wrong for
this one — a £4.6m transfer *into* reserves printed identically to a £4.6m raid
*on* them. Lines opt out individually rather than the convention being weakened;
only the Actual column honours it, since a plan of 0.0 has no sign to carry.

### 6.4 Drivers, each on a metric no other finance line reads

| Line | Driver | Why not the obvious alternative |
|---|---|---|
| Clinical income | `waiting` | — |
| Private patients | `rep` | the only rep-driven finance line |
| Other operating income | `safety` | education/training income; placements are withdrawn by the deanery, not the market. `waiting` would make it a second view of clinical income, `morale` a second view of agency |
| Drugs | `budget` + activity | see below |
| Clinical supplies | `budget` | — |

`kDrugsBudget 0.09 + kSuppliesBudget 0.16` = the old single `kNonPay 0.25`, split
in the 12:22 proportion of the bases, so the aggregate non-pay response to the
budget is byte-unchanged and only its presentation is finer.

**A proportional split alone would be worthless** — two lines driven by one
coefficient in fixed proportion are one line printed twice, the X10 collinearity
defect rebuilt inside the finance table. `kDrugsActivity` is what stops it, and
it is asserted both ways: drugs move on waiting, supplies provably do not.

Activity is measured as `waiting`, **not** the occupancy anchor, and that is a
deliberate refusal of the obvious choice. Occupancy is a percentage whose
denominator moves: `Q2:open_escalation_ward` opens 18 beds and so *lowers*
occupancy while the patients, and their drugs, are still there. Pointing the
drugs bill at occupancy would make opening a ward cut the drugs spend — the wrong
sign for the right-looking reason.

### 6.5 Subtotals carry no variance

Both blocks carry a subtotal, summed from the same rows that render so a block
and its total cannot disagree. The variance cell is deliberately empty and
carries no `band-{tone}`.

The income block now contains lines whose directions of good disagree — an
over-recovery of clinical income is good, a larger reserves movement is not.
Summing their variances gives an arithmetic total with no favourability at all,
and colouring it would assert one: the same failure the `goodWhen` split exists
to prevent, rebuilt one row lower. Per-line variances carry the direction; the
net position carries the verdict.

### 6.6 The residual, stated plainly

The reserves movement is still the widest line on the page and is the largest
favourable variance on 44 of the 84 visible nodes. That is inherent to being the
plug — it absorbs the sum of everything else — and it is not the old defect
returning: on all 44 the trust is transferring money *back into* reserves, which
is what the number says.

The defect was the plug reading favourable *because* the operating position was
bad, and that case is measured directly: on the 5 visible nodes where every
operational line is adverse, the plug is never the largest favourable variance.
It is adverse too.

---

## 7 · The three authored tables

Three mechanisms can author a figure, and they are deliberately different.

| Table | Keying | Semantics |
|---|---|---|
| `REPORTING_OVERRIDES` | `quarter` or `quarter:option`, longest wins | **replaces** the derived value outright |
| `REPORTING_EXOGENOUS` | **quarter only** | **adds** — what happened that the board did not choose |
| `REPORTING_MECHANISMS` | **quarter:option only** | **adds** — what the decision mechanically did to this figure |

The keying asymmetry is not a detail. An option-keyed exogenous term would be the
board's own decision in disguise; a quarter-keyed mechanism would credit the
board for a choice it did not make.

Both additive tables resolve to 0 for a null ctx, so the opening board position
still derives to base exactly.

### The mutual-exclusion rule

> A quarter must not use both an override and an additive term for the same
> figure.

An override wins silently, so the additive term becomes dead code that a future
author would spend an afternoon debugging. This is asserted, and the assertion
plants a synthetic clash to prove it is not vacuous.

### Why the Q2 DTOC overrides were retired

`REPORTING_OVERRIDES` used to author `Q2 → dtocBeds: 41` with
`Q2:discharge_partnership → 38`. That is the collinearity defect in miniature: at
Q2 the headline figure read 41 whatever the board did, unless it did one specific
thing, and then it read 38. A figure that cannot respond to a decision teaches the
group that the decision did not matter — in the one quarter where delayed
transfers are the headline figure.

The same authorial intent is now an additive per-quarter term in
`REPORTING_EXOGENOUS`, which shifts the figure without freezing it, so the four
Q2 options produce four different figures.

The override mechanism itself is unchanged and still fully covered — the test
block installs synthetic entries and removes them. It remains the right tool for
a one-off authored fact the model has no business deriving. Use it for that, not
to pin a figure the player is meant to be able to move.

### Exogenous values track the authored bridge prose

The values in `REPORTING_EXOGENOUS` are authored to match the `bridge` prose
already written on each quarter in `quarters-data.js`. **If you change one, change
the other.** Each value is the pressure sitting on the trust *during* that
quarter, not a running total, which is why Q3's is small — its external event is
a reputational one, not a discharge one.

The Q4 entry is never rendered (see §2) and is excluded from calibration.

### Why `REPORTING_MECHANISMS` exists

Without it, every consequence of every option travels through six global
coefficients that are averages over a whole year of decisions, so they cannot
express a mechanism. Three measured examples from before it existed:

- **Accelerating discharge planning (Q1 C) reported a *longer* length of stay
  than doing nothing** (102.5 vs 100.0), because the option costs morale and
  length of stay reads morale. The one thing the option does by definition is
  shorten stays.
- **Funding the discharge partnership (Q2 D) beat expanding the virtual ward on
  delayed transfers by 0.02 beds.** The option that exists to unblock medically
  fit patients was indistinguishable from one that does not.
- **Deferring capital (Q4 D) reported *fewer* delayed transfers than extending
  the discharge lounge**, because deferring capital improves the budget and
  delayed transfers read the budget.

No coefficient value fixes any of those; they are the wrong shape for the job.

After the change, measured as a single quarter from the opening position:

    rapid discharge         LOS 95.3 (was 102.5),  DTOC 25.5 (was 31.5)
    partnership vs virtual  35.7 vs 43.7 - margin 8.0 beds (was 0.02)
    lounge vs defer capital 38.4 vs 44.5 - margin 6.1 beds (was -1.3, inverted)

**Authoring rule.** Only the direct, mechanical, in-quarter consequence of the
intervention itself goes here — the thing true by definition of what the option
does. Durable consequences are already carried by the option's authored `effects`
on the board metrics.

    effects    = what the decision does to the trust, and keeps doing
    mechanisms = what the decision mechanically does to THIS figure, this quarter
    exogenous  = what happened to the trust that the board did not choose

An option with no unambiguous direct mechanism gets **no entry**. All four Q3
options are communications decisions and author nothing, which is correct and is
not an oversight. Q4 *Defer non-urgent capital spending* authors nothing for the
same reason: it is a financial decision whose operational consequence is the 13
points of safety it costs, and it must not be able to *look* like a discharge
intervention just because it improves the budget.

Anchors take mechanisms too, so "open 18 escalation beds" cuts occupancy and that
reaches length of stay, handovers and cancelled operations without any of them
knowing the option exists. One entry is deliberately counter-intuitive: the
escalation ward **raises** delayed transfers, because escalation areas are where
medically fit patients waiting on social care accumulate. It buys flow at the
front door and reports more delay at the back. It is the one sign a reader is
likely to want to "fix".

---

## 8 · Benchmarks

`REPORTING_BENCHMARKS` is kept separate from `REPORTING_COEFFS` because these are
not tuning constants: retuning a coefficient changes a derived *value*, whereas
changing a benchmark changes what that value *means*. They are also the figures
most likely to be replaced with real published values after NHS review.

Bands are authored ascending by `to`, `to` is the **inclusive** upper bound of
its own band — the same contract `METRIC_DEFS` uses and `getMetricBand()`
implements — and the final band is open-ended.

The inclusive bound is load-bearing, not stylistic: at the opening board position
occupancy derives to exactly `occBase = 92 = occupancyNorm`, so an exclusive
bound would drop the norm itself into `warn` and print an amber "ELEVATED" chip
directly above a sentence saying the trust is exactly on its norm.

### Tone direction is per figure

`getBenchmarkTone()` cannot check it. For a lower-is-better figure the tones run
good → neutral → warn → critical as the value ascends; for a higher-is-better
figure (harm-free care, FFT, staff survey) they run the other way. Authoring a
higher-is-better list in the lower-is-better order produces a page that colours a
good figure red and **nothing in the code will catch it**, so each list states its
direction and the band-contract test asserts the tone sequence is monotonic.

Boundaries are pitched against the **clamps**, not against the narrower range the
figures currently traverse, so they still read correctly when coefficients widen.
Every base sits in `neutral` by construction: an ordinary functioning hospital is
on its norm, not doing well.

### Wording claims no external authority

`Norm`/`NormLabel` pairs exist only where a panel prints a reference point —
currently the occupancy gauge alone. The label is deliberately "Trust operating
norm" and nothing else. These are fictional coefficients tuned for a training
game; wording implying an external authority ("national standard", "NHS target")
would be repeated in a real meeting as though it were one. The suite asserts the
pack never claims a national standard, an NHS target, a statutory standard or a
safe legal limit.

### Tone comes from the figure, not its source metric

`_row()` judges each figure against its own authored bands. Taking the tone from
the source metric made the colour decorative: every row in a tab shared one tone
whatever its own value, so at Q3 all five Operations rows were amber together
while never events read amber at **zero**, its best attainable result. The same
`band-{tone}` class is diagnostic on the Finance variance cells, so a decorative
use of it teaches the player that the colour means nothing.

An earlier comment in the source argued the opposite — that a figure whose only
meaning is "this is what waiting pressure does to the wards" should inherit the
source band. That held while occupancy was the only figure with an authored
benchmark. Every derived figure now has one, so there is one tone source and it
is the figure's own.

`REPORTING_COMMENTARY` is deliberately unchanged by this: it is keyed to the
source metric's band and reads correctly for all five rows. Tone changed; prose
did not.

### Never events

Banded on the integers themselves, because it is a stepped integer count rather
than a continuous figure. Zero never events is the best attainable result and
must read `good`, not amber — this is the one figure where inheriting the source
metric's band was not merely uninformative but visibly wrong. There is no
`neutral` band on purpose: one never event is not a middling position.

---

## 9 · Acceptance criteria

Clamp traversal is a proxy for "this row says something", and it is gameable: an
authored per-quarter shift widens it without making any single decision more
legible, which is how a +26 winter term once flattered a revision.

The criteria actually used:

1. **Band coverage.** Across the visible nodes a figure reaches at least three
   distinct tones.
2. **Clamp traversal**, reported with the bar stated in the assertion name so a
   known shortfall is visible rather than silently passing.
3. **No favourable-end clamping.** A clamp may bind on the bad path; it must
   never bind on the good path. Saturation is asserted at or below ~2% at either
   bound.
4. **Correlation.** No pair ≥ 0.95, worst pair per tab reported.
5. **Within-quarter decision spread** — the ungameable one. At each decision
   point reachable in the visible tree, how far apart are the four options
   actually on offer on this row? Asserted: no row is ever flat across the four
   options, every row separates them by at least 1.0 at the median decision
   point, and at the first decision a player faces all nine figures tell all four
   options apart at 1 dp.
6. **Plausibility.** A figure satisfying 1–5 only at values a real trust would
   never report has failed. If the only way to reach a band is an implausible
   number, the *band* is mis-pitched, not the coefficient — say so rather than
   forcing it.

Occupancy's one flat spread point is asserted explicitly with its cause: it is
the one figure at full clamp utilisation, so at the most extreme Q3 positions all
four options land on 99.
