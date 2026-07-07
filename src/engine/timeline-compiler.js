'use strict';
/* ---------- resolved-outcome timeline compiler ---------- */
var TIMELINE = null;

var TIMELINE_SLOTS = {
  pressure:8,
  response:18,
  consequence:28
};

function _hashString(s){
  var h=2166136261, i;
  s=String(s || '');
  for(i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return h >>> 0;
}

function _seededOffset(seed, label, amount){
  var n=_hashString(seed+':'+label);
  return ((n % 2001)/1000 - 1) * amount;
}

function _slotTime(outcome, slot){
  var base=TIMELINE_SLOTS[slot] != null ? TIMELINE_SLOTS[slot] : 18;
  var jitter=_seededOffset(outcome.quarterId+':'+outcome.optionId, slot, 1.2);
  return Math.max(2, Math.min(34, +(base+jitter).toFixed(2)));
}

function _metricDelta(outcome, key){
  return (outcome.endStats[key] || 0) - (outcome.startStats[key] || 0);
}

function _beatsForProfile(profile){
  return (profile && profile.beats && profile.beats.length) ? profile.beats : OUTCOME_DRAMA._default.beats;
}

function _weightForMetric(beats, beatIndex, key){
  var explicit=0, consequenceIndex=beats.length-1, i, w;
  for(i=0;i<beats.length;i++){
    w=beats[i].weights && beats[i].weights[key];
    if(typeof w==='number') explicit+=w;
    if(beats[i].slot==='consequence') consequenceIndex=i;
  }
  w=beats[beatIndex].weights && beats[beatIndex].weights[key];
  if(typeof w==='number'){
    return explicit>1 ? w/explicit : w;
  }
  if(explicit>=1) return 0;
  return beatIndex===consequenceIndex ? 1-explicit : 0;
}

function _buildBeatEffects(outcome, beats, offsetScale){
  var effectsByBeat=[], i, def, key, delta, effect, runningBeforeLast;
  for(i=0;i<beats.length;i++) effectsByBeat.push({});

  for(def=0;def<METRIC_DEFS.length;def++){
    key=METRIC_DEFS[def].key;
    delta=_metricDelta(outcome, key);
    runningBeforeLast=0;
    for(i=0;i<beats.length;i++){
      if(i===beats.length-1){
        effect=delta-runningBeforeLast;
      }else{
        effect=delta*_weightForMetric(beats, i, key);
        if(beats[i].offsets && typeof beats[i].offsets[key]==='number'){
          effect+=beats[i].offsets[key]*offsetScale;
        }
        runningBeforeLast+=effect;
      }
      if(Math.abs(effect)>=0.005) effectsByBeat[i][key]=+effect.toFixed(3);
    }
  }
  return effectsByBeat;
}

function _effectsWouldClamp(outcome, effectsByBeat){
  var stats=cloneStats(outcome.startStats), i, key, def, next;
  for(i=0;i<effectsByBeat.length;i++){
    for(key in effectsByBeat[i]){
      if(!effectsByBeat[i].hasOwnProperty(key)) continue;
      def=getMetricDef(key);
      next=(stats[key] || 0)+effectsByBeat[i][key];
      if(def && (next<def.min || next>def.max)) return true;
      stats[key]=next;
    }
  }
  return false;
}

function _balancedBeatEffects(outcome, beats){
  var scale=1, effects=_buildBeatEffects(outcome, beats, scale), guard=0;
  while(_effectsWouldClamp(outcome, effects) && guard<8){
    scale*=0.5;
    effects=_buildBeatEffects(outcome, beats, scale);
    guard++;
  }
  return effects;
}

function _copyVisualCue(cue, t0){
  var copy={}, key;
  for(key in cue){ if(cue.hasOwnProperty(key)) copy[key]=cue[key]; }
  copy.t0=+(t0+(copy.offset || 0)).toFixed(2);
  copy.t1=+(copy.t0+(copy.duration != null ? copy.duration : 7)).toFixed(2);
  return copy;
}

function _timelineTotals(events){
  var total={}, i;
  for(i=0;i<events.length;i++) total=mergeMetricEffects(total, events[i].effects);
  return total;
}

function _validateTimeline(timeline){
  var totals=_timelineTotals(timeline.statEvents), errors=[], i, def, expected, actual;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    expected=+_metricDelta(timeline.outcome, def.key).toFixed(3);
    actual=+(totals[def.key] || 0).toFixed(3);
    if(Math.abs(expected-actual)>0.01){
      errors.push(def.key+' expected '+expected+' got '+actual);
    }
  }
  timeline.validationErrors=errors;
  if(errors.length && typeof console!=='undefined' && console.warn){
    console.warn('Timeline validation warnings', errors);
  }
}

