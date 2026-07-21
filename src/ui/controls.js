'use strict';
function escapeHTML(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

function seekSimulation(t){
  var target=clamp(Number(t)||0,0,QLEN);
  clock=target;
  prevSimT=target;
  quarterComplete=target>=QLEN;
  if(target<QLEN) reportOpenedForQuarter=false;
  resetMetrics();
  updateMetrics(target);
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

/* Facilitator hotkeys: S skip · P pause · F facilitator notes · R restart. */
document.addEventListener('keydown',function(event){
  if(!simulationStarted || event.altKey || event.ctrlKey || event.metaKey) return;
  if(event.key==='Escape'){
    if(typeof isFacilitatorNotesOpen==='function' && isFacilitatorNotesOpen()){
      event.preventDefault();
      closeFacilitatorNotes();
    }
    return;
  }
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
  switch(event.key.toLowerCase()){
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
    case 'r':
      event.preventDefault();
      confirmCurrentQuarterRestart();
      break;
  }
});
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
