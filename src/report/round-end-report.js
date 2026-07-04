'use strict';
/* =========================================================
   ROUND-END BOARD REPORT
   Renders the 3-page pixel paper stack into #repRoot and, when
   running inside the game (index.html), applies the chosen
   option to the live game state:
     page 1  — real quarter results (METRIC_START vs METRIC_CUR)
     page 2  — the quarter's escalation issue (QUARTERS data)
     page 3  — decision options; choosing one updates GAME.stats,
               records the decision, re-baselines the metrics
               engine and restarts the simulation loop.
   Also runs standalone in round-end-report.html (no game code:
   metric values fall back to METRIC_DEFS starts + STAT_EVENTS).

   Depends on: scenario-data.js (METRIC_DEFS, STAT_EVENTS),
               quarters-data.js (QUARTERS), game-state.js (GAME)
   In-game:    metrics.js, controls.js, state.js, simulation.js
========================================================= */

var REP = { page:0, choice:-1, busy:false, locked:false, open:false,
            inGame:false, root:null, pages:[], data:null };

function $r(id){ return document.getElementById(id); }
function repClamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function fmtRepMoney(v){ return (v<-0.05?'−':(v>0.05?'+':''))+'£'+Math.abs(v).toFixed(1)+'m'; }

/* ---------- live report data ---------- */
function repMetricValues(def){
  if(typeof getMetricValue==='function'){
    return { last:METRIC_START[def.key], cur:getMetricValue(def.key) };
  }
  /* standalone preview: quarter start + summed STAT_EVENTS */
  var cur=def.start, e, fx;
  for(e=0;e<STAT_EVENTS.length;e++){
    fx=STAT_EVENTS[e].effects;
    if(fx.hasOwnProperty(def.key)) cur+=fx[def.key];
  }
  return { last:def.start, cur:repClamp(cur,def.min,def.max) };
}

/* impact chips derived straight from an option's effects */
function repImpactChips(effects){
  var chips=[], i, def, v, txt;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i]; v=effects[def.key];
    if(!v) continue;
    txt=def.money ? fmtRepMoney(v) : ((v>0?'+':'−')+Math.abs(v));
    chips.push({t:def.label+' '+txt, tone:((v>0)===def.goodUp)?'good':'bad'});
  }
  return chips;
}

function buildReportData(){
  var q=QUARTERS[GAME.currentQuarterIndex];
  var metrics=[], i, def, vals;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    vals=repMetricValues(def);
    metrics.push({key:def.key, label:def.label, money:!!def.money, goodUp:def.goodUp,
                  last:vals.last, cur:vals.cur, min:def.min, max:def.max});
  }
  return { quarter:q.code, quarterName:q.name, metrics:metrics,
           summary:q.summary, issue:q.issue, options:q.options };
}

/* ---------- shell markup (shared by overlay + standalone) ---------- */
function repPageHead(badge, title, sub, q, num){
  return '<div class="pghead">'+
    '<div class="pgbadge">'+badge+'</div>'+
    '<div class="pgtitle"><h2>'+title+'</h2><div class="sub">'+sub+'</div></div>'+
    '<div class="pgq">'+q+' &middot; 0'+num+' / 03</div>'+
  '</div><div class="rule"></div><div class="rule teal"></div>';
}

