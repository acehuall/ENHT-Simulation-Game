'use strict';
/* =========================================================
   ROUND-END BOARD REPORT — reusable pixel paper stack.

   openBoardReport({quarter, prevStats, curStats, onAdvance})
   builds the 3-page report overlay for ANY quarter:
     page 1 - quarter summary (prevStats vs curStats bars/deltas)
     page 2 - the issue + that quarter's graph (report-graphs.js)
     page 3 - the four options; choosing + confirming rolls the
              option's riskEvents (game-state.js) and shows the
              outcome, then hands control back via onAdvance().

   All CONTENT comes from quarters-data.js — edit text, impacts
   and graph data there, not here. Layout/stack behaviour only
   in this file. CSS: src/report/round-end-report.css (.rep-root).

   Used by index.html (in-game overlay after each quarter) and
   round-end-report.html (standalone preview with a Q dropdown).
========================================================= */

var REP = { open:false, page:0, choice:-1, decided:false, busy:false,
            pages:[], quarter:null, prev:null, cur:null, onAdvance:null, root:null };

function $r(id){ return document.getElementById(id); }
function fmtRepMoney(v){ return (v<-0.05?'−':(v>0.05?'+':''))+'£'+Math.abs(v).toFixed(1)+'m'; }
function repEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

function repMetricDisp(def,v){ return def.money ? fmtRepMoney(v) : String(Math.round(v)); }
function repMetricBarPct(def,v){
  var p=Math.round(100*(v-def.min)/(def.max-def.min));
  return Math.max(4, Math.min(100,p));
}
function repDeltaDisp(def,d){
  if(Math.abs(d)<0.05) return {tone:'flat', disp:'—'};
  var good=((d>0)===(def.goodUp!==false));
  return {
    tone: good?'good':'bad',
    disp: def.money?fmtRepMoney(d):((d>0?'+':'−')+Math.abs(Math.round(d)))
  };
}

/* impact chips for an effects/impacts object, in METRIC_DEFS order */
function repImpactChips(effects){
  var html=[],i,def,v,dl;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i]; v=effects[def.key];
    if(!v) continue;
    dl=repDeltaDisp(def,v);
    html.push('<span class="chip '+dl.tone+'">'+def.label+' '+dl.disp+'</span>');
  }
  return html.join('');
}

/* ---------- shell ---------- */
function _repPageShell(num,tabClass,inner){
  return '<section class="page" id="pg'+num+'"><div class="lift">'+
    '<div class="tab '+tabClass+'">0'+num+'</div>'+
    '<div class="paper"><div class="binder"></div>'+
    '<div class="content" id="pg'+num+'Content">'+inner+'</div></div></div></section>';
}

function _repHead(badge,title,sub,q,pg){
  return '<div class="pghead"><div class="pgbadge">'+badge+'</div>'+
    '<div class="pgtitle"><h2>'+title+'</h2><div class="sub">'+sub+'</div></div>'+
    '<div class="pgq">'+q.label+' &middot; 0'+pg+' / 03</div></div>'+
    '<div class="rule"></div><div class="rule teal"></div>';
}

