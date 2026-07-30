'use strict';
/* ---------- metric semantics ----------
   Pure functions over METRIC_DEFS. No state, no side effects, no DOM.
   Everything here is DERIVED from a value that already exists in
   GAME.stats or METRIC_CUR. Never write a result back into either.

   Consumers: live tickers, board pack, stats report (phase 3),
   alerts (phase 2), role objectives (phase 4), year-end scoring.
---------------------------------------------------------------- */

/* Tone severity rank. LOWER IS WORSE. Shared so that every consumer
   orders tones identically. Phases 2 and 4 use this too - do not
   redefine it locally. */
var TONE_RANK={critical:0, warn:1, neutral:2, good:3, great:4};

function getToneRank(tone){
  return TONE_RANK.hasOwnProperty(tone) ? TONE_RANK[tone] : 2;
}

/* -> band object, or null if the metric has no bands authored. */
function getMetricBand(key, value){
  var def=getMetricDef(key), i;
  if(!def || !def.bands || !def.bands.length) return null;
  for(i=0;i<def.bands.length;i++){
    if(value<=def.bands[i].to) return def.bands[i];
  }
  return def.bands[def.bands.length-1];
}

/* -> integer index into def.bands, or -1 for an unknown metric or a
   metric with no bands authored. */
function getMetricBandIndex(key, value){
  var def=getMetricDef(key), i;
  if(!def || !def.bands || !def.bands.length) return -1;
  for(i=0;i<def.bands.length;i++){
    if(value<=def.bands[i].to) return i;
  }
  return def.bands.length-1;
}

/* Normalised 0..100 desirability of one metric value, so six metrics in five
   different units can share one axis (the board-balance radar). 100 is the top
   of the best band, 0 the bottom of the worst, and HIGHER IS ALWAYS BETTER -
   including for waiting, which inverts here.

   Each band owns an equal slice of the range (five bands -> 20 points each) and
   the value's position inside its own band fills that slice. Bands are not
   equal in value-width, so the mapping is deliberately non-linear in the raw
   number: a band is the board's unit of "how bad is this", and the radar is
   read as tone, not as arithmetic.

   That design produces a small step at every band boundary - waiting 48 scores
   80.0 and waiting 48.1 scores 79.8. This is intentional tone quantisation: it
   is what makes crossing a band legible on the chart. Do not "fix" it by
   interpolating across boundaries.

   PRESENTATION ONLY. This never reaches GAME.stats, metric-pressure.js, agent
   spawning or computeTrustRating() - the simulation knows nothing about it. */
function getMetricHealthScore(key, value){
  var def=getMetricDef(key), i, n, lo, hi, pos, rank;
  /* A metric with no bands authored has no desirability scale to normalise
     against, so it sits at the midpoint rather than skewing the shape. */
  if(!def || !def.bands || !def.bands.length) return 50;
  n=def.bands.length;
  i=getMetricBandIndex(key,value);
  lo=(i===0) ? def.min : def.bands[i-1].to;
  hi=def.bands[i].to;
  pos=(hi===lo) ? 1 : (value-lo)/(hi-lo);
  pos=Math.max(0, Math.min(1, pos));
  /* Bands are authored ascending by `to`. For a goodUp:false metric the best
     band is therefore first, so both the band rank and the within-band fill
     run backwards. */
  rank=def.goodUp ? i : (n-1-i);
  if(!def.goodUp) pos=1-pos;
  return (rank+pos)*(100/n);
}

/* Threshold crossings between two values.
     dir:'below' fires when prev >  at && next <= at
     dir:'above' fires when prev <  at && next >= at
   Returns ALL authored thresholds crossed, ordered in the direction of travel.
   -> [{threshold, def, direction}] */
function getThresholdCrossings(key, prevValue, nextValue){
  var def=getMetricDef(key), found=[], i, threshold;
  if(!def || !def.thresholds || !def.thresholds.length || prevValue===nextValue) return found;
  for(i=0;i<def.thresholds.length;i++){
    threshold=def.thresholds[i];
    if((threshold.dir==='below' && prevValue>threshold.at && nextValue<=threshold.at) ||
       (threshold.dir==='above' && prevValue<threshold.at && nextValue>=threshold.at)){
      found.push({threshold:threshold, def:def, direction:threshold.dir});
    }
  }
  found.sort(function(a,b){ return a.threshold.at-b.threshold.at; });
  if(nextValue<prevValue) found.reverse();
  return found;
}

