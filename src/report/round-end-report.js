'use strict';
/* ===== round-end board report — stack behaviour ===== */

var REP = { page:0, choice:-1, busy:false, pages:[] };

function $r(id){ return document.getElementById(id); }
function fmtRepMoney(v){ return (v<-0.05?'−':(v>0.05?'+':''))+'£'+Math.abs(v).toFixed(1)+'m'; }

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

/* ---------- page 1 : bars + summary + deltas ---------- */
function fillPage1(){
  var bars=[], xl=[], rows=[], i, m, dl;
  for(i=0;i<REPORT_DATA.metrics.length;i++){
    m=REPORT_DATA.metrics[i];
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
  $r('p1Sum').innerHTML=REPORT_DATA.summary.map(function(p){ return '<p>'+p+'</p>'; }).join('');
}

/* ---------- page 2 : issue + projection chart ---------- */
function fillPage2(){
  var iss=REPORT_DATA.issue;
  $r('p2Tag').textContent=iss.tag;
  $r('p2Title').textContent=iss.title;
  $r('p2Risk').textContent=iss.risk;
  $r('p2Paras').innerHTML=iss.paras.map(function(p){ return '<p>'+p+'</p>'; }).join('');
  drawIssueChart(iss.chart);
}

function drawIssueChart(c){
  var cv=$r('issueChart'), ctx=cv.getContext('2d');
  var W=cv.width, H=cv.height, L=32, R=8, T=10, B=22;
  var n=c.actual.length+c.projected.length;
  var step=(W-L-R)/n;
  var ink='#141b30', mid='#8b94ab';
  var yOf=function(v){ return T+(H-T-B)*(1-v/c.maxV); };
  var i,x,y,px,py,d,dx,dy,len;

  ctx.clearRect(0,0,W,H);

  /* gridlines + y labels */
  ctx.font='bold 8px "Courier New", monospace';
  for(i=0;i<=c.maxV;i+=40){
    y=Math.round(yOf(i));
    ctx.fillStyle='#d4dae7'; ctx.fillRect(L,y,W-L-R,1);
    ctx.fillStyle=mid; ctx.textAlign='right'; ctx.fillText(String(i),L-4,y+3);
  }

  /* axes */
  ctx.fillStyle=ink;
  ctx.fillRect(L,T-4,2,H-T-B+4);
  ctx.fillRect(L,H-B,W-L-R,2);

  /* NOW divider */
  x=Math.round(L+c.actual.length*step);
  ctx.fillStyle=mid;
  for(y=T;y<H-B;y+=6) ctx.fillRect(x,y,1,3);
  ctx.textAlign='center'; ctx.fillText('NOW',x,T-2);

  /* actual bars (teal) */
  for(i=0;i<c.actual.length;i++){
    x=Math.round(L+i*step+3); y=Math.round(yOf(c.actual[i]));
    ctx.fillStyle='#23c4b4'; ctx.fillRect(x,y,Math.round(step-6),H-B-y);
    ctx.strokeStyle=ink; ctx.lineWidth=2;
    ctx.strokeRect(x+1,y+1,Math.round(step-6)-2,H-B-y-2);
  }

  /* projected dotted line + point markers (amber) */
  ctx.fillStyle='#c98f1d';
  px=L+(c.actual.length-0.5)*step; py=yOf(c.actual[c.actual.length-1]);
  for(i=0;i<c.projected.length;i++){
    x=L+(c.actual.length+i+0.5)*step; y=yOf(c.projected[i]);
    dx=x-px; dy=y-py; len=Math.sqrt(dx*dx+dy*dy);
    for(d=0;d<len;d+=5) ctx.fillRect(Math.round(px+dx*d/len)-1,Math.round(py+dy*d/len)-1,2,2);
    ctx.fillRect(Math.round(x)-2,Math.round(y)-2,4,4);
    px=x; py=y;
  }

  /* capacity line (red dashes) */
  y=Math.round(yOf(c.capacity));
  ctx.fillStyle='#e05252';
  for(x=L;x<W-R;x+=8) ctx.fillRect(x,y,4,2);
  ctx.textAlign='left'; ctx.fillText('CAPACITY',L+4,y-4);

  /* x labels */
  ctx.fillStyle=mid; ctx.textAlign='center';
  ctx.fillText('W1',L+step*0.5,H-B+12);
  ctx.fillText('W'+n,W-R-step*0.5,H-B+12);
}

/* ---------- page 3 : option cards ---------- */
function fillPage3(){
  var html=[], i, o;
  for(i=0;i<REPORT_DATA.options.length;i++){
    o=REPORT_DATA.options[i];
    html.push('<button type="button" class="opt" data-idx="'+i+'">'+
      '<h4>OPTION '+String.fromCharCode(65+i)+' — '+o.title+'</h4>'+
      '<div class="desc">'+o.desc+'</div>'+
      '<div class="pc">'+
        o.pros.map(function(p){ return '<div class="p">'+p+'</div>'; }).join('')+
        o.cons.map(function(cn){ return '<div class="c">'+cn+'</div>'; }).join('')+
      '</div>'+
      '<div class="impact">'+
        o.impact.map(function(ch){ return '<span class="chip '+ch.tone+'">'+ch.t+'</span>'; }).join('')+
      '</div></button>');
  }
  $r('p3Opts').innerHTML=html.join('');
  $r('p3Opts').addEventListener('click', function(e){
    var b=e.target.closest('.opt');
    if(b) chooseOption(parseInt(b.getAttribute('data-idx'),10));
  });
}

function chooseOption(i){
  REP.choice=i;
  var cards=$r('p3Opts').querySelectorAll('.opt'), j;
  for(j=0;j<cards.length;j++) cards[j].classList.toggle('sel', j===i);
  $r('decision').textContent='BOARD DECISION: '+REPORT_DATA.options[i].title;
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
  $r('btnResetReport').hidden=(REP.page<REP.pages.length-1);
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

function resetReport(){
  if(REP.busy) return;
  REP.page=0; REP.choice=-1;
  var cards=$r('p3Opts').querySelectorAll('.opt'), j;
  for(j=0;j<cards.length;j++) cards[j].classList.remove('sel');
  $r('decision').textContent='';
  layoutStack(true);
  updateFoot();
}

/* ---------- init ---------- */
(function(){
  REP.pages=[$r('pg1'),$r('pg2'),$r('pg3')];
  fillPage1(); fillPage2(); fillPage3();
  layoutStack(true);
  updateFoot();

  $r('btnNextPage').addEventListener('click', nextReportPage);
  $r('btnResetReport').addEventListener('click', resetReport);
  document.addEventListener('keydown', function(e){
    if(e.key===' '||e.key==='ArrowRight'||e.key==='Spacebar'){ e.preventDefault(); nextReportPage(); }
    else if(e.key==='r'||e.key==='R'){ resetReport(); }
  });
})();