function buildReportShell(q){
  var root=document.createElement('div');
  root.className='rep-root'; root.id='repRoot';
  root.innerHTML=
    '<div class="rep-hdr"><div class="nsq">N</div><div>'+
      '<h1>NORTHBROOK GENERAL HOSPITAL</h1>'+
      '<div class="sub">QUARTERLY BOARD PACK &middot; CONFIDENTIAL &middot; DRAFT FOR MINUTES</div></div>'+
      '<div class="chip">'+q.label+' - '+q.name+'</div></div>'+
    '<div class="rep-stage"><div id="stack">'+

    _repPageShell(1,'tab1',
      _repHead('PAGE 1','QUARTER RESULTS','Board position over the quarter just simulated.',q,1)+
      '<div class="cols">'+
        '<div class="panelP"><h3>BOARD METRICS &mdash; END OF '+q.label+' VS START</h3>'+
          '<div class="barwrap"><div class="plot" id="p1Plot"></div><div class="xlabels" id="p1X"></div></div>'+
          '<div class="blegend"><span><i class="swl"></i>START OF '+q.label+'</span><span><i class="swc"></i>END OF '+q.label+'</span></div></div>'+
        '<div class="panelP"><h3>EXECUTIVE SUMMARY</h3><div class="sumtext" id="p1Sum"></div><div class="drows" id="p1Rows"></div></div>'+
      '</div>')+

    _repPageShell(2,'tab2',
      _repHead('PAGE 2','ISSUE AT HAND','Escalation paper &mdash; decision required before close of meeting.',q,2)+
      '<div class="warn" id="p2Tag"></div><div class="issueTitle" id="p2Title"></div>'+
      '<div class="cols"><div class="panelP"><h3>SITUATION</h3><div class="sumtext" id="p2Paras"></div></div>'+
      '<div class="panelP"><h3 id="p2ChartHead"></h3><canvas id="issueChart" width="360" height="180"></canvas>'+
      '<div class="caption" id="p2Caption"></div><div class="risk" id="p2Risk"></div></div></div>')+

    _repPageShell(3,'tab3',
      '<div id="p3Choice">'+
      _repHead('PAGE 3','OPTIONS FOR DECISION','Select ONE option, then confirm to record the board\'s decision.',q,3)+
      '<div class="opts" id="p3Opts"></div></div>'+
      '<div id="p3Outcome" hidden></div>')+

    '</div></div>'+
    '<div class="rep-foot">'+
      '<button class="btn" id="btnNextPage">NEXT PAGE &#9656;</button>'+
      '<button class="btn" id="btnResetReport" hidden>FIRST PAGE</button>'+
      '<button class="btn confirm" id="btnConfirmDecision" hidden>CONFIRM DECISION</button>'+
      '<button class="btn confirm" id="btnContinueQuarter" hidden></button>'+
      '<span class="pgind" id="pageInd">PAGE 1 / 3</span>'+
      '<span class="decision" id="decision"></span>'+
      '<span class="hint">SPACE / &#8594; NEXT &middot; R FIRST PAGE</span>'+
    '</div>';
  return root;
}

/* ---------- page 1 : bars + summary + deltas ---------- */
function fillPage1(){
  var bars=[], xl=[], rows=[], i, def, last, cur, dl;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    last=REP.prev[def.key]; cur=REP.cur[def.key];
    bars.push('<div class="grp">'+
      '<i class="bar last" style="height:'+repMetricBarPct(def,last)+'%"></i>'+
      '<i class="bar cur" style="height:'+repMetricBarPct(def,cur)+'%"></i></div>');
    xl.push('<span>'+def.label+'</span>');
    dl=repDeltaDisp(def,cur-last);
    rows.push('<div class="drow"><b>'+def.label+'</b>'+
      '<span class="val">'+repMetricDisp(def,cur)+'</span>'+
      '<span class="dlt '+dl.tone+'">'+dl.disp+'</span></div>');
  }
  $r('p1Plot').innerHTML=bars.join('');
  $r('p1X').innerHTML=xl.join('');
  $r('p1Rows').innerHTML=rows.join('');
  $r('p1Sum').innerHTML=REP.quarter.page1Summary.map(function(p){ return '<p>'+p+'</p>'; }).join('');
}

/* ---------- page 2 : issue + per-quarter graph ---------- */
function fillPage2(){
  var q=REP.quarter, iss=q.page2Issue;
  $r('p2Tag').textContent=iss.tag;
  $r('p2Title').textContent=iss.title;
  $r('p2Risk').textContent=iss.risk;
  $r('p2ChartHead').textContent=q.page2GraphData.heading;
  $r('p2Caption').textContent=q.page2GraphData.caption;
  var paras=[q.scenarioText].concat(iss.paras);
  $r('p2Paras').innerHTML=paras.map(function(p){ return '<p>'+p+'</p>'; }).join('');
  drawQuarterGraph($r('issueChart'),q);
}

/* ---------- page 3 : option cards ---------- */
function fillPage3(){
  var html=[], i, o, q=REP.quarter;
  for(i=0;i<q.options.length;i++){
    o=q.options[i];
    html.push('<button type="button" class="opt" data-idx="'+i+'">'+
      '<h4>OPTION '+o.label+' — '+o.title.toUpperCase()+'</h4>'+
      '<div class="desc">'+o.description+'</div>'+
      '<div class="pc">'+
        o.pros.map(function(p){ return '<div class="p">'+p+'</div>'; }).join('')+
        o.cons.map(function(cn){ return '<div class="c">'+cn+'</div>'; }).join('')+
      '</div>'+
      '<div class="impact">'+repImpactChips(o.effects)+
        ((o.riskEvents&&o.riskEvents.length)?'<span class="chip luck">&#9860; '+o.riskEvents.length+' LUCK</span>':'')+
      '</div></button>');
  }
  $r('p3Opts').innerHTML=html.join('');
  $r('p3Opts').addEventListener('click', function(e){
    var b=e.target.closest('.opt');
    if(b && !REP.decided) chooseReportOption(parseInt(b.getAttribute('data-idx'),10));
  });
}

