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
  data:null,
  /* Temporary, report-local selection: the option the board is discussing but
     has not committed. Nothing outside this overlay reads it, and it is never
     written into GAME - selecting an option must not touch permanent state. */
  selectedOptionIndex:null
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

/* `selected` stays the confirmed state so the existing CSS and the recorded
   presentation are unchanged; `proposed` is the new unconfirmed state. */
function _markSelectedReportOption(index){
  var cards=_reportRoot().querySelectorAll('.rep-option'), i, flag;
  for(i=0;i<cards.length;i++){
    cards[i].classList.toggle('selected', i===index);
    cards[i].classList.remove('proposed');
    cards[i].setAttribute('aria-pressed', i===index ? 'true' : 'false');
    flag=cards[i].querySelector('.rep-option-flag');
    if(flag) flag.hidden=true;
  }
}

function _markProposedReportOption(index){
  var cards=_reportRoot().querySelectorAll('.rep-option'), i, flag;
  for(i=0;i<cards.length;i++){
    cards[i].classList.toggle('proposed', i===index);
    cards[i].setAttribute('aria-pressed', i===index ? 'true' : 'false');
    flag=cards[i].querySelector('.rep-option-flag');
    if(flag) flag.hidden=i!==index;
  }
}

/* Cards stay focusable after commitment (so the pack can still be read back)
   but announce that they can no longer be operated. */
function _lockReportOptions(){
  var cards=_reportRoot().querySelectorAll('.rep-option'), i;
  for(i=0;i<cards.length;i++){
    cards[i].classList.add('locked');
    cards[i].setAttribute('aria-disabled','true');
  }
}

function _reportOptionIndexById(optionId){
  var i;
  for(i=0;i<REPORT.data.options.length;i++){
    if(REPORT.data.options[i].id===optionId) return i;
  }
  return -1;
}

/* The single choke point for the committed presentation - reached both by a
   fresh confirmation and by reopening a quarter that already has a decision.
   Retiring the confirm control here therefore covers both paths. */
function _showRecordedDecision(outcome, suffix){
  var index=_reportOptionIndexById(outcome.optionId), confirmBtn=$('repConfirm');
  REPORT.locked=true;
  REPORT.outcome=outcome;
  REPORT.selectedOptionIndex=index>=0 ? index : null;
  _markSelectedReportOption(index);
  _lockReportOptions();
  if(confirmBtn){ confirmBtn.disabled=true; confirmBtn.hidden=true; }
  if(index>=0) renderProposedDecision(REPORT.data.options[index], true);
  renderDecisionOutcome(outcome);
  $('repDecision').textContent='BOARD DECISION: '+outcome.optionTitle.toUpperCase()+(suffix || '');
  $('repNextQuarter').hidden=false;
  $('repNextQuarter').textContent=getNextQuarterId(REPORT.data.quarter.id) ? 'Next Quarter' : 'Year Complete';
}

/* Step one of two: temporary UI selection only. No game state is touched here,
   so the board can move between options freely while it discusses them. */
function _selectReportOption(index){
  var option, confirmBtn;
  if(REPORT.locked) return;
  option=REPORT.data.options[index];
  if(!option) return;
  REPORT.selectedOptionIndex=index;
  _markProposedReportOption(index);
  renderProposedDecision(option, false);
  confirmBtn=$('repConfirm');
  if(confirmBtn) confirmBtn.disabled=false;
}

/* Step two of two: the only place the UI commits a quarter's decision. */
function _confirmSelectedReportOption(){
  var index=REPORT.selectedOptionIndex, option, outcome, confirmBtn;
  if(REPORT.locked || index===null) return;
  option=REPORT.data.options[index];
  if(!option) return;
  confirmBtn=$('repConfirm');
  /* Disabled synchronously, before any work, so a double click cannot submit
     twice. The engine is idempotent too; this is defence in depth. */
  if(confirmBtn) confirmBtn.disabled=true;
  outcome=confirmBoardDecision(REPORT.data.quarter.id, option.id);
  if(!outcome){
    /* Quarter not finished: nothing was committed. Keep the selection and let
       the board try again rather than locking a pack with no decision. */
    if(confirmBtn) confirmBtn.disabled=false;
    return;
  }
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
  /* An unconfirmed selection is deliberately discarded on every open: closing
     the pack mid-discussion must not leave a proposal armed. openReport()
     rebuilds the whole shell, so resetting here is the whole mechanism - do
     not move this into the reset or quarter-advance paths. */
  REPORT.selectedOptionIndex=null;
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
    /* Resolved with closest() rather than off e.target directly: a click that
       lands on a child node of an action button must still act. */
    var actionEl=e.target.closest && e.target.closest('[data-report-action]');
    var action=actionEl ? actionEl.getAttribute('data-report-action') : null;
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
    if(action==='confirm-decision'){
      _confirmSelectedReportOption();
      return;
    }
    var tab=e.target.closest && e.target.closest('[data-perf-tab]');
    if(tab){
      if(typeof setPerfTab==='function') setPerfTab(parseInt(tab.getAttribute('data-perf-tab'),10));
      return;
    }
    var btn=e.target.closest('.rep-option');
    if(btn) _selectReportOption(parseInt(btn.getAttribute('data-index'),10));
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
