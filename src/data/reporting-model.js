'use strict';
/* ---------- reporting model (phase 3) ----------
   A pure derivation layer that turns the six board metrics into plausible NHS
   operational figures for the Performance Analysis board-pack page.

   Everything here is DERIVED from a stats snapshot; nothing is a new source of
   truth and nothing is ever written back. All functions are deterministic:
   no RNG, no DOM, no reads of live METRIC_CUR. Callers pass a committed stats
   object (the report snapshot's endStats) plus an optional context describing
   which quarter/option is being reported so authored overrides can apply.

   Loaded AFTER metric-semantics.js (needs getMetricDef / getMetricBand) and
   BEFORE quarters-data.js.

   Direction is stated explicitly per figure (see the 5.3 table in the phase 3
   prompt) rather than inferred from goodUp - the single biggest risk here is a
   sign flip, because `waiting` worsens as it rises while everything else
   improves as it rises.

   ctx = {quarterId, optionId, outcome, history} - the report snapshot.
   ctx is optional; when null/undefined, derivation runs with no overrides.
--------------------------------------------------------------------------- */

/* Every tunable coefficient and clamp bound lives here so figures can be
   retuned without hunting through function bodies. Clamp bounds are [lo, hi].
   Each figure is anchored on its source metric's authored `start` value (pulled
   live from METRIC_DEFS via _start), so at the opening board position every
   derived figure sits exactly on its `base`. */
