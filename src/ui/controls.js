'use strict';
/* quarter close moves straight to the boardroom when the simulation ends */
var boardRoomTimer=null;
function scheduleBoardRoom(){
  cancelBoardRoom();
  setScene('boardRoom');
}
function cancelBoardRoom(){
  if(boardRoomTimer){ clearTimeout(boardRoomTimer); boardRoomTimer=null; }
}

function seekSimulation(t){
  var target=clamp(Number(t)||0,0,QLEN);
  cancelBoardRoom();
  clock=target;
  prevSimT=target;
  quarterComplete=target>=QLEN;
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
    html.push('<option value="'+q.id+'">'+q.label+' - '+q.title+'</option>');
  }
  sel.innerHTML=html.join('');
}

function populateOptionControls(){
  var sel=$('optionSelect'), q=getCurrentQuarter(), html=[], i, o;
  if(!sel) return;
  for(i=0;i<q.options.length;i++){
    o=q.options[i];
    html.push('<option value="'+o.id+'">'+o.label+' - '+o.title+'</option>');
  }
  sel.innerHTML=html.join('');
}

function syncQuarterControls(){
  var quarter=getCurrentQuarter();
  var option=getCurrentOption();
  var qSel=$('quarterSelect');
  var oSel=$('optionSelect');
  if(qSel) qSel.value=quarter.id;
  if(oSel){
    populateOptionControls();
    oSel.value=option.id;
  }
  if($('quarterChip')) $('quarterChip').textContent=quarter.displayName;
  if($('quarterTrackLabel')) $('quarterTrackLabel').textContent=quarter.label;
  if($('bannerMsg')){
    $('bannerMsg').innerHTML=quarter.label+' &middot; '+quarter.title.toUpperCase()+
      '<br><b>BOARD OPTION: '+option.title.toUpperCase()+'</b>';
  }
  if($('metricTrendCaption')) $('metricTrendCaption').textContent='BOARD METRIC TREND - '+quarter.label;
  if($('btnNextQuarter')) $('btnNextQuarter').disabled=!getNextQuarterId(quarter.id);
  if(typeof setScenarioSelection==='function') setScenarioSelection(quarter.id, option.id);
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
$('btnNextQuarter').onclick=function(){
  if(!advanceToNextQuarter()) return;
  if(typeof setMetricStarts==='function') setMetricStarts(GAME.stats);
  populateOptionControls();
  syncQuarterControls();
  resetCurrentQuarterSimulation();
};
$('btnFs').onclick=function(){
  var st=document.querySelector('.stage');
  if(document.fullscreenElement){ document.exitFullscreen(); }
  else if(st.requestFullscreen){ st.requestFullscreen().catch(function(){}); }
};
$('ckLabels').onchange=function(){ labelsDiv.style.display=this.checked?'':'none'; };
$('ckScan').onchange=function(){ $('scan').style.display=this.checked?'':'none'; };

var scrub=$('pscrub');
scrub.max=QLEN;
scrub.oninput=function(){ seekSimulation(this.value); setScene('simulation'); };

$('btnPrevScene').onclick=function(){ setScene('simulation'); };
$('btnNextScene').onclick=function(){ setScene('boardRoom'); };

$('quarterSelect').onchange=function(){
  setCurrentQuarter(this.value);
  if(typeof setMetricStarts==='function') setMetricStarts(GAME.stats);
  populateOptionControls();
  syncQuarterControls();
  resetCurrentQuarterSimulation();
};

$('optionSelect').onchange=function(){
  setSelectedOption(this.value);
  syncQuarterControls();
  resetCurrentQuarterSimulation();
};

populateQuarterControls();
populateOptionControls();
syncQuarterControls();
setScene('simulation');