/* A gap this small rounds to 0.0 at one decimal place, so printing it as a
   distance ("0.0m to DEFICIT BREACH") states a falsehood about a figure that is
   effectively on the line. Same tolerance the report layer already uses for
   "rounds to nothing" in _finVariance / _reportMetricDelta. */
var THRESHOLD_REACHED_EPS=0.05;

/* The nearest authored threshold to a value, with a signed distance AND which
   side of it the value is on.

   DIRECTION COMES FROM threshold.dir, NEVER FROM THE SIGN OF distance. `distance`
   is at-value, which is positive when approaching a 'below' threshold and
   positive when a 'above' threshold has been crossed - so a caller reading the
   sign gets the surplus threshold exactly backwards. The convention here is the
   one getThresholdCrossings() already encodes:
     dir:'below' is crossed once value <= at
     dir:'above' is crossed once value >= at

   Selection is by smallest absolute gap, so at budget -4.0 this still reports the
   -3.0 breach as crossed by 1.0 rather than jumping to a nearer-in-spirit
   threshold. That is the useful reading and getNearestThreshold() delegates here
   so there is one implementation of it.

   Returns numbers and the authored threshold only - no wording, no unit, no
   entity, no HTML. Formatting is the view's job (see the file header).
   -> {threshold, distance, magnitude, state} | null when the metric has no
   thresholds. state is 'approaching' | 'crossed' | 'reached'. */
function describeThresholdDistance(key, value){
  var def=getMetricDef(key), best=null, bestGap=Infinity, i, gap, crossed;
  if(!def || !def.thresholds || !def.thresholds.length) return null;
  for(i=0;i<def.thresholds.length;i++){
    gap=Math.abs(def.thresholds[i].at-value);
    if(gap<bestGap){ bestGap=gap; best=def.thresholds[i]; }
  }
  if(!best) return null;
  if(bestGap<THRESHOLD_REACHED_EPS) crossed='reached';
  else if(best.dir==='below') crossed=(value<=best.at) ? 'crossed' : 'approaching';
  else crossed=(value>=best.at) ? 'crossed' : 'approaching';
  return {threshold:best, distance:best.at-value, magnitude:bestGap, state:crossed};
}

/* Plain-language one-liner for a single metric.
   -> {key, label, value, valueText, band, line} */
function describeMetric(key, value){
  var def=getMetricDef(key), band, valueTextHtml, line;
  if(!def) return null;
  band=getMetricBand(key,value);
  valueTextHtml=def.money ? fmtMoney(value) : String(Math.round(value));
  line=def.label+' '+valueTextHtml;
  if(band) line+=' - '+band.label+'. '+band.line;
  return {
    key:def.key,
    label:def.label,
    value:value,
    valueText:valueTextHtml,
    band:band,
    line:line
  };
}

/* Health of the whole board position, for the posture strip.
   -> {tone, label, worstKey, criticalCount, warnCount} */
function getBoardPosture(stats){
  var criticalCount=0, warnCount=0, healthyCount=0;
  var worstKey=null, worstRank=5, i, def, value, band, rank;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    value=stats && stats.hasOwnProperty(def.key) ? stats[def.key] : def.start;
    band=getMetricBand(def.key,value);
    rank=getToneRank(band && band.tone);
    if(rank<worstRank){
      worstRank=rank;
      worstKey=def.key;
    }
    if(band && band.tone==='critical') criticalCount++;
    else if(band && band.tone==='warn') warnCount++;
    else if(band && (band.tone==='good' || band.tone==='great')) healthyCount++;
  }
  if(criticalCount>0){
    return {tone:'critical', label:'BOARD: CRITICAL', worstKey:worstKey,
            criticalCount:criticalCount, warnCount:warnCount};
  }
  if(warnCount>=2){
    return {tone:'warn', label:'BOARD: UNDER PRESSURE', worstKey:worstKey,
            criticalCount:criticalCount, warnCount:warnCount};
  }
  if(warnCount===1){
    return {tone:'warn', label:'BOARD: WATCH', worstKey:worstKey,
            criticalCount:criticalCount, warnCount:warnCount};
  }
  if(healthyCount>=4){
    return {tone:'great', label:'BOARD: STRONG', worstKey:worstKey,
            criticalCount:criticalCount, warnCount:warnCount};
  }
  return {tone:'neutral', label:'BOARD: STABLE', worstKey:worstKey,
          criticalCount:criticalCount, warnCount:warnCount};
}
