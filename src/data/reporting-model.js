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
  finance: {
    /* £m per quarter. Bases are the plan (budgeted) figures. */
    clinicalIncomeBase: 95,  kInc: 0.15,   /* clinical income falls as waiting rises */
    otherIncomeBase:    13,                 /* nominal plan for the balancing line */
    payBase:            68,   kPay: 0.40, kMor: 0.05, /* pay rises as budget/morale fall */
    agencyBase:          6,   kAgency: 0.12,          /* bank & agency rises as morale falls */
    nonPayBase:         34,   kNonPay: 0.25           /* non-pay rises as budget falls */
  },
  operational: {
    occBase:  92,  kOcc:  0.35, occClamp:  [82, 99],       /* % */
    losBase: 100,  kLos:  0.40, losClamp:  [90, 125],      /* index */
    dtocBase: 35,  kDtoc: 0.60, dtocClamp: [0, 80],        /* beds */
    handBase: 20,  kHand: 0.50, kHs: 0.40, handClamp: [0, Infinity], /* count */
    cancBase:  8,  kCanc: 0.40, cancClamp: [0, Infinity]   /* count */
  },
  workforce: {
    vacBase:   9,   kVac:  0.12, vacClamp:  [2, 20],   /* % */
    turnBase: 13,   kTurn: 0.14, turnClamp: [5, 22],   /* % */
    sickBase:  4.5, kSick: 0.06, sickClamp: [2, 9],    /* % */
    /* Bank & agency spend is NOT derived here. It is an I&E expenditure line
       with a plan and a variance, so it is derived once under `finance`. A
       second copy of the same coefficients was kept in step by comment alone,
       which is how Finance and Workforce end up reporting different agency
       spend for the same quarter two clicks apart. */
    survBase:  6.5, kSurv: 0.04, kRep: 0.03, survClamp: [0, 10] /* index 0..10 */
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
   value. Longest (most specific) key wins. Keys use real game IDs: Q2 is the
   Capacity Strain quarter, where delayed transfers of care are the headline
   figure, and funding the discharge partnership pulls that figure down further. */
var REPORTING_OVERRIDES = {
  'Q2':                      { operational: { dtocBeds: 41 } },
  'Q2:discharge_partnership': { operational: { dtocBeds: 38 } }
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

/* One I&E line. `budget` is the plan (budgeted) figure, `actual` the derived
   position, `variance` = actual - plan. tone reflects favourability: an
   over-recovery of income or an underspend is `good`; the reverse is `warn`. */
function _ieLine(id, label, plan, actual, kind){
  var variance = actual - plan;
  var favourable = kind === 'income' ? variance >= 0 : variance <= 0;
  var tone = Math.abs(variance) < 0.05 ? 'neutral' : (favourable ? 'good' : 'warn');
  return { id: id, label: label, kind: kind, budget: plan, actual: actual, variance: variance, tone: tone };
}

/* ---------- derivations ---------- */

/* Finance. Reconciles by construction: every line except the balancing
   "Other operating income" line is derived (and may be overridden), then the
   balancing line is set to whatever makes
     sum(income) - sum(expenditure) === stats.budget
   hold exactly. An override on any derived line therefore re-runs the balance,
   so an authored figure can never break reconciliation. The balancing line is
   not itself overridable - the reconciliation requirement always wins.
   -> {lines:[{id,label,kind,budget,actual,variance,tone}], surplus} */
function deriveIncomeExpenditure(stats, ctx){
  var c = REPORTING_COEFFS.finance;
  var budget = stats.budget;

  /* higher waiting -> lower elective throughput -> lower clinical income */
  var clinical = _field('finance', 'clinicalIncome',
    c.clinicalIncomeBase - c.kInc * (stats.waiting - _start('waiting')), ctx);
  /* pay rises as the financial position and morale fall */
  var pay = _field('finance', 'paySpend',
    c.payBase + c.kPay * (-budget) + c.kMor * (_start('morale') - stats.morale), ctx);
  /* bank & agency rises as morale falls */
  var agency = _field('finance', 'agencySpend',
    c.agencyBase + c.kAgency * (_start('morale') - stats.morale), ctx);
  /* non-pay rises as the financial position falls */
  var nonPay = _field('finance', 'nonPaySpend',
    c.nonPayBase + c.kNonPay * (-budget), ctx);

  var expenditure = pay + agency + nonPay;
  /* balancing income line: (clinical + other) - expenditure === budget */
  var other = budget + expenditure - clinical;

  var lines = [
    _ieLine('clinicalIncome', 'Clinical income',        c.clinicalIncomeBase, clinical, 'income'),
    _ieLine('otherIncome',    'Other operating income',  c.otherIncomeBase,    other,    'income'),
    _ieLine('paySpend',       'Pay expenditure',         c.payBase,            pay,      'expenditure'),
    _ieLine('agencySpend',    'Bank & agency',           c.agencyBase,         agency,   'expenditure'),
    _ieLine('nonPaySpend',    'Non-pay expenditure',     c.nonPayBase,         nonPay,   'expenditure')
  ];

  var income = 0, spend = 0, i;
  for(i = 0; i < lines.length; i++){
    if(lines[i].kind === 'income') income += lines[i].actual;
    else spend += lines[i].actual;
  }
  return { lines: lines, surplus: income - spend,
           totalIncome: income, totalExpenditure: spend };
}

/* Operations. All five figures rise with `waiting` (worsening), handover also
   rises as `safety` falls.
   -> {occupancy, losPct, dtocBeds, ambulanceHandover, cancelledOps} */
function deriveOperational(stats, ctx){
  var c = REPORTING_COEFFS.operational;
  var w = stats.waiting - _start('waiting');
  var s = _start('safety') - stats.safety;
  return {
    occupancy:         _field('operational', 'occupancy',
      _clamp(c.occBase + c.kOcc * w, c.occClamp[0], c.occClamp[1]), ctx),
    losPct:            _field('operational', 'losPct',
      _clamp(c.losBase + c.kLos * w, c.losClamp[0], c.losClamp[1]), ctx),
    dtocBeds:          _field('operational', 'dtocBeds',
      _clamp(c.dtocBase + c.kDtoc * w, c.dtocClamp[0], c.dtocClamp[1]), ctx),
    ambulanceHandover: _field('operational', 'ambulanceHandover',
      _clamp(c.handBase + c.kHand * w + c.kHs * s, c.handClamp[0], c.handClamp[1]), ctx),
    cancelledOps:      _field('operational', 'cancelledOps',
      _clamp(c.cancBase + c.kCanc * w, c.cancClamp[0], c.cancClamp[1]), ctx)
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

/* Workforce. Vacancy/turnover/sickness worsen as `morale` falls; the staff
   survey improves with `morale` and `rep`. Bank & agency spend is a finance
   figure and lives on the I&E, not here - see REPORTING_COEFFS.workforce.
   -> {vacancyRate, turnover, sickness, surveyScore} */
function deriveWorkforce(stats, ctx){
  var c = REPORTING_COEFFS.workforce;
  var m = _start('morale') - stats.morale;
  return {
    vacancyRate:     _field('workforce', 'vacancyRate',
      _clamp(c.vacBase + c.kVac * m, c.vacClamp[0], c.vacClamp[1]), ctx),
    turnover:        _field('workforce', 'turnover',
      _clamp(c.turnBase + c.kTurn * m, c.turnClamp[0], c.turnClamp[1]), ctx),
    sickness:        _field('workforce', 'sickness',
      _clamp(c.sickBase + c.kSick * m, c.sickClamp[0], c.sickClamp[1]), ctx),
    surveyScore:     _field('workforce', 'surveyScore',
      _clamp(c.survBase + c.kSurv * (stats.morale - _start('morale')) +
                          c.kRep * (stats.rep - _start('rep')),
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
        rows.push({ id: l.id, label: l.label, kind: l.kind, plan: l.budget,
                    value: l.actual, variance: l.variance, unit: '£m', tone: l.tone });
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
