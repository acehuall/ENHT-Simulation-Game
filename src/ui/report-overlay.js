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

function _reportData(){
  var q=getCurrentQuarter();
  return {
    quarter:q,
    metrics:_reportMetricValues(),
    issue:q.issue,
    options:q.options
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
}

function openReport(){
  var root=_reportRoot();
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
  REPORT.data=_reportData();
  root.innerHTML=_reportShell(REPORT.data);
  root.querySelector('[data-page="0"]').innerHTML=_fillReportPage1(REPORT.data);
  root.querySelector('[data-page="1"]').innerHTML=_fillReportPage2(REPORT.data);
  root.querySelector('[data-page="2"]').innerHTML=_fillReportPage3(REPORT.data);
  root.hidden=false;
  paused=true;
  reportOpenedForQuarter=true;
  syncPauseButton();
  _drawReportIssueChart(REPORT.data.issue);
  _syncReportPages();
  if(existing) _showRecordedDecision(existing, ' (RECORDED)');

  root.onclick=function(e){
    var action=e.target.getAttribute && e.target.getAttribute('data-report-action');
    if(action==='prev' && REPORT.page>0){
      REPORT.page--;
      _syncReportPages();
      return;
    }
    if(action==='next' && REPORT.page<2){
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
    var btn=e.target.closest('.rep-option');
    if(btn) _chooseReportOption(parseInt(btn.getAttribute('data-index'),10));
  };
}

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
      return;
    }
    closeReport();
  }catch(err){
    $('repDecision').textContent='ADVANCE FAILED: '+(err && err.message ? err.message : err);
    if(typeof console!=='undefined' && console.error) console.error(err);
  }
}
