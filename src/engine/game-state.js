'use strict';
/* ---------- game state foundation ---------- */
var GAME = {
  currentQuarterIndex:0,
  currentQuarterId:getFirstQuarterId(),
  screen:'simulation',
  selectedOptionId:null,
  decisionByQuarterId:{},
  decisions:[],
  stats:initialMetricStats(),
  alerts:[],
  roles:[]                     /* selected board role ids, e.g. ['cfo','md'] */
};

/* Board roles chosen in the pregame. Stored as ids (not indices, not objects)
   so the source of truth stays PREGAME.roles - see getBoardRoles(). */
function setBoardRoles(ids){
  GAME.roles=(ids||[]).slice();
}

/* Resolve the selected ids to their PREGAME role objects, skipping any id that
   does not match a known role rather than returning an undefined entry. */
function getBoardRoles(){
  var out=[], i, role;
  for(i=0;i<GAME.roles.length;i++){
    role=(typeof getPregameRoleById==='function') ? getPregameRoleById(GAME.roles[i]) : null;
    if(role) out.push(role);
  }
  return out;
}

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
  recordDecisionAlerts(outcome);
  return true;
}

/* Durable alert history is derived only from the committed decision movement.
   Playback can be rewound or replayed, so it must never write to this list. */
function recordDecisionAlerts(outcome){
  if(typeof getThresholdCrossings!=='function') return;
  for(var i=0;i<METRIC_DEFS.length;i++){
    var def=METRIC_DEFS[i];
    var crossings=getThresholdCrossings(
      def.key,
      outcome.startStats[def.key],
      outcome.endStats[def.key]
    );
    for(var c=0;c<crossings.length;c++){
      var crossing=crossings[c];
      GAME.alerts.push({
        decisionQuarterId:outcome.quarterId,
        key:def.key,
        at:crossing.threshold.at,
        direction:crossing.direction,
        severity:crossing.threshold.severity,
        title:crossing.threshold.title,
        line:crossing.threshold.line,
        value:outcome.endStats[def.key]
      });
    }
  }
}

/* Ordered per-quarter closing positions, oldest first. Derived only from
   committed decisions - never from playback. Returns [] before the first
   decision; every consumer must fall back to the current single value rather
   than throwing on the empty case. The stats objects are references into
   GAME.decisions and must not be mutated. */
function getStatsHistory(){
  var out=[], i, d;
  for(i=0;i<GAME.decisions.length;i++){
    d=GAME.decisions[i];
    out.push({
      round:      d.round,
      quarterId:  d.quarter,
      optionId:   d.optionId,
      startStats: d.startStats,
      endStats:   d.endStats
    });
  }
  return out;
}

function getAlertsForDecisionQuarter(decisionQuarterId){
  var alerts=[];
  for(var i=0;i<GAME.alerts.length;i++){
    if(GAME.alerts[i].decisionQuarterId===decisionQuarterId){
      alerts.push(GAME.alerts[i]);
    }
  }
  return alerts;
}

function resetGameState(){
  GAME.currentQuarterIndex=0;
  GAME.currentQuarterId=getFirstQuarterId();
  GAME.screen='simulation';
  GAME.selectedOptionId=null;
  GAME.decisionByQuarterId={};
  GAME.decisions=[];
  GAME.stats=initialMetricStats();
  GAME.alerts=[];
  GAME.roles=[];
  setSelectedOption(getCurrentQuarter().options[0].id);
}

setSelectedOption(getCurrentQuarter().options[0].id);
