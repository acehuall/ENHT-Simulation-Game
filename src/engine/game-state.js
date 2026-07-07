'use strict';
/* ---------- game state foundation ---------- */
var DEBUG_MODE=false;

var QUARTER_PHASES={
  REPORT_PENDING:'REPORT_PENDING',
  REPORT_OPEN:'REPORT_OPEN',
  OPTION_SELECTED:'OPTION_SELECTED',
  OUTCOME_RESOLVED:'OUTCOME_RESOLVED',
  QUARTER_LOCKED:'QUARTER_LOCKED'
};

var QUARTER_ACTIONS={
  OPEN_REPORT:'OPEN_REPORT',
  SUBMIT_DECISION:'SUBMIT_DECISION',
  BEGIN_NEXT_QUARTER:'BEGIN_NEXT_QUARTER'
};

var GAME = {
  currentQuarterIndex:0,
  currentQuarterId:getFirstQuarterId(),
  quarterPhase:QUARTER_PHASES.REPORT_PENDING,
  screen:'simulation',
  selectedOptionId:null,
  lastOutcome:null,
  currentOutcome:null,
  outcomeResolvedQuarterId:null,
  decisions:[],
  lockedQuarters:{},
  stats:initialQuarterStats()
};

function warnIllegalQuarterTransition(action, detail){
  if(typeof console!=='undefined' && console.warn){
    console.warn('[quarter-state] Illegal transition "'+action+'" from '+GAME.quarterPhase+(detail ? ': '+detail : ''));
  }
}

function cloneStats(stats){
  return cloneQuarterStats(stats);
}

function getCurrentQuarter(){
  return getQuarterById(GAME.currentQuarterId);
}

function getCurrentQuarterId(){
  return GAME.currentQuarterId || getFirstQuarterId();
}

function getCurrentQuarterEvent(){
  return getQuarterEventConfig(getCurrentQuarterId());
}

function getCurrentOption(){
  if(!GAME.selectedOptionId) return null;
  return getQuarterOption(getCurrentQuarter(), GAME.selectedOptionId);
}

function isDebugMode(){ return DEBUG_MODE===true; }
function getQuarterPhase(){ return GAME.quarterPhase; }
function isQuarterLocked(quarterId){ return !!GAME.lockedQuarters[quarterId || getCurrentQuarterId()]; }
function canSelectQuarterOption(){ return GAME.quarterPhase===QUARTER_PHASES.REPORT_OPEN; }
function canResolveQuarterOutcome(){ return false; }
function canBeginNextQuarter(){ return GAME.quarterPhase===QUARTER_PHASES.QUARTER_LOCKED; }

function setSelectedOption(optionId){
  if(!isDebugMode()){
    warnIllegalQuarterTransition('DEBUG_SET_OPTION','debug controls are disabled');
    return false;
  }
  return submitQuarterDecision(optionId); // debug path still uses the guarded atomic submit
}

function setCurrentQuarter(quarterId){
  if(!isDebugMode()){
    warnIllegalQuarterTransition('DEBUG_SET_QUARTER','debug controls are disabled');
    return false;
  }
  return beginQuarterById(quarterId);
}

function beginQuarterById(quarterId){
  var idx=getQuarterIndexById(quarterId);
  var quarter=QUARTERS[idx];
  GAME.currentQuarterId=quarter.id;
  GAME.currentQuarterIndex=idx;
  GAME.quarterPhase=QUARTER_PHASES.REPORT_PENDING;
  GAME.selectedOptionId=null;
  GAME.lastOutcome=null;
  GAME.currentOutcome=null;
  GAME.outcomeResolvedQuarterId=null;
  if(typeof setScenarioSelection==='function') setScenarioSelection(quarter.id, quarter.options[0].id);
  return true;
}

function advanceToNextQuarter(){
  return advancePhase(QUARTER_ACTIONS.BEGIN_NEXT_QUARTER);
}

