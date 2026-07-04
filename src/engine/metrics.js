'use strict';
/* =========================================================
   METRICS ENGINE
   Holds the live board-metric values, applies timed
   STAT_EVENTS as short gradual transitions (so the graph
   bends instead of teleporting), and samples a history
   trail for the stats chart. Plain globals — no modules.

   Depends on: scenario-data.js (METRIC_DEFS, STAT_EVENTS)
               canvas.js (clamp, ease)
========================================================= */

var METRIC_CUR     = {};   /* current (animated) value per key */
var METRIC_START   = {};   /* quarter starting value per key   */
var METRIC_HISTORY = [];   /* [{t, waiting, patsat, ...}, ...] */
var METRIC_TRANS   = [];   /* active event transitions         */

var _metricFired = [];     /* STAT_EVENTS already applied this Q */
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

/* push one history sample at time t using the current values */
function _sampleMetrics(t){
  var s={t:t};
  for(var i=0;i<METRIC_DEFS.length;i++){ var k=METRIC_DEFS[i].key; s[k]=METRIC_CUR[k]; }
  METRIC_HISTORY.push(s);
  _lastSampleT=t;
}

/* wipe everything back to the quarter's starting state */
function resetMetrics(){
  METRIC_CUR={}; METRIC_START={};
  for(var i=0;i<METRIC_DEFS.length;i++){
    var def=METRIC_DEFS[i];
    METRIC_CUR[def.key]=def.start;
    METRIC_START[def.key]=def.start;
  }
  METRIC_HISTORY=[];
  METRIC_TRANS=[];
  _metricFired=[];
  _lastSampleT=-1;
  _sampleMetrics(0);   /* seed the trail at t=0 */
}

/* queue a gradual change: current value -> current+delta over the ramp */
function _startTransition(key,delta,simT){
  if(_metricDef(key)==null) return;
  var from=METRIC_CUR[key];
  METRIC_TRANS.push({
    key:key, t0:simT, t1:simT+METRIC_EVENT_RAMP,
    from:from, to:_clampMetric(key,from+delta)
  });
}

/* advance the metrics to sim time simT (called every frame) */
function updateMetrics(simT){
  /* 1. fire any events whose time has arrived (once per quarter) */
  for(var i=0;i<STAT_EVENTS.length;i++){
    if(_metricFired[i]) continue;
    if(simT>=STAT_EVENTS[i].t){
      var fx=STAT_EVENTS[i].effects;
      for(var key in fx){ if(fx.hasOwnProperty(key)) _startTransition(key,fx[key],simT); }
      _metricFired[i]=true;
    }
  }
  /* 2. interpolate active transitions, dropping finished ones */
  for(var j=METRIC_TRANS.length-1;j>=0;j--){
    var tr=METRIC_TRANS[j], p=(simT-tr.t0)/(tr.t1-tr.t0);
    if(p>=1){ METRIC_CUR[tr.key]=tr.to; METRIC_TRANS.splice(j,1); }
    else if(p>0){ METRIC_CUR[tr.key]=tr.from+(tr.to-tr.from)*ease(p); }
  }
  /* 3. sample the history on a fixed grid (not every frame) */
  while(_lastSampleT+METRIC_SAMPLE_DT<=simT){ _sampleMetrics(_lastSampleT+METRIC_SAMPLE_DT); }
}

/* ---------- accessors for the UI ---------- */
function getMetricValue(key){ return METRIC_CUR[key]; }
function getMetricDelta(key){ return METRIC_CUR[key]-METRIC_START[key]; }
function getMetricHistory(){ return METRIC_HISTORY; }
function getMetricDefs(){ return METRIC_DEFS; }
function getMetricByIndex(index){ return METRIC_DEFS[index]; }   /* v0..v5 ticker order */

resetMetrics();   /* initialise on load */