function compileTimeline(outcome, quarterEvent){
  outcome=outcome || DEFAULT_OUTCOME;
  quarterEvent=quarterEvent || getCurrentQuarterEvent();
  var profile=getOutcomeDramaProfile(outcome.optionId);
  var beats=_beatsForProfile(profile);
  var effectsByBeat=_balancedBeatEffects(outcome, beats);
  var statEvents=[], visualEvents=[], slotTimes={}, i, beat, t, cue;

  for(i=0;i<beats.length;i++){
    beat=beats[i];
    t=_slotTime(outcome, beat.slot);
    slotTimes[beat.slot]=t;
    statEvents.push({
      t:t,
      slot:beat.slot,
      name:beat.name,
      toast:beat.toast || beat.name,
      effects:effectsByBeat[i]
    });
  }

  var ambient=(quarterEvent && quarterEvent.ambientVisuals) || [];
  for(i=0;i<ambient.length;i++){
    cue={};
    for(var aKey in ambient[i]){ if(ambient[i].hasOwnProperty(aKey)) cue[aKey]=ambient[i][aKey]; }
    visualEvents.push(cue);
  }

  var visuals=(profile && profile.visuals) || [];
  for(i=0;i<visuals.length;i++){
    cue=visuals[i];
    visualEvents.push(_copyVisualCue(cue, slotTimes[cue.slot] != null ? slotTimes[cue.slot] : TIMELINE_SLOTS.response));
  }

  visualEvents.push({type:'moodEmote', t0:0, t1:QLEN});
  visualEvents.sort(function(a,b){ return (a.t0 || 0)-(b.t0 || 0); });
  statEvents.sort(function(a,b){ return a.t-b.t; });

  var timeline={
    quarterId:quarterEvent.id,
    outcome:outcome,
    banner:{
      quarterLine:(quarterEvent.label || 'Q')+' - '+(quarterEvent.bannerLine || quarterEvent.eventName || 'SIMULATION'),
      decisionLine:'the board has decided: '+String(outcome.optionTitle || 'Status Quo').toUpperCase()
    },
    statEvents:statEvents,
    visualEvents:visualEvents,
    closeAt:38
  };
  _validateTimeline(timeline);
  return timeline;
}

function setTimelineForCurrentQuarter(outcome){
  TIMELINE=compileTimeline(outcome || getPlaybackOutcomeForQuarter(getCurrentQuarterId()), getCurrentQuarterEvent());
  if(typeof resetMetrics==='function') resetMetrics();
  if(typeof syncQuarterControls==='function') syncQuarterControls();
  return TIMELINE;
}

function getTimeline(){
  return TIMELINE;
}

function getTimelineOutcome(){
  return (TIMELINE && TIMELINE.outcome) || DEFAULT_OUTCOME;
}

function getTimelineStatEvents(){
  return (TIMELINE && TIMELINE.statEvents) || [];
}

function getTimelineVisualEvents(){
  return (TIMELINE && TIMELINE.visualEvents) || [];
}

function getTimelineEventsAt(type, simT){
  var events=getTimelineVisualEvents(), active=[], i, ev;
  for(i=0;i<events.length;i++){
    ev=events[i];
    if(ev.type===type && simT>=(ev.t0 || 0) && simT<(ev.t1 == null ? QLEN : ev.t1)) active.push(ev);
  }
  return active;
}

function getTimelineToastAt(simT){
  var events=getTimelineStatEvents(), active=null, i, ev;
  for(i=0;i<events.length;i++){
    ev=events[i];
    if(simT>=ev.t && simT<ev.t+5.5) active=ev;
  }
  return active;
}
