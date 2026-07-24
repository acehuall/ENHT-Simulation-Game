'use strict';
function seekSimulation(t){
  var target=clamp(Number(t)||0,0,QLEN);
  clock=target;
  prevSimT=target;
  quarterComplete=target>=QLEN;
  if(target<QLEN) reportOpenedForQuarter=false;
  resetMetrics();
  updateMetrics(target);
  if(typeof resetAlerts==='function') resetAlerts();
  /* Seed pressure from the landed values (after updateMetrics), so a scrub
     renders the settled state instead of animating in from the old position.
     seekSimulation sets prevSimT=target before render() runs, so render's own
     rewound branch never fires for a scrub - this call is what covers it. */
  if(typeof resetMetricPressure==='function') resetMetricPressure(target);
  syncBoardPackButton();
}

function syncBoardPackButton(){
  var btn=$('btnReport');
  if(!btn) return;
  var openable=typeof canOpenBoardPack==='function' ? canOpenBoardPack() : true;
  btn.disabled=!openable;
  btn.title=openable ? '' : 'Available when the quarter ends';
}

function syncPauseButton(){
  $('btnPause').textContent=paused?'Resume':'Pause';
}

function setScene(scene){
  currentScene=scene==='boardRoom'?'boardRoom':'simulation';
  var showingBoardRoom=currentScene==='boardRoom';
  document.querySelector('.frame').classList.toggle('showBoardRoom',showingBoardRoom);
  $('boardRoom').setAttribute('aria-hidden',showingBoardRoom?'false':'true');
  $('btnPrevScene').disabled=!showingBoardRoom;
  $('btnNextScene').disabled=showingBoardRoom;
  $('btnPrevScene').textContent='Back';
  $('btnNextScene').textContent='Forward';
  if(showingBoardRoom){
    paused=true;
    syncPauseButton();
  }
}

function populateQuarterControls(){
  var sel=$('quarterSelect'), html=[], i, q;
  if(!sel) return;
  for(i=0;i<QUARTERS.length;i++){
    q=QUARTERS[i];
    html.push('<option value="'+q.id+'">'+q.label+' '+q.title+'</option>');
  }
  sel.innerHTML=html.join('');
}

function syncQuarterControls(){
  var quarterEvent=getCurrentQuarterEvent();
  var timeline=getTimeline && getTimeline();
  var banner=timeline && timeline.banner;
  var sel=$('quarterSelect');
  if(sel) sel.value=getCurrentQuarterId();
  $('quarterChip').textContent=quarterEvent.displayName;
  $('quarterTrackLabel').textContent=quarterEvent.label;
  if(banner){
    $('bannerQuarter').innerHTML=escapeHTML(banner.quarterLine)+'<br><b>'+escapeHTML(banner.decisionLine)+'</b>';
  }else{
    $('bannerQuarter').innerHTML=escapeHTML(quarterEvent.label+' - '+quarterEvent.bannerLine);
  }
  $('metricTrendCaption').textContent='BOARD METRIC TREND - '+quarterEvent.label;
}

function resetCurrentQuarterSimulation(){
  seekSimulation(0);
  paused=false;
  setScene('simulation');
  syncPauseButton();
  render();
}

function confirmCurrentQuarterRestart(){
  if(window.confirm('Restart the current quarter? Any progress in this quarter will be lost.')){
    resetCurrentQuarterSimulation();
  }
}

/* Full-game reset: returns to a genuinely fresh start, unlike
   confirmCurrentQuarterRestart() which only replays the current quarter's
   animation and leaves every decision, stat, alert and role standing.
   Everything derived (alerts, decisions, roles, objective status) hangs off
   GAME, so resetting it is sufficient - but every module holding its own
   playback or feed state (metrics, feed, alert overlay, report tab) must be
   reset too, or the new game inherits the old one's tail.

   Roles are kept across the reset (Stats_Spec judgement call (a)): the common
   facilitator move is the same group replaying to try a different strategy, so
   the board they assembled is snapshotted before resetGameState() clears it and
   set back afterwards. A fresh cohort picking new seats is reachable by
   reloading the page (which replays the pregame). */
function startNewGame(){
  if(typeof closeYearEnd==='function' && typeof isYearEndOpen==='function' && isYearEndOpen()) closeYearEnd();
  if(typeof closeReport==='function') closeReport();
  if(typeof closeBrief==='function') closeBrief();
  if(typeof closeFacilitatorNotes==='function') closeFacilitatorNotes();

  var keptRoles=(typeof GAME!=='undefined' && GAME.roles) ? GAME.roles.slice() : [];

  resetGameState();                       /* stats, decisions, alerts, roles */
  if(typeof setBoardRoles==='function')   setBoardRoles(keptRoles);   /* option (a): same board replays */
  if(typeof resetMetrics==='function')    resetMetrics();
  if(typeof feedReset==='function')       feedReset();
  if(typeof resetAlerts==='function')     resetAlerts();
  if(typeof resetPerfTab==='function')    resetPerfTab();

  quarterComplete=false;
  reportOpenedForQuarter=false;
  setTimelineForCurrentQuarter(DEFAULT_OUTCOME);
  resetCurrentQuarterSimulation();
  syncBoardPackButton();
  if(typeof refreshBrief==='function') refreshBrief();
}

function confirmNewGame(){
  if(window.confirm('Start a new game? The full year - all decisions, stats and role scorecards - will be cleared.')){
    startNewGame();
  }
}

/* Skip the animated simulation and jump straight to the quarter close - mirrors
   the natural end-of-quarter flow (board room + board pack). */
