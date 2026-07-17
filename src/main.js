'use strict';
var simulationStarted=false;

function startSimulation(){
  if(simulationStarted) return;
  simulationStarted=true;
  setTimelineForCurrentQuarter(DEFAULT_OUTCOME);
  drawStatic();
  last=performance.now();
  document.getElementById('gameShell').classList.add('game-shell--ready');
  document.getElementById('gameShell').setAttribute('aria-hidden','false');
  requestAnimationFrame(frame);
}

startPregameFlow(startSimulation);
