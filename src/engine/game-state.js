'use strict';
/* =========================================================
   GAME STATE + BOARD DECISIONS
   GAME.stats is the "official" board position, updated once
   per quarter when the board confirms a decision. The live
   sim (metrics.js) animates drift WITHIN a quarter starting
   from these values.

   applyBoardDecision() is where option effects land and the
   riskEvents dice are rolled — edit the numbers themselves
   in src/data/quarters-data.js, not here.
========================================================= */
var GAME = {
  currentQuarterIndex: 0,
  screen: 'simulation',
  selectedOptionId: null,
  lastOutcome: null,
  decisions: [],          /* one entry per confirmed board decision */
  stats: null             /* set from METRIC_DEFS starts below */
};

function defaultStats(){
  var s={};
  for(var i=0;i<METRIC_DEFS.length;i++){ s[METRIC_DEFS[i].key]=METRIC_DEFS[i].start; }
  return s;
}

function cloneStats(stats){
  var s={};
  for(var k in stats){ if(stats.hasOwnProperty(k)) s[k]=stats[k]; }
  return s;
}

GAME.stats = defaultStats();

function getCurrentQuarter(){
  return QUARTERS[GAME.currentQuarterIndex];
}

function isFinalQuarter(){
  return GAME.currentQuarterIndex >= QUARTERS.length-1;
}

function getCurrentStats(){
  return cloneStats(GAME.stats);
}

function setGameScreen(screenName){
  GAME.screen = screenName;
}

function resetGameState(){
  GAME.currentQuarterIndex = 0;
  GAME.screen = 'simulation';
  GAME.selectedOptionId = null;
  GAME.lastOutcome = null;
  GAME.decisions = [];
  GAME.stats = defaultStats();
}

/* clamp a stats object to the METRIC_DEFS ranges */
function clampStats(stats){
  for(var i=0;i<METRIC_DEFS.length;i++){
    var d=METRIC_DEFS[i];
    if(stats[d.key]!=null) stats[d.key]=clamp(stats[d.key],d.min,d.max);
  }
  return stats;
}

/* ---------- board decision + luck rolls ----------
   endStats: the metric values at the moment the report was
   opened (end of the simulated quarter). The option's fixed
   effects are applied first, then each riskEvent is rolled
   once (Math.random() < chance => its impacts land too).
   Returns an outcome object the report renders for the player. */
function applyBoardDecision(quarter, option, endStats){
  var stats=cloneStats(endStats), k;

  /* 1. deterministic effects */
  for(k in option.effects){
    if(option.effects.hasOwnProperty(k) && stats[k]!=null) stats[k]+=option.effects[k];
  }

  /* 2. luck: roll each risk event once */
  var rolls=[], evs=option.riskEvents||[];
  for(var r=0;r<evs.length;r++){
    var ev=evs[r], hit=Math.random()<ev.chance;
    rolls.push({ name:ev.name, chance:ev.chance, impacts:ev.impacts, triggered:hit });
    if(hit){
      for(k in ev.impacts){
        if(ev.impacts.hasOwnProperty(k) && stats[k]!=null) stats[k]+=ev.impacts[k];
      }
    }
  }

  clampStats(stats);

  var outcome={
    quarterId: quarter.id,
    quarterLabel: quarter.label,
    optionId: option.id,
    optionTitle: option.title,
    summary: option.decisionSummary,
    effects: option.effects,
    rolls: rolls,
    before: cloneStats(endStats),
    after: cloneStats(stats)
  };

  GAME.stats=stats;
  GAME.selectedOptionId=option.id;
  GAME.lastOutcome=outcome;
  GAME.decisions.push({ quarterId:quarter.id, quarterLabel:quarter.label, optionId:option.id, optionTitle:option.title });
  return outcome;
}
