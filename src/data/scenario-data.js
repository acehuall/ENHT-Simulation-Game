'use strict';
/* ---------- board metric definitions ----------
   The ticker order is still v0..v5, but the labels/ranges come from the
   shared quarter data so report and simulation stay aligned.
------------------------------------------------------------------------ */
var METRIC_DEFS = QUARTER_STAT_DEFS.map(function(def){
  return {
    key:def.key,
    label:def.label,
    money:def.money,
    goodUp:def.goodUp,
    start:def.start,
    min:def.min,
    max:def.max
  };
});

var ACTIVE_SCENARIO_QUARTER_ID = getFirstQuarterId();
var ACTIVE_SCENARIO_OPTION_ID = null;

function cloneScenarioEffects(effects){
  var copy={};
  for(var key in effects){
    if(effects.hasOwnProperty(key)) copy[key]=effects[key];
  }
  return copy;
}

function makeDecisionScenarioEvent(quarter, option){
  return {
    t:18,
    name:'Board decision - '+option.title,
    toast:'Board decision: '+option.title,
    effects:cloneScenarioEffects(option.optionImpacts)
  };
}

function buildScenarioEvents(quarterId, optionId){
  var quarter=getQuarterById(quarterId);
  var option=getQuarterOption(quarter, optionId);
  var events=[], i, ev;
  for(i=0;i<quarter.timelineEvents.length;i++){
    ev=quarter.timelineEvents[i];
    events.push({
      t:ev.t,
      name:ev.name,
      toast:ev.toast,
      effects:cloneScenarioEffects(ev.effects)
    });
  }
  events.push(makeDecisionScenarioEvent(quarter, option));
  events.sort(function(a,b){ return a.t-b.t; });
  return events;
}

var STAT_EVENTS = [];
var TOASTS = [];

function setScenarioSelection(quarterId, optionId){
  var quarter=getQuarterById(quarterId);
  var option=getQuarterOption(quarter, optionId);
  ACTIVE_SCENARIO_QUARTER_ID=quarter.id;
  ACTIVE_SCENARIO_OPTION_ID=option.id;
  STAT_EVENTS=buildScenarioEvents(quarter.id, option.id);
  TOASTS=STAT_EVENTS.map(function(e){ return {t:e.t, msg:e.toast}; });
}

function getActiveScenarioOptionId(){
  return ACTIVE_SCENARIO_OPTION_ID;
}

setScenarioSelection(ACTIVE_SCENARIO_QUARTER_ID, ACTIVE_SCENARIO_OPTION_ID);

var TICKS=METRIC_DEFS.map(function(def){ return {s:def.start, e:def.start, money:!!def.money}; });

function fmtMoney(v){
  return (v<-0.05?'&#8722;':(v>0.05?'+':''))+'GBP'+Math.abs(v).toFixed(1)+'m';
}
