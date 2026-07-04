'use strict';
/* =========================================================
   METRICS ENGINE
   Holds the live board-metric values, applies the current
   quarter's timed simEvents as short gradual transitions
   (so the graph bends instead of teleporting), and samples
   a history trail for the stats chart. Plain globals.

   Quarter awareness:
   - events come from QUARTERS[GAME.currentQuarterIndex].simEvents
   - baselines default to METRIC_DEFS[i].start (Q1), but after a
     board decision setMetricStarts(GAME.stats) overrides them so
     Q2+ replay their own events from the post-decision position.

   Depends on: scenario-data.js (METRIC_DEFS)
               quarters-data.js (QUARTERS)
               game-state.js (GAME)
               canvas.js (clamp, ease)
========================================================= */

var METRIC_CUR     = {};   /* current (animated) value per key */
var METRIC_START   = {};   /* quarter starting value per key   */
var METRIC_HISTORY = [];   /* [{t, waiting, patsat, ...}, ...] */
var METRIC_BASE    = null; /* per-quarter start override (post-decision stats) */

var _lastSampleT = -1;     /* sim time of the last history sample */

var METRIC_SAMPLE_DT  = 0.5;  /* seconds between history samples   */
var METRIC_EVENT_RAMP = 3.0;  /* seconds an event effect ramps in  */

function _metricDef(key){
  for(var i=0;i<METRIC_DEFS.length;i++){ if(METRIC_DEFS[i].key===key) return METRIC_DEFS[i]; }
  return null;
}
function _clampMetric(key,v){
  var def=_metricDef(key);
  return def ? clamp(v,def.min,def.max) : v;
}
function _metricStartValue(def){
  return (METRIC_BASE && METRIC_BASE[def.key]!=null) ? METRIC_BASE[def.key] : def.start;
}

/* the timed events for the quarter currently being simulated */
function getSimEvents(){
  if(typeof QUARTERS!=='undefined' && typeof GAME!=='undefined'){
    var q=QUARTERS[GAME.currentQuarterIndex];
    if(q && q.simEvents) return q.simEvents;
  }
  return [];
}

/* override the quarter baselines (called after a board decision);
   pass null to fall back to the METRIC_DEFS Q1 starts */
function setMetricStarts(stats){
  if(!stats){ METRIC_BASE=null; return; }
  METRIC_BASE={};
  for(var i=0;i<METRIC_DEFS.length;i++){
    var k=METRIC_DEFS[i].key;
    if(stats[k]!=null) METRIC_BASE[k]=stats[k];
  }
}

function _metricSnapshotAt(t){
  var s={t:t}, events=getSimEvents();
  for(var i=0;i<METRIC_DEFS.length;i++){
    var def=METRIC_DEFS[i];
    s[def.key]=_metricStartValue(def);
  }
  for(var e=0;e<events.length;e++){
    var ev=events[e], p=clamp((t-ev.t)/METRIC_EVENT_RAMP,0,1);
    if(p<=0) continue;
    p=ease(p);
    for(var key in ev.effects){
      if(ev.effects.hasOwnProperty(key) && s.hasOwnProperty(key)){
        s[key]=_clampMetric(key,s[key]+ev.effects[key]*p);
      }
    }
  }
  return s;
}

function _applyMetricSnapshot(s){
  for(var i=0;i<METRIC_DEFS.length;i++){
    var k=METRIC_DEFS[i].key;
    METRIC_CUR[k]=s[k];
  }
}

/* push one history sample at time t using the deterministic timeline state */
function _sampleMetrics(t){
  var s=_metricSnapshotAt(t);
  METRIC_HISTORY.push(s);
  _lastSampleT=t;
}

/* wipe everything back to the quarter's starting state */
function resetMetrics(){
  METRIC_CUR={}; METRIC_START={};
  for(var i=0;i<METRIC_DEFS.length;i++){
    var def=METRIC_DEFS[i];
    METRIC_CUR[def.key]=_metricStartValue(def);
    METRIC_START[def.key]=_metricStartValue(def);
  }
  METRIC_HISTORY=[];
  _lastSampleT=-1;
  _sampleMetrics(0);   /* seed the trail at t=0 */
}

/* advance the metrics to sim time simT (called every frame) */
function updateMetrics(simT){
  if(simT<_lastSampleT){
    METRIC_HISTORY=[];
    _lastSampleT=-1;
    _sampleMetrics(0);
  }
  /* sample the history on a fixed grid (not every frame) */
  while(_lastSampleT+METRIC_SAMPLE_DT<=simT){ _sampleMetrics(_lastSampleT+METRIC_SAMPLE_DT); }
  _applyMetricSnapshot(_metricSnapshotAt(simT));
}

/* ---------- accessors for the UI ---------- */
function getMetricValue(key){ return METRIC_CUR[key]; }
function getMetricDelta(key){ return METRIC_CUR[key]-METRIC_START[key]; }
function getMetricHistory(){ return METRIC_HISTORY; }
function getMetricDefs(){ return METRIC_DEFS; }
function getMetricByIndex(index){ return METRIC_DEFS[index]; }   /* v0..v5 ticker order */
function getMetricStarts(){
  var s={};
  for(var i=0;i<METRIC_DEFS.length;i++){ s[METRIC_DEFS[i].key]=METRIC_START[METRIC_DEFS[i].key]; }
  return s;
}
function getMetricValues(){
  var s={};
  for(var i=0;i<METRIC_DEFS.length;i++){ s[METRIC_DEFS[i].key]=METRIC_CUR[METRIC_DEFS[i].key]; }
  return s;
}

resetMetrics();   /* initialise on load */
