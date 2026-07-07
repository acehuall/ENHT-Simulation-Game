'use strict';
/* ---------- timeline self-test (developer tool) ----------
   Run from the browser console:  runTimelineSelfTest()
   Checks the timeline-compiler invariants from
   docs/simulation-timeline-design.md §9 against the live code.
   Pure/read-only apart from metrics, which are restored after.
---------------------------------------------------------------- */
function runTimelineSelfTest(){
  var EPS=0.01, failures=[], checks=0;
  var savedTimeline=TIMELINE, savedSimT=Math.min(clock,QLEN);
  var qe=getCurrentQuarterEvent();
  var keys=METRIC_DEFS.map(function(d){ return d.key; });

  function check(label, ok, detail){
    checks++;
    if(!ok) failures.push(label+(detail?(' — '+detail):''));
  }

  function testOutcome(label, outcome){
    var tl=compileTimeline(outcome, qe), k, i, sum, delta, prev;

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
          JSON.stringify(compileTimeline(outcome, qe))===JSON.stringify(tl));

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

  testOutcome('default', DEFAULT_OUTCOME);
  var q=getCurrentQuarter(), o;
  for(o=0;o<q.options.length;o++){
    testOutcome(q.options[o].id, resolveOutcome(q, q.options[o], GAME.stats));
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