function buildDecisionRecord(outcome){
  return {
    round:GAME.decisions.length+1,
    quarterIndex:GAME.currentQuarterIndex,
    quarter:outcome.quarter.id,
    optionId:outcome.option.id,
    title:outcome.option.title,
    summary:outcome.option.outcomeText,
    impacts:mergeQuarterImpacts(outcome.impacts, {}),
    triggeredRisks:outcome.triggeredRisks.map(function(r){ return r.name; }),
    statsAfter:cloneStats(outcome.after)
  };
}

function submitQuarterDecision(optionId, payload){
  return advancePhase(QUARTER_ACTIONS.SUBMIT_DECISION,{optionId:optionId, rng:payload && payload.rng});
}

function advancePhase(action, payload){
  payload=payload || {};
  var phase=GAME.quarterPhase;
  var quarter=getCurrentQuarter();
  var option, outcome, nextId;

  if(action===QUARTER_ACTIONS.OPEN_REPORT){
    if(phase===QUARTER_PHASES.REPORT_PENDING){
      GAME.quarterPhase=QUARTER_PHASES.REPORT_OPEN;
      return true;
    }
    if(phase===QUARTER_PHASES.REPORT_OPEN || phase===QUARTER_PHASES.QUARTER_LOCKED) return true;
    warnIllegalQuarterTransition(action);
    return false;
  }

  if(action===QUARTER_ACTIONS.SUBMIT_DECISION){
    if(phase!==QUARTER_PHASES.REPORT_OPEN){
      warnIllegalQuarterTransition(action,'decisions can only be submitted after the report is open');
      return null;
    }
    if(GAME.outcomeResolvedQuarterId===quarter.id || GAME.currentOutcome || isQuarterLocked(quarter.id)){
      warnIllegalQuarterTransition(action,'outcome already resolved and locked for '+quarter.id);
      return null;
    }
    option=getQuarterOption(quarter, payload.optionId);
    outcome=resolveQuarterOutcome(quarter, option.id, GAME.stats, payload.rng);
    if(!outcome){
      warnIllegalQuarterTransition(action,'outcome resolution failed without mutating state');
      return null;
    }

    GAME.selectedOptionId=option.id;
    GAME.stats=cloneStats(outcome.after);
    GAME.lastOutcome=outcome.option.outcomeText;
    GAME.currentOutcome=outcome;
    GAME.outcomeResolvedQuarterId=quarter.id;
    GAME.decisions.push(buildDecisionRecord(outcome));
    GAME.lockedQuarters[quarter.id]={
      quarterId:quarter.id,
      optionId:option.id,
      outcome:outcome,
      stats:cloneStats(GAME.stats)
    };
    GAME.quarterPhase=QUARTER_PHASES.QUARTER_LOCKED;
    if(typeof setScenarioSelection==='function') setScenarioSelection(quarter.id, option.id);
    if(typeof setMetricStarts==='function') setMetricStarts(outcome.after);
    return outcome;
  }

  if(action===QUARTER_ACTIONS.BEGIN_NEXT_QUARTER){
    if(phase!==QUARTER_PHASES.QUARTER_LOCKED){
      warnIllegalQuarterTransition(action,'next quarter requires previous quarter to be locked');
      return false;
    }
    nextId=getNextQuarterId(getCurrentQuarterId());
    if(!nextId) return false;
    return beginQuarterById(nextId);
  }

  warnIllegalQuarterTransition(action,'unknown action');
  return false;
}

function getCurrentStats(){
  return cloneStats(GAME.stats);
}

function setGameScreen(screenName){
  GAME.screen = screenName;
}

function resetGameState(){
  GAME.currentQuarterIndex=0;
  GAME.currentQuarterId=getFirstQuarterId();
  GAME.quarterPhase=QUARTER_PHASES.REPORT_PENDING;
  GAME.screen='simulation';
  GAME.selectedOptionId=null;
  GAME.lastOutcome=null;
  GAME.currentOutcome=null;
  GAME.outcomeResolvedQuarterId=null;
  GAME.decisions=[];
  GAME.lockedQuarters={};
  GAME.stats=initialQuarterStats();
  if(typeof setScenarioSelection==='function') setScenarioSelection(getCurrentQuarter().id, getCurrentQuarter().options[0].id);
}

if(typeof setScenarioSelection==='function') setScenarioSelection(getCurrentQuarter().id, getCurrentQuarter().options[0].id);