function skipSimulation(){
  seekSimulation(QLEN);
  quarterComplete=true;
  setScene('boardRoom');
  paused=true;
  syncPauseButton();
  syncBoardPackButton();
  if(typeof openReport==='function' && !reportOpenedForQuarter){
    reportOpenedForQuarter=true;
    openReport();
  }
  render();
}

function togglePause(){
  paused=!paused;
  syncPauseButton();
}

$('btnPause').onclick=function(){ togglePause(); };
$('btnRestart').onclick=function(){ confirmCurrentQuarterRestart(); };

function _facilitatorNotesOpen(){
  return typeof isFacilitatorNotesOpen==='function' && isFacilitatorNotesOpen();
}
function _boardPackOpen(){
  return typeof isReportOpen==='function' && isReportOpen();
}
function _briefPanelOpen(){
  return typeof isBriefOpen==='function' && isBriefOpen();
}
function _yearEndOpen(){
  return typeof isYearEndOpen==='function' && isYearEndOpen();
}

/* Facilitator hotkeys: S skip · P pause · F facilitator notes · B board brief ·
   R restart quarter · Shift+R new game · Y year end report. B mirrors F: it never
   fires while a text field has focus, while the board pack (report) overlay is
   open, or during the pregame flow (simulationStarted is false until the game
   starts). Plain R replays only the current quarter; Shift+R clears the whole
   year. The year-end report is terminal and modal over everything: while it is
   open every other hotkey is inert and only Y closes it. */
document.addEventListener('keydown',function(event){
  if(!simulationStarted || event.altKey || event.ctrlKey || event.metaKey) return;
  /* Held keys must not re-fire actions (e.g. repeatedly re-opening a modal). */
  if(event.repeat) return;
  if(event.key==='Escape'){
    if(_yearEndOpen()){
      event.preventDefault();
      closeYearEnd();
    }else if(_facilitatorNotesOpen()){
      event.preventDefault();
      closeFacilitatorNotes();
    }else if(_briefPanelOpen()){
      event.preventDefault();
      closeBrief();
    }
    return;
  }
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
  var key=event.key.toLowerCase();
  /* The year-end report is terminal and owns the screen outright: it suppresses
     every other hotkey (S/P/F/B/R), unlike the facilitator and brief overlays
     which each honour their own toggle key. Only Y closes it. This block is
     first, so nothing behind the report can be triggered while it is up. */
  if(_yearEndOpen()){
    if(key==='y'){
      event.preventDefault();
      if(typeof toggleYearEnd==='function') toggleYearEnd();
    }
    return;
  }
  /* While an overlay owns the screen, only the key that opened it is honoured -
     F closes the facilitator notes, B closes the brief. The board pack suppresses
     both. Skip/pause/restart are suppressed so a stray keypress cannot mutate
     simulation state behind a modal. */
  if(_facilitatorNotesOpen() || _boardPackOpen() || _briefPanelOpen()){
    if(key==='f' && !_boardPackOpen() && !_briefPanelOpen()){
      event.preventDefault();
      if(typeof toggleFacilitatorNotes==='function') toggleFacilitatorNotes();
    }else if(key==='b' && !_boardPackOpen() && !_facilitatorNotesOpen()){
      event.preventDefault();
      if(typeof toggleBrief==='function') toggleBrief();
    }
    return;
  }
  switch(key){
    case 's':
      event.preventDefault();
      skipSimulation();
      break;
    case 'p':
      event.preventDefault();
      togglePause();
      break;
    case 'f':
      event.preventDefault();
      if(typeof toggleFacilitatorNotes==='function') toggleFacilitatorNotes();
      break;
    case 'b':
      event.preventDefault();
      if(typeof toggleBrief==='function') toggleBrief();
      break;
    case 'r':
      event.preventDefault();
      if(event.shiftKey) confirmNewGame();
      else confirmCurrentQuarterRestart();
      break;
    case 'y':
      event.preventDefault();
      if(typeof toggleYearEnd==='function') toggleYearEnd();
      break;
  }
});
if($('btnNotes')){
  $('btnNotes').onclick=function(){
    if(typeof toggleFacilitatorNotes==='function') toggleFacilitatorNotes();
  };
}
if($('btnBrief')){
  $('btnBrief').onclick=function(){
    if(typeof toggleBrief==='function') toggleBrief();
  };
}
$('btnFs').onclick=function(){
  var st=document.querySelector('.stage');
  if(document.fullscreenElement){ document.exitFullscreen(); }
  else if(st.requestFullscreen){ st.requestFullscreen().catch(function(){}); }
};
if($('btnReport')){
  $('btnReport').onclick=function(){
    if(typeof canOpenBoardPack==='function' && !canOpenBoardPack()) return;
    if(typeof openReport==='function') openReport();
  };
}
$('ckLabels').onchange=function(){ labelsDiv.style.display=this.checked?'':'none'; };
$('ckScan').onchange=function(){ $('scan').style.display=this.checked?'':'none'; };

var scrub=$('pscrub');
scrub.max=QLEN;
scrub.oninput=function(){ seekSimulation(this.value); setScene('simulation'); render(); };

$('btnPrevScene').onclick=function(){ setScene('simulation'); };
$('btnNextScene').onclick=function(){ setScene('boardRoom'); };

$('quarterSelect').onchange=function(){
  setCurrentQuarter(this.value);
  if(typeof setTimelineForCurrentQuarter==='function'){
    setTimelineForCurrentQuarter(getPlaybackOutcomeForQuarter(this.value));
  }
  resetCurrentQuarterSimulation();
};

populateQuarterControls();
syncQuarterControls();
syncBoardPackButton();
setScene('simulation');
