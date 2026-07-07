'use strict';
/* ---------- board decision controller ----------
   Owns the decision lifecycle: gating the board pack, confirming a
   decision, and advancing to the next quarter. UI layers (report
   overlay, controls) call in here and only render the result.
------------------------------------------------------------------- */

/* the board pack opens once the quarter has finished, or read-only
   for a quarter whose decision is already recorded */
function canOpenBoardPack(){
  return quarterComplete || isQuarterDecided(getCurrentQuarterId());
}

/* returns the recorded outcome, or null if the decision was blocked */
function confirmBoardDecision(quarterId, optionId){
  if(isQuarterDecided(quarterId)){
    if(typeof console!=='undefined' && console.warn){
      console.warn('[decision] quarter '+quarterId+' is already decided; keeping the recorded outcome');
    }
    return getDecisionForQuarter(quarterId);
  }
  if(!quarterComplete){
    if(typeof console!=='undefined' && console.warn){
      console.warn('[decision] quarter '+quarterId+' has not finished; decision blocked');
    }
    return null;
  }
  var outcome=resolveOutcome(getQuarterById(quarterId), optionId, GAME.stats);
  if(!applyBoardDecision(outcome)) return getDecisionForQuarter(quarterId);
  if(typeof syncBoardPackButton==='function') syncBoardPackButton();
  return outcome;
}

/* returns 'advanced' or 'year-complete' */
function advanceAfterDecision(quarterId){
  var nextId=getNextQuarterId(quarterId);
  if(!nextId) return 'year-complete';
  setCurrentQuarter(nextId);
  setTimelineForCurrentQuarter(getPlaybackOutcomeForQuarter(nextId));
  resetCurrentQuarterSimulation();
  return 'advanced';
}
