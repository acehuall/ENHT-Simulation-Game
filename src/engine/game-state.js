'use strict';
/* ---------- game state foundation ---------- */
var GAME = {
  currentQuarterIndex:0,
  currentQuarterId:getFirstQuarterId(),
  screen:'simulation',
  selectedOptionId:null,
  decisionByQuarterId:{},
  decisions:[],
  stats:initialMetricStats()
};

function isQuarterDecided(quarterId){
  return !!GAME.decisionByQuarterId[quarterId];
}

function getDecisionForQuarter(quarterId){
  return GAME.decisionByQuarterId[quarterId] || null;
}

/* the outcome quarter `quarterId` should dramatize: the most recent board
   decision taken before it, falling back to the scripted opening outcome */
function getPlaybackOutcomeForQuarter(quarterId){
  var idx=getQuarterIndexById(quarterId), i, prior;
  for(i=idx-1;i>=0;i--){
    prior=GAME.decisionByQuarterId[QUARTERS[i].id];
    if(prior) return prior;
  }
  return DEFAULT_OUTCOME;
}

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
  if(isQuarterDecided(outcome.quarterId)){
    if(typeof console!=='undefined' && console.warn){
      console.warn('[game-state] quarter '+outcome.quarterId+' already has a recorded decision; ignoring duplicate');
    }
    return false;
  }
  GAME.stats=cloneStats(outcome.endStats);
  GAME.selectedOptionId=outcome.optionId;
  GAME.decisionByQuarterId[outcome.quarterId]=outcome;
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
  return true;
}

function resetGameState(){
  GAME.currentQuarterIndex=0;
  GAME.currentQuarterId=getFirstQuarterId();
  GAME.screen='simulation';
  GAME.selectedOptionId=null;
  GAME.decisionByQuarterId={};
  GAME.decisions=[];
  GAME.stats=initialMetricStats();
  setSelectedOption(getCurrentQuarter().options[0].id);
}

setSelectedOption(getCurrentQuarter().options[0].id);
