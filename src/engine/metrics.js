'use strict';
/* =========================================================
   TIMELINE METRICS ENGINE
   Tickers and chart samples are a playback view of the resolved outcome.
   The simulation does not invent net stat movement.
========================================================= */

var METRIC_CUR     = {};
var METRIC_START   = {};
var METRIC_HISTORY = [];

var _lastSampleT = -1;
var METRIC_SAMPLE_DT  = 0.5;
var METRIC_EVENT_RAMP = 3.0;

function _metricOutcome(){
  return (typeof getTimelineOutcome==='function') ? getTimelineOutcome() : DEFAULT_OUTCOME;
}

function _metricEvents(){
  return (typeof getTimelineStatEvents==='function') ? getTimelineStatEvents() : [];
}

function _metricStartOf(def){
  var outcome=_metricOutcome();
  return outcome.startStats && outcome.startStats.hasOwnProperty(def.key) ? outcome.startStats[def.key] : def.start;
}

function _clampMetric(key,v){
  return clampMetricStat(key,v);
}

function _metricSnapshotAt(t){
  var outcome=_metricOutcome();
  var s={t:t}, i, def, events, ev, key, p;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    s[def.key]=_metricStartOf(def);
  }
  events=_metricEvents();
  for(i=0;i<events.length;i++){
    ev=events[i];
    if(!ev || !ev.effects || t<ev.t) continue;
    p=ease(clamp((t-ev.t)/METRIC_EVENT_RAMP,0,1));
    for(key in ev.effects){
      if(ev.effects.hasOwnProperty(key) && s.hasOwnProperty(key)){
        s[key]=_clampMetric(key, s[key]+ev.effects[key]*p);
      }
    }
  }
  if(outcome.endStats && t>=QLEN){
    for(i=0;i<METRIC_DEFS.length;i++){
      def=METRIC_DEFS[i];
      if(outcome.endStats.hasOwnProperty(def.key)) s[def.key]=outcome.endStats[def.key];
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

function _sampleMetrics(t){
  var s=_metricSnapshotAt(t);
  METRIC_HISTORY.push(s);
  _lastSampleT=t;
}

function resetMetrics(){
  METRIC_CUR={};
  METRIC_START={};
  for(var i=0;i<METRIC_DEFS.length;i++){
    var def=METRIC_DEFS[i], start=_metricStartOf(def);
    METRIC_CUR[def.key]=start;
    METRIC_START[def.key]=start;
  }
  METRIC_HISTORY=[];
  _lastSampleT=-1;
  _sampleMetrics(0);
}

function updateMetrics(simT){
  if(simT<_lastSampleT){
    METRIC_HISTORY=[];
    _lastSampleT=-1;
    _sampleMetrics(0);
  }
  while(_lastSampleT+METRIC_SAMPLE_DT<=simT){
    _sampleMetrics(_lastSampleT+METRIC_SAMPLE_DT);
  }
  _applyMetricSnapshot(_metricSnapshotAt(simT));
}

function getMetricValue(key){ return METRIC_CUR[key]; }
function getMetricDelta(key){ return METRIC_CUR[key]-METRIC_START[key]; }
function getMetricHistory(){ return METRIC_HISTORY; }
function getMetricDefs(){ return METRIC_DEFS; }
function getMetricByIndex(index){ return METRIC_DEFS[index]; }

resetMetrics();
