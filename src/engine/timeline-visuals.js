'use strict';
/* ---------- timeline visual cue interpreter ---------- */
function _activeVisual(ev, simT){
  return simT>=(ev.t0 || 0) && simT<(ev.t1 == null ? QLEN : ev.t1);
}

function _tileCenter(tile){
  return {x:tile[0]*TILE+16, y:tile[1]*TILE+16};
}

function drawTimelineVisuals(simT, clock){
  var events=getTimelineVisualEvents(), snow=[], i, ev;
  for(i=0;i<events.length;i++){
    ev=events[i];
    if(!_activeVisual(ev, simT)) continue;
    if(ev.type==='snowfall') snow.push(ev);
    else drawTimelineVisual(ev, simT, clock);
  }
  for(i=0;i<snow.length;i++) drawTimelineSnow(snow[i], simT, clock);
}

function drawTimelineVisual(ev, simT, clock){
  switch(ev.type){
    case 'patientSurge': drawPatientSurgeCue(ev, simT, clock); break;
    case 'extraStaff': drawExtraStaffCue(ev, simT, clock); break;
    case 'staffExit': drawStaffExitCue(ev, simT, clock); break;
    case 'wardIncidentFlash': drawWardIncidentCue(ev, simT, clock); break;
    case 'pressScrum': drawPressScrumCue(ev, simT, clock); break;
    case 'pressBriefing': drawPressBriefingCue(ev, simT, clock); break;
    case 'signage': drawSignageCue(ev, simT, clock); break;
    case 'ambulanceDivert': drawAmbulanceDivertCue(ev, simT, clock); break;
    case 'dischargeStream': drawDischargeStreamCue(ev, simT, clock); break;
    case 'corridorTrolleys': drawCorridorTrolleyCue(ev, simT, clock); break;
    case 'moodEmote': drawMetricMoodEmote(); break;
  }
}

function _patientSurgeCount(ev){
  return Math.max(1, Math.min(6, Math.round(((ev.mult || 1)-1)*6)));
}

function drawPatientSurgeCue(ev, simT, clock){
  var base=AGENTS[3], count=_patientSurgeCount(ev), i, p, t, tint;
  if(!base || !base.L) return;
  tint=ev.tint==='ill' ? 0.55 : 0;
  for(i=0;i<count;i++){
    t=clock*0.78+i*3.4;
    p=samplePath(base.L,t,false);
    drawAgent('patient',p.x,p.y,p.dx,p.dy,p.moving,clock+i,false,{illnessTint:tint});
  }
}

/* one-way walk paths are static geometry — build each variant once,
   not on every frame for every agent */
var _visualPathCache={};
function _cachedOneWayPath(key, points, speed){
  if(!_visualPathCache[key]){
    _visualPathCache[key]=buildLoop(points, {}, speed || 2.4, true);
  }
  return _visualPathCache[key];
}

function drawExtraStaffCue(ev, simT, clock){
  var count=ev.count || 1, role=ev.role || 'nurse', i, path, p, t;
  for(i=0;i<count;i++){
    path=_cachedOneWayPath('extraStaff:'+(i%6),
      [[14,15],[14,9],[16,9],[16,7],[22+i%2,7],[22+i%2,4+i%3]], 2.7);
    t=Math.max(0, simT-(ev.t0 || 0)-i*.85);
    p=samplePath(path,t,true);
    drawAgent(role,p.x,p.y,p.dx,p.dy,p.moving,clock+i,false);
  }
}

function drawStaffExitCue(ev, simT, clock){
  var count=ev.count || 1, role=ev.role || 'nurse', i, path, p, t;
  for(i=0;i<count;i++){
    path=_cachedOneWayPath('staffExit:'+(i%2),
      [[23,10+i%2],[18,10+i%2],[16,9],[14,9],[14,15]], 2.5);
    t=Math.max(0, simT-(ev.t0 || 0)-i*.9);
    p=samplePath(path,t,true);
    drawAgent(role,p.x,p.y,p.dx,p.dy,p.moving,clock+i,false);
  }
}

function drawDischargeStreamCue(ev, simT, clock){
  var count=ev.count || 3, i, path, p, t;
  path=_cachedOneWayPath('dischargeStream',
    [[20,12],[19,12],[19,9],[16,9],[14,9],[14,15]], 2.1);
  for(i=0;i<count;i++){
    t=Math.max(0, simT-(ev.t0 || 0)-i*1.1);
    p=samplePath(path,t,true);
    drawAgent('patient',p.x,p.y,p.dx,p.dy,p.moving,clock+i,false,{illnessTint:0.08});
  }
}

function drawWardIncidentCue(ev, simT, clock){
  if(Math.floor(clock*3)%2!==0) return;
  var pos=_tileCenter(ev.tile || [7,14]), wx=pos.x, wy=pos.y-4;
  ctx.fillStyle='#b3541e'; ctx.beginPath();
  ctx.moveTo(wx,wy-20); ctx.lineTo(wx+13,wy+2); ctx.lineTo(wx-13,wy+2); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#ffcf3f'; ctx.beginPath();
  ctx.moveTo(wx,wy-16); ctx.lineTo(wx+10,wy); ctx.lineTo(wx-10,wy); ctx.closePath(); ctx.fill();
  R('#1a1a1a',wx-1,wy-11,3,6); R('#1a1a1a',wx-1,wy-3,3,2);
}

