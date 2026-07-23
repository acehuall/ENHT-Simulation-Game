'use strict';
/* ---------- shared threshold observer + live alert delivery ----------
   Committed endpoints decide which threshold crossings are real. Playback
   values decide when those eligible crossings are presented. This layer is
   transient theatre and never writes to GAME.alerts, GAME.stats or METRIC_CUR.
------------------------------------------------------------------------ */

var ALERT_HOLD=2.5;
var ALERT_FADE=0.6;

var _obsLastVals={};
var _obsSeen={};
var _obsEligible={};
var _obsPassKey=null;
var _obsTimeline=null;
var _obsFrame=-1;
var _obsFrameOut=[];

var _alertQueue=[];
var _alertActive=null;

function _obsKey(key, at, direction){
  return key+'@'+at+':'+direction;
}

function _obsPassIdentity(timeline){
  var outcome=timeline && timeline.outcome;
  return outcome ? outcome.quarterId+':'+outcome.optionId : null;
}

function _obsRebuildEligible(timeline){
  _obsEligible={};
  var outcome=timeline && timeline.outcome;
  if(!outcome) return;
  for(var i=0;i<METRIC_DEFS.length;i++){
    var def=METRIC_DEFS[i];
    var crossings=getThresholdCrossings(
      def.key,
      outcome.startStats[def.key],
      outcome.endStats[def.key]
    );
    for(var c=0;c<crossings.length;c++){
      var crossing=crossings[c];
      _obsEligible[_obsKey(def.key, crossing.threshold.at, crossing.direction)]=true;
    }
  }
}

/* Reset is deliberately silent: it seeds at the current reconstructed values,
   clears presentation state, and cannot itself produce an alert. */
function resetAlerts(){
  var timeline=(typeof getTimeline==='function') && getTimeline();
  _obsSeen={};
  _obsLastVals={};
  _obsFrame=-1;
  _obsFrameOut=[];
  _obsPassKey=_obsPassIdentity(timeline);
  _obsTimeline=timeline;
  _obsRebuildEligible(timeline);
  for(var i=0;i<METRIC_DEFS.length;i++){
    var def=METRIC_DEFS[i];
    _obsLastVals[def.key]=getMetricValue(def.key);
  }
  _alertQueue=[];
  _alertActive=null;
  _alertClearOverlay('alertBanner');
  _alertClearOverlay('alertToast');
}

/* The sole live detector. Its output is memoised for a render frame so the
   feed and overlay consumers receive the exact same crossing objects. */
function observeThresholdCrossings(frameId){
  var timeline=(typeof getTimeline==='function') && getTimeline();
  var passKey=_obsPassIdentity(timeline);
  if(timeline!==_obsTimeline || passKey!==_obsPassKey){
    resetAlerts();
  }
  if(frameId===_obsFrame) return _obsFrameOut;
  _obsFrame=frameId;

  var out=[];
  for(var i=0;i<METRIC_DEFS.length;i++){
    var def=METRIC_DEFS[i];
    var next=getMetricValue(def.key);
    var prev=_obsLastVals[def.key];
    if(prev==null){
      _obsLastVals[def.key]=next;
      continue;
    }
    if(prev===next) continue;
    var crossings=getThresholdCrossings(def.key,prev,next);
    for(var c=0;c<crossings.length;c++){
      var crossing=crossings[c];
      var key=_obsKey(def.key,crossing.threshold.at,crossing.direction);
      if(!_obsEligible[key] || _obsSeen[key]) continue;
      _obsSeen[key]=true;
      out.push({
        key:def.key,
        threshold:crossing.threshold,
        direction:crossing.direction
      });
    }
    _obsLastVals[def.key]=next;
  }
  _obsFrameOut=out;
  return out;
}

var _SEV_ORDER={critical:0,warn:1,praise:2};

function _severityRank(severity){
  return _SEV_ORDER.hasOwnProperty(severity) ? _SEV_ORDER[severity] : 9;
}

function _enqueueCrossings(crossings){
  var ranked=crossings.slice().sort(function(a,b){
    return _severityRank(a.threshold.severity)-_severityRank(b.threshold.severity);
  });
  for(var i=0;i<ranked.length;i++){
    var threshold=ranked[i].threshold;
    _alertQueue.push({
      key:ranked[i].key,
      at:threshold.at,
      direction:ranked[i].direction,
      severity:threshold.severity,
      title:threshold.title,
      line:threshold.line,
      channel:threshold.severity==='critical' ? 'banner' : 'toast'
    });
  }
}

function _alertNow(){
  return typeof performance!=='undefined' ? performance.now() : Date.now();
}

function updateAlerts(frameId){
  _enqueueCrossings(observeThresholdCrossings(frameId));
  _alertTick();
}

function _alertTick(){
  var now=_alertNow();
  if(_alertActive==null){
    if(!_alertQueue.length) return;
    _alertActive=_alertQueue.shift();
    _alertActive.shownAt=now;
    _alertShow(_alertActive);
    return;
  }
  var age=(now-_alertActive.shownAt)/1000;
  if(age<ALERT_HOLD) return;
  if(age<ALERT_HOLD+ALERT_FADE){
    var activeEl=$(_alertActive.channel==='banner' ? 'alertBanner' : 'alertToast');
    if(activeEl){
      activeEl.style.opacity=Math.max(0,1-(age-ALERT_HOLD)/ALERT_FADE);
    }
    return;
  }
  _alertClearOverlay(_alertActive.channel==='banner' ? 'alertBanner' : 'alertToast');
  _alertActive=null;
}

function _alertShow(alert){
  var id=alert.channel==='banner' ? 'alertBanner' : 'alertToast';
  var el=$(id);
  if(!el) return;
  el.className=(alert.channel==='banner' ? 'alert-banner' : 'alert-toast')+
    ' alert-'+alert.severity;
  el.innerHTML='<b>'+escapeHTML(alert.title)+'</b><span>'+escapeHTML(alert.line)+'</span>';
  el.style.opacity=1;
}

function _alertClearOverlay(id){
  var el=$(id);
  if(!el) return;
  el.className=id==='alertBanner' ? 'alert-banner' : 'alert-toast';
  el.textContent='';
  el.style.opacity=0;
}
