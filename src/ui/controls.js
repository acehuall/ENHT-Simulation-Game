'use strict';
/* quarter close lingers 5s on the QUARTER CLOSED stamp before the boardroom */
var boardRoomTimer=null;
function scheduleBoardRoom(){
  cancelBoardRoom();
  boardRoomTimer=setTimeout(function(){
    boardRoomTimer=null;
    setScene('boardRoom');
  },5000);
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

$('btnPause').onclick=function(){ paused=!paused; this.textContent=paused?'Resume':'Pause'; };
$('btnRestart').onclick=function(){ seekSimulation(0); paused=false; setScene('simulation'); syncPauseButton(); };
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
setScene('simulation');
