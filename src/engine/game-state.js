'use strict';
/* ---------- game state foundation ---------- */
var GAME = {
  currentQuarterIndex: 0,
  screen: 'simulation',
  selectedOptionId: null,
  lastOutcome: null,
  decisions: [],
  stats: {
    budget: 0,
    waiting: 68,
    patsat: 63,
    morale: 58,
    safety: 66,
    rep: 60
  }
};

function cloneStats(stats){
  return {
    budget: stats.budget,
    waiting: stats.waiting,
    patsat: stats.patsat,
    morale: stats.morale,
    safety: stats.safety,
    rep: stats.rep
  };
}

function getCurrentQuarter(){
  return QUARTERS[GAME.currentQuarterIndex];
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
  GAME.stats = {
    budget: 0,
    waiting: 68,
    patsat: 63,
    morale: 58,
    safety: 66,
    rep: 60
  };
}
