'use strict';
/* ---------- reporting model (phase 3) ----------
   A pure derivation layer that turns the six board metrics into plausible NHS
   operational figures for the Performance Analysis board-pack page.

   >>> DESIGN REASONING LIVES IN docs/reporting-model-design.md. <<<
   The comments here state the rules and warn against reversing them; that
   document holds the measurements, the alternatives tried and rejected, and the
   defect each rule exists to prevent. Section references below (design notes §N)
   point into it. If you are about to change a coefficient, a clamp, a band or a
   driver, read the matching section first - most of the obvious "tidy-ups" here
   have already been measured and are worse.

   Everything is DERIVED from a stats snapshot; nothing is a new source of truth
   and nothing is written back. All functions are deterministic: no RNG, no DOM,
   no reads of live METRIC_CUR.

   Loaded AFTER metric-semantics.js (needs getMetricDef / getMetricBand) and
   BEFORE quarters-data.js.

   Direction is stated explicitly per figure rather than inferred from goodUp -
   the single biggest risk here is a sign flip, because `waiting` worsens as it
   rises while everything else improves as it rises.

   ctx = {quarterId, optionId, outcome, history} - the report snapshot. Optional;
   when null/undefined, derivation runs with no overrides and no authored
   addends, so every figure sits exactly on its base.

   Figures are calibrated on the PLAYER-VISIBLE snapshot set (the Q1-Q3 closes,
   768 of the 1024 derivable), never on all four closes - design notes §2.
--------------------------------------------------------------------------- */

/* Every tunable coefficient and clamp bound lives here so figures can be
   retuned without hunting through function bodies. Clamp bounds are [lo, hi].
   Each figure is anchored on its source metric's authored `start` value (pulled
   live from METRIC_DEFS via _start), so at the opening board position every
   derived figure sits exactly on its `base`. */
