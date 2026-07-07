'use strict';
/* =========================================================
   ROUND-END BOARD REPORT
   Renders the layered 3-page board pack into #repRoot.

   The report is fully data-driven from quarters-data.js:
     Page 1: live/baseline board metric position
     Page 2: quarter issue text and graph selected by page2GraphType
     Page 3: four decision options, stat impacts and risk events

   In index.html it works as the in-game decision point. Standalone
   round-end-report.html uses the same renderer for quick preview/testing.
========================================================= */

var REP = {
  page:0,
  choice:-1,
  busy:false,
  locked:false,
  open:false,
  inGame:false,
  root:null,
  pages:[],
  data:null,
  outcome:null
};

function $r(id){ return document.getElementById(id); }
function repClamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

function repMetricDefs(){
  return typeof getMetricDefs==='function' ? getMetricDefs() : METRIC_DEFS;
}

function fmtRepMoney(v){
  return (v<-0.05?'-':(v>0.05?'+':''))+'GBP'+Math.abs(v).toFixed(1)+'m';
}

function repSignedNumber(v){
  if(Math.abs(v)<0.05) return '0';
  return (v>0?'+':'-')+Math.abs(Math.round(v));
}

function repMetricValueText(def, v){
  return def.money ? fmtRepMoney(v) : String(Math.round(v));
}

function repMetricDeltaText(def, v){
  return def.money ? fmtRepMoney(v) : repSignedNumber(v);
}

function repMetricValues(def){
  if(typeof getMetricValue==='function' && typeof METRIC_START!=='undefined'){
    return {last:METRIC_START[def.key], cur:getMetricValue(def.key)};
  }
  var stats=(typeof GAME!=='undefined' && GAME.stats) ? GAME.stats : initialQuarterStats();
  return {
    last:def.start,
    cur:stats.hasOwnProperty(def.key) ? stats[def.key] : def.start
  };
}

function repImpactChips(effects){
  var chips=[], defs=repMetricDefs(), i, def, v;
  for(i=0;i<defs.length;i++){
    def=defs[i];
    v=effects[def.key];
    if(!v) continue;
    chips.push({
      t:def.label+' '+repMetricDeltaText(def, v),
      tone:((v>0)===def.goodUp)?'good':'bad'
    });
  }
  return chips;
}

function getDecisionBaseStats(){
  var defs=repMetricDefs(), stats={}, i, def, v;
  if(REP.inGame && typeof getMetricValue==='function'){
    for(i=0;i<defs.length;i++){
      def=defs[i];
      v=getMetricValue(def.key);
      stats[def.key]=v == null ? def.start : v;
    }
    return cloneQuarterStats(stats);
  }
  return cloneQuarterStats(GAME.stats);
}

function buildReportData(){
  var q=getCurrentQuarter();
  var defs=repMetricDefs(), metrics=[], i, def, vals;
  for(i=0;i<defs.length;i++){
    def=defs[i];
    vals=repMetricValues(def);
    metrics.push({
      key:def.key,
      label:def.label,
      money:!!def.money,
      goodUp:def.goodUp,
      last:vals.last,
      cur:vals.cur,
      min:def.min,
      max:def.max
    });
  }
  return {
    quarter:q,
    quarterLabel:q.label,
    quarterName:q.title.toUpperCase(),
    metrics:metrics,
    summary:q.page1Summary,
    issue:q.page2Issue,
    graphType:q.page2GraphType,
    graphData:q.page2GraphData,
    options:q.options
  };
}