function drawPressScrumCue(ev, simT, clock){
  var count=ev.count || 4, i, npc, x0=12.5, flash;
  drawNewsVan(3*TILE, 15*TILE+7);
  for(i=0;i<count;i++){
    npc={
      x:x0+i*1.35,
      y:15.12+(i%2)*0.08,
      prop:i%2 ? 'camera' : 'microphone',
      facing:i<count/2 ? 1 : -1
    };
    drawReporterNpc(npc,clock+i*.3);
    flash=ev.flashLights && i%2===1 && Math.floor((clock+i*.67)*2.1)%5===0;
    if(flash){
      ctx.globalAlpha=.72;
      R('#f5fbff',npc.x*TILE+20,npc.y*TILE-4,18,12);
      ctx.globalAlpha=1;
    }
  }
}

function drawPressBriefingCue(ev, simT, clock){
  drawPressScrumCue({count:3, flashLights:true, t0:ev.t0, t1:ev.t1}, simT, clock);
  var x=15*TILE, y=14*TILE+8;
  R('#20242f',x-8,y+18,48,8);
  R('#8f6a3a',x,y,32,22);
  R('#e9b44c',x+4,y+5,24,4);
  drawAgent('reception',15.5,14.35,0,1,false,clock,false);
}

function drawSignageCue(ev){
  var pos=_tileCenter(ev.tile || [18,8]), text=String(ev.text || 'ACTION');
  var w=Math.max(36, Math.min(126, text.length*7+12)), h=18;
  var x=pos.x-w/2, y=pos.y-h/2;
  R('#05070c',x-2,y-2,w+4,h+4);
  R('#e9b44c',x,y,w,h);
  R('#141b30',x+2,y+2,w-4,h-4);
  ctx.fillStyle='#e8ecf5';
  ctx.font='bold 8px monospace';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(text,pos.x,pos.y);
}

function drawNewsVan(x,y){
  R('#d9dfeb',x,y,72,28);
  R('#98a3bd',x+6,y+5,22,9);
  R('#23c4b4',x+34,y+6,24,8);
  R('#141b30',x+8,y+22,12,8);
  R('#141b30',x+52,y+22,12,8);
  R('#e05252',x+60,y+2,8,5);
}

function drawAmbulanceDivertCue(ev, simT){
  var span=Math.max(.1,(ev.t1 || ev.t0+12)-(ev.t0 || 0));
  var p=clamp((simT-(ev.t0 || 0))/span,0,1);
  var x=-90+Math.sin(p*Math.PI)*205, y=15*TILE+4;
  R('#f2f5fa',x,y,82,30);
  R('#e05252',x+12,y+3,12,8);
  R('#e05252',x+16,y-1,4,16);
  R('#8fd7dd',x+46,y+6,20,8);
  R('#141b30',x+10,y+24,12,8);
  R('#141b30',x+58,y+24,12,8);
  R('#e9b44c',x+72,y+11,8,5);
}

function drawCorridorTrolleyCue(){
  var spots=[[10,8],[11,8],[25,7]];
  for(var i=0;i<spots.length;i++){
    var x=spots[i][0]*TILE, y=spots[i][1]*TILE+9;
    R('#20242f',x+2,y+18,28,4);
    R('#c6ccd8',x+4,y+7,24,12);
    R('#f4f6f8',x+6,y+9,20,8);
    R('#33415e',x+6,y+20,5,5);
    R('#33415e',x+22,y+20,5,5);
  }
}

function drawTimelineSnow(ev, simT, clock){
  var i, x, y, drift;
  ctx.globalAlpha=.72;
  for(i=0;i<80;i++){
    drift=(hash(i,7)%30)-15;
    x=(hash(i,3)%960 + clock*12 + drift*Math.sin(clock*.25+i))%960;
    y=(hash(i,9)%544 + clock*(10+(hash(i,11)%16)))%544;
    R(i%3 ? '#dfe8f4' : '#ffffff',x,y,2,2);
  }
  ctx.globalAlpha=1;
}

function drawMetricMoodEmote(){
  var patsat=getMetricValue('patsat');
  var happy=patsat == null ? true : patsat>=60;
  var ex=20*TILE+16, ey=12*TILE-16;
  R('#f4f6f8',ex-10,ey-9,20,16); R('#f4f6f8',ex-2,ey+7,4,3);
  if(happy){
    R('#3fae5c',ex-6,ey-5,3,3); R('#3fae5c',ex+3,ey-5,3,3); R('#3fae5c',ex-5,ey+2,10,2);
  }else{
    R('#d84848',ex-6,ey-5,3,3); R('#d84848',ex+3,ey-5,3,3); R('#d84848',ex-4,ey+2,8,2);
    R('#d84848',ex-7,ey-8,4,2); R('#d84848',ex+3,ey-8,4,2);
  }
}