var REPORTING_COEFFS = {
  /* ---------- Finance (X11) ----------
     THE PLAN-BALANCE INVARIANT. The bases are the plan (budgeted) figures and
     they balance exactly:

       income      95.0 + 2.5 + 10.5 + 0.0 = 108.0
       expenditure 68.0 + 6.0 + 12.0 + 22.0 = 108.0

     so at the opening board position every line derives to its own plan, every
     variance is zero and the surplus is exactly 0. That is what makes the pack's
     first page readable as "this is the plan, and nothing has happened yet". If
     you re-pitch any base, re-pitch another to match; the suite asserts it.

     WHY THERE ARE EIGHT LINES AND NOT FIVE. `Other operating income` used to be
     the balancing plug: the single line with no narrative behind it absorbed
     every other line's error. Worked through at budget -2, morale 48,
     waiting 78 - an ordinary bad-but-not-catastrophic Q3 - the old table put
     every derived line adverse and made the plug a +2.5 FAVOURABLE variance, the
     largest single positive number on the page, favourable precisely BECAUSE
     everything else had gone wrong. A board reading down the column found the
     only good news sitting on the only line nobody could explain.
     `Other operating income` is now derived like any other line, and the plug
     moves to an explicit `Reserves & contingency drawdown` - see C.4 on
     deriveIncomeExpenditure(). */
  finance: {
    /* £m per quarter. --- INCOME --- */
    /* Clinical income falls as waiting rises: a gridlocked front door displaces
       the elective work the tariff is earned on. */
    clinicalIncomeBase: 95,   kInc: 0.15,
    /* Private patients: small, and the only finance line driven by reputation.
       Private work follows the trust's public standing more than its capacity,
       and no other line reads `rep`, so this is the income block's third
       independent driver. Kept deliberately small in scale - a swing of about
       +/- 0.5 on a 2.5 plan - because a trust of this size does not fund itself
       out of private work and a line that moved further would say it did. */
    privateIncomeBase:   2.5, kPrivateRep: 0.02,
    /* Other operating income - education, training and research income, no
       longer the plug. Driven by SAFETY, which looks surprising for an income
       line and is the most defensible driver available: placements and the
       education tariff that comes with them are what a trust loses when its
       safety record deteriorates, and trainees are withdrawn by the deanery, not
       by the market. Reading `waiting` instead would have made it a second view
       of clinical income; reading `morale` would have made it a second view of
       agency spend. Safety drives no other finance line. */
    otherIncomeBase:    10.5, kOtherSafety: 0.04,
    /* The balancing plug's plan is 0: a trust does not BUDGET to raid its
       reserves, which is exactly why any drawdown at all is a variance worth
       colouring. No coefficient - it is not derived, it is solved for. */
    drawdownBase:        0,
    /* --- EXPENDITURE --- */
    /* Pay rises as the financial position and morale fall. */
    payBase:            68,   kPay: 0.40, kMor: 0.05,
    /* Bank & agency rises as morale falls. */
    agencyBase:          6,   kAgency: 0.12,
    /* Non-pay was ONE line of 34 with a single kNonPay of 0.25. It is now split
       into drugs (12) and clinical supplies (22), and the budget coefficients
       are split in the same 12:22 proportion - 0.09 + 0.16 = 0.25 - so the
       aggregate non-pay response to the budget is byte-unchanged and only its
       presentation is finer.
       A PROPORTIONAL SPLIT ALONE WOULD BE WORTHLESS: two lines driven by one
       coefficient in fixed proportion are one line printed twice, which is the
       X10 collinearity defect rebuilt inside the finance table. kDrugsActivity
       is what stops it - the drugs bill follows ACTIVITY as well as the
       financial position, so the two lines diverge whenever demand and the
       control total move differently.
       Activity is measured as `waiting`, NOT as the occupancy anchor, and that
       is a deliberate refusal of the obvious choice. Occupancy is a percentage
       whose denominator moves: `Q2:open_escalation_ward` opens 18 beds and so
       LOWERS occupancy while the patients - and their drugs - are still there.
       Pointing the drugs bill at occupancy would have opening a ward cut the
       drugs spend, which is the wrong sign for the right-looking reason. */
    drugsBase:          12,   kDrugsBudget: 0.09, kDrugsActivity: 0.03,
    suppliesBase:       22,   kSuppliesBudget: 0.16
  },
  /* ---------- Operations (X10) ----------
     Every figure here used to be `base + k x (waiting - start)`, which made five
     rows five views of one number: their correlations across the 256 legal
     decision paths ran 0.83 - 0.997, and two of them could never reach their own
     `critical` band at all. Each now carries a DISTINCT second driver.

     EVERY NUMBER QUOTED IN THIS FILE IS MEASURED ON THE PLAYER-VISIBLE SNAPSHOT
     SET - the Q1, Q2 and Q3 closes, three per path, 768 in all. A board pack
     reports the outcome of the quarter BEFORE the one it asks about, so the Q4
     close is derivable but never rendered anywhere. Calibrating on all four closes
     flatters the model with a fourth quarter of compounding nobody sees. The test
     suite asserts on the visible set and prints the other for comparison.

     TWO COEFFICIENTS THAT LOOK ODD AND ARE NOT. Length of stay is deliberately
     MORALE-LED (kLosMor >= kLosOcc) while ambulance handovers are deliberately
     OCCUPANCY-LED (kHandOcc >> kHs). That asymmetry is the whole reason the two
     rows say different things: morale and safety themselves correlate 0.88 across
     the legal paths, so two figures that are BOTH occupancy-led are two views of
     occupancy however different their second driver reads on paper. Re-point
     length of stay at occupancy (kLosOcc 1.20, kLosMor 0.25) and the worst
     operations pair goes straight back to 0.96. Do not "tidy" them into one shape.

     WHAT THE COEFFICIENTS DO NOT DO. They are averages over a whole year of
     decisions, so they cannot express the mechanism of one option: they made
     accelerating discharge report a LONGER length of stay than doing nothing. That
     is REPORTING_MECHANISMS' job, and the split matters when reading the numbers
     here - these coefficients carry the trust's general condition, the mechanism
     table carries what a specific decision mechanically does.

     See the layering rule above _deriveAnchors() for why the dependants read
     `occupancyRaw` and `vacancyRateRaw` rather than the clamped display values. */
  operational: {
    /* Layer-1 anchor. Occupancy already traverses its whole clamp and reaches all
       four authored bands, so kOcc is deliberately left alone. */
    occBase:  92,  kOcc:  0.35, occClamp:  [82, 99],       /* % */
    /* Length of stay: a full hospital discharges slowly (kLosOcc, on the pre-clamp
       occupancy anchor), and discharge pace depends on having the staff to do the
       discharging (kLosMor, on falling morale) - which is the larger term, see
       above. The floor moved from 90 to 85, the one clamp change in this commit:
       measured at a floor of 90, 12.5% of the visible snapshots sat exactly on it,
       over the 10% budget, because 10 points of downward headroom against a base
       of 100 is not enough once the figure has two drivers and a discharge
       mechanism. At 85 it is 2.1%. `good <= 95` is unaffected, so losPctBands
       needed no edit. */
    losBase: 100,  kLosOcc: 0.70, kLosMor: 0.70, losClamp: [85, 125], /* index */
    /* Delayed transfers. BPS-001 X10 asked for kDtoc to be WEAKENED, on the
       reasoning that a figure the trust does not control should not track the
       waiting index. It is 0.65 - slightly stronger than the 0.60 it replaced -
       and the reasoning still holds; the coefficient is not what was carrying the
       collinearity. Measured: weakening it to the suggested 0.35 leaves the worst
       operations correlation exactly where it is (0.870) and drops this figure's
       clamp traversal from 47% to 41%. What broke the collinearity was giving the
       figure three other drivers, not shrinking this one.
       The other drivers: REPORTING_EXOGENOUS for community and social-care
       capacity the trust does not control, REPORTING_MECHANISMS for the discharge
       interventions that act on it directly, and kDtocBudget for the one general
       financial lever - beds held per £1m of deficit, because a trust in deficit
       cannot fund brokerage, transport and packages of care. kDtocBudget is large
       against a budget range of about 9 points; it has to be, to supply variance
       that waiting does not.
       KNOWN SHORTFALL, measured and deliberate: on the visible snapshots this
       figure traverses 47% of its authored [0, 80] clamp against an acceptance bar
       of 55%. The only lever that closes the gap is kDtoc, and at 0.80 the
       occupancy correlation reaches 0.96 - i.e. buying the clamp figure costs the
       thing this commit exists to fix. The clamp is the widest in the model and
       three quarters of authored effects cannot span it. What the player actually
       needs is that the row separates the options in front of them, and it does:
       the four Q1 options span 16.4 beds on it, the widest of any figure. */
    dtocBase: 35,  kDtoc: 0.65, kDtocBudget: 3.20, dtocClamp: [0, 80], /* beds */
    /* Ambulance handovers: re-pointed from `waiting` to the occupancy anchor so
       the causal chain reads front door -> beds -> handover, with safety as the
       second driver as before. Occupancy-led on purpose - see above. */
    handBase: 20,  kHandOcc: 1.20, kHs: 0.38, handClamp: [0, Infinity], /* count */
    /* Cancelled operations: electives are cancelled for want of a bed (kCancOcc)
       or for want of a theatre team (kCancVac, on the pre-clamp vacancy anchor).
       This is the one cross-tab driver and the reason _deriveAnchors() exists.
       kCancVac is large because the vacancy rate is a narrow-range figure: at the
       proportionate-looking 0.60 the theatre-team term supplies about a seventh of
       the variance, cancelled operations stays a relabelled occupancy, and the
       worst operations pair measures 0.94. At 2.25 the two terms are comparable and
       it is 0.87. */
    cancBase:  8,  kCancOcc: 0.78, kCancVac: 2.25, cancClamp: [0, Infinity] /* count */
  },
  /* ---------- Workforce (X9) ----------
     Vacancy, turnover and sickness were all `base + k x (morale - start)`, i.e.
     one variable in three costumes: their pairwise correlations were exactly
     1.0000 - identical up to an affine transform - and vacancy and turnover could
     reach only 2 of their 4 authored bands. Each keeps morale as its primary
     driver and gains one DISTINCT second driver, and the primary coefficients
     roughly double, because the old ones traversed only 26-35% of the clamps that
     were authored for them. Measured on the visible snapshots, the worst workforce
     pair is now 0.867 and all four figures traverse 58-78%. */
  workforce: {
    /* Layer-1 anchor. A trust in deficit holds posts vacant, so vacancy control is
       a financial lever as much as a workforce outcome - and kVacBudget is sized so
       that it genuinely is one: budget swings over a ~9 point range against
       morale's ~40, so a coefficient in proportion to the two rates leaves the
       financial term contributing a fifth of the movement. Measured at the
       proportionate-looking 0.25, the worst workforce pair is 0.91 and this figure
       traverses 51% of its clamp; at 1.00 they are 0.87 and 58%. Read it as: a
       percentage point of vacancy held per £1m of deficit. */
    vacBase:   9,   kVac:  0.33, kVacBudget: 1.00, vacClamp:  [2, 20],   /* % */
    /* Staff leave a trust whose public standing is poor, and it recruits more
       slowly against the same reputation (kTurnRep). */
    turnBase: 13,   kTurn: 0.25, kTurnRep: 0.22, turnClamp:  [5, 22],   /* % */
    /* Sustained escalation-level occupancy drives absence: this is the one
       workforce figure that should respond to operational pressure (kSickOcc,
       on the pre-clamp occupancy anchor). */
    sickBase:  4.5, kSick: 0.11, kSickOcc: 0.15, sickClamp: [2, 9],    /* % */
    /* Bank & agency spend is NOT derived here. It is an I&E expenditure line
       with a plan and a variance, so it is derived once under `finance`. A
       second copy of the same coefficients was kept in step by comment alone,
       which is how Finance and Workforce end up reporting different agency
       spend for the same quarter two clicks apart. */
    /* The Staff Survey's best-known question is whether staff would be happy for
       a friend or relative to be treated at the trust, which tracks safety at
       least as much as morale - so kSurvSafety is the dominant second term (safety
       moves over a far wider range than reputation, so 0.055 against kRep's 0.012
       is a much larger share of the figure than the two numbers suggest).
       kRep is retuned DOWN but must stay strictly positive: reputation moving the
       survey is authored behaviour and is asserted in the test suite. Most of what
       kRep used to do was making the survey a second view of turnover. */
    survBase:  6.5, kSurv: 0.09, kSurvSafety: 0.07, kRep: 0.02, survClamp: [0, 10] /* index 0..10 */
  },
  quality: {
    incBase:    6,   kInc2:  0.50, incClamp:  [0, Infinity], /* moderate-harm / month */
    neverAnchor: 50, kNever: 10,                             /* stepped; integer count */
    harmBase:   96,  kHarm:  0.15, harmClamp: [88, 99.5],    /* % */
    compBase:   18,  kComp:  0.60, compClamp: [0, Infinity], /* complaints */
    fftBase:    90,  kFft:   0.50, fftClamp:  [40, 99]       /* % */
  }
};

