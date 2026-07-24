'use strict';
/* ---------- CQC-style year-end rating (phase 5) ----------
   Implements Game_Spec.md §7. Pure derivation over a stats object (the trust's
   closing position). No state, no DOM. Every consumer - the year-end overlay,
   the tests, any future export - reads these same functions.

   THE ONE THING TO GET RIGHT: waiting is authored goodUp:false in
   scenario-data.js (100 = access collapse, 0 = exemplary). The Game_Spec §7
   formula was written as if higher waiting were better; it is not. Waiting is
   flipped into "rating space" (higher is always better) in toRatingSpace, and
   ONLY there. Every weighted term and every core-stat cap compares in rating
   space; only budget and the raw display columns stay in metric space. Get this
   backwards and a trust with catastrophic 95 waiting scores like an exemplary
   one - Stats_Spec §1.2 called tone inversion "the single most likely bug in
   this feature", and this is that same bug wearing a different hat.

   The rating bands are REBASED from Game_Spec's original 63.3-anchored table:
   with waiting direction-corrected, the starting position scores 56.1, not
   63.3. Game_Spec §7's stated intent - "starting stats score solidly Good, with
   headroom to climb or crash" - is honoured by rebasing the bands so 56.1 lands
   mid-Good, rather than preserving the arithmetic of a figure that only held
   because a near-critical access position was scored as above-average.
------------------------------------------------------------------------- */

var RATING_MODEL = {
  /* The five weighted index metrics. Budget is deliberately absent - it is not
     in the weighted average; it enters only as an adjustment below. The five
     weights sum to exactly 1.00. */
  weights:{ safety:0.25, waiting:0.20, patsat:0.20, morale:0.20, rep:0.15 },
  budgetAdjust:[
    {test:'gte', at: 1.0, delta:  5,
     line:'Closing surplus of +£1.0m or better: +5.'},   /* surplus >= +£1m */
    {test:'lte', at:-3.0, delta:-10,
     line:'Closing deficit of -£3.0m or worse: -10.'}     /* deficit <= -£3m */
  ],
  /* Rebased for direction-normalised waiting - see the header. Starting stats
     score 56.1, comfortably inside GOOD with room both ways. Ordered best to
     worst; a score falls in the FIRST band whose `min` it meets. */
  bands:[
    {min:72, id:'outstanding', label:'OUTSTANDING', tone:'great', stamp:'★ OUTSTANDING'},
    {min:52, id:'good',        label:'GOOD',        tone:'good',  stamp:'GOOD'},
    {min:34, id:'requires',    label:'REQUIRES IMPROVEMENT', tone:'warn', stamp:'REQUIRES IMPROVEMENT'},
    {min:-Infinity, id:'inadequate', label:'INADEQUATE', tone:'critical', stamp:'INADEQUATE'}
  ],
  /* Caps only ever push a rating DOWN (the sustainability lesson). Each names
     the band it caps TO. They read the YEAR-END position only - where the trust
     closed - never per-quarter minima. This is deliberately different from the
     `floor` objectives in objectives.js, which latch on the worst committed
     quarter; do not "fix" this into a latch. */
  caps:[
    {id:'core_stat_low', at:25, capTo:'requires',
     line:'A core metric closed in the bottom quartile of its range.'},
    {id:'safety_breach', at:30, capTo:'inadequate',
     line:'Safety closed below 30. Automatic Inadequate.'},
    {id:'deficit_severe', at:-6.0, capTo:'requires',
     line:'Deficit worse than -£6.0m.'}
  ]
};

/* Rating-space value: the direction-normalised 0..100 where HIGHER IS ALWAYS
   BETTER. Waiting is authored goodUp:false (100 = access collapse), so it is
   flipped here and ONLY here. Never write this value back; never let it reach
   getMetricBand, which expects raw metric space. (min+max)-value, not a
   hardcoded 100-value, so the flip stays correct if the range is re-authored. */
function toRatingSpace(key, value){
  var def=(typeof getMetricDef==='function') ? getMetricDef(key) : null;
  if(!def || def.goodUp!==false) return value;
  return (def.min+def.max)-value;          /* 0..100 -> 100..0 */
}

/* Band for a raw weighted score (before caps). First band whose min is met. */
function getRatingBand(score){
  var bands=RATING_MODEL.bands, i;
  for(i=0;i<bands.length;i++){
    if(score>=bands[i].min) return bands[i];
  }
  return bands[bands.length-1];
}

function _ratingBandById(id){
  var bands=RATING_MODEL.bands, i;
  for(i=0;i<bands.length;i++){ if(bands[i].id===id) return bands[i]; }
  return null;
}
/* Position in the bands array: 0 = best (outstanding), last = worst. A larger
   index is a worse rating, so capping is a max() over indices. */
function _ratingBandIndex(id){
  var bands=RATING_MODEL.bands, i;
  for(i=0;i<bands.length;i++){ if(bands[i].id===id) return i; }
  return bands.length-1;
}

/* Weighted score BEFORE budget adjustment and caps. Every term is passed
   through toRatingSpace first; budget is excluded (it is an adjustment, not a
   weighted term). The five weights sum to 1.00. */
function getRatingBaseScore(stats){
  var w=RATING_MODEL.weights, key, total=0;
  for(key in w){
    if(!w.hasOwnProperty(key)) continue;
    total+=w[key]*toRatingSpace(key, stats[key]);
  }
  return total;
}

