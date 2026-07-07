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

$('btnPause').onclick=function(){ paused=!paused; this.textContent=paused?'Resume':'Pause'; };
$('btnRestart').onclick=function(){ resetCurrentQuarterSimulation(); };
$('btnFs').onclick=function(){
  var st=document.querySelector('.stage');
  if(document.fullscreenElement){ document.exitFullscreen(); }
  else if(st.requestFullscreen){ st.requestFullscreen().catch(function(){}); }
};
if($('btnReport')){
  $('btnReport').onclick=function(){ if(typeof openReport==='function') openReport(); };
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
    setTimelineForCurrentQuarter(GAME.lastOutcome || DEFAULT_OUTCOME);
  }
  resetCurrentQuarterSimulation();
};

populateQuarterControls();
syncQuarterControls();
setScene('simulation');
