'use strict';
$('btnPause').onclick=function(){ paused=!paused; this.textContent=paused?'Resume':'Pause'; };
$('btnRestart').onclick=function(){ clock=0; };
$('btnFs').onclick=function(){
  var st=document.querySelector('.stage');
  if(document.fullscreenElement){ document.exitFullscreen(); }
  else if(st.requestFullscreen){ st.requestFullscreen().catch(function(){}); }
};
$('ckLabels').onchange=function(){ labelsDiv.style.display=this.checked?'':'none'; };
$('ckScan').onchange=function(){ $('scan').style.display=this.checked?'':'none'; };