/* Budget adjustment: surplus >= +£1m adds 5, deficit <= -£3m subtracts 10,
   anything between does nothing. -> {amount, reason} | {amount:0, reason:null} */
function getRatingBudgetAdjustment(stats){
  var rules=RATING_MODEL.budgetAdjust, budget=stats.budget, i, r;
  for(i=0;i<rules.length;i++){
    r=rules[i];
    if((r.test==='gte' && budget>=r.at) || (r.test==='lte' && budget<=r.at)){
      return {amount:r.delta, reason:r.line};
    }
  }
  return {amount:0, reason:null};
}

/* Which caps have fired, order-independent, [] when none. `core_stat_low`
   checks the five weighted index metrics in RATING SPACE (not budget), so it
   catches HIGH waiting (rating space below 25 = raw waiting above 75), not low.
   `safety_breach` reads safety directly (raw == rating space for goodUp:true).
   `deficit_severe` reads raw budget. -> [{cap, evidenceKey, evidenceValue}] */
function getRatingCaps(stats){
  var out=[], caps=RATING_MODEL.caps, w=RATING_MODEL.weights, i, cap, key;

  /* core_stat_low: the worst weighted index metric that closed below 25 in
     rating space, if any. One entry names the worst offender. */
  var coreCap=null, worstKey=null, worstRv=Infinity, rv;
  for(i=0;i<caps.length;i++){ if(caps[i].id==='core_stat_low') coreCap=caps[i]; }
  if(coreCap){
    for(key in w){
      if(!w.hasOwnProperty(key)) continue;
      rv=toRatingSpace(key, stats[key]);
      if(rv<coreCap.at && rv<worstRv){ worstRv=rv; worstKey=key; }
    }
    if(worstKey!==null){
      out.push({cap:coreCap, evidenceKey:worstKey, evidenceValue:stats[worstKey]});
    }
  }

  /* safety_breach: safety closed below 30. */
  for(i=0;i<caps.length;i++){
    cap=caps[i];
    if(cap.id==='safety_breach' && stats.safety<cap.at){
      out.push({cap:cap, evidenceKey:'safety', evidenceValue:stats.safety});
    }
  }

  /* deficit_severe: raw budget worse than -£6.0m. */
  for(i=0;i<caps.length;i++){
    cap=caps[i];
    if(cap.id==='deficit_severe' && stats.budget<=cap.at){
      out.push({cap:cap, evidenceKey:'budget', evidenceValue:stats.budget});
    }
  }
  return out;
}

/* The full result:
   -> {score, baseScore, adjustment, band, cappedFrom, caps:[], breakdown:[]}
   `score` = baseScore + adjustment.amount (the number the band is read from).
   `band` is the final band AFTER caps. `cappedFrom` is the pre-cap band object
   when a cap actually lowered the rating, else null - a cap can only push down,
   never up, so if the score already lands at or below a cap's ceiling the cap
   changes nothing and cappedFrom stays null.
   `caps` lists every fired cap (for the year-end callout) regardless of whether
   it moved the band.
   `breakdown` is one row per weighted metric (budget excluded):
     {key, label, value, ratingValue, inverted, weight, contribution, band}
   `value` is the RAW metric value and `band` is getMetricBand(key, value) in
   RAW space, so the page speaks the same language as the tickers; `ratingValue`
   is the normalised term actually multiplied by the weight, and `inverted` is
   true for waiting - the table shows both columns so a finance-literate player
   can audit the arithmetic. */
function computeTrustRating(stats){
  var baseScore=getRatingBaseScore(stats);
  var adjustment=getRatingBudgetAdjustment(stats);
  var score=baseScore+adjustment.amount;
  var scoreBand=getRatingBand(score);

  var caps=getRatingCaps(stats);
  /* Caps only push down: take the worst (highest index) ceiling among the fired
     caps and the score band. */
  var finalIndex=_ratingBandIndex(scoreBand.id), c, capIndex;
  for(c=0;c<caps.length;c++){
    capIndex=_ratingBandIndex(caps[c].cap.capTo);
    if(capIndex>finalIndex) finalIndex=capIndex;
  }
  var band=RATING_MODEL.bands[finalIndex];
  var cappedFrom=(band.id!==scoreBand.id) ? scoreBand : null;

  var breakdown=[], w=RATING_MODEL.weights, i, def, key, val, rv;
  var defs=(typeof METRIC_DEFS!=='undefined') ? METRIC_DEFS : [];
  for(i=0;i<defs.length;i++){
    def=defs[i];
    key=def.key;
    if(!w.hasOwnProperty(key)) continue;   /* budget and any unweighted metric skipped */
    val=stats[key];
    rv=toRatingSpace(key, val);
    breakdown.push({
      key:key,
      label:def.label,
      value:val,
      ratingValue:rv,
      inverted:(def.goodUp===false),
      weight:w[key],
      contribution:w[key]*rv,
      band:(typeof getMetricBand==='function') ? getMetricBand(key, val) : null
    });
  }

  return {
    score:score,
    baseScore:baseScore,
    adjustment:adjustment,
    band:band,
    cappedFrom:cappedFrom,
    caps:caps,
    breakdown:breakdown
  };
}