function repShellHTML(d){
  var h=[];
  h.push('<div class="rep-hdr">',
    '<div class="nsq">N</div>',
    '<div><h1>NORTHBROOK GENERAL HOSPITAL</h1>',
    '<div class="sub">QUARTERLY BOARD PACK &middot; CONFIDENTIAL &middot; DRAFT FOR MINUTES</div></div>',
    '<div class="chip">'+d.quarter+' &middot; '+d.quarterName+'</div>',
  '</div>');

  h.push('<div class="rep-stage"><div id="stack">');

  /* page 1 : prior quarter results */
  h.push('<section class="page" id="pg1"><div class="lift">',
    '<div class="tab tab1">01</div>',
    '<div class="paper"><div class="binder"></div><div class="content">',
    repPageHead('PAGE 1','QUARTER RESULTS','Board position at close of quarter vs opening position.',d.quarter,1),
    '<div class="cols">',
      '<div class="panelP"><h3>BOARD METRICS &mdash; END VS START OF QUARTER</h3>',
        '<div class="barwrap"><div class="plot" id="p1Plot"></div><div class="xlabels" id="p1X"></div></div>',
        '<div class="blegend"><span><i class="swl"></i>START OF QUARTER</span><span><i class="swc"></i>END OF QUARTER</span></div>',
      '</div>',
      '<div class="panelP"><h3>EXECUTIVE SUMMARY</h3>',
        '<div class="sumtext" id="p1Sum"></div><div class="drows" id="p1Rows"></div>',
      '</div>',
    '</div>',
  '</div></div></div></section>');

  /* page 2 : issue at hand */
  h.push('<section class="page" id="pg2"><div class="lift">',
    '<div class="tab tab2">02</div>',
    '<div class="paper"><div class="binder"></div><div class="content">',
    repPageHead('PAGE 2','ISSUE AT HAND','Escalation paper &mdash; decision required before close of meeting.',d.quarter,2),
    '<div class="warn" id="p2Tag"></div>',
    '<div class="issueTitle" id="p2Title"></div>',
    '<div class="cols">',
      '<div class="panelP"><h3>SITUATION</h3><div class="sumtext" id="p2Paras"></div></div>',
      '<div class="panelP"><h3 id="p2ChartTitle"></h3>',
        '<canvas id="issueChart" width="360" height="180"></canvas>',
        '<div class="caption" id="p2Caption"></div>',
        '<div class="risk" id="p2Risk"></div>',
      '</div>',
    '</div>',
  '</div></div></div></section>');

  /* page 3 : options */
  h.push('<section class="page" id="pg3"><div class="lift">',
    '<div class="tab tab3">03</div>',
    '<div class="paper"><div class="binder"></div><div class="content">',
    repPageHead('PAGE 3','OPTIONS FOR DECISION','Select ONE option to record as the board\'s decision.',d.quarter,3),
    '<div class="opts" id="p3Opts"></div>',
  '</div></div></div></section>');

  h.push('</div></div>');

  /* footer */
  h.push('<div class="rep-foot">',
    '<button class="btn" id="btnNextPage">NEXT PAGE &#9656;</button>');
  if(REP.inGame){
    h.push('<button class="btn" id="btnCloseReport">CLOSE</button>');
  }else{
    h.push('<button class="btn" id="btnResetReport" hidden>RESET REPORT</button>');
  }
  h.push('<span class="pgind" id="pageInd">PAGE 1 / 3</span>',
    '<span class="decision" id="decision"></span>',
    '<span class="hint">'+(REP.inGame
      ? 'SPACE / &#8594; NEXT &middot; ESC CLOSE &middot; CHOOSE ON PAGE 3'
      : 'SPACE / &#8594; NEXT &middot; R RESET')+'</span>',
  '</div>');

  return h.join('');
}

/* ---------- page 1 : bars + summary + deltas ---------- */
function metricDisp(m,v){ return m.money ? fmtRepMoney(v) : String(Math.round(v)); }
function metricBarPct(m,v){
  var p=Math.round(100*(v-m.min)/(m.max-m.min));
  return Math.max(4, Math.min(100,p));
}
function metricDelta(m){
  var d=m.cur-m.last, tone, disp;
  if(Math.abs(d)<0.05){ tone='flat'; disp='—'; }
  else{
    tone=((d>0)===m.goodUp)?'good':'bad';
    disp=m.money?fmtRepMoney(d):((d>0?'+':'−')+Math.abs(Math.round(d)));
  }
  return {tone:tone, disp:disp};
}

function fillPage1(){
  var bars=[], xl=[], rows=[], i, m, dl;
  for(i=0;i<REP.data.metrics.length;i++){
    m=REP.data.metrics[i];
    bars.push('<div class="grp">'+
      '<i class="bar last" style="height:'+metricBarPct(m,m.last)+'%"></i>'+
      '<i class="bar cur" style="height:'+metricBarPct(m,m.cur)+'%"></i></div>');
    xl.push('<span>'+m.label+'</span>');
    dl=metricDelta(m);
    rows.push('<div class="drow"><b>'+m.label+'</b>'+
      '<span class="val">'+metricDisp(m,m.cur)+'</span>'+
      '<span class="dlt '+dl.tone+'">'+dl.disp+'</span></div>');
  }
  $r('p1Plot').innerHTML=bars.join('');
  $r('p1X').innerHTML=xl.join('');
  $r('p1Rows').innerHTML=rows.join('');
  $r('p1Sum').innerHTML=REP.data.summary.map(function(p){ return '<p>'+p+'</p>'; }).join('');
}

/* ---------- page 2 : issue + projection chart ---------- */
function fillPage2(){
  var iss=REP.data.issue;
  $r('p2Tag').textContent=iss.tag;
  $r('p2Title').textContent=iss.title;
  $r('p2Risk').textContent=iss.risk;
  $r('p2ChartTitle').textContent=iss.chartTitle;
  $r('p2Caption').textContent=iss.chartCaption;
  $r('p2Paras').innerHTML=iss.paras.map(function(p){ return '<p>'+p+'</p>'; }).join('');
  drawIssueChart(iss.chart);
}