function chooseReportOption(i){
  REP.choice=i;
  var cards=$r('p3Opts').querySelectorAll('.opt'), j;
  for(j=0;j<cards.length;j++) cards[j].classList.toggle('sel', j===i);
  $r('decision').textContent='BOARD DECISION: '+REP.quarter.options[i].title.toUpperCase();
  updateReportFoot();
}

/* ---------- decision + outcome ---------- */
function confirmReportDecision(){
  if(REP.choice<0 || REP.decided) return;
  var q=REP.quarter, option=q.options[REP.choice];
  var outcome=applyBoardDecision(q,option,REP.cur);
  REP.decided=true;
  renderOutcome(outcome);
  updateReportFoot();
}

function renderOutcome(oc){
  var q=REP.quarter, i, def, dl, rows=[], luck=[];

  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    dl=repDeltaDisp(def,oc.after[def.key]-oc.before[def.key]);
    rows.push('<div class="drow"><b>'+def.label+'</b>'+
      '<span class="val">'+repMetricDisp(def,oc.after[def.key])+'</span>'+
      '<span class="dlt '+dl.tone+'">'+dl.disp+'</span></div>');
  }

  if(oc.rolls.length){
    for(i=0;i<oc.rolls.length;i++){
      var r=oc.rolls[i];
      luck.push('<div class="luckrow '+(r.triggered?'hit':'miss')+'">'+
        '<div class="lhead"><b>'+r.name+'</b><span class="pct">'+Math.round(r.chance*100)+'%</span>'+
        '<span class="res">'+(r.triggered?'&#9860; TRIGGERED':'DID NOT OCCUR')+'</span></div>'+
        (r.triggered?'<div class="impact">'+repImpactChips(r.impacts)+'</div>':'')+
        '</div>');
    }
  }else{
    luck.push('<div class="luckrow miss"><div class="lhead"><b>No luck events for this option</b></div></div>');
  }

  $r('p3Choice').hidden=true;
  var host=$r('p3Outcome');
  host.hidden=false;
  host.innerHTML=
    _repHead('DECISION','MINUTED OUTCOME','What changed, why it changed, and what luck decided.',q,3)+
    '<div class="issueTitle">OPTION '+q.options[REP.choice].label+' — '+oc.optionTitle.toUpperCase()+'</div>'+
    '<div class="cols">'+
      '<div class="panelP"><h3>WHAT HAPPENED</h3>'+
        '<div class="sumtext"><p>'+oc.summary+'</p></div>'+
        '<h3>PLANNED IMPACT</h3><div class="impact ocimpact">'+repImpactChips(oc.effects)+'</div>'+
        '<h3 class="lucktitle">LUCK OF THE QUARTER</h3><div class="luckwrap">'+luck.join('')+'</div></div>'+
      '<div class="panelP"><h3>REVISED BOARD POSITION &mdash; CARRIED INTO '+
        (isFinalQuarter()?'YEAR END':QUARTERS[GAME.currentQuarterIndex+1].label)+'</h3>'+
        '<div class="drows">'+rows.join('')+'</div>'+
        '<div class="nextq">'+q.nextQuarterIntro+'</div></div>'+
    '</div>';
}