/* ---------- shell markup ---------- */
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
    '<div class="chip">'+d.quarter.displayName+'</div>',
    '<label class="rep-qctl" id="reportQuarterControl">Quarter <select id="reportQuarterSelect" aria-label="Report quarter selector"></select></label>',
  '</div>');

  h.push('<div class="rep-stage"><div id="stack">');

  h.push('<section class="page" id="pg1"><div class="lift">',
    '<div class="tab tab1">01</div>',
    '<div class="paper"><div class="binder"></div><div class="content">',
    repPageHead('PAGE 1','QUARTER RESULTS','Board position at close of quarter vs opening position.',d.quarterLabel,1),
    '<div class="cols">',
      '<div class="panelP"><h3>BOARD METRICS - END VS START OF QUARTER</h3>',
        '<div class="barwrap"><div class="plot" id="p1Plot"></div><div class="xlabels" id="p1X"></div></div>',
        '<div class="blegend"><span><i class="swl"></i>START OF QUARTER</span><span><i class="swc"></i>CURRENT POSITION</span></div>',
      '</div>',
      '<div class="panelP"><h3>EXECUTIVE SUMMARY</h3>',
        '<div class="sumtext" id="p1Sum"></div><div class="drows" id="p1Rows"></div>',
      '</div>',
    '</div>',
  '</div></div></div></section>');

  h.push('<section class="page" id="pg2"><div class="lift">',
    '<div class="tab tab2">02</div>',
    '<div class="paper"><div class="binder"></div><div class="content">',
    repPageHead('PAGE 2','ISSUE AT HAND','Escalation paper - decision required before close of meeting.',d.quarterLabel,2),
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

  h.push('<section class="page" id="pg3"><div class="lift">',
    '<div class="tab tab3">03</div>',
    '<div class="paper"><div class="binder"></div><div class="content">',
    repPageHead('PAGE 3','OPTIONS FOR DECISION','Select one option to record as the board decision.',d.quarterLabel,3),
    '<div class="opts" id="p3Opts"></div>',
    '<div class="outcome" id="decisionOutcome" hidden></div>',
  '</div></div></div></section>');

  h.push('</div></div>');

  h.push('<div class="rep-foot">',
    '<button class="btn" id="btnNextPage">NEXT PAGE &#9656;</button>');
  if(REP.inGame){
    h.push('<button class="btn" id="btnCloseReport">CLOSE</button>');
  }else{
    h.push('<button class="btn" id="btnResetReport" hidden>RESET REPORT</button>');
  }
  h.push('<button class="btn" id="btnNextQuarterReport" hidden>NEXT QUARTER</button>',
    '<span class="pgind" id="pageInd">PAGE 1 / 3</span>',
    '<span class="decision" id="decision"></span>',
    '<span class="hint">'+(REP.inGame
      ? 'SPACE / RIGHT NEXT - ESC CLOSE - CHOOSE ON PAGE 3'
      : 'SPACE / RIGHT NEXT - R RESET')+'</span>',
  '</div>');

  return h.join('');
}

function populateReportQuarterSelect(){
  var sel=$r('reportQuarterSelect'), html=[], i, q;
  if(!sel) return;
  for(i=0;i<QUARTERS.length;i++){
    q=QUARTERS[i];
    html.push('<option value="'+q.id+'">'+q.label+' - '+q.title+'</option>');
  }
  sel.innerHTML=html.join('');
  sel.value=getCurrentQuarterId();
  if($r('reportQuarterControl')) $r('reportQuarterControl').hidden=(typeof isDebugMode==='function' && !isDebugMode());
  sel.disabled=(typeof isDebugMode==='function' && !isDebugMode());
  sel.onchange=function(){
    if(typeof isDebugMode==='function' && !isDebugMode()) return;
    setCurrentQuarter(this.value);
    if(typeof setMetricStarts==='function') setMetricStarts(GAME.stats);
    if(typeof resetMetrics==='function') resetMetrics();
    if(typeof syncQuarterControls==='function') syncQuarterControls();
    openReport();
  };
}

