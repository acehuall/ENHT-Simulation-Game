'use strict';
/* ---------- role objective evaluation (phase 4) ----------
   Pure derivations over the committed decision history. No state is written
   back; nothing here reads METRIC_CUR or playback beats (Stats_Spec §5.5 and
   the recordDecisionAlerts precedent). Every consumer - the brief panel, the
   board-pack pips, the year-end scoring - reads the same functions.

   `history` is always the array returned by getStatsHistory(): ordered
   {round, quarterId, optionId, startStats, endStats}, oldest first, [] before
   the first decision. Its stats objects are references into GAME.decisions and
   are treated as read-only here.
--------------------------------------------------------------------------- */

/* Plain-text target descriptor for an objective, e.g. "HOLD >= -£3.0m". Money
   keeps the sign outside the £; index metrics are bare integers; the comparator
   folds in goodUp so a lower-is-better `end` reads "REACH <=". Shared by the
   board brief and the year-end scorecard so the two can never drift - it lived
   in brief.js as _briefTargetText before phase 5 lifted it here. */
function formatObjectiveTarget(obj){
  var def=(typeof getMetricDef==='function') ? getMetricDef(obj.key) : null;
  var val=(def && def.money)
    ? ((obj.target<0?'-£':'£')+Math.abs(obj.target).toFixed(1)+'m')
    : String(obj.target);
  var op;
  switch(obj.type){
    case 'floor':   op='HOLD ≥ '; break;
    case 'ceiling': op='KEEP ≤ '; break;
    case 'delta':   op='GAIN ≥ '+(obj.target>=0?'+':''); break;
    case 'end':     op=(def && def.goodUp===false) ? 'REACH ≤ ' : 'REACH ≥ '; break;
    default:        op='';
  }
  return op+val;
}

/* -> PREGAME role object for an id, or null. */
function getPregameRoleById(id){
  var i, roles=(typeof PREGAME!=='undefined' && PREGAME.roles) ? PREGAME.roles : [];
  for(i=0;i<roles.length;i++){
    if(roles[i].id===id) return roles[i];
  }
  return null;
}

/* Closing values of one metric across committed quarters, oldest first.
   Empty when no decision has been committed - callers must guard min/max. */
function _objEndValues(history, key){
  var out=[], i;
  for(i=0;i<history.length;i++) out.push(history[i].endStats[key]);
  return out;
}
function _objMin(vals){
  var m=vals[0], i;
  for(i=1;i<vals.length;i++){ if(vals[i]<m) m=vals[i]; }
  return m;
}
function _objMax(vals){
  var m=vals[0], i;
  for(i=1;i<vals.length;i++){ if(vals[i]>m) m=vals[i]; }
  return m;
}

/* The marginal / at-risk tolerance is 10% of the metric's authored RANGE
   (max-min), never 10% of the target: targets are legitimately 0 or negative
   (budget -3.0), so a percent-of-target denominator divides by zero or flips
   sign. Range is always positive and stable. */
function _objTolerance(def){
  return def ? 0.10*(def.max-def.min) : 0;
}

/* Signed headroom into pass territory: >=0 means the objective is met, and the
   magnitude is how far inside (floor/ceiling/end/delta all normalised so that a
   larger positive number is safer). Direction folds in goodUp for `end`. */
function _objHeadroom(obj, def, actual){
  var goodUp=def ? !!def.goodUp : true;
  switch(obj.type){
    case 'floor':   return actual-obj.target;
    case 'ceiling': return obj.target-actual;
    case 'delta':   return actual-obj.target;
    case 'end':     return goodUp ? actual-obj.target : obj.target-actual;
  }
  return actual-obj.target;
}

/* Final (year-end) evaluation of one objective.
   -> {objective, status:'pass'|'fail'|'marginal', actual, target, margin}
   `marginal` counts as passed for scoring; it flags a pass sitting within one
   tolerance of the line. floor/ceiling latch automatically: `actual` is the
   min/max across ALL committed quarters, so a single breached quarter keeps the
   metric below/above the line even after it recovers (Stats_Spec §5.5). */
function evaluateObjective(obj, history, startStats, finalStats){
  var def=getMetricDef(obj.key);
  var tol=_objTolerance(def);
  var vals=_objEndValues(history, obj.key);
  var actual=null;
  if(obj.type==='floor'){
    actual = vals.length ? _objMin(vals) : (finalStats!=null ? finalStats[obj.key] : null);
  }else if(obj.type==='ceiling'){
    actual = vals.length ? _objMax(vals) : (finalStats!=null ? finalStats[obj.key] : null);
  }else if(obj.type==='end'){
    actual = finalStats!=null ? finalStats[obj.key] : (vals.length ? vals[vals.length-1] : null);
  }else{ /* delta */
    var s = startStats!=null ? startStats[obj.key] : (history.length ? history[0].startStats[obj.key] : null);
    var f = finalStats!=null ? finalStats[obj.key] : (vals.length ? vals[vals.length-1] : null);
    actual = (s!=null && f!=null) ? f-s : null;
  }
  /* Empty/absent data cannot have breached anything - never a fail. */
  if(actual==null){
    return {objective:obj, status:'pass', actual:null, target:obj.target, margin:null};
  }
  var head=_objHeadroom(obj, def, actual);
  var status;
  if(head<0) status='fail';
  else if(head<=tol) status='marginal';
  else status='pass';
  return {objective:obj, status:status, actual:actual, target:obj.target, margin:head};
}