var REPORTING_COEFFS = {
  /* ---------- Finance (X11) - design notes §6 ----------
     PLAN-BALANCE INVARIANT, asserted: the bases balance exactly.
       income      95.0 + 2.5 + 10.5 + 0.0  = 108.0
       expenditure 68.0 + 6.0 + 12.0 + 22.0 = 108.0
     So at the opening position every line derives to its own plan and the
     surplus is 0. Re-pitch one base and you must re-pitch another. */
  finance: {
    /* £m per quarter. --- INCOME --- */
    /* A gridlocked front door displaces the elective work the tariff is earned on. */
    clinicalIncomeBase: 95,   kInc: 0.15,
    /* The only rep-driven finance line. Deliberately small in scale (~+/-0.5 on a
       2.5 plan): a trust this size does not fund itself out of private work, and
       a line that moved further would say it did. */
    privateIncomeBase:   2.5, kPrivateRep: 0.02,
    /* Education, training and research income - no longer the plug. Driven by
       SAFETY, which looks surprising and is the most defensible driver
       available; `waiting` or `morale` would each duplicate another line.
       Design notes §6.4. */
    otherIncomeBase:    10.5, kOtherSafety: 0.04,
    /* The plug's plan is 0: a trust does not BUDGET to raid its reserves, which
       is why any movement at all is a variance worth colouring. No coefficient -
       it is solved for, not derived. */
    drawdownBase:        0,
    /* --- EXPENDITURE --- */
    payBase:            68,   kPay: 0.40, kMor: 0.05,  /* rises as budget/morale fall */
    agencyBase:          6,   kAgency: 0.12,           /* rises as morale falls */
    /* Non-pay was ONE line of 34 with a single kNonPay 0.25, now split 12/22 with
       the coefficient split in the same proportion (0.09 + 0.16 = 0.25), so the
       aggregate budget response is unchanged.
       kDrugsActivity IS WHAT MAKES THE SPLIT WORTH ANYTHING - two lines driven by
       one coefficient in fixed proportion are one line printed twice, i.e. the
       X10 defect rebuilt in the finance table.
       Activity is `waiting`, NOT the occupancy anchor: occupancy's denominator
       moves, so opening escalation beds would CUT the drugs bill. Design
       notes §6.4. */
    drugsBase:          12,   kDrugsBudget: 0.09, kDrugsActivity: 0.03,
    suppliesBase:       22,   kSuppliesBudget: 0.16
  },
  /* ---------- Operations (X10) - design notes §4 ----------
     Every figure used to be `base + k x (waiting - start)`: five rows, one number,
     correlations 0.83-0.997. Each now carries a DISTINCT second driver.

     DO NOT "TIDY" THE ASYMMETRY. Length of stay is deliberately MORALE-LED
     (kLosMor >= kLosOcc) while handovers are deliberately OCCUPANCY-LED
     (kHandOcc >> kHs). Morale and safety themselves correlate 0.88, so two
     figures that are BOTH occupancy-led are two views of occupancy however
     different their second driver looks on paper. Re-pointing length of stay at
     occupancy puts the worst operations pair straight back to 0.96.

     These coefficients carry the trust's GENERAL CONDITION and cannot express
     what one option does - that is REPORTING_MECHANISMS' job.

     Dependants read the PRE-CLAMP anchors; see the layering rule above
     _deriveAnchors(). */
  operational: {
    /* Layer-1 anchor. Already traverses its whole clamp and reaches all four
       bands, so kOcc is deliberately left alone. */
    occBase:  92,  kOcc:  0.35, occClamp:  [82, 99],       /* % */
    /* A full hospital discharges slowly (kLosOcc), and discharge pace needs staff
       to do the discharging (kLosMor - the larger term, see above). Floor moved
       90 -> 85, the one permitted clamp change: at 90, 12.5% of visible snapshots
       sat exactly on it against a 10% budget; at 85 it is 2.1%. No band moved. */
    losBase: 100,  kLosOcc: 0.70, kLosMor: 0.70, losClamp: [85, 125], /* index */
    /* Delayed transfers. X10 asked for kDtoc to be WEAKENED; it is 0.65, slightly
       STRONGER than the 0.60 it replaced, because measurement showed the
       coefficient was not carrying the collinearity - the three other drivers
       broke it. Weakening to 0.35 leaves correlation at 0.870 and costs 6 points
       of traversal. kDtocBudget is beds held per £1m of deficit (a trust in
       deficit cannot fund brokerage, transport and packages of care) and is large
       on purpose, to supply variance waiting does not.
       KNOWN SHORTFALL, deliberate: traverses 47% of its [0, 80] clamp against a
       55% bar, and the assertion says so in its own name. Closing the gap costs
       the correlation this work exists to fix. Design notes §4. */
    dtocBase: 35,  kDtoc: 0.65, kDtocBudget: 3.20, dtocClamp: [0, 80], /* beds */
    /* Re-pointed from `waiting` to the occupancy anchor so the causal chain reads
       front door -> beds -> handover. Occupancy-led on purpose - see above. */
    handBase: 20,  kHandOcc: 1.20, kHs: 0.38, handClamp: [0, Infinity], /* count */
    /* Cancelled for want of a bed (kCancOcc) or a theatre team (kCancVac). The one
       cross-tab driver, and the reason _deriveAnchors() exists. kCancVac is large
       because vacancy is a narrow-range figure: at a proportionate-looking 0.60
       this stays a relabelled occupancy and the worst pair measures 0.94. */
    cancBase:  8,  kCancOcc: 0.78, kCancVac: 2.25, cancClamp: [0, Infinity] /* count */
  },
  /* ---------- Workforce (X9) - design notes §5 ----------
     Vacancy, turnover and sickness were all `base + k x (morale - start)` - one
     variable in three costumes, pairwise correlations exactly 1.0000, and two
     figures reaching only 2 of their 4 bands. Each keeps morale as its primary
     driver and gains one DISTINCT second driver. Primary coefficients roughly
     doubled because the old ones traversed only 26-35% of their clamps. Worst
     workforce pair is now 0.867; all four traverse 58-78%. */
  workforce: {
    /* Layer-1 anchor. A trust in deficit holds posts vacant, so this is a
       financial lever as much as a workforce outcome. kVacBudget 1.00 reads as a
       point of vacancy held per £1m of deficit, and is NOT proportionate to the
       two metrics' ranges on purpose: at a proportionate 0.25 the worst pair is
       0.91 and traversal 51%; at 1.00, 0.87 and 58%. */
    vacBase:   9,   kVac:  0.33, kVacBudget: 1.00, vacClamp:  [2, 20],   /* % */
    /* Staff leave a trust whose public standing is poor, and it recruits more
       slowly against the same reputation. NOT coupled to vacancy - that would
       re-import the collinearity being removed. */
    turnBase: 13,   kTurn: 0.25, kTurnRep: 0.22, turnClamp:  [5, 22],   /* % */
    /* The one workforce figure that should respond to operational pressure
       (kSickOcc, on the pre-clamp occupancy anchor). */
    sickBase:  4.5, kSick: 0.11, kSickOcc: 0.15, sickClamp: [2, 9],    /* % */
    /* Bank & agency spend is NOT derived here - it is an I&E expenditure line with
       a plan and a variance, derived once under `finance`. A second copy kept in
       step by comment alone is how Finance and Workforce end up reporting
       different agency spend for the same quarter two clicks apart.

       Survey: kSurvSafety is the dominant second term, not kRep. The best-known
       survey question asks whether staff would be happy for a friend or relative
       to be treated here, which tracks safety at least as much as morale, and
       safety moves over a far wider range than reputation. kRep must stay
       strictly positive - it is authored behaviour and is asserted. */
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

/* Reference points a board reads a figure AGAINST - design notes §8.

   Kept separate from REPORTING_COEFFS because these are not tuning constants:
   retuning a coefficient changes a derived VALUE, changing a benchmark changes
   what that value MEANS. They are also the most likely to be replaced with real
   published values after NHS review, so they need to be findable in one place.

   Bands are authored ASCENDING by `to`; `to` is the INCLUSIVE upper bound of its
   own band (the contract METRIC_DEFS uses and getMetricBand() implements); the
   final band is open-ended.

   TONE DIRECTION IS PER FIGURE and getBenchmarkTone() CANNOT CHECK IT. Authoring
   a higher-is-better list in the lower-is-better order colours a good figure red
   and nothing in the code will catch it, so each list states its direction and
   the band-contract test asserts the tone sequence is monotonic.

   Boundaries are pitched against the CLAMPS, not the narrower range the figures
   currently traverse, so they still read correctly when coefficients widen. Every
   base sits in `neutral` by construction: an ordinary functioning hospital is on
   its norm, not doing well.

   The `Norm`/`NormLabel` label is deliberately "Trust operating norm" and nothing
   else. These are fictional coefficients for a training game; wording implying an
   external authority ("national standard", "NHS target") would be repeated in a
   real meeting as though it were one. Asserted. */
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

/* REPLACES the derived value. 'quarterId:optionId' wins over 'quarterId', which
   wins over the derived value; longest key wins. Design notes §7.

   Nothing is authored here at present, deliberately: Q2's old hard `dtocBeds: 41`
   made the headline figure of the Capacity Strain quarter read 41 whatever the
   board did. That intent is now an ADDITIVE term in REPORTING_EXOGENOUS, which
   shifts the figure without freezing it.

   A hard override is the right tool for a one-off authored fact the model has no
   business deriving. Use it for that, not to pin a figure the player is meant to
   be able to move. A figure must never be authored BOTH here and in an additive
   table - the override wins silently and the addend becomes dead code. Asserted. */
var REPORTING_OVERRIDES = {};

/* ADDS to the derived figure. Exogenous pressure the trust does not control,
   keyed by the quarter whose OUTCOME is being reported. Design notes §7.

   KEYED BY QUARTER ONLY, never 'quarter:option'. That is the whole point: an
   option-keyed exogenous term would be the board's own decision in disguise. If a
   figure should respond to the decision, give it a driver, not an entry here.

   A missing key and a null ctx both resolve to 0, so the opening board position
   still derives to base exactly. Being additive rather than an override is what
   lets the board still move the figure in the quarter the pressure lands.

   VALUES TRACK THE AUTHORED `bridge` PROSE in quarters-data.js - CHANGE ONE,
   CHANGE THE OTHER. Each is the pressure sitting on the trust DURING that
   quarter, not a running total, which is why Q3's is small: its external event is
   a reputational one, not a discharge one.

   THE Q4 ENTRY IS NEVER RENDERED (a pack reports the previous quarter's outcome)
   and is excluded from calibration. An earlier revision had it at +26 and leaned
   on it for a clamp figure nobody could ever see; it is now sized from the prose
   alone. */
var REPORTING_EXOGENOUS = {
  'Q2': { operational: { dtocBeds: 14 } },
  'Q3': { operational: { dtocBeds:  3 } },
  'Q4': { operational: { dtocBeds: 14 } }
};

/* ADDS to the derived figure. The DIRECT MECHANISM of a board decision, keyed by
   'quarterId:optionId' - the exact mirror of REPORTING_EXOGENOUS above: that
   table is what the trust does not control, this is what it just chose to do.
   Design notes §7 carries the three measured defects that made it necessary.

   WHY IT CANNOT BE COEFFICIENTS. Global coefficients are averages over a year of
   decisions, so they cannot express one option's mechanism. Before this table,
   accelerating discharge REPORTED A LONGER length of stay than doing nothing,
   because the option costs morale and length of stay reads morale.

   THE RULE FOR AUTHORING ONE. Only the direct, mechanical, in-quarter consequence
   of the intervention itself - the thing true by definition of what the option
   does. Durable consequences are already carried by the option's `effects`.

     effects   = what the decision does to the trust, and keeps doing
     here      = what it mechanically does to THIS figure, this quarter
     exogenous = what happened that the board did not choose

   An option with no unambiguous direct mechanism gets NO ENTRY. Signs read in the
   figure's own direction: negative is a lower figure, which for everything here
   except cancelledOps is an improvement. */
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

   TONE COMES FROM THE FIGURE, judged against its own authored benchmark bands,
   never from the source metric's band - design notes §8. Taking it from the
   source made the colour decorative: every row in a tab shared one tone whatever
   its own value, and never events read amber at ZERO, their best attainable
   result. An earlier comment here argued the opposite; that held only while
   occupancy was the sole figure with an authored benchmark.

   A figure with no authored bands renders `neutral` rather than falling back to
   the source metric.

   `sourceKey`/`sourceValue` still drive `commentary`, which is deliberately
   unchanged - this changes colour, not prose. */
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

   Three separate concepts, which were one field until X11 (see
   docs/reporting-model-design.md §4):
     `kind`        GROUPING AND ARITHMETIC - which block the line renders in and
                   which side of the reconciliation it sits on.
     `goodWhen`    DIRECTION OF GOOD - what the tone and the variance sign read.
     `signedValue` DISPLAY SIGN - whether the Actual column shows the figure's
                   true arithmetic sign instead of the block's sign convention.

   `opts` is optional and carries the last two; both default from `kind`, so the
   seven conventional lines pass nothing. */
function _ieLine(id, label, plan, actual, kind, opts){
  opts = opts || {};
  var goodWhen = opts.goodWhen || _defaultGoodWhen(kind);
  var variance = actual - plan;
  var favourable = goodWhen === 'up' ? variance >= 0 : variance <= 0;
  var tone = Math.abs(variance) < 0.05 ? 'neutral' : (favourable ? 'good' : 'warn');
  return { id: id, label: label, kind: kind, goodWhen: goodWhen,
           signedValue: opts.signedValue === true, budget: plan,
           actual: actual, variance: variance, tone: tone };
}

/* ---------- derivations ---------- */

/* Finance. Reconciles by construction: every OPERATIONAL line is derived (and
   may be overridden), then one balancing line is solved for whatever makes
     sum(income) - sum(expenditure) === stats.budget
   hold exactly. An override on any derived line therefore re-runs the balance,
   so an authored figure can never break reconciliation. The balancing line is
   not itself overridable - the reconciliation requirement always wins.

   WHICH LINE CARRIES THE PLUG IS THE WHOLE POINT (X11) - design notes §6.2. It
   used to be `Other operating income`, which made that line dishonest in a
   specific, repeatable way: it absorbed the sum of everybody else's adverse
   variances and reported the total back as good news, so the only line with no
   narrative behind it carried the best number on the page.

   The plug is now `Reserves movement`, the one line on an NHS I&E where a board
   EXPECTS elasticity. It is authored goodWhen:'down' - it sits in the income
   block because that is which side of the reconciliation it falls on, but a
   larger movement is a worse result. That combination is the reason _ieLine()
   carries `goodWhen` at all.

   Every other income line is derived and defensible, so nothing on the page is
   favourable merely because something else went wrong.
   -> {lines:[{id,label,kind,goodWhen,signedValue,budget,actual,variance,tone}],
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
    /* Signed on purpose, and the only line that is. It runs BOTH ways - drawn
       from reserves when the position needs covering, returned to them when it
       does not - so a label naming one direction ("drawdown") described half of
       what the line does, and the block's income sign convention hid the other
       half by printing a transfer back as a plain positive amount. */
    _ieLine('drawdown',       'Reserves movement',                 c.drawdownBase,       drawdown,        'income',
            { goodWhen: 'down', signedValue: true }),
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
   Design notes §3. THIS IS THE ONLY LAYER-1 FUNCTION.

     LAYER 1 (this function) reads SOURCE METRICS ONLY.
       occupancy   <- waiting
       vacancyRate <- morale, budget
     LAYER 2 (every other derived figure) may read source metrics and the layer-1
       anchors returned from here, and may NEVER read another layer-2 figure.
     deriveOperational() must never call deriveWorkforce(), and the reverse.

   The rule exists because the model wants cross-tab drivers - cancelledOps <-
   occupancy + vacancyRate, sickness <- morale + occupancy - and taken literally
   that is the two derive functions calling each other, i.e. a stack overflow the
   first time the pack is opened. A new figure needing another figure as a driver
   is a layer-2 figure that reads the anchor from here. Do not promote a second
   function to layer 1, and do not cross-call the two derive functions.

   TWO DETAILS THAT ARE LOAD-BEARING:

   (a) The anchors resolve through _field() HERE, before any dependant reads them,
       so an authored override on `occupancy` reaches its dependants too -
       otherwise the pack can show occupancy 97% beside a length of stay derived
       as though it were 91%.

   (b) Dependants read the PRE-CLAMP anchor. Occupancy saturates its [82, 99]
       clamp by design; if dependants read the clamped value they would all
       flatten at the same instant on high-pressure paths, rebuilding the very
       lockstep this layer removes. Clamped is for display, raw is what the rest
       of the model is made of.

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
                    signedValue: l.signedValue, plan: l.budget, value: l.actual,
                    variance: l.variance, unit: '£m', tone: l.tone });
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