/* Reference points a board reads a figure AGAINST, kept separate from
   REPORTING_COEFFS because these are not tuning constants: retuning a
   coefficient changes a derived value, whereas changing a benchmark changes what
   that value MEANS. They are also the figures most likely to be replaced with real
   published values after NHS review, so they need to be findable in one place.

   Bands are authored ASCENDING by `to`, `to` is the INCLUSIVE upper bound of its
   own band - the same contract METRIC_DEFS uses and getMetricBand() implements -
   and the final band is open-ended.

   TONE DIRECTION IS PER FIGURE, and getBenchmarkTone() cannot check it. For a
   LOWER-IS-BETTER figure (occupancy, length of stay, vacancy, complaints) the
   tones run good -> neutral -> warn -> critical as the value ascends. For a
   HIGHER-IS-BETTER figure (harm-free care, FFT, staff survey) they run the other
   way: critical -> warn -> neutral -> good. Authoring a higher-is-better list in
   the lower-is-better order produces a page that colours a good figure red and
   nothing in the code will catch it, so each list states its direction and the
   band-contract test asserts the tone sequence is monotonic.

   Boundaries are pitched against the CLAMPS in REPORTING_COEFFS, not against the
   narrower range the figures currently traverse, so they still read correctly
   when the coefficients are widened. Every figure derives to its `base` at the
   opening board position, and every base sits in the `neutral` band by
   construction: an ordinary functioning hospital is on its norm, not doing well.

   `Norm`/`NormLabel` pairs exist only where a panel prints a reference point -
   currently the occupancy gauge alone. The label is authored, and is deliberately
   "Trust operating norm" and nothing else. These are fictional coefficients tuned
   for a training game; wording that implies an external authority ("national
   standard", "NHS target") would be repeated in a real meeting as though it were
   one. */
