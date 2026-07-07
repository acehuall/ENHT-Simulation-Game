'use strict';
/* ---------- timeline self-test + debug helpers (developer tools) ----------
   Run from the browser console:
     runTimelineSelfTest()  - checks the compiler invariants from
                              docs/simulation-timeline-design.md §9 for every
                              quarter and every option
     debugGameState()       - snapshot of quarter, playback outcome, selected
                              option, recorded decisions and timeline errors
   Pure/read-only apart from metrics, which are restored afterwards.
--------------------------------------------------------------------------- */
function runTimelineSelfTest(){
  var EPS=0.01, failures=[], checks=0;
  var savedTimeline=TIMELINE, savedSimT=Math.min(clock,QLEN);
  var keys=METRIC_DEFS.map(function(d){ return d.key; });

  function check(label, ok, detail){
    checks++;
    if(!ok) failures.push(label+(detail?(' — '+detail):''));
  }

  function testOutcome(label, outcome, quarterEvent){
    var tl=compileTimeline(outcome, quarterEvent), k, i, sum, delta, prev;

    /* 0. compiler's own validation must be clean */
    check(label+': no validation errors', !(tl.validationErrors && tl.validationErrors.length),
          (tl.validationErrors || []).join('; '));

    /* 1. sum of beat effects === endStats - startStats, per metric */
    for(k=0;k<keys.length;k++){
      sum=0;
      for(i=0;i<tl.statEvents.length;i++) sum+=(tl.statEvents[i].effects[keys[k]]||0);
      delta=(outcome.endStats[keys[k]]||0)-(outcome.startStats[keys[k]]||0);
      check(label+': sum('+keys[k]+')===delta', Math.abs(sum-delta)<=EPS,
            sum.toFixed(3)+' vs '+delta.toFixed(3));
    }

    /* 2. beat times ordered and inside the playable window */
    prev=-1;
    for(i=0;i<tl.statEvents.length;i++){
      check(label+': beat times ordered/in range',
            tl.statEvents[i].t>prev && tl.statEvents[i].t>=2 && tl.statEvents[i].t<=34,
            'beat '+i+' t='+tl.statEvents[i].t);
      prev=tl.statEvents[i].t;
    }

    /* 3. deterministic recompile */
    check(label+': deterministic',
          JSON.stringify(compileTimeline(outcome, quarterEvent))===JSON.stringify(tl));

    /* 4. metrics land exactly on endStats at QLEN */
    TIMELINE=tl;
    resetMetrics(); updateMetrics(QLEN);
    for(k=0;k<keys.length;k++){
      check(label+': endpoint('+keys[k]+')',
            Math.abs(METRIC_CUR[keys[k]]-outcome.endStats[keys[k]])<=EPS,
            METRIC_CUR[keys[k]].toFixed(3)+' vs '+outcome.endStats[keys[k]]);
    }

    /* 5. decision-scoped events: agency beats only for the agency option */
    var agency=false;
    for(i=0;i<tl.statEvents.length;i++){
      if(/agency/i.test(tl.statEvents[i].name||'')||/agency/i.test(tl.statEvents[i].toast||'')) agency=true;
    }
    check(label+': agency events scoped',
          agency===(outcome.optionId==='hire_temporary_staff'));
  }

  testOutcome('default', DEFAULT_OUTCOME, getQuarterEventConfig(getFirstQuarterId()));

  var q, o, opt, outcome, quarterEvent, label;
  for(q=0;q<QUARTERS.length;q++){
    quarterEvent=getQuarterEventConfig(QUARTERS[q].id);
    for(o=0;o<QUARTERS[q].options.length;o++){
      opt=QUARTERS[q].options[o];
      label=QUARTERS[q].id+'/'+opt.id;
      check(label+': drama profile exists', !!OUTCOME_DRAMA[opt.id]);
      outcome=resolveOutcome(QUARTERS[q], opt, initialMetricStats());
      testOutcome(label, outcome, quarterEvent);
    }
  }

  /* restore live state */
  TIMELINE=savedTimeline;
  resetMetrics(); updateMetrics(savedSimT);

  if(failures.length){
    console.error('TIMELINE SELF-TEST: '+failures.length+' of '+checks+' checks FAILED');
    for(o=0;o<failures.length;o++) console.error('  FAIL '+failures[o]);
  }else{
    console.log('TIMELINE SELF-TEST: all '+checks+' checks passed');
  }
  return {checks:checks, failures:failures};
}

function debugGameState(){
  var tl=typeof getTimeline==='function' ? getTimeline() : null;
  var decided={}, k;
  for(k in GAME.decisionByQuarterId){
    if(GAME.decisionByQuarterId.hasOwnProperty(k)) decided[k]=GAME.decisionByQuarterId[k].optionId;
  }
  var state={
    quarter:GAME.currentQuarterId,
    simT:+Math.min(clock,QLEN).toFixed(2),
    quarterComplete:quarterComplete,
    paused:paused,
    scene:currentScene,
    selectedOptionId:GAME.selectedOptionId,
    playbackOutcome:tl && tl.outcome ? tl.outcome.quarterId+'/'+tl.outcome.optionId : null,
    decisionByQuarterId:decided,
    stats:cloneStats(GAME.stats),
    timelineValidationErrors:(tl && tl.validationErrors) || []
  };
  console.log('GAME STATE\n'+JSON.stringify(state, null, 2));
  return state;
}
