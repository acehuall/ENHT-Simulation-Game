'use strict';
/* =========================================================
   QUARTER UI — glues the quarter data to the game shell.
   - applyQuarterTheme(): header chip, progress label, chart
     caption and quarter banner all come from QUARTERS data
     (no hardcoded "Q1" text in the HTML).
   - startQuarter(i): begins a quarter with the current
     GAME.stats as the metric baselines.
   - "Read Board Report" (boardroom scene) opens the report
     overlay; the confirmed decision advances the quarter or,
     after the final quarter, shows the year-end paper.
   - Dev dropdown in the control bar jumps straight to any
     quarter (new quarters appear automatically).
========================================================= */

function applyQuarterTheme(){
  var q=getCurrentQuarter();
  var dec=GAME.decisions.length ? GAME.decisions[GAME.decisions.length-1] : null;
  $('hdrChip').textContent=q.label+' - '+q.name;
  $('pqLabel').textContent=q.label;
  $('chartCap').textContent='BOARD METRIC TREND - '+q.label;
  $('bannerMsg').innerHTML=q.label+' &middot; '+q.name+'<br><b>'+
    (dec ? 'the board has decided: '+dec.optionTitle : q.title)+'</b>';
  var sel=$('devQuarter');
  if(sel) sel.value=String(GAME.currentQuarterIndex);
}

/* begin quarter i using the current GAME.stats as baselines */
function startQuarter(i){
  GAME.currentQuarterIndex=clamp(i,0,QUARTERS.length-1);
  setMetricStarts(GAME.stats);
  applyQuarterTheme();
  seekSimulation(0);
  paused=false;
  syncPauseButton();
  setScene('simulation');
}

/* boardroom "Read Board Report" -> report overlay */
function openQuarterReport(){
  openBoardReport({
    quarter: getCurrentQuarter(),
    prevStats: getMetricStarts(),   /* values at the start of the quarter */
    curStats: getMetricValues(),    /* values now (end of the sim) */
    onAdvance: function(){
      if(isFinalQuarter()){
        renderYearEnd(function(){
          resetGameState();
          closeBoardReport();
          startQuarter(0);
        });
      }else{
        closeBoardReport();
        startQuarter(GAME.currentQuarterIndex+1);
      }
    }
  });
}

/* ---------- init ---------- */
(function(){
  /* dev/debug quarter jump — options generated from QUARTERS */
  var sel=$('devQuarter'), i;
  for(i=0;i<QUARTERS.length;i++){
    var op=document.createElement('option');
    op.value=String(i);
    op.textContent=QUARTERS[i].label+' - '+QUARTERS[i].name;
    sel.appendChild(op);
  }
  sel.onchange=function(){ startQuarter(parseInt(this.value,10)); };

  $('btnReadReport').onclick=openQuarterReport;

  applyQuarterTheme();
})();