/* ---------- year-end paper (after the Q4 decision) ---------- */
function renderYearEnd(onRestart){
  var i, def, dl, rows=[], decs=[];
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    dl=repDeltaDisp(def,GAME.stats[def.key]-def.start);
    rows.push('<div class="drow"><b>'+def.label+'</b>'+
      '<span class="val">'+repMetricDisp(def,GAME.stats[def.key])+'</span>'+
      '<span class="dlt '+dl.tone+'">'+dl.disp+'</span></div>');
  }
  for(i=0;i<GAME.decisions.length;i++){
    decs.push('<div class="drow"><b>'+GAME.decisions[i].quarterLabel+'</b>'+
      '<span class="val">'+repEsc(GAME.decisions[i].optionTitle)+'</span></div>');
  }
  $r('stack').innerHTML=_repPageShell(1,'tab1',
    '<div class="pghead"><div class="pgbadge">YEAR END</div>'+
    '<div class="pgtitle"><h2>FINANCIAL YEAR COMPLETE</h2>'+
    '<div class="sub">Four quarters, four decisions &mdash; the Trust the board built.</div></div></div>'+
    '<div class="rule"></div><div class="rule teal"></div>'+
    '<div class="cols">'+
      '<div class="panelP"><h3>FINAL POSITION VS START OF YEAR</h3><div class="drows">'+rows.join('')+'</div></div>'+
      '<div class="panelP"><h3>THE BOARD\'S DECISIONS</h3><div class="drows">'+decs.join('')+'</div>'+
      '<div class="nextq">Thank you for playing. Restart to steer the year differently.</div></div>'+
    '</div>');
  REP.pages=[$r('pg1')]; REP.page=0;
  layoutStack(true);
  $r('btnNextPage').hidden=true;
  $r('btnResetReport').hidden=true;
  $r('btnConfirmDecision').hidden=true;
  $r('pageInd').textContent='YEAR END';
  var btn=$r('btnContinueQuarter');
  btn.hidden=false;
  btn.textContent='RESTART YEAR';
  btn.onclick=function(){ if(onRestart) onRestart(); };
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

function updateReportFoot(){
  $r('pageInd').textContent='PAGE '+(REP.page+1)+' / '+REP.pages.length;
  $r('btnNextPage').hidden=REP.decided||(REP.page>=REP.pages.length-1);
  $r('btnResetReport').hidden=REP.decided||(REP.page<REP.pages.length-1);
  $r('btnConfirmDecision').hidden=REP.decided||REP.page<REP.pages.length-1||REP.choice<0;
  var cont=$r('btnContinueQuarter');
  cont.hidden=!REP.decided;
  if(REP.decided){
    cont.textContent=isFinalQuarter()?'CLOSE FINANCIAL YEAR':'BEGIN '+QUARTERS[GAME.currentQuarterIndex+1].label+' ▸';
  }
}

function nextReportPage(){
  if(REP.busy || REP.decided || REP.page>=REP.pages.length-1) return;
  REP.busy=true;
  var top=REP.pages[REP.page];
  top.classList.remove('deal');
  top.classList.add('leave');
  setTimeout(function(){
    REP.page++;
    layoutStack(false);
    updateReportFoot();
    REP.busy=false;
  },480);
}

function resetReportStack(){
  if(REP.busy || REP.decided) return;
  REP.page=0;
  layoutStack(true);
  updateReportFoot();
}

/* ---------- open / close ---------- */
function openBoardReport(opts){
  closeBoardReport();
  REP.quarter=opts.quarter;
  REP.prev=cloneStats(opts.prevStats);
  REP.cur=cloneStats(opts.curStats);
  REP.onAdvance=opts.onAdvance||null;
  REP.page=0; REP.choice=-1; REP.decided=false; REP.busy=false; REP.open=true;

  REP.root=buildReportShell(REP.quarter);
  document.body.appendChild(REP.root);
  REP.pages=[$r('pg1'),$r('pg2'),$r('pg3')];

  fillPage1(); fillPage2(); fillPage3();
  layoutStack(true);
  updateReportFoot();

  $r('btnNextPage').addEventListener('click', nextReportPage);
  $r('btnResetReport').addEventListener('click', resetReportStack);
  $r('btnConfirmDecision').addEventListener('click', confirmReportDecision);
  $r('btnContinueQuarter').addEventListener('click', function(){
    if(REP.decided && REP.onAdvance) REP.onAdvance(GAME.lastOutcome);
  });
}

function closeBoardReport(){
  if(REP.root && REP.root.parentNode) REP.root.parentNode.removeChild(REP.root);
  REP.root=null; REP.open=false; REP.pages=[];
}

/* one document-level keyboard hook, active while a report is open */
document.addEventListener('keydown', function(e){
  if(!REP.open) return;
  if(e.key===' '||e.key==='ArrowRight'||e.key==='Spacebar'){ e.preventDefault(); nextReportPage(); }
  else if(e.key==='r'||e.key==='R'){ resetReportStack(); }
});
