'use strict';
/* ---------- board report modal state and wiring ----------
   Rendering lives in report-view.js; decision logic lives in
   decision-controller.js. This file only manages the modal:
   opening, paging, option clicks, closing, and advancing.
------------------------------------------------------------ */
var REPORT = {
  page:0,
  locked:false,
  outcome:null,
  data:null
};

function _reportRoot(){
  return $('repRoot');
}

function isReportOpen(){
  var root=_reportRoot();
  return !!(root && !root.hidden);
}

function _reportData(){
  var q=getCurrentQuarter();
  return {
    quarter:q,
    metrics:_reportMetricValues(),
    issue:q.issue,
    options:q.options,
    snapshot:_reportSnapshot()
  };
}

function _syncReportPages(){
  var root=_reportRoot(), pages=root.querySelectorAll('.rep-page'), i;
  for(i=0;i<pages.length;i++) pages[i].hidden=i!==REPORT.page;
  $('repPrev').disabled=REPORT.page===0;
  $('repNext').hidden=REPORT.page>=pages.length-1;
  $('repPageInd').textContent='Page '+(REPORT.page+1)+' / '+pages.length;
}

function _markSelectedReportOption(index){
  var cards=_reportRoot().querySelectorAll('.rep-option'), i;
  for(i=0;i<cards.length;i++) cards[i].classList.toggle('selected', i===index);
}

function _reportOptionIndexById(optionId){
  var i;
  for(i=0;i<REPORT.data.options.length;i++){
    if(REPORT.data.options[i].id===optionId) return i;
  }
  return -1;
}

function _showRecordedDecision(outcome, suffix){
  REPORT.locked=true;
  REPORT.outcome=outcome;
  _markSelectedReportOption(_reportOptionIndexById(outcome.optionId));
  renderDecisionOutcome(outcome);
  $('repDecision').textContent='BOARD DECISION: '+outcome.optionTitle.toUpperCase()+(suffix || '');
  $('repNextQuarter').hidden=false;
  $('repNextQuarter').textContent=getNextQuarterId(REPORT.data.quarter.id) ? 'Next Quarter' : 'Year Complete';
}

function _chooseReportOption(index){
  if(REPORT.locked) return;
  var option=REPORT.data.options[index];
  var outcome=confirmBoardDecision(REPORT.data.quarter.id, option.id);
  if(!outcome) return;
  _showRecordedDecision(outcome);
  /* Recompute objective status against the freshly committed decision. */
  if(typeof refreshBrief==='function') refreshBrief();
}

function openReport(){
  var root=_reportRoot(), i, page, section;
  if(!root) return;
  var existing=getDecisionForQuarter(getCurrentQuarterId());
  if(!quarterComplete && !existing){
    if(typeof console!=='undefined' && console.warn){
      console.warn('[report] board pack is locked until the quarter finishes');
    }
    return;
  }
  REPORT.page=0;
  REPORT.locked=false;
  REPORT.outcome=null;
  if(typeof resetPerfTab==='function') resetPerfTab();
  REPORT.data=_reportData();
  root.innerHTML=_reportShell(REPORT.data);
  for(i=0;i<REPORT_PAGES.length;i++){
    page=REPORT_PAGES[i];
    section=root.querySelector('[data-page="'+i+'"]');
    if(section) section.innerHTML=page.build(REPORT.data);
  }
  root.hidden=false;
  paused=true;
  reportOpenedForQuarter=true;
  syncPauseButton();
  for(i=0;i<REPORT_PAGES.length;i++){
    if(REPORT_PAGES[i].afterRender) REPORT_PAGES[i].afterRender(REPORT.data);
  }
  _syncReportPages();
  if(existing) _showRecordedDecision(existing, ' (RECORDED)');

  root.onclick=function(e){
    var action=e.target.getAttribute && e.target.getAttribute('data-report-action');
    if(action==='prev' && REPORT.page>0){
      REPORT.page--;
      _syncReportPages();
      return;
    }
    if(action==='next' && REPORT.page<REPORT_PAGES.length-1){
      REPORT.page++;
      _syncReportPages();
      return;
    }
    if(action==='close'){
      closeReport();
      return;
    }
    if(action==='next-quarter'){
      goToNextReportQuarter();
      return;
    }
    var tab=e.target.closest && e.target.closest('[data-perf-tab]');
    if(tab){
      if(typeof setPerfTab==='function') setPerfTab(parseInt(tab.getAttribute('data-perf-tab'),10));
      return;
    }
    var btn=e.target.closest('.rep-option');
    if(btn) _chooseReportOption(parseInt(btn.getAttribute('data-index'),10));
  };
}

/* Left/right cycle the Performance Analysis tabs while that page is active.
   Registered once; paging keys elsewhere are unchanged. */
document.addEventListener('keydown',function(e){
  if(!isReportOpen()) return;
  if(typeof isPerformancePageActive!=='function' || !isPerformancePageActive()) return;
  if(e.key==='ArrowLeft'){ e.preventDefault(); movePerfTab(-1); }
  else if(e.key==='ArrowRight'){ e.preventDefault(); movePerfTab(1); }
});

function closeReport(){
  var root=_reportRoot();
  if(root) root.hidden=true;
}

function goToNextReportQuarter(){
  try{
    if(!REPORT.outcome){
      closeReport();
      return;
    }
    if(advanceAfterDecision(REPORT.data.quarter.id)==='year-complete'){
      $('repDecision').textContent='YEAR COMPLETE: ALL FOUR QUARTERS RECORDED';
      $('repNextQuarter').hidden=true;
      closeReport();
      /* Guard with typeof so the game still runs if year-end.js fails to load. */
      if(typeof openYearEnd==='function') openYearEnd();
      return;
    }
    closeReport();
  }catch(err){
    $('repDecision').textContent='ADVANCE FAILED: '+(err && err.message ? err.message : err);
    if(typeof console!=='undefined' && console.error) console.error(err);
  }
}