/* Shared status derivation for a metric position `statsAt`, honouring the
   floor/ceiling latch off committed history. Empty history never latches; a
   null position reads ON TRACK. -> ON TRACK | AT RISK | BREACHED | MET */
function _objStatusFrom(obj, history, startStats, statsAt){
  var def=getMetricDef(obj.key);
  var tol=_objTolerance(def);
  var vals=_objEndValues(history, obj.key);
  var cur = statsAt!=null ? statsAt[obj.key] : (vals.length ? vals[vals.length-1] : null);
  if(cur==null) return 'ON TRACK';
  if(obj.type==='floor'){
    if(vals.length && _objMin(vals) < obj.target) return 'BREACHED';  /* latched by a prior quarter */
    if(cur < obj.target) return 'BREACHED';
    return (cur-obj.target <= tol) ? 'AT RISK' : 'ON TRACK';
  }
  if(obj.type==='ceiling'){
    if(vals.length && _objMax(vals) > obj.target) return 'BREACHED';  /* latched by a prior quarter */
    if(cur > obj.target) return 'BREACHED';
    return (obj.target-cur <= tol) ? 'AT RISK' : 'ON TRACK';
  }
  /* end / delta do not latch - the year can still turn them around. */
  var actual;
  if(obj.type==='delta'){
    var s = startStats!=null ? startStats[obj.key] : (history.length ? history[0].startStats[obj.key] : null);
    if(s==null) return 'ON TRACK';
    actual = cur - s;
  }else{
    actual = cur;
  }
  var head=_objHeadroom(obj, def, actual);
  if(head<0) return 'AT RISK';
  return (head<=tol) ? 'AT RISK' : 'MET';
}

/* Live in-game status for the brief panel.
   -> 'ON TRACK' | 'AT RISK' | 'BREACHED' | 'MET'
   Derived from committed decisions only. `currentStats` should be the committed
   running position (GAME.stats), NEVER METRIC_CUR. Before the first decision
   (empty history) every objective reads ON TRACK and none can be BREACHED. */
function getObjectiveLiveStatus(obj, history, startStats, currentStats){
  if(!history.length) return 'ON TRACK';
  return _objStatusFrom(obj, history, startStats, currentStats);
}

/* Year-end score verdict for a weighted 0..100 score. */
function getObjectiveVerdict(score){
  if(score>=90) return 'EXCEEDED';
  if(score>=70) return 'MET';
  if(score>=45) return 'PARTIALLY MET';
  return 'NOT MET';
}

/* Evaluate every objective for one role and roll up a weighted score.
   -> {role, results:[], passed, total, weightedScore, verdict}
   weightedScore = 100 * Σ(weight of passed) / Σ(weight); marginal counts as
   passed. Falls back to the current committed position when no decision has
   been committed yet, so it never throws on the empty case. */
function evaluateRole(roleId){
  var role=getPregameRoleById(roleId);
  if(!role) return null;
  var history=(typeof getStatsHistory==='function') ? getStatsHistory() : [];
  var fallback=(typeof getCurrentStats==='function') ? getCurrentStats() : (typeof GAME!=='undefined' ? GAME.stats : null);
  var startStats = history.length ? history[0].startStats : fallback;
  var finalStats = history.length ? history[history.length-1].endStats : fallback;
  var results=[], passedWeight=0, totalWeight=0, passedCount=0, i, obj, res;
  for(i=0;i<role.objectives.length;i++){
    obj=role.objectives[i];
    res=evaluateObjective(obj, history, startStats, finalStats);
    results.push(res);
    totalWeight+=obj.weight;
    if(res.status!=='fail'){ passedWeight+=obj.weight; passedCount++; }
  }
  var weightedScore = totalWeight ? 100*passedWeight/totalWeight : 0;
  return {
    role:role,
    results:results,
    passed:passedCount,
    total:role.objectives.length,
    weightedScore:weightedScore,
    verdict:getObjectiveVerdict(weightedScore)
  };
}

/* One roleResult per selected board role, skipping unknown ids. */
function evaluateAllRoles(){
  var ids=(typeof GAME!=='undefined' && GAME.roles) ? GAME.roles : [];
  var out=[], i, res;
  for(i=0;i<ids.length;i++){
    res=evaluateRole(ids[i]);
    if(res) out.push(res);
  }
  return out;
}