var REPORTING_BENCHMARKS = {
  operational: {
    occupancyNorm:      92,
    occupancyNormLabel: 'Trust operating norm',
    /* lower is better - occClamp [82, 99], base 92 */
    occupancyBands: [
      { to: 89,       tone: 'good'     },
      { to: 92,       tone: 'neutral'  },
      { to: 95,       tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* lower is better - losClamp [90, 125], base 100 */
    losPctBands: [
      { to: 95,       tone: 'good'     },
      { to: 102,      tone: 'neutral'  },
      { to: 112,      tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* lower is better - dtocClamp [0, 80], base 35 */
    dtocBedsBands: [
      { to: 25,       tone: 'good'     },
      { to: 38,       tone: 'neutral'  },
      { to: 55,       tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* lower is better - handClamp [0, Infinity), base 20 */
    ambulanceHandoverBands: [
      { to: 12,       tone: 'good'     },
      { to: 24,       tone: 'neutral'  },
      { to: 40,       tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* lower is better - cancClamp [0, Infinity), base 8 */
    cancelledOpsBands: [
      { to: 5,        tone: 'good'     },
      { to: 10,       tone: 'neutral'  },
      { to: 18,       tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ]
  },
  workforce: {
    /* lower is better - vacClamp [2, 20], base 9 */
    vacancyRateBands: [
      { to: 6,        tone: 'good'     },
      { to: 10,       tone: 'neutral'  },
      { to: 14,       tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* lower is better - turnClamp [5, 22], base 13 */
    turnoverBands: [
      { to: 10,       tone: 'good'     },
      { to: 14,       tone: 'neutral'  },
      { to: 18,       tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* lower is better - sickClamp [2, 9], base 4.5 */
    sicknessBands: [
      { to: 3.5,      tone: 'good'     },
      { to: 5,        tone: 'neutral'  },
      { to: 6.5,      tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* HIGHER is better - survClamp [0, 10], base 6.5. Tones ascend. */
    surveyScoreBands: [
      { to: 4.5,      tone: 'critical' },
      { to: 6,        tone: 'warn'     },
      { to: 7.5,      tone: 'neutral'  },
      { to: Infinity, tone: 'good'     }
    ]
  },
  quality: {
    /* lower is better - incClamp [0, Infinity), base 6 */
    incidentsBands: [
      { to: 4,        tone: 'good'     },
      { to: 7,        tone: 'neutral'  },
      { to: 12,       tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* lower is better, and a STEPPED INTEGER count rather than a continuous
       figure, so it is banded on the integers themselves: zero never events is
       the best attainable result and must read `good`, not amber. This is the
       one figure where inheriting the source metric's band was not merely
       uninformative but visibly wrong - at safety 48 the count is 0 and the pack
       flagged it. There is no `neutral` band on purpose: one never event is not
       a middling position. */
    neverEventsBands: [
      { to: 0,        tone: 'good'     },
      { to: 1,        tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* HIGHER is better - harmClamp [88, 99.5], base 96. Tones ascend. */
    harmFreePctBands: [
      { to: 92,       tone: 'critical' },
      { to: 95,       tone: 'warn'     },
      { to: 97.5,     tone: 'neutral'  },
      { to: Infinity, tone: 'good'     }
    ],
    /* lower is better - compClamp [0, Infinity), base 18 */
    complaintsBands: [
      { to: 12,       tone: 'good'     },
      { to: 20,       tone: 'neutral'  },
      { to: 32,       tone: 'warn'     },
      { to: Infinity, tone: 'critical' }
    ],
    /* HIGHER is better - fftClamp [40, 99], base 90. Tones ascend. */
    fftScoreBands: [
      { to: 70,       tone: 'critical' },
      { to: 85,       tone: 'warn'     },
      { to: 92,       tone: 'neutral'  },
      { to: Infinity, tone: 'good'     }
    ]
  }
};

/* 'quarterId:optionId' wins over 'quarterId', which wins over the derived
   value. Longest (most specific) key wins. Keys use real game IDs.

   Nothing is authored here at present, and that is deliberate. Q2 used to author
   `dtocBeds: 41` with `Q2:discharge_partnership` authoring 38, which is the
   collinearity defect in miniature: at Q2 the headline figure read 41 whatever
   the board did, unless it did one specific thing, and then it read 38 - a
   figure that cannot respond to a decision teaches the group that the decision
   did not matter. The same authorial intent (Q2 is the quarter when discharge
   pressure lands) is now expressed as an ADDITIVE term in REPORTING_EXOGENOUS,
   which shifts the figure without freezing it.

   The mechanism stays: a hard override is the right tool for a one-off authored
   fact that the model has no business deriving. Use it for that, not to pin a
   figure the player is meant to be able to move. */
var REPORTING_OVERRIDES = {};

/* Exogenous pressure the trust does not control, ADDED to the derived figure,
   keyed by the quarter whose OUTCOME is being reported (ctx.quarterId on the
   report snapshot). Delayed transfers depend far more on community and
   social-care capacity than on anything the board decided, and modelling them as
   a pure function of the waiting index made them the fourth identical view of
   one number.

   KEYED BY QUARTER ONLY, never by 'quarter:option'. That is the whole point: an
   option-keyed exogenous term would be the board's own decision wearing a
   disguise. If a figure should respond to the decision, give it a driver, not an
   entry here.

   ctx.quarterId on a report snapshot is the quarter whose decision was
   committed, so Q2's pressure lands in the Q2 OUTCOME - which is what the Q3
   pack's pages 1-2 report, the same pack whose page 3 carries the Q2 bridge
   line. A missing key, and a null ctx, both resolve to 0, so the opening board
   position still derives to base exactly.

   Each value is the pressure sitting on the trust DURING that quarter, not a
   running total: Q3's is small because Q3's external event is a reputational one,
   not a discharge one.

   These values are authored to match the `bridge` prose already written on each
   quarter in quarters-data.js - if you change one, change the other:
     Q2 "Regional discharge pathways tightened after the last board, so beds now
         clear more slowly than they did earlier in the year."
     Q3 "A regional outlet began reporting on the trust after the last board..."
         (a reputational quarter, so only a small residual discharge drag)
     Q4 "A cold snap was forecast after the last board, so winter demand now sits
         on top of the position above."

   THE Q4 ENTRY IS NEVER RENDERED. A pack reports the previous quarter's outcome,
   so the last close a player sees derived is Q3's; the Q4 term is authored for
   completeness and for whatever later reports the Q4 outcome, and it is excluded
   from the model's calibration for exactly that reason. An earlier revision of
   this commit had it at +26 and leaned on it for a clamp-utilisation figure, which
   was a number nobody could ever see. It is now sized from the bridge prose alone.

   Every entry is additive, so the board can still move the figure in the quarter
   the pressure lands - that is the difference between this and the hard Q2
   override it replaced, which pinned the figure to 41 whatever the board did. */
var REPORTING_EXOGENOUS = {
  'Q2': { operational: { dtocBeds: 14 } },
  'Q3': { operational: { dtocBeds:  3 } },
  'Q4': { operational: { dtocBeds: 14 } }
};

/* The DIRECT MECHANISM of a board decision, ADDED to the derived figure, keyed by
   'quarterId:optionId'. The exact mirror of REPORTING_EXOGENOUS above: that table
   is what the trust does not control, this one is what it just chose to do.

   WHY THIS TABLE EXISTS. Without it every consequence of every option has to
   travel through the six global coefficients on waiting, morale, budget, safety
   and reputation - and those are averages over a whole year of decisions, so they
   cannot express a mechanism. Three measured examples from before it existed:

     - Accelerating discharge planning (Q1 C) REPORTED A LONGER length of stay
       than doing nothing (102.5 against 100.0), because the option costs morale
       and length of stay reads morale. The one thing the option does by
       definition is shorten stays.
     - Funding the discharge partnership (Q2 D) beat expanding the virtual ward
       (Q2 B) on delayed transfers by 0.02 beds. The option that exists to unblock
       medically fit patients was indistinguishable from one that does not.
     - Deferring capital (Q4 D) reported FEWER delayed transfers than extending the
       discharge lounge (Q4 B), because deferring capital improves the budget and
       delayed transfers read the budget.

   Coefficients cannot fix any of those: they are the wrong shape. A per-option
   term is.

   THE RULE FOR AUTHORING ONE. Only the direct, mechanical, in-quarter consequence
   of the intervention itself goes here - the thing that is true by definition of
   what the option does. The DURABLE consequences are already carried by the
   option's authored `effects` on the board metrics (rapid discharge costs 15
   points of safety, and every figure that reads safety picks that up in this
   quarter and every quarter after). So:

     effects  = what the decision does to the trust, and keeps doing
     here     = what the decision mechanically does to THIS figure, this quarter
     exogenous= what happened to the trust that the board did not choose

   Keyed by quarter AND option, because unlike the exogenous table the whole point
   is that it is the board's choice. An option with no unambiguous direct
   mechanism gets no entry - all four Q3 options are communications decisions and
   author nothing here, which is correct and is not an oversight.

   Signs read in the figure's own direction: negative is a lower figure, which for
   every figure in this table except cancelledOps is an improvement. */
var REPORTING_MECHANISMS = {
  /* Q1 - infection pressure */
  /* "Hire temporary agency staff to cover sickness and stabilise ward staffing":
     covered rotas are staffed rotas, and a staffed ward discharges. */
  'Q1:hire_temporary_staff':    { operational: { losPct: -2.0 } },
  /* "Pause lower-priority activity so staff and beds can be moved": the paused
     activity IS cancelled operations, and the freed beds show as occupancy. */
  'Q1:slow_non_essential_care': { operational: { occupancy: -1.5, cancelledOps: +4.0 } },
  /* "Accelerate discharge planning to free beds faster": shorter stays and fewer
     medically fit patients still in a bed are what the option means. */
  'Q1:rapid_discharge':         { operational: { occupancy: -1.0, losPct: -6.0, dtocBeds: -5.0 } },
  /* "Divert some ambulance flow to neighbouring trusts": fewer arrivals to hand
     over is the mechanism, and it is the only figure it acts on directly. */
  'Q1:divert_to_other_trusts':  { operational: { ambulanceHandover: -6.0 } },

  /* Q2 - capacity strain */
  /* "Open 18 escalation beds in the old day unit": more beds for the same
     occupied beds is a lower occupancy, and a bed found is a list not cancelled.
     The delayed transfers go UP, and that is not a typo: escalation areas are
     where medically fit patients waiting on social care accumulate, so opening one
     buys flow at the front door and reports more delay at the back. It is the one
     entry in this table whose sign a reader is likely to want to "fix". */
  'Q2:open_escalation_ward':    { operational: { occupancy: -2.5, cancelledOps: -1.5, dtocBeds: +4.0 } },
  /* "Move suitable patients home with remote monitoring": the acute stay ends
     earlier and some delayed transfers stop being delays at all. */
  'Q2:virtual_ward':            { operational: { occupancy: -1.5, losPct: -4.0, dtocBeds: -3.0 } },
  /* "Cancel routine elective work for four weeks": says so. */
  'Q2:cancel_electives':        { operational: { occupancy: -1.5, cancelledOps: +6.0 } },
  /* "Fund extra social care brokerage and transport to unblock medically fit
     patients": the single most direct intervention on delayed transfers in the
     game, and it must read that way beside the virtual ward. */
  'Q2:discharge_partnership':   { operational: { losPct: -2.0, dtocBeds: -11.0 } },

  /* Q3 - media pressure. Four communications decisions; none of them moves a
     bed, a rota or a theatre list directly. Nothing authored, on purpose. */

  /* Q4 - winter surge */
  /* "Rest spaces, hot food, transport support and extra clinical supervision":
     fatigue is what turns a winter surge into absence. */
  'Q4:staff_wellbeing_fund':    { workforce:   { sickness: -0.5 },
                                  operational: { losPct: -1.0 } },
  /* "Extend discharge lounge hours and transport support through the cold snap":
     a discharge lounge exists to get a discharged patient out of the bed. */
  'Q4:expand_discharge_lounge': { operational: { occupancy: -1.0, losPct: -2.0, dtocBeds: -8.0 } },
  /* "Ask neighbouring trusts and community partners for short-term surge
     support": arrivals go elsewhere and some community capacity comes back. */
  'Q4:mutual_aid_winter':       { operational: { ambulanceHandover: -5.0, dtocBeds: -2.0 } }
  /* "Defer non-urgent capital spending" authors nothing here. It is a financial
     decision; its operational consequence is the 13 points of safety it costs,
     which every safety-reading figure already picks up. It must not be able to
     LOOK like a discharge intervention just because it improves the budget. */
};

/* Short authored commentary keyed off the source metric's current band tone,
   so the page reads as narrative rather than a number dump. Falls back to the
   band's own authored `line` from METRIC_DEFS for any tone not listed. */
var REPORTING_COMMENTARY = {
  budget: {
    critical: 'Financial control has failed; agency and non-pay overspends are driving the deficit.',
    warn:     'The run rate is behind plan. Pay and agency pressure needs a credible recovery grip.',
    neutral:  'Income and expenditure are broadly balanced against the quarter plan.',
    good:     'A modest surplus is opening headroom while clinical income holds.',
    great:    'A strong surplus is protecting investment without cutting into frontline pay.'
  },
  waiting: {
    great:    'Flow is strong: occupancy, length of stay and cancellations are all below plan.',
    good:     'Throughput is ahead of peers; delayed transfers and handover delays are contained.',
    neutral:  'Occupancy and length of stay sit within tolerance for the current demand.',
    warn:     'Rising occupancy is lengthening stays and pushing cancellations and handover delays up.',
    critical: 'Beds are gridlocked; delayed transfers and ambulance handovers are failing the standard.'
  },
  morale: {
    critical: 'Vacancy, turnover and sickness are all elevated, forcing heavy bank and agency cover.',
    warn:     'Workforce pressure is climbing and temporary staffing spend is following it up.',
    neutral:  'Vacancy and sickness are within tolerance but teams have little spare capacity.',
    good:     'Retention is above peer median, holding agency spend down and the survey up.',
    great:    'A thriving workforce is minimising vacancy, sickness and temporary staffing cost.'
  },
  safety: {
    critical: 'Harm indicators are rising and never events are recurring; regulatory action is likely.',
    warn:     'Moderate-harm incidents are above tolerance and harm-free care is slipping.',
    neutral:  'Harm-free care and incident rates are within expected tolerance for this pressure.',
    good:     'Harm-free care is above peer median and never events are being designed out.',
    great:    'Top-decile safety: incidents are low and harm-free care is at the ceiling.'
  },
  patsat: {
    critical: 'Complaints are outpacing resolution and Friends and Family scores have collapsed.',
    warn:     'Complaints are rising faster than they are closed and recommendation rates are falling.',
    neutral:  'Complaints and recommendation rates are within expected tolerance.',
    good:     'Positive feedback is above peer median and complaints are being contained.',
    great:    'Top-decile experience: recommendation rates are high and complaints are low.'
  },
  rep: {
    critical: 'Public confidence has collapsed, compounding recruitment and partnership difficulty.',
    warn:     'Adverse coverage is shaping the public account of the trust.',
    neutral:  'External confidence is holding despite visible operational pressure.',
    good:     'The trust is trusted locally, easing recruitment and partnership working.',
    great:    'A top-tier public standing is amplifying confidence across staff and partners.'
  }
};

/* ---------- on-map metric pressure model (phase 6) ----------
   Visual intensity keyed by band TONE, never by band index.
   Band ARRAY ORDER is by value and is therefore inverted for goodUp:false
   metrics (waiting authors exemplar first, critical last). Tone is authored
   by desirability and is consistent across all six metrics, so tone is the
   only safe key. Do not convert this to an index lookup.

   Every coefficient lives here, matching how phase 3 keeps its tuning in
   REPORTING_COEFFS, so playtest tuning never touches render code. Consumed by
   engine/metric-pressure.js (pure derivation) and drawn by
   engine/timeline-visuals.js. This is data only - no consumers of a metric's
   live value live here. */
var PRESSURE_MODEL = {
  waiting: {
    channel:'queueDensity',
    byTone:{critical:6, warn:4, neutral:2, good:1, great:0},
    seatTiles:[[18,11],[18,12],[18,13],[18,14],[20,11],[20,12],[20,13],[20,14]],
    illTintFromTone:{critical:0.30, warn:0.15}
  },
  morale: {
    channel:'staffIdle',
    idleByTone:{critical:3, warn:2, neutral:1, good:0, great:0},
    idleTiles:[[23,3],[24,4],[23,5]]
  },
  safety: {
    channel:'incidentRate',
    /* flashes per 10s of SIM time; 0 means the channel is silent */
    byTone:{critical:3.2, warn:1.8, neutral:0.8, good:0.25, great:0},
    flashDuration:0.34,                     /* seconds a flash stays lit */
    tiles:[[7,14],[2,14],[11,14],[24,14]]
  },
  rep: {
    channel:'pressPresence',
    /* neutral is 0. Press turn up when reputation is a problem or a story, not
       as ambient background at a stable trust. */
    byTone:{critical:4, warn:2, neutral:0, good:0, great:0},
    flashLightsFromTone:{critical:true, warn:true}
  }
};

/* ---------- internal helpers ---------- */

/* The authored opening value for a metric. Using the live METRIC_DEFS start
   keeps the anchor in one place and guarantees at-start figures equal base. */
function _start(key){
  var def = getMetricDef(key);
  return def ? def.start : 0;
}

function _clamp(v, lo, hi){
  return Math.max(lo, Math.min(hi, v));
}

/* -> value | undefined. Longest-matching key wins. Returns undefined (never
   null/0) when nothing is authored, so a legitimately authored 0 is honoured
   rather than mistaken for "absent". A ctx of null/undefined behaves exactly
   as "no overrides authored". */
function _resolveOverride(section, field, ctx){
  if(!ctx) return undefined;
  var keys = [], i, ov;
  /* most specific first */
  if(ctx.quarterId != null && ctx.optionId != null) keys.push(ctx.quarterId + ':' + ctx.optionId);
  if(ctx.quarterId != null) keys.push(ctx.quarterId);
  for(i = 0; i < keys.length; i++){
    ov = REPORTING_OVERRIDES[keys[i]];
    if(ov && ov[section] && Object.prototype.hasOwnProperty.call(ov[section], field)){
      return ov[section][field];
    }
  }
  return undefined;
}

/* Every derived field passes through here: an authored override replaces the
   derived value, otherwise the derived value falls through cleanly. */
function _field(section, field, derived, ctx){
  var ov = _resolveOverride(section, field, ctx);
  return ov === undefined ? derived : ov;
}

/* One authored additive term, from a table keyed by `key`. Unlike an override,
   these do not replace the derived value, they shift it, so the figure stays
   responsive to everything else that drives it.
   -> number; 0 whenever nothing is authored. */
function _addend(table, key, section, field){
  var entry = key == null ? null : table[key];
  var v = entry && entry[section] ? entry[section][field] : undefined;
  return typeof v === 'number' ? v : 0;
}

/* Exogenous pressure the trust did not choose. QUARTER-KEYED ONLY. */
function _exogenous(section, field, ctx){
  if(!ctx || ctx.quarterId == null) return 0;
  return _addend(REPORTING_EXOGENOUS, ctx.quarterId, section, field);
}

/* The direct mechanism of the decision the board took. QUARTER:OPTION-KEYED ONLY.
   The two are deliberately keyed differently, and it is not a detail: an
   option-keyed exogenous term would be the board's own decision in disguise, and
   a quarter-keyed mechanism would credit the board for a choice it did not make. */
function _mechanism(section, field, ctx){
  if(!ctx || ctx.quarterId == null || ctx.optionId == null) return 0;
  return _addend(REPORTING_MECHANISMS, ctx.quarterId + ':' + ctx.optionId, section, field);
}

/* Both authored addends for a figure. Every Operations and Workforce figure adds
   this, so an authored term needs no change to a derivation to take effect.
   -> number; 0 for a null ctx, so the opening board position is unshifted and
   every figure still derives to its authored base exactly. */
function _adjust(section, field, ctx){
  return _exogenous(section, field, ctx) + _mechanism(section, field, ctx);
}

/* Commentary for a metric at a value, from its band tone. */
function _commentary(key, value){
  var band = getMetricBand(key, value);
  var map = REPORTING_COMMENTARY[key];
  if(band && map && map[band.tone]) return map[band.tone];
  return band ? band.line : '';
}

/* Tone for a benchmark value against an ascending band list. `to` is INCLUSIVE,
   matching getMetricBand() at metric-semantics.js:25 - a second boundary
   convention in the same codebase would be a bug waiting to happen. Returns the
   last band's tone for anything past the final boundary (unreachable when the
   list ends open, kept as a guard for lists that do not), and never throws on an
   empty or absent list.

   The inclusive bound is load-bearing, not stylistic: at the opening board
   position occupancy derives to exactly occBase = 92 = occupancyNorm, so an
   exclusive bound would drop the norm itself into the `warn` band and print an
   amber "ELEVATED" chip directly above a sentence saying the trust is exactly on
   its norm.
   -> 'good'|'neutral'|'warn'|'critical' */
function getBenchmarkTone(bands, value){
  var i;
  if(!bands || !bands.length) return 'neutral';
  for(i = 0; i < bands.length; i++){
    if(value <= bands[i].to) return bands[i].tone;
  }
  return bands[bands.length - 1].tone;
}

/* The authored benchmark band list for a derived figure, addressed by the
   namespace it lives under in REPORTING_COEFFS plus its row id:
   ('operational', 'losPct') -> REPORTING_BENCHMARKS.operational.losPctBands.
   -> band list | null when a figure has no authored benchmark. */
function _bandsFor(namespace, id){
  var ns = REPORTING_BENCHMARKS[namespace];
  var bands = ns ? ns[id + 'Bands'] : null;
  return bands || null;
}

/* A single non-finance display row, honouring the phase-1 band-{tone} contract.

   TONE COMES FROM THE FIGURE, judged against its own authored benchmark bands -
   never from the source metric's band. Taking it from the source made the colour
   decorative: every row in a tab shared one tone whatever its own value, so at
   Q3 all five Operations rows were amber together while never events read amber
   at ZERO, its best attainable result. The same band-{tone} class is diagnostic
   on the Finance variance cells, so a decorative use of it teaches the player
   that the colour means nothing.

   An earlier comment here argued the opposite - that a figure whose only meaning
   is "this is what waiting pressure does to the wards" should inherit the source
   band, leaving the Operations tab two tone sources on purpose. That held while
   occupancy was the only figure with an authored benchmark. Every derived figure
   now has one, so there is one tone source and it is the figure's own.

   A figure with no authored bands renders `neutral` (getBenchmarkTone's
   behaviour on a null list) rather than falling back to the source metric.

   `sourceKey`/`sourceValue` are retained: they still drive `commentary`, which is
   deliberately unchanged. The Operations narrative is about waiting pressure and
   reads correctly for all five rows. This changes colour, not prose. */
function _row(id, label, value, unit, sourceKey, sourceValue, namespace){
  return {
    id:         id,
    label:      label,
    value:      value,
    unit:       unit,
    source:     sourceKey,
    tone:       getBenchmarkTone(_bandsFor(namespace, id), value),
    commentary: _commentary(sourceKey, sourceValue)
  };
}

/* The direction of good for an I&E line, given only its block. Every
   conventional line follows it: income is better when there is more of it,
   expenditure when there is less. Authored `goodWhen` overrides it, and exactly
   one line needs to - see below.
   -> 'up' | 'down' */
function _defaultGoodWhen(kind){
  return kind === 'income' ? 'up' : 'down';
}

/* One I&E line. `budget` is the plan (budgeted) figure, `actual` the derived
   position, `variance` = actual - plan.

   `kind` IS GROUPING AND ARITHMETIC ONLY: which block the line renders in and
   which side of the reconciliation it sits on. `goodWhen` IS DIRECTION OF GOOD,
   and is what the tone and the displayed variance sign read.

   These were one field, and the split is not tidying. `kind` was doing four
   unrelated jobs - favourability here, grouping in the totalling loop below,
   the CSS class in _finRow(), and the display sign in _finMoney() - and the two
   favourability jobs are the ones that break when a line's block and its
   direction of good disagree. That happens the moment the balancing plug moves
   to a reserves drawdown: an INCOME-block line where a LARGER actual is worse,
   because it means the trust covered its position by spending its reserves.
   Under the old rule that line rendered green while the reserves drained, which
   is the decorative-colour failure X3 was raised to remove, reintroduced on the
   one line that most needs to be read correctly.

   Everything except tone and variance sign still reads `kind`, so grouping,
   totalling, the CSS classes and the display sign are all unchanged. */
function _ieLine(id, label, plan, actual, kind, goodWhen){
  goodWhen = goodWhen || _defaultGoodWhen(kind);
  var variance = actual - plan;
  var favourable = goodWhen === 'up' ? variance >= 0 : variance <= 0;
  var tone = Math.abs(variance) < 0.05 ? 'neutral' : (favourable ? 'good' : 'warn');
  return { id: id, label: label, kind: kind, goodWhen: goodWhen, budget: plan,
           actual: actual, variance: variance, tone: tone };
}

/* ---------- derivations ---------- */

/* Finance. Reconciles by construction: every OPERATIONAL line is derived (and
   may be overridden), then one balancing line is solved for whatever makes
     sum(income) - sum(expenditure) === stats.budget
   hold exactly. An override on any derived line therefore re-runs the balance,
   so an authored figure can never break reconciliation. The balancing line is
   not itself overridable - the reconciliation requirement always wins.

   WHICH LINE CARRIES THE PLUG IS THE WHOLE POINT (X11). It used to be
   `Other operating income`, and putting the plug on an operational income line
   made that line dishonest in a specific, repeatable way: it absorbed the sum of
   everybody else's adverse variances and reported the total back as good news.
   See the worked example above REPORTING_COEFFS.finance.

   The plug is now `Reserves & contingency drawdown`, and it is the one line on
   an NHS I&E where a board EXPECTS elasticity: a worsening position is covered
   by drawing on reserves, a strong one transfers back. It is authored
   goodWhen:'down' - it sits in the income block because that is which side of
   the reconciliation it falls on, but a larger drawdown is a worse result, not a
   better one. That combination is the reason _ieLine() carries `goodWhen` at all.

   Every other income line is now derived and defensible, so nothing on the page
   is favourable merely because something else went wrong.
   -> {lines:[{id,label,kind,goodWhen,budget,actual,variance,tone}],
       surplus, totalIncome, totalExpenditure} */
function deriveIncomeExpenditure(stats, ctx){
  var c = REPORTING_COEFFS.finance;
  var budget = stats.budget;

  /* higher waiting -> lower elective throughput -> lower clinical income */
  var clinical = _field('finance', 'clinicalIncome',
    c.clinicalIncomeBase - c.kInc * (stats.waiting - _start('waiting')), ctx);
  /* private work follows the trust's public standing */
  var privatePatients = _field('finance', 'privateIncome',
    c.privateIncomeBase + c.kPrivateRep * (stats.rep - _start('rep')), ctx);
  /* education and research income falls with the safety record that placements
     and trainees depend on */
  var otherIncome = _field('finance', 'otherIncome',
    c.otherIncomeBase - c.kOtherSafety * (_start('safety') - stats.safety), ctx);
  /* pay rises as the financial position and morale fall */
  var pay = _field('finance', 'paySpend',
    c.payBase + c.kPay * (-budget) + c.kMor * (_start('morale') - stats.morale), ctx);
  /* bank & agency rises as morale falls */
  var agency = _field('finance', 'agencySpend',
    c.agencyBase + c.kAgency * (_start('morale') - stats.morale), ctx);
  /* drugs rise with the financial position AND with activity - the second term
     is what stops this and clinical supplies being one line printed twice */
  var drugs = _field('finance', 'drugsSpend',
    c.drugsBase + c.kDrugsBudget * (-budget) +
    c.kDrugsActivity * (stats.waiting - _start('waiting')), ctx);
  /* clinical supplies and the rest of non-pay rise as the position falls */
  var supplies = _field('finance', 'suppliesSpend',
    c.suppliesBase + c.kSuppliesBudget * (-budget), ctx);

  var expenditure = pay + agency + drugs + supplies;
  /* The plug, solved not derived: everything else is fixed by this point, so
     this is the only value that can make the reconciliation hold. Deliberately
     NOT wrapped in _field() - an authored override here would break the
     identity the whole function guarantees. */
  var drawdown = budget + expenditure - clinical - privatePatients - otherIncome;

  var lines = [
    _ieLine('clinicalIncome', 'Clinical income',                   c.clinicalIncomeBase, clinical,        'income'),
    _ieLine('privateIncome',  'Private patients',                  c.privateIncomeBase,  privatePatients, 'income'),
    _ieLine('otherIncome',    'Other operating income',            c.otherIncomeBase,    otherIncome,     'income'),
    _ieLine('drawdown',       'Reserves & contingency drawdown',   c.drawdownBase,       drawdown,        'income', 'down'),
    _ieLine('paySpend',       'Pay expenditure',                   c.payBase,            pay,             'expenditure'),
    _ieLine('agencySpend',    'Bank & agency',                     c.agencyBase,         agency,          'expenditure'),
    _ieLine('drugsSpend',     'Drugs',                             c.drugsBase,          drugs,           'expenditure'),
    _ieLine('suppliesSpend',  'Clinical supplies & other non-pay', c.suppliesBase,       supplies,        'expenditure')
  ];

  var income = 0, spend = 0, i;
  for(i = 0; i < lines.length; i++){
    if(lines[i].kind === 'income') income += lines[i].actual;
    else spend += lines[i].actual;
  }
  return { lines: lines, surplus: income - spend,
           totalIncome: income, totalExpenditure: spend };
}

/* ---------- THE LAYERING RULE - read this before adding a derived figure ----
   Layer-1 anchor figures. Both deriveOperational() and deriveWorkforce() need
   these, and each depends only on the six source metrics, so this helper can be
   called from either without recursion. THIS IS THE ONLY LAYER-1 FUNCTION.

   The rule, stated as a rule:

     LAYER 1 (this function) reads SOURCE METRICS ONLY.
       occupancy   <- waiting
       vacancyRate <- morale, budget
     LAYER 2 (every other derived figure) may read source metrics and the layer-1
       anchors returned from here, and may NEVER read another layer-2 figure.
     deriveOperational() must never call deriveWorkforce(), and the reverse.

   The rule exists because the model genuinely wants cross-tab drivers -
   cancelledOps <- occupancy + vacancyRate, sickness <- morale + occupancy - and
   taken literally that is deriveOperational() calling deriveWorkforce() calling
   deriveOperational(), i.e. a stack overflow the first time the pack is opened.
   If a new figure needs another figure as a driver it is a layer-2 figure and it
   reads the anchor from here. Do not promote a second function to layer 1, and do
   not cross-call the two derive functions.

   TWO DETAILS THAT ARE LOAD-BEARING:

   (a) The anchors resolve through _field() HERE, before any dependant reads them,
       so an authored override on `occupancy` reaches losPct, ambulanceHandover
       and cancelledOps too. Without that, an author can put the pack into a state
       where the occupancy row says 97% while length of stay is derived as though
       it were 91%.

   (b) Dependants read the PRE-CLAMP anchor (`occupancyRaw` / `vacancyRateRaw`).
       Occupancy saturates its [82, 99] clamp on a material share of legal paths -
       it is the one figure at 100% clamp utilisation, by design. If the dependants
       read the clamped value, then on every high-pressure path they would all
       flatten at the same instant, which is exactly the lockstep this layer exists
       to remove, rebuilt at the top of the range. The clamped value is for
       display; the raw value is what the rest of the model is made of.

   -> {occupancy, occupancyRaw, vacancyRate, vacancyRateRaw} */
function _deriveAnchors(stats, ctx){
  var o = REPORTING_COEFFS.operational;
  var w = REPORTING_COEFFS.workforce;
  var waitingUp  = stats.waiting - _start('waiting');
  var moraleDown = _start('morale') - stats.morale;
  /* budget's authored start is 0, so this is just -budget. Written as a delta
     from the start anyway: the opening-position invariant depends on every driver
     term being zero-centred at the start, not on budget's start staying 0. */
  var budgetDown = _start('budget') - stats.budget;

  /* An override sets the raw value, so it reaches both the display figure and
     every dependant - and so does an authored direct mechanism, which is why
     "open 18 escalation beds" shortens length of stay and cuts handover delays
     without any of those figures having to know the option exists. */
  var occRaw = _field('operational', 'occupancy',
    o.occBase + o.kOcc * waitingUp + _adjust('operational', 'occupancy', ctx), ctx);
  var vacRaw = _field('workforce', 'vacancyRate',
    w.vacBase + w.kVac * moraleDown + w.kVacBudget * budgetDown +
    _adjust('workforce', 'vacancyRate', ctx), ctx);

  return {
    occupancy:      _clamp(occRaw, o.occClamp[0], o.occClamp[1]),
    occupancyRaw:   occRaw,
    vacancyRate:    _clamp(vacRaw, w.vacClamp[0], w.vacClamp[1]),
    vacancyRateRaw: vacRaw
  };
}

/* Operations. All five figures still worsen as pressure rises, but each now has
   its own second driver so no two of them are the same number in different units:
     occupancy         <- waiting                       (layer-1 anchor)
     losPct            <- occupancy, morale
     dtocBeds          <- waiting (weakly), budget, authored exogenous term
     ambulanceHandover <- occupancy, safety
     cancelledOps      <- occupancy, vacancyRate
   -> {occupancy, losPct, dtocBeds, ambulanceHandover, cancelledOps} */
function deriveOperational(stats, ctx){
  var c = REPORTING_COEFFS.operational;
  var a = _deriveAnchors(stats, ctx);
  var w          = stats.waiting - _start('waiting');
  var occUp      = a.occupancyRaw - c.occBase;
  var vacUp      = a.vacancyRateRaw - REPORTING_COEFFS.workforce.vacBase;
  var moraleDown = _start('morale') - stats.morale;
  var safetyDown = _start('safety') - stats.safety;
  var budgetDown = _start('budget') - stats.budget;
  return {
    occupancy:         a.occupancy,
    losPct:            _field('operational', 'losPct',
      _clamp(c.losBase + c.kLosOcc * occUp + c.kLosMor * moraleDown +
             _adjust('operational', 'losPct', ctx),
             c.losClamp[0], c.losClamp[1]), ctx),
    dtocBeds:          _field('operational', 'dtocBeds',
      _clamp(c.dtocBase + c.kDtoc * w + c.kDtocBudget * budgetDown +
             _adjust('operational', 'dtocBeds', ctx),
             c.dtocClamp[0], c.dtocClamp[1]), ctx),
    ambulanceHandover: _field('operational', 'ambulanceHandover',
      _clamp(c.handBase + c.kHandOcc * occUp + c.kHs * safetyDown +
             _adjust('operational', 'ambulanceHandover', ctx),
             c.handClamp[0], c.handClamp[1]), ctx),
    cancelledOps:      _field('operational', 'cancelledOps',
      _clamp(c.cancBase + c.kCancOcc * occUp + c.kCancVac * vacUp +
             _adjust('operational', 'cancelledOps', ctx),
             c.cancClamp[0], c.cancClamp[1]), ctx)
  };
}

/* Bed occupancy prepared for gauge display. The value, range and clamp all come
   from the existing operational derivation, so the gauge can never disagree with
   the figure in the row list beside it or drift from the model's own clamp.

   deriveOperational() is deliberately called a second time rather than having
   the view thread its already-derived value in: it is pure and cheap, and this
   way an authored REPORTING_OVERRIDES entry on `occupancy` reaches the gauge
   automatically. Threading the value in from the view is the route by which the
   two presentations drift apart.

   Returns numbers only - no rounding, no wording, no colour. Presentation happens
   in report-view.js, matching the rule that rounding never enters the derivation.
   -> {value, min, max, norm, normLabel, tone, delta, bands} */
function getOccupancyGauge(stats, ctx){
  var c = REPORTING_COEFFS.operational;
  var b = REPORTING_BENCHMARKS.operational;
  var value = deriveOperational(stats, ctx).occupancy;
  return {
    value:     value,
    min:       c.occClamp[0],
    max:       c.occClamp[1],
    norm:      b.occupancyNorm,
    normLabel: b.occupancyNormLabel,
    tone:      getBenchmarkTone(b.occupancyBands, value),
    delta:     value - b.occupancyNorm,
    bands:     b.occupancyBands
  };
}

/* Workforce. All four still move with `morale` as their primary driver, but each
   has a DISTINCT second driver, so no two of them share a driver set and the four
   rows can disagree with one another:
     vacancyRate <- morale, budget                      (layer-1 anchor)
     turnover    <- morale, rep
     sickness    <- morale, occupancy
     surveyScore <- morale, safety, rep
   Bank & agency spend is a finance figure and lives on the I&E, not here - see
   REPORTING_COEFFS.workforce.
   -> {vacancyRate, turnover, sickness, surveyScore} */
function deriveWorkforce(stats, ctx){
  var c = REPORTING_COEFFS.workforce;
  var a = _deriveAnchors(stats, ctx);
  var m     = _start('morale') - stats.morale;
  var occUp = a.occupancyRaw - REPORTING_COEFFS.operational.occBase;
  return {
    vacancyRate:     a.vacancyRate,
    turnover:        _field('workforce', 'turnover',
      _clamp(c.turnBase + c.kTurn * m + c.kTurnRep * (_start('rep') - stats.rep) +
             _adjust('workforce', 'turnover', ctx),
             c.turnClamp[0], c.turnClamp[1]), ctx),
    sickness:        _field('workforce', 'sickness',
      _clamp(c.sickBase + c.kSick * m + c.kSickOcc * occUp +
             _adjust('workforce', 'sickness', ctx),
             c.sickClamp[0], c.sickClamp[1]), ctx),
    surveyScore:     _field('workforce', 'surveyScore',
      _clamp(c.survBase + c.kSurv * (stats.morale - _start('morale')) +
                          c.kSurvSafety * (stats.safety - _start('safety')) +
                          c.kRep * (stats.rep - _start('rep')) +
                          _adjust('workforce', 'surveyScore', ctx),
             c.survClamp[0], c.survClamp[1]), ctx)
  };
}

/* Quality & safety. Incidents/never-events/complaints worsen as safety/patsat
   fall; harm-free care and FFT improve as safety/patsat rise.
   -> {incidents, neverEvents, harmFreePct, complaints, fftScore} */
function deriveQuality(stats, ctx){
  var c = REPORTING_COEFFS.quality;
  return {
    incidents:   _field('quality', 'incidents',
      _clamp(c.incBase + c.kInc2 * (_start('safety') - stats.safety),
             c.incClamp[0], c.incClamp[1]), ctx),
    neverEvents: _field('quality', 'neverEvents',
      Math.floor(Math.max(0, (c.neverAnchor - stats.safety)) / c.kNever), ctx),
    harmFreePct: _field('quality', 'harmFreePct',
      _clamp(c.harmBase + c.kHarm * (stats.safety - _start('safety')),
             c.harmClamp[0], c.harmClamp[1]), ctx),
    complaints:  _field('quality', 'complaints',
      _clamp(c.compBase + c.kComp * (_start('patsat') - stats.patsat),
             c.compClamp[0], c.compClamp[1]), ctx),
    fftScore:    _field('quality', 'fftScore',
      _clamp(c.fftBase + c.kFft * (stats.patsat - _start('patsat')),
             c.fftClamp[0], c.fftClamp[1]), ctx)
  };
}

/* Nearest authored threshold to a value, with signed distance. Thin wrapper over
   describeThresholdDistance() in metric-semantics.js so the selection rule and
   the distance exist once; callers that need to know which SIDE of the threshold
   the value is on should call that directly, because the sign of `distance` does
   not answer it for an 'above' threshold.
   -> {threshold, distance} | null when the metric has no thresholds. */
function getNearestThreshold(key, value){
  var d = describeThresholdDistance(key, value);
  return d ? { threshold: d.threshold, distance: d.distance } : null;
}

/* Section lookup used by the view. -> {id, title, rows, commentary} | null for
   an unknown id (never throws). */
function getReportSection(id, stats, ctx){
  var s, rows;
  switch(id){
    case 'finance': {
      var ie = deriveIncomeExpenditure(stats, ctx);
      rows = [];
      for(var i = 0; i < ie.lines.length; i++){
        var l = ie.lines[i];
        rows.push({ id: l.id, label: l.label, kind: l.kind, goodWhen: l.goodWhen,
                    plan: l.budget, value: l.actual, variance: l.variance,
                    unit: '£m', tone: l.tone });
      }
      rows.push({ id: 'surplus', label: 'Surplus / (deficit)', value: ie.surplus,
                  unit: '£m', tone: getMetricBand('budget', stats.budget).tone });
      return { id: id, title: 'Income & Expenditure', rows: rows,
               surplus: ie.surplus, commentary: _commentary('budget', stats.budget) };
    }
    case 'operations': {
      s = deriveOperational(stats, ctx);
      rows = [
        /* Occupancy resolves to REPORTING_BENCHMARKS.operational.occupancyBands,
           the same list getOccupancyGauge() reads, so the row and the gauge above
           it can never show different tones for the same figure. */
        _row('occupancy',         'Bed occupancy',                s.occupancy,         '%',       'waiting', stats.waiting, 'operational'),
        _row('losPct',            'Length of stay index',         s.losPct,            '',        'waiting', stats.waiting, 'operational'),
        _row('dtocBeds',          'Delayed transfers of care',    s.dtocBeds,          ' beds',   'waiting', stats.waiting, 'operational'),
        _row('ambulanceHandover', 'Ambulance handovers >30min',   s.ambulanceHandover, '',        'waiting', stats.waiting, 'operational'),
        _row('cancelledOps',      'Cancelled operations',         s.cancelledOps,      '',        'waiting', stats.waiting, 'operational')
      ];
      return { id: id, title: 'Operational Performance', rows: rows,
               commentary: _commentary('waiting', stats.waiting) };
    }
    case 'workforce': {
      s = deriveWorkforce(stats, ctx);
      rows = [
        _row('vacancyRate',     'Vacancy rate',       s.vacancyRate,     '%',      'morale', stats.morale, 'workforce'),
        _row('turnover',        'Staff turnover',     s.turnover,        '%',      'morale', stats.morale, 'workforce'),
        _row('sickness',        'Sickness absence',   s.sickness,        '%',      'morale', stats.morale, 'workforce'),
        _row('surveyScore',     'Staff survey score', s.surveyScore,     ' / 10',  'morale', stats.morale, 'workforce')
      ];
      return { id: id, title: 'Workforce', rows: rows,
               commentary: _commentary('morale', stats.morale) };
    }
    case 'quality': {
      s = deriveQuality(stats, ctx);
      rows = [
        _row('incidents',   'Moderate-harm incidents', s.incidents,   ' / month', 'safety', stats.safety, 'quality'),
        _row('neverEvents', 'Never events',            s.neverEvents, '',         'safety', stats.safety, 'quality'),
        _row('harmFreePct', 'Harm-free care',          s.harmFreePct, '%',        'safety', stats.safety, 'quality'),
        _row('complaints',  'Complaints',              s.complaints,  '',         'patsat', stats.patsat, 'quality'),
        _row('fftScore',    'FFT recommend',           s.fftScore,    '%',        'patsat', stats.patsat, 'quality')
      ];
      return { id: id, title: 'Quality & Safety', rows: rows,
               commentary: _commentary('safety', stats.safety) };
    }
    default:
      return null;
  }
}