function drawIssueChart(c){
  var cv=$r('issueChart'), ctx2=cv.getContext('2d');
  var W=cv.width, H=cv.height, L=32, R2=8, T=10, B=22;
  var n=c.actual.length+c.projected.length;
  var step=(W-L-R2)/n;
  var ink='#141b30', mid='#8b94ab';
  var yOf=function(v){ return T+(H-T-B)*(1-v/c.maxV); };
  var i,x,y,px,py,d,dx,dy,len;

  ctx2.clearRect(0,0,W,H);

  /* gridlines + y labels */
  ctx2.font='bold 8px "Courier New", monospace';
  for(i=0;i<=c.maxV;i+=40){
    y=Math.round(yOf(i));
    ctx2.fillStyle='#d4dae7'; ctx2.fillRect(L,y,W-L-R2,1);
    ctx2.fillStyle=mid; ctx2.textAlign='right'; ctx2.fillText(String(i),L-4,y+3);
  }

  /* axes */
  ctx2.fillStyle=ink;
  ctx2.fillRect(L,T-4,2,H-T-B+4);
  ctx2.fillRect(L,H-B,W-L-R2,2);

  /* NOW divider */
  x=Math.round(L+c.actual.length*step);
  ctx2.fillStyle=mid;
  for(y=T;y<H-B;y+=6) ctx2.fillRect(x,y,1,3);
  ctx2.textAlign='center'; ctx2.fillText('NOW',x,T-2);

  /* actual bars (teal) */
  for(i=0;i<c.actual.length;i++){
    x=Math.round(L+i*step+3); y=Math.round(yOf(c.actual[i]));
    ctx2.fillStyle='#23c4b4'; ctx2.fillRect(x,y,Math.round(step-6),H-B-y);
    ctx2.strokeStyle=ink; ctx2.lineWidth=2;
    ctx2.strokeRect(x+1,y+1,Math.round(step-6)-2,H-B-y-2);
  }

  /* projected dotted line + point markers (amber) */
  ctx2.fillStyle='#c98f1d';
  px=L+(c.actual.length-0.5)*step; py=yOf(c.actual[c.actual.length-1]);
  for(i=0;i<c.projected.length;i++){
    x=L+(c.actual.length+i+0.5)*step; y=yOf(c.projected[i]);
    dx=x-px; dy=y-py; len=Math.sqrt(dx*dx+dy*dy);
    for(d=0;d<len;d+=5) ctx2.fillRect(Math.round(px+dx*d/len)-1,Math.round(py+dy*d/len)-1,2,2);
    ctx2.fillRect(Math.round(x)-2,Math.round(y)-2,4,4);
    px=x; py=y;
  }

  /* capacity line (red dashes) */
  y=Math.round(yOf(c.capacity));
  ctx2.fillStyle='#e05252';
  for(x=L;x<W-R2;x+=8) ctx2.fillRect(x,y,4,2);
  ctx2.textAlign='left'; ctx2.fillText('CAPACITY',L+4,y-4);

  /* x labels */
  ctx2.fillStyle=mid; ctx2.textAlign='center';
  ctx2.fillText('W1',L+step*0.5,H-B+12);
  ctx2.fillText('W'+n,W-R2-step*0.5,H-B+12);
}

/* ---------- page 3 : option cards ---------- */
function fillPage3(){
  var html=[], i, o, chips;
  for(i=0;i<REP.data.options.length;i++){
    o=REP.data.options[i];
    chips=repImpactChips(o.effects);
    html.push('<button type="button" class="opt" data-idx="'+i+'">'+
      '<h4>OPTION '+o.label+' — '+o.title.toUpperCase()+'</h4>'+
      '<div class="desc">'+o.description+'</div>'+
      '<div class="pc">'+
        o.pros.map(function(p){ return '<div class="p">'+p+'</div>'; }).join('')+
        o.cons.map(function(cn){ return '<div class="c">'+cn+'</div>'; }).join('')+
      '</div>'+
      '<div class="impact">'+
        chips.map(function(ch){ return '<span class="chip '+ch.tone+'">'+ch.t+'</span>'; }).join('')+
      '</div></button>');
  }
  $r('p3Opts').innerHTML=html.join('');
  $r('p3Opts').addEventListener('click', function(e){
    var b=e.target.closest('.opt');
    if(b) chooseOption(parseInt(b.getAttribute('data-idx'),10));
  });
}

