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
