'use strict';
/* ---------- board metric definitions ----------
   `start` is the new-game baseline. Per-quarter playback starts come from
   the resolved outcome on TIMELINE, not from fixed scenario events.
------------------------------------------------------------------------ */
var METRIC_DEFS = [
  {key:'budget',  label:'BUDGET',  money:true,  goodUp:true,  start:0,  min:-5, max:2},
  {key:'waiting', label:'WAITING', money:false, goodUp:false, start:68, min:0,  max:100},
  {key:'patsat',  label:'PAT SAT', money:false, goodUp:true,  start:63, min:0,  max:100},
  {key:'morale',  label:'MORALE',  money:false, goodUp:true,  start:58, min:0,  max:100},
  {key:'safety',  label:'SAFETY',  money:false, goodUp:true,  start:66, min:0,  max:100},
  {key:'rep',     label:'REP',     money:false, goodUp:true,  start:60, min:0,  max:100}
];

function getMetricDef(key){
  for(var i=0;i<METRIC_DEFS.length;i++){
    if(METRIC_DEFS[i].key===key) return METRIC_DEFS[i];
  }
  return null;
}

function initialMetricStats(){
  var stats={}, i, def;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    stats[def.key]=def.start;
  }
  return stats;
}

function cloneMetricStats(stats){
  var copy={}, i, def;
  stats=stats || initialMetricStats();
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    copy[def.key]=Number(stats[def.key] != null ? stats[def.key] : def.start);
  }
  return copy;
}

function clampMetricStat(key, value){
  var def=getMetricDef(key);
  return def ? Math.max(def.min, Math.min(def.max, value)) : value;
}

function mergeMetricEffects(a,b){
  var merged={}, key, left=a || {}, right=b || {};
  for(key in left){ if(left.hasOwnProperty(key)) merged[key]=left[key]; }
  for(key in right){ if(right.hasOwnProperty(key)) merged[key]=(merged[key] || 0)+right[key]; }
  return merged;
}

function applyMetricEffects(stats, effects){
  var next=cloneMetricStats(stats), key, source=effects || {};
  for(key in source){
    if(source.hasOwnProperty(key) && next.hasOwnProperty(key)){
      next[key]=clampMetricStat(key, next[key]+source[key]);
    }
  }
  return next;
}

function metricDeltaText(def, value){
  if(Math.abs(value)<0.05) return '-';
  if(def.money){
    return (value<0 ? '-' : '+')+'GBP'+Math.abs(value).toFixed(1)+'m';
  }
  return (value<0 ? '-' : '+')+String(Math.abs(Math.round(value)));
}

function fmtMoney(v){
  var sign=v<-0.05 ? '&#8722;' : (v>0.05 ? '+' : '');
  return sign+'&pound;'+Math.abs(v).toFixed(1)+'m';
}

var DEFAULT_OUTCOME = {
  quarterId:'Q0',
  optionId:'status_quo',
  optionTitle:'Status Quo',
  decisionSummary:'Baseline winter pressure plays out before the board makes its first decision.',
  startStats:{budget:0, waiting:68, patsat:63, morale:58, safety:66, rep:60},
  endStats:{budget:-1.8, waiting:69, patsat:65, morale:61, safety:68, rep:60}
};
