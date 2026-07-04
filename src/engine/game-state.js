'use strict';
/* ---------- game state foundation ---------- */
var GAME = {
  currentQuarterIndex:0,
  currentQuarterId:getFirstQuarterId(),
  screen:'simulation',
  selectedOptionId:null,
  lastOutcome:null,
  decisions:[],
  stats:initialQuarterStats()
};

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
  var quarter=getCurrentQuarter();
  return getQuarterOption(quarter, GAME.selectedOptionId);
}

function setSelectedOption(optionId){
  var quarter=getCurrentQuarter();
  var option=getQuarterOption(quarter, optionId);
  GAME.selectedOptionId=option.id;
  if(typeof setScenarioSelection==='function'){
    setScenarioSelection(quarter.id, option.id);
  }
}

function setCurrentQuarter(quarterId){
  var idx=getQuarterIndexById(quarterId);
  var quarter=QUARTERS[idx];
  GAME.currentQuarterId=quarter.id;
  GAME.currentQuarterIndex=idx;
  setSelectedOption(quarter.options[0].id);
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

function resetGameState(){
  GAME.currentQuarterIndex=0;
  GAME.currentQuarterId=getFirstQuarterId();
  GAME.screen='simulation';
  GAME.selectedOptionId=null;
  GAME.lastOutcome=null;
  GAME.decisions=[];
  GAME.stats=initialQuarterStats();
  setSelectedOption(getCurrentQuarter().options[0].id);
}

setSelectedOption(getCurrentQuarter().options[0].id);
