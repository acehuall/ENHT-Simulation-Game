'use strict';
/* ---------- main loop ---------- */
var prevSimT=0;
function render(){
  var simT=clock%QLEN;
  if(simT<prevSimT) resetMetrics();   /* quarter looped back to the start */
  prevSimT=simT;
  updateMetrics(simT);
  ctx.drawImage(stat,0,0);

  if($('ckGrid').checked){
    ctx.fillStyle='rgba(0,0,0,0.12)';
    for(var gx=1;gx<COLS;gx++) ctx.fillRect(gx*32,0,1,544);
    for(var gy=1;gy<ROWS;gy++) ctx.fillRect(0,gy*32,960,1);
  }

  /* N sign flicker */
  var m=simT%6.5;
  if((m>5.9&&m<6.05)||(m>6.2&&m<6.28)){ ctx.fillStyle='rgba(6,10,16,0.75)'; ctx.fillRect(406,516,26,22); }

  /* agents */
  for(var n=0;n<AGENTS.length;n++){
    var a=AGENTS[n];
    if(a.fixed){ drawAgent(a.role,a.fixed[0],a.fixed[1],0,1,false,clock,a.seated); continue; }
    if(a.startAt!=null && simT<a.startAt) continue;
    var time=(a.startAt!=null)? simT-a.startAt : clock;
    var p=samplePath(a.L,time,a.oneWay);
    drawAgent(a.role,p.x,p.y,p.dx,p.dy,p.moving,clock,false);
    if(a.heartIdx!=null && p.idx===a.heartIdx){
      var ph=(clock*1.1)%1;
      ctx.globalAlpha=1-ph;
      var hx=a.heartAt[0]*32+16, hy=a.heartAt[1]*32-2-ph*14;
      R('#ff5c7a',hx-4,hy-3,3,3); R('#ff5c7a',hx+1,hy-3,3,3);
      R('#ff5c7a',hx-4,hy,8,3); R('#ff5c7a',hx-2,hy+3,4,2);
      ctx.globalAlpha=1;
    }
  }

  /* mood emote over the seated patient (PatSat theatre) */
  var happy=(clock%7)<3.5, ex=20*32+16, ey=12*32-16;
  R('#f4f6f8',ex-10,ey-9,20,16); R('#f4f6f8',ex-2,ey+7,4,3);
  if(happy){
    R('#3fae5c',ex-6,ey-5,3,3); R('#3fae5c',ex+3,ey-5,3,3); R('#3fae5c',ex-5,ey+2,10,2);
  }else{
    R('#d84848',ex-6,ey-5,3,3); R('#d84848',ex+3,ey-5,3,3); R('#d84848',ex-4,ey+2,8,2);
    R('#d84848',ex-7,ey-8,4,2); R('#d84848',ex+3,ey-8,4,2);
  }

  /* incident flash over Ward 4 bed (Safety theatre) */
  if(simT>=28&&simT<35&&Math.floor(clock*3)%2===0){
    var wx=7*32+16, wy=14*32-4;
    ctx.fillStyle='#b3541e'; ctx.beginPath();
    ctx.moveTo(wx,wy-20); ctx.lineTo(wx+13,wy+2); ctx.lineTo(wx-13,wy+2); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ffcf3f'; ctx.beginPath();
    ctx.moveTo(wx,wy-16); ctx.lineTo(wx+10,wy); ctx.lineTo(wx-10,wy); ctx.closePath(); ctx.fill();
    R('#1a1a1a',wx-1,wy-11,3,6); R('#1a1a1a',wx-1,wy-3,3,2);
  }

  /* letterbox banner */
  $('banner').style.opacity = simT<2.6 ? 1 : (simT<3.2 ? (3.2-simT)/0.6 : 0);

  /* quarter close */
  var st=$('stamp');
  if(simT>=38){
    $('dim').style.opacity=Math.min(1,(simT-38)/0.8)*0.55;
    var sp=clamp((simT-38.2)/0.3,0,1);
    st.style.opacity=sp;
    st.firstElementChild.style.transform='rotate(-7deg) scale('+(2.2-1.2*sp)+')';
  }else{ $('dim').style.opacity=0; st.style.opacity=0; }

  /* toasts */
  var tActive=null;
  for(var q=0;q<TOASTS.length;q++) if(simT>=TOASTS[q].t && simT<TOASTS[q].t+5.5) tActive=TOASTS[q];
  var toastEl=$('toast');
  if(tActive){ toastEl.innerHTML=tActive.msg; toastEl.style.opacity=1; } else toastEl.style.opacity=0;

  /* progress + tickers */
  $('pfill').style.width=(simT/QLEN*100)+'%';
  $('ptime').textContent='0:'+('0'+Math.floor(simT)).slice(-2);
  var defs=getMetricDefs();
  for(var ti=0;ti<defs.length;ti++){
    var def=getMetricByIndex(ti), v=getMetricValue(def.key), d=getMetricDelta(def.key);
    $('v'+ti).innerHTML = def.money ? fmtMoney(v) : String(Math.round(v));
    var de=$('d'+ti);
    if(Math.abs(d)<0.05){ de.textContent='—'; de.className='td fl'; }
    else{
      var up=d>0;
      de.innerHTML=(up?'&#9650; ':'&#9660; ')+(def.money?('£'+Math.abs(d).toFixed(1)+'m'):String(Math.abs(Math.round(d))));
      de.className='td '+(up?'up':'dn');
    }
  }
  drawStatsChart();
  drawEkg(clock);
}

function frame(now){
  var dt=Math.min(0.05,(now-last)/1000); last=now;
  if(!paused) clock+=dt;
  render();
  requestAnimationFrame(frame);
}
