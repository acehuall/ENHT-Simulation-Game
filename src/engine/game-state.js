'use strict';
/* ---------- game state foundation ---------- */
var GAME = {
  currentQuarterIndex:0,
  currentQuarterId:getFirstQuarterId(),
  screen:'simulation',
  selectedOptionId:null,
  lastOutcome:null,
  playbackOutcome:DEFAULT_OUTCOME,
  decisions:[],
  stats:initialMetricStats()
};

function cloneStats(stats){
  return cloneMetricStats(stats);
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
  return getQuarterOption(getCurrentQuarter(), GAME.selectedOptionId);
}

function setSelectedOption(optionId){
  GAME.selectedOptionId=getQuarterOption(getCurrentQuarter(), optionId).id;
}

function setCurrentQuarter(quarterId){
  var idx=getQuarterIndexById(quarterId);
  var q=QUARTERS[idx];
  GAME.currentQuarterId=q.id;
  GAME.currentQuarterIndex=idx;
  setSelectedOption(q.options[0].id);
}

function advanceToNextQuarter(){
  var nextId=getNextQuarterId(getCurrentQuarterId());
  if(!nextId) return false;
  setCurrentQuarter(nextId);
  return true;
}

function getCurrentStats(){
  return cloneStats(GAME.stats);
}

function setGameScreen(screenName){
  GAME.screen = screenName;
}

function resolveOutcome(quarterOrId, optionOrId, startStats){
  var q=typeof quarterOrId==='string' ? getQuarterById(quarterOrId) : quarterOrId;
  var option=typeof optionOrId==='string' ? getQuarterOption(q, optionOrId) : optionOrId;
  var before=cloneStats(startStats || GAME.stats);
  var after=applyMetricEffects(before, option.effects);
  return {
    quarterId:q.id,
    quarterLabel:q.label,
    quarterTitle:q.title,
    optionId:option.id,
    optionLabel:option.label,
    optionTitle:option.title,
    decisionSummary:option.decisionSummary,
    startStats:before,
    endStats:after,
    effects:mergeMetricEffects(option.effects, {})
  };
}

function applyBoardDecision(outcome){
  GAME.stats=cloneStats(outcome.endStats);
  GAME.selectedOptionId=outcome.optionId;
  GAME.lastOutcome=outcome;
  GAME.playbackOutcome=outcome;
  GAME.decisions.push({
    round:GAME.decisions.length+1,
    quarter:outcome.quarterId,
    optionId:outcome.optionId,
    title:outcome.optionTitle,
    summary:outcome.decisionSummary,
    startStats:cloneStats(outcome.startStats),
    endStats:cloneStats(outcome.endStats),
    effects:mergeMetricEffects(outcome.effects, {})
  });
}

function resetGameState(){
  GAME.currentQuarterIndex=0;
  GAME.currentQuarterId=getFirstQuarterId();
  GAME.screen='simulation';
  GAME.selectedOptionId=null;
  GAME.lastOutcome=null;
  GAME.playbackOutcome=DEFAULT_OUTCOME;
  GAME.decisions=[];
  GAME.stats=initialMetricStats();
  setSelectedOption(getCurrentQuarter().options[0].id);
}

setSelectedOption(getCurrentQuarter().options[0].id);