/* ---------- decision: apply for real ---------- */
function chooseOption(i){
  if(REP.locked) return;
  REP.choice=i;
  var o=REP.data.options[i];
  var cards=$r('p3Opts').querySelectorAll('.opt'), j;
  for(j=0;j<cards.length;j++) cards[j].classList.toggle('sel', j===i);
  $r('decision').textContent='BOARD DECISION: '+o.title.toUpperCase();
  if(!REP.inGame) return;

  REP.locked=true;
  applyBoardDecision(o);
  /* brief beat so the player sees the selection register */
  setTimeout(function(){ closeReport(); startNextQuarter(o); }, 1100);
}

function applyBoardDecision(o){
  /* end-of-quarter live values + option effects → new game state */
  var stats={}, i, def, defs=getMetricDefs();
  for(i=0;i<defs.length;i++){
    def=defs[i];
    stats[def.key]=repClamp(getMetricValue(def.key)+(o.effects[def.key]||0), def.min, def.max);
  }
  GAME.stats=cloneStats(stats);
  GAME.selectedOptionId=o.id;
  GAME.lastOutcome=o.decisionSummary;
  GAME.decisions.push({
    round: GAME.decisions.length+1,
    quarterIndex: GAME.currentQuarterIndex,
    quarter: REP.data.quarter,
    optionId: o.id,
    title: o.title,
    summary: o.decisionSummary,
    statsAfter: cloneStats(stats)
  });
  setMetricStarts(stats);   /* next run of the quarter starts from these values */
}

function startNextQuarter(o){
  var msg=$r('bannerMsg');
  if(msg) msg.innerHTML=REP.data.quarter+' &middot; '+REP.data.quarterName+
    '<br><b>THE BOARD HAS DECIDED: '+o.title.toUpperCase()+'</b>';
  setScene('simulation');
  seekSimulation(0);        /* resets metrics onto the new baseline */
  paused=false;
  syncPauseButton();
}

/* ---------- stack layering + flow ---------- */
function layoutStack(deal){
  var i,p;
  for(i=0;i<REP.pages.length;i++){
    p=REP.pages[i];
    p.classList.remove('pos0','pos1','pos2','leave');
    p.classList.toggle('gone', i<REP.page);
    if(i>=REP.page) p.classList.add('pos'+(i-REP.page));
  }
  if(deal){
    for(i=REP.page;i<REP.pages.length;i++){
      p=REP.pages[i];
      p.classList.remove('deal');
      void p.offsetWidth; /* restart animation */
      p.querySelector('.lift').style.animationDelay=((REP.pages.length-1-i)*0.13)+'s';
      p.classList.add('deal');
    }
  }
}

function updateFoot(){
  $r('pageInd').textContent='PAGE '+(REP.page+1)+' / '+REP.pages.length;
  $r('btnNextPage').hidden=(REP.page>=REP.pages.length-1);
  var rb=$r('btnResetReport');
  if(rb) rb.hidden=(REP.page<REP.pages.length-1);
}

function nextReportPage(){
  if(REP.busy || REP.page>=REP.pages.length-1) return;
  REP.busy=true;
  var top=REP.pages[REP.page];
  top.classList.remove('deal');
  top.classList.add('leave');
  setTimeout(function(){
    REP.page++;
    layoutStack(false);
    updateFoot();
    REP.busy=false;
  },480);
}

/* ---------- open / close ---------- */
function openReport(){
  REP.data=buildReportData();
  REP.root.innerHTML=repShellHTML(REP.data);
  REP.pages=[$r('pg1'),$r('pg2'),$r('pg3')];
  REP.page=0; REP.choice=-1; REP.busy=false; REP.locked=false;
  fillPage1(); fillPage2(); fillPage3();
  $r('btnNextPage').addEventListener('click', nextReportPage);
  if(REP.inGame){
    $r('btnCloseReport').addEventListener('click', closeReport);
  }else{
    $r('btnResetReport').addEventListener('click', openReport);
  }
  layoutStack(true);
  updateFoot();
  REP.root.hidden=false;
  REP.open=true;
}

function closeReport(){
  if(REP.busy) return;
  REP.root.hidden=true;
  REP.open=false;
}

/* ---------- init ---------- */
(function(){
  REP.root=$r('repRoot');
  if(!REP.root) return;
  REP.inGame=!!document.getElementById('cv');

  var btn=document.getElementById('btnReadReport');
  if(btn) btn.addEventListener('click', openReport);

  document.addEventListener('keydown', function(e){
    if(!REP.open) return;
    if(e.key===' '||e.key==='ArrowRight'||e.key==='Spacebar'){ e.preventDefault(); nextReportPage(); }
    else if(REP.inGame && e.key==='Escape'){ closeReport(); }
    else if(!REP.inGame && (e.key==='r'||e.key==='R')){ openReport(); }
  });

  if(!REP.inGame) openReport();   /* standalone page shows immediately */
})();
