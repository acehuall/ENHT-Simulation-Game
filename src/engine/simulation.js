'use strict';
/* ---------- main loop ---------- */
var prevSimT=0;

function render(){
  var simT=Math.min(clock,QLEN);
  if(simT<prevSimT) resetMetrics();
  prevSimT=simT;
  updateMetrics(simT);
  ctx.drawImage(stat,0,0);

  if($('ckGrid').checked){
    ctx.fillStyle='rgba(0,0,0,0.12)';
    for(var gx=1;gx<COLS;gx++) ctx.fillRect(gx*32,0,1,544);
    for(var gy=1;gy<ROWS;gy++) ctx.fillRect(0,gy*32,960,1);
  }

  /* N sign flicker stays as ambient hospital texture. */
  var m=simT%6.5;
  if((m>5.9&&m<6.05)||(m>6.2&&m<6.28)){
    ctx.fillStyle='rgba(6,10,16,0.75)';
    ctx.fillRect(406,516,26,22);
  }

  var patient=AGENTS.find(function(agent){ return agent.role==='patient'; });
  var patientPath=patient && patient.L ? samplePath(patient.L,clock,patient.oneWay) : null;
  for(var n=0;n<AGENTS.length;n++){
    var a=AGENTS[n];
    if(a.fixed){
      drawAgent(a.role,a.fixed[0],a.fixed[1],0,1,false,clock,a.seated);
      continue;
    }
    if(a.startAt!=null && simT<a.startAt) continue;
    var time=(a.startAt!=null)? simT-a.startAt : clock;
    var p=samplePath(a.L,time,a.oneWay);
    var visualState=a.role==='patient' ? getPatientVisualState(a,p,simT,time) : null;
    drawAgent(a.role,p.x,p.y,p.dx,p.dy,p.moving,clock,false,visualState);
    /* A heart appears only while the nurse and ill patient share the treatment bay. */
    if(a.heartIdx!=null && p.idx===a.heartIdx && patientPath &&
       patientPath.idx===patient.treatmentIdx){
      var ph=(clock*1.1)%1;
      ctx.globalAlpha=1-ph;
      var hx=a.heartAt[0]*32+16, hy=a.heartAt[1]*32-2-ph*14;
      R('#ff5c7a',hx-4,hy-3,3,3); R('#ff5c7a',hx+1,hy-3,3,3);
      R('#ff5c7a',hx-4,hy,8,3); R('#ff5c7a',hx-2,hy+3,4,2);
      ctx.globalAlpha=1;
    }
  }

  drawTimelineVisuals(simT, clock);

  var banner=getTimeline() && getTimeline().banner;
  if(banner){
    $('bannerQuarter').innerHTML=escapeHTML(banner.quarterLine)+'<br><b>'+escapeHTML(banner.decisionLine)+'</b>';
  }
  $('banner').style.opacity = simT<2.6 ? 1 : (simT<3.2 ? (3.2-simT)/0.6 : 0);

  var closeAt=(getTimeline() && getTimeline().closeAt) || 38;
  var st=$('stamp');
  if(simT>=closeAt){
    $('dim').style.opacity=Math.min(1,(simT-closeAt)/0.8);
    var sp=clamp((simT-closeAt-0.2)/0.3,0,1);
    st.style.opacity=sp;
    st.firstElementChild.style.transform='rotate(-7deg) scale('+(2.2-1.2*sp)+')';
  }else{
    $('dim').style.opacity=0;
    st.style.opacity=0;
  }

  var tActive=getTimelineToastAt(simT);
  var toastEl=$('toast');
  if(tActive){
    toastEl.innerHTML=tActive.toast;
    toastEl.style.opacity=1;
  }else{
    toastEl.style.opacity=0;
  }

  var progress=(simT/QLEN*100);
  $('pfill').style.width=progress+'%';
  $('pscrub').value=simT;
  $('ptime').textContent=simMonthLabel(simT);
  var defs=getMetricDefs();
  for(var ti=0;ti<defs.length;ti++){
    var def=getMetricByIndex(ti), v=getMetricValue(def.key), d=getMetricDelta(def.key);
    $('v'+ti).innerHTML = def.money ? fmtMoney(v) : String(Math.round(v));
    var de=$('d'+ti);
    if(Math.abs(d)<0.05){
      de.textContent='-';
      de.className='td fl';
    }else{
      var up=d>0;
      de.innerHTML=(up?'&#9650; ':'&#9660; ')+(def.money?('GBP'+Math.abs(d).toFixed(1)+'m'):String(Math.abs(Math.round(d))));
      de.className='td '+(up?'up':'dn');
    }
  }
  drawStatsChart();
  drawEkg(clock);
  if(typeof updateEventFeed==='function') updateEventFeed(simT);
}

function frame(now){
  var dt=Math.min(0.05,(now-last)/1000);
  last=now;
  if(!paused){
    clock+=dt;
    if(clock>=QLEN){
      clock=QLEN;
      quarterComplete=true;
      paused=true;
      if(typeof syncPauseButton==='function') syncPauseButton();
      if(typeof syncBoardPackButton==='function') syncBoardPackButton();
      if(typeof setScene==='function') setScene('boardRoom');
      if(typeof openReport==='function' && !reportOpenedForQuarter){
        reportOpenedForQuarter=true;
        openReport();
      }
    }
  }
  render();
  requestAnimationFrame(frame);
}