/* ---------- page 1 ---------- */
function metricDisp(m,v){ return m.money ? fmtRepMoney(v) : String(Math.round(v)); }
function metricBarPct(m,v){
  var p=Math.round(100*(v-m.min)/(m.max-m.min));
  return Math.max(4, Math.min(100,p));
}
function metricDelta(m){
  var d=m.cur-m.last, tone, disp;
  if(Math.abs(d)<0.05){ tone='flat'; disp='-'; }
  else{
    tone=((d>0)===m.goodUp)?'good':'bad';
    disp=repMetricDeltaText(m, d);
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

/* ---------- page 2 ---------- */
function graphTitle(type){
  if(type==='winterPressure') return 'WINTER PRESSURE INDICATORS';
  if(type==='financePressure') return 'SAVINGS TARGET AND BUDGET GAP';
  if(type==='safetyCulture') return 'SAFETY CULTURE SIGNALS';
  if(type==='waitingListFunding') return 'WAITING LIST AND FUNDING FORECAST';
  return 'BOARD DATA';
}

function graphCaption(type){
  if(type==='winterPressure') return 'BED OCCUPANCY, FLU ADMISSIONS AND STAFF SICKNESS - LAST 4 WEEKS';
  if(type==='financePressure') return 'GBP12M TARGET VS IDENTIFIED SAVINGS, PAY MIX AND FORECAST GAP';
  if(type==='safetyCulture') return 'CULTURE SCORE FALLING AS CONCERNS AND ESCALATION FAILURES RISE';
  if(type==='waitingListFunding') return 'BACKLOG TREND, 18-WEEK PERFORMANCE AND FUNDING OPTIONS';
  return 'QUARTER-SPECIFIC BOARD DATA';
}

function fillPage2(){
  var iss=REP.data.issue;
  $r('p2Tag').textContent=iss.tag;
  $r('p2Title').textContent=iss.title;
  $r('p2Risk').textContent=iss.risk;
  $r('p2ChartTitle').textContent=graphTitle(REP.data.graphType);
  $r('p2Caption').textContent=graphCaption(REP.data.graphType);
  $r('p2Paras').innerHTML=iss.paras.map(function(p){ return '<p>'+p+'</p>'; }).join('');
  drawIssueChart(REP.data.graphType, REP.data.graphData);
}

function chartBase(ctx2,W,H){
  ctx2.clearRect(0,0,W,H);
  ctx2.fillStyle='#fbfcfe';
  ctx2.fillRect(0,0,W,H);
  ctx2.font='bold 8px "Courier New", monospace';
  ctx2.textBaseline='middle';
}

function drawAxes(ctx2,L,T,R,B,W,H){
  ctx2.fillStyle='#141b30';
  ctx2.fillRect(L,T,2,H-T-B);
  ctx2.fillRect(L,H-B,W-L-R,2);
}

function drawGrid(ctx2,L,T,R,B,W,H,steps){
  var i,y;
  ctx2.fillStyle='#d4dae7';
  for(i=0;i<=steps;i++){
    y=Math.round(T+(H-T-B)*i/steps);
    ctx2.fillRect(L,y,W-L-R,1);
  }
}

function drawLegend(ctx2, entries, x, y){
  var i, e, lx=x;
  ctx2.textAlign='left';
  ctx2.textBaseline='middle';
  ctx2.font='bold 7px "Courier New", monospace';
  for(i=0;i<entries.length;i++){
    e=entries[i];
    ctx2.fillStyle=e.color;
    ctx2.fillRect(lx,y-4,7,7);
    ctx2.fillStyle='#4a5470';
    ctx2.fillText(e.label,lx+10,y);
    lx+=e.w || 78;
  }
}

function drawLineSeries(ctx2, values, labels, maxV, color, L,T,R,B,W,H){
  var plotW=W-L-R, plotH=H-T-B;
  var step=values.length>1 ? plotW/(values.length-1) : plotW;
  var i,x,y;
  ctx2.strokeStyle=color;
  ctx2.lineWidth=2;
  ctx2.beginPath();
  for(i=0;i<values.length;i++){
    x=L+i*step;
    y=T+(1-values[i]/maxV)*plotH;
    if(i===0) ctx2.moveTo(x,y); else ctx2.lineTo(x,y);
  }
  ctx2.stroke();
  ctx2.fillStyle=color;
  for(i=0;i<values.length;i++){
    x=Math.round(L+i*step);
    y=Math.round(T+(1-values[i]/maxV)*plotH);
    ctx2.fillRect(x-2,y-2,4,4);
  }
  ctx2.fillStyle='#8b94ab';
  ctx2.textAlign='center';
  for(i=0;i<labels.length;i++){
    x=L+i*step;
    ctx2.fillText(labels[i],x,H-B+11);
  }
}

function drawWinterPressureGraph(ctx2,c,W,H){
  var L=34,T=14,R=10,B=26, y, i;
  chartBase(ctx2,W,H);
  drawGrid(ctx2,L,T,R,B,W,H,4);
  drawAxes(ctx2,L,T,R,B,W,H);
  y=Math.round(T+(1-c.safeOccupancy/100)*(H-T-B));
  ctx2.fillStyle='#e05252';
  for(i=L;i<W-R;i+=8) ctx2.fillRect(i,y,4,2);
  ctx2.fillText('SAFE BED HEADROOM',L+4,y-6);
  drawLineSeries(ctx2,c.bedOccupancy,c.weeks,100,'#e05252',L,T,R,B,W,H);
  drawLineSeries(ctx2,c.fluAdmissions,c.weeks,80,'#e9b44c',L,T,R,B,W,H);
  drawLineSeries(ctx2,c.staffSickness,c.weeks,20,'#23c4b4',L,T,R,B,W,H);
  drawLegend(ctx2,[
    {label:'BED %', color:'#e05252', w:62},
    {label:'FLU', color:'#e9b44c', w:54},
    {label:'SICK %', color:'#23c4b4', w:64}
  ],L+6,T+8);
}

function drawFinanceGraph(ctx2,c,W,H){
  var L=30,T=14,R=10,B=24, chartH=H-T-B, targetH, idH, gapH, x, y, i;
  chartBase(ctx2,W,H);
  drawGrid(ctx2,L,T,R,B,W,H,3);
  drawAxes(ctx2,L,T,R,B,W,H);
  targetH=chartH*(c.target/12);
  idH=chartH*(c.identified/12);
  gapH=chartH*((c.target-c.identified)/12);

  x=L+22;
  ctx2.fillStyle='#95a0ba';
  ctx2.fillRect(x,H-B-targetH,42,targetH);
  ctx2.fillStyle='#23c4b4';
  ctx2.fillRect(x+58,H-B-idH,42,idH);
  ctx2.fillStyle='#e05252';
  ctx2.fillRect(x+116,H-B-gapH,42,gapH);
  ctx2.fillStyle='#4a5470';
  ctx2.textAlign='center';
  ctx2.fillText('TARGET',x+21,H-B+11);
  ctx2.fillText('FOUND',x+79,H-B+11);
  ctx2.fillText('GAP',x+137,H-B+11);

  x=W-112; y=T+18;
  ctx2.strokeStyle='#141b30'; ctx2.strokeRect(x,y,90,18);
  ctx2.fillStyle='#e9b44c'; ctx2.fillRect(x+1,y+1,Math.round(88*c.costSplit.pay/100),16);
  ctx2.fillStyle='#23c4b4'; ctx2.fillRect(x+1+Math.round(88*c.costSplit.pay/100),y+1,88-Math.round(88*c.costSplit.pay/100),16);
  ctx2.fillStyle='#4a5470'; ctx2.textAlign='left';
  ctx2.fillText('PAY '+c.costSplit.pay+'%',x,y-7);

  ctx2.strokeStyle='#c98f1d'; ctx2.lineWidth=2; ctx2.beginPath();
  for(i=0;i<c.budgetGapByQuarter.length;i++){
    x=L+210+i*28;
    y=H-B-(c.budgetGapByQuarter[i]/12)*chartH;
    if(i===0) ctx2.moveTo(x,y); else ctx2.lineTo(x,y);
  }
  ctx2.stroke();
  ctx2.fillStyle='#c98f1d';
  for(i=0;i<c.budgetGapByQuarter.length;i++){
    x=Math.round(L+210+i*28);
    y=Math.round(H-B-(c.budgetGapByQuarter[i]/12)*chartH);
    ctx2.fillRect(x-2,y-2,4,4);
  }
  drawLegend(ctx2,[
    {label:'GBP M', color:'#95a0ba', w:58},
    {label:'PAY MIX', color:'#e9b44c', w:76},
    {label:'GAP FCST', color:'#c98f1d', w:78}
  ],L+6,T+8);
}

function drawSafetyCultureGraph(ctx2,c,W,H){
  var L=34,T=14,R=10,B=26, i, x, barW=12, maxBar=40, plotH=H-T-B;
  chartBase(ctx2,W,H);
  drawGrid(ctx2,L,T,R,B,W,H,4);
  drawAxes(ctx2,L,T,R,B,W,H);
  for(i=0;i<c.periods.length;i++){
    x=L+22+i*70;
    ctx2.fillStyle='#e9b44c';
    ctx2.fillRect(x,H-B-(c.bullyingConcerns[i]/maxBar)*plotH,barW,(c.bullyingConcerns[i]/maxBar)*plotH);
    ctx2.fillStyle='#e05252';
    ctx2.fillRect(x+16,H-B-(c.escalationFailures[i]/maxBar)*plotH,barW,(c.escalationFailures[i]/maxBar)*plotH);
    ctx2.fillStyle='#8b94ab';
    ctx2.textAlign='center';
    ctx2.fillText(c.periods[i],x+8,H-B+11);
  }
  drawLineSeries(ctx2,c.cultureScore,c.periods,100,'#23c4b4',L,T,R,B,W,H);
  drawLegend(ctx2,[
    {label:'CULTURE', color:'#23c4b4', w:72},
    {label:'BULLYING', color:'#e9b44c', w:76},
    {label:'ESC FAIL', color:'#e05252', w:78}
  ],L+6,T+8);
}

function drawWaitingListGraph(ctx2,c,W,H){
  var L=34,T=14,R=10,B=26, i, x, barW=28, plotH=H-T-B, maxBacklog=10000;
  chartBase(ctx2,W,H);
  drawGrid(ctx2,L,T,R,B,W,H,4);
  drawAxes(ctx2,L,T,R,B,W,H);
  for(i=0;i<c.periods.length;i++){
    x=L+20+i*68;
    ctx2.fillStyle='#95a0ba';
    ctx2.fillRect(x,H-B-(c.backlog[i]/maxBacklog)*plotH,barW,(c.backlog[i]/maxBacklog)*plotH);
    ctx2.fillStyle='#8b94ab';
    ctx2.textAlign='center';
    ctx2.fillText(c.periods[i],x+barW/2,H-B+11);
  }
  drawLineSeries(ctx2,c.within18Weeks,c.periods,100,'#e05252',L,T,R,B,W,H);
  drawLineSeries(ctx2,c.forecastWithFunding,c.periods,100,'#23c4b4',L,T,R,B,W,H);
  drawLegend(ctx2,[
    {label:'BACKLOG', color:'#95a0ba', w:70},
    {label:'18WK NOW', color:'#e05252', w:76},
    {label:'FUNDED', color:'#23c4b4', w:70}
  ],L+6,T+8);
}

function drawIssueChart(type, data){
  var cv=$r('issueChart'), ctx2=cv.getContext('2d');
  var W=cv.width, H=cv.height;
  if(type==='financePressure') drawFinanceGraph(ctx2,data,W,H);
  else if(type==='safetyCulture') drawSafetyCultureGraph(ctx2,data,W,H);
  else if(type==='waitingListFunding') drawWaitingListGraph(ctx2,data,W,H);
  else drawWinterPressureGraph(ctx2,data,W,H);
}

/* ---------- page 3 ---------- */
function fillPage3(){
  var html=[], i, o, chips;
  for(i=0;i<REP.data.options.length;i++){
    o=REP.data.options[i];
    chips=repImpactChips(o.optionImpacts);
    html.push('<button type="button" class="opt" data-idx="'+i+'">'+
      '<h4>OPTION '+o.label+' - '+o.title.toUpperCase()+'</h4>'+
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

function impactRows(outcome){
  var defs=repMetricDefs(), rows=[], i, def, delta;
  for(i=0;i<defs.length;i++){
    def=defs[i];
    delta=outcome.impacts[def.key] || 0;
    if(!delta) continue;
    rows.push('<span class="'+(((delta>0)===def.goodUp)?'good':'bad')+'">'+
      def.label+' '+repMetricDeltaText(def, delta)+
      ' ('+repMetricValueText(def, outcome.before[def.key])+' to '+repMetricValueText(def, outcome.after[def.key])+')</span>');
  }
  return rows.join('');
}

function showOutcome(outcome){
  var riskText;
  if(outcome.triggeredRisks.length){
    riskText=outcome.triggeredRisks.map(function(r){
      return '<p><b>Risk/luck:</b> '+r.name+' - '+r.explanation+'</p>';
    }).join('');
  }else{
    riskText='<p><b>Risk/luck:</b> No random event triggered this time.</p>';
  }
  $r('decisionOutcome').hidden=false;
  $r('decisionOutcome').innerHTML=
    '<h3>Decision Outcome</h3>'+
    '<p>'+outcome.option.outcomeText+'</p>'+
    '<div class="outcomeRows">'+impactRows(outcome)+'</div>'+
    riskText;
}


function restoreReportPhaseState(){
  var phase=typeof getQuarterPhase==='function' ? getQuarterPhase() : null;
  var option, cards, i;
  if(!phase || phase===QUARTER_PHASES.REPORT_OPEN || phase===QUARTER_PHASES.REPORT_PENDING) return;
  option=getCurrentOption();
  if(!option){
    $r('decision').textContent='NO BOARD DECISION SELECTED';
    return;
  }
  REP.choice=REP.data.options.findIndex ? REP.data.options.findIndex(function(o){ return o.id===option.id; }) : -1;
  cards=$r('p3Opts').querySelectorAll('.opt');
  for(i=0;i<cards.length;i++) cards[i].classList.toggle('sel', REP.data.options[i].id===option.id);
  $r('decision').textContent='BOARD DECISION: '+option.title.toUpperCase();
  if(GAME.currentOutcome) showOutcome(GAME.currentOutcome);
  if(phase===QUARTER_PHASES.QUARTER_LOCKED){
    REP.locked=true;
    var nextBtn=$r('btnNextQuarterReport');
    nextBtn.textContent=getNextQuarterId(REP.data.quarter.id)?'NEXT QUARTER':'YEAR COMPLETE';
    nextBtn.hidden=false;
  }
}

function syncReportPhaseUI(){
  var phase=typeof getQuarterPhase==='function' ? getQuarterPhase() : QUARTER_PHASES.REPORT_OPEN;
  var cards=$r('p3Opts') ? $r('p3Opts').querySelectorAll('.opt') : [], i;
  for(i=0;i<cards.length;i++){
    cards[i].disabled=phase!==QUARTER_PHASES.REPORT_OPEN;
    cards[i].classList.toggle('is-disabled', phase!==QUARTER_PHASES.REPORT_OPEN);
    cards[i].setAttribute('aria-disabled', phase!==QUARTER_PHASES.REPORT_OPEN ? 'true' : 'false');
  }
  if($r('btnNextQuarterReport')) $r('btnNextQuarterReport').disabled=phase!==QUARTER_PHASES.QUARTER_LOCKED;
}

function chooseOption(i){
  if(REP.locked || (typeof canSelectQuarterOption==='function' && !canSelectQuarterOption())) return;
  var option=REP.data.options[i];
  REP.outcome=applyBoardDecision(REP.data.quarter, option.id);
  if(!REP.outcome) return;
  REP.choice=i;
  var cards=$r('p3Opts').querySelectorAll('.opt'), j;
  for(j=0;j<cards.length;j++) cards[j].classList.toggle('sel', j===i);
  $r('decision').textContent='BOARD DECISION: '+option.title.toUpperCase();
  showOutcome(REP.outcome);
  REP.locked=true;

  var nextBtn=$r('btnNextQuarterReport');
  if(getNextQuarterId(REP.data.quarter.id)){
    nextBtn.textContent='NEXT QUARTER';
    nextBtn.hidden=false;
  }else{
    nextBtn.textContent='YEAR COMPLETE';
    nextBtn.hidden=false;
  }
  syncReportPhaseUI();
}

function applyBoardDecision(quarter, optionId){
  if(typeof submitQuarterDecision==='function') return submitQuarterDecision(optionId);
  return null;
}

function goToNextQuarter(){
  if(typeof canBeginNextQuarter==='function' && !canBeginNextQuarter()) return;
  if(!REP.outcome) return;
  var nextId=getNextQuarterId(REP.data.quarter.id);
  if(!nextId){
    $r('decision').textContent='YEAR COMPLETE: ALL FOUR QUARTERS RECORDED';
    $r('btnNextQuarterReport').hidden=true;
    return;
  }
  if(typeof advancePhase==='function'){
    if(!advancePhase(QUARTER_ACTIONS.BEGIN_NEXT_QUARTER)) return;
  }else return;
  if(typeof setMetricStarts==='function') setMetricStarts(GAME.stats);
  if(typeof resetMetrics==='function') resetMetrics();
  if(typeof syncQuarterControls==='function') syncQuarterControls();
  if(REP.inGame){
    closeReport();
    if(typeof seekSimulation==='function') seekSimulation(0);
    if(typeof setScene==='function') setScene('simulation');
    paused=false;
    if(typeof syncPauseButton==='function') syncPauseButton();
  }else{
    openReport();
  }
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
      void p.offsetWidth;
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
  if(typeof advancePhase==='function' && !advancePhase(QUARTER_ACTIONS.OPEN_REPORT)) return;
  REP.data=buildReportData();
  REP.root.innerHTML=repShellHTML(REP.data);
  REP.pages=[$r('pg1'),$r('pg2'),$r('pg3')];
  REP.page=0;
  REP.choice=-1;
  REP.busy=false;
  REP.locked=(typeof getQuarterPhase==='function' && getQuarterPhase()===QUARTER_PHASES.QUARTER_LOCKED);
  REP.outcome=(typeof GAME!=='undefined' ? GAME.currentOutcome : null);
  fillPage1();
  fillPage2();
  fillPage3();
  populateReportQuarterSelect();
  restoreReportPhaseState();
  $r('btnNextPage').addEventListener('click', nextReportPage);
  $r('btnNextQuarterReport').addEventListener('click', goToNextQuarter);
  if(REP.inGame){
    $r('btnCloseReport').addEventListener('click', closeReport);
  }else{
    $r('btnResetReport').addEventListener('click', openReport);
  }
  layoutStack(true);
  updateFoot();
  syncReportPhaseUI();
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

  try{
    var params=new URLSearchParams(window.location.search);
    var q=params.get('quarter');
    if(q && typeof isDebugMode==='function' && isDebugMode()) setCurrentQuarter(q);
  }catch(e){}

  var btn=document.getElementById('btnReadReport');
  if(btn) btn.addEventListener('click', openReport);

  document.addEventListener('keydown', function(e){
    if(!REP.open) return;
    if(e.key===' '||e.key==='ArrowRight'||e.key==='Spacebar'){
      e.preventDefault();
      nextReportPage();
    }else if(REP.inGame && e.key==='Escape'){
      closeReport();
    }else if(!REP.inGame && (e.key==='r'||e.key==='R')){
      openReport();
    }
  });

  if(!REP.inGame) openReport();
})();
