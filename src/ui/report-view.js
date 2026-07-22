'use strict';
/* ---------- board report rendering (view only) ----------
   Pure HTML/canvas builders for the quarterly board pack. No game
   state changes happen here; decisions go through
   decision-controller.js and modal state lives in report-overlay.js.
------------------------------------------------------------------ */

function _reportMetricValues(){
  var timeline=getTimeline && getTimeline();
  var outcome=timeline && timeline.outcome ? timeline.outcome : DEFAULT_OUTCOME;
  var metrics=[], i, def, start, end;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    start=outcome.startStats[def.key];
    end=outcome.endStats[def.key];
    metrics.push({
      key:def.key,
      label:def.label,
      full:def.full || def.label,
      money:!!def.money,
      goodUp:!!def.goodUp,
      last:start,
      cur:end,
      min:def.min,
      max:def.max
    });
  }
  return metrics;
}

function _reportImpactChips(effects){
  var chips=[], i, def, v;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    v=effects[def.key];
    if(!v) continue;
    chips.push({
      text:def.label+' '+metricDeltaText(def, v),
      tone:((v>0)===def.goodUp)?'good':'bad'
    });
  }
  return chips;
}

function _metricDisplay(metric, value){
  return metric.money ? fmtMoney(value).replace('&pound;','GBP').replace('&#8722;','-') : String(Math.round(value));
}

function _reportMetricDelta(metric){
  var d=metric.cur-metric.last, tone;
  if(Math.abs(d)<0.05){
    return {tone:'flat', disp:'-'};
  }
  tone=((d>0)===metric.goodUp)?'good':'bad';
  return {tone:tone, disp:metricDeltaText(metric, d)};
}

/* Board pack pages, in display order. Adding a page here is the only
   change needed to add a page to the report - the shell, the filler
   loop, the pager bounds, the page indicator and the page headers all
   read from this.

   build:       (data) -> HTML string for the page body
   afterRender: optional (data) -> void, run after the page HTML is in
                the DOM. For pages that draw into a <canvas>, which
                cannot be done from an HTML string. */
var REPORT_PAGES=[
  {id:'results', title:'Prior Quarter Results', build:_fillReportPage1},
  {id:'issue',   title:'Issue At Hand',         build:_fillReportPage2,
   afterRender:function(data){ _drawReportIssueChart(data.issue); }},
  {id:'options', title:'Options For Decision',  build:_fillReportPage3}
];

function _reportPageHead(pageId){
  var i, n;
  for(i=0;i<REPORT_PAGES.length;i++){
    if(REPORT_PAGES[i].id===pageId){
      n=i+1;
      return '<div class="rep-page-head"><span>'+
             (n<10?'0':'')+n+'</span><h3>'+
             escapeHTML(REPORT_PAGES[i].title)+'</h3></div>';
    }
  }
  return '';
}

function _reportShell(data){
  var q=data.quarter, pages=[], i;
  for(i=0;i<REPORT_PAGES.length;i++){
    pages.push('<section class="rep-page" data-page="'+i+'"'+(i?' hidden':'')+'></section>');
  }
  return [
    '<div class="rep-modal" role="dialog" aria-modal="true" aria-labelledby="repTitle">',
      '<div class="rep-top">',
        '<div class="nsq">N</div>',
        '<div><h2 id="repTitle">NORTHBROOK GENERAL HOSPITAL</h2>',
        '<div class="rep-sub">QUARTERLY BOARD PACK - DECISION REQUIRED</div></div>',
        '<div class="chip">'+escapeHTML(q.displayName)+'</div>',
      '</div>',
      '<div class="rep-pages">',
        pages.join(''),
      '</div>',
      '<div class="rep-foot">',
        '<button class="btn" id="repPrev" data-report-action="prev">Back</button>',
        '<button class="btn" id="repNext" data-report-action="next">Next</button>',
        '<button class="btn" id="repNextQuarter" data-report-action="next-quarter" hidden>Next Quarter</button>',
        '<span class="pgind" id="repPageInd">Page 1 / '+REPORT_PAGES.length+'</span>',
        '<span class="decision" id="repDecision"></span>',
        '<button class="btn" id="repClose" data-report-action="close">Close</button>',
      '</div>',
    '</div>'
  ].join('');
}

function _fillReportPage1(data){
  var rows=[], bars=[], labels=[], i, m, dl;
  for(i=0;i<data.metrics.length;i++){
    m=data.metrics[i];
    dl=_reportMetricDelta(m);
    bars.push('<div class="rep-bar-group">'+
      '<i class="rep-bar last" style="height:'+metricBarHeightPct(m,m.last)+'%"></i>'+
      '<i class="rep-bar cur" style="height:'+metricBarHeightPct(m,m.cur)+'%"></i></div>');
    labels.push('<span>'+escapeHTML(m.full)+'</span>');
    rows.push('<div class="rep-metric-row"><b>'+escapeHTML(m.full)+'</b>'+
      '<span>'+_metricDisplay(m,m.cur)+'</span>'+
      '<i class="'+dl.tone+'">'+escapeHTML(dl.disp)+'</i></div>');
  }
  return [
    '<div class="rep-paper">',
      _reportPageHead('results'),
      '<div class="rep-grid two">',
        '<div><h4>Metric movement</h4><div class="rep-bars">'+bars.join('')+'</div><div class="rep-x">'+labels.join('')+'</div></div>',
        '<div><h4>Board position</h4>',
          '<p>The simulation has replayed the current board position using the resolved outcome. These values are the baseline for the decision you make now.</p>',
          '<div class="rep-metric-list">'+rows.join('')+'</div>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');
}

function _fillReportPage2(data){
  var issue=data.issue;
  return [
    '<div class="rep-paper">',
      _reportPageHead('issue'),
      '<div class="rep-alert">'+escapeHTML(issue.tag)+'</div>',
      '<h4 class="rep-issue-title">'+escapeHTML(issue.title)+'</h4>',
      '<div class="rep-grid two">',
        '<div><h4>Situation</h4>',
          issue.paras.map(function(p){ return '<p>'+escapeHTML(p)+'</p>'; }).join(''),
        '</div>',
        '<div><h4>Risk</h4><canvas id="repIssueChart" width="360" height="180"></canvas>',
        '<p class="rep-risk">'+escapeHTML(issue.risk)+'</p></div>',
      '</div>',
    '</div>'
  ].join('');
}

function _fillReportPage3(data){
  var html=[], i, o, chips;
  for(i=0;i<data.options.length;i++){
    o=data.options[i];
    chips=_reportImpactChips(o.effects);
    html.push('<button type="button" class="rep-option" data-index="'+i+'">'+
      '<h4>'+escapeHTML(o.label+' - '+o.title)+'</h4>'+
      '<p>'+escapeHTML(o.description)+'</p>'+
      '<div class="rep-procon">'+
        o.pros.map(function(p){ return '<span class="good">+ '+escapeHTML(p)+'</span>'; }).join('')+
        o.cons.map(function(c){ return '<span class="bad">- '+escapeHTML(c)+'</span>'; }).join('')+
      '</div>'+
      '<div class="rep-chips">'+chips.map(function(ch){ return '<i class="'+ch.tone+'">'+escapeHTML(ch.text)+'</i>'; }).join('')+'</div>'+
    '</button>');
  }
  return [
    '<div class="rep-paper">',
      _reportPageHead('options'),
      '<div class="rep-options">'+html.join('')+'</div>',
      '<div class="rep-outcome" id="repOutcome" hidden></div>',
    '</div>'
  ].join('');
}

function _drawReportIssueChart(issue){
  var cv=$('repIssueChart');
  if(!cv) return;
  var c=issue.chart, g=cv.getContext('2d');
  /* Draw in a fixed 360x180 logical space but back it with a super-sampled
     bitmap so the axis labels stay sharp when the canvas is scaled to fit. */
  var W=360, H=180, L=34, R=10, T=12, B=24;
  var ss=Math.max(2, Math.ceil((window.devicePixelRatio||1)*2));
  if(cv.width!==W*ss){ cv.width=W*ss; cv.height=H*ss; }
  g.setTransform(ss,0,0,ss,0,0);
  var n=c.actual.length+c.projected.length, step=(W-L-R)/n;
  var yOf=function(v){ return T+(H-T-B)*(1-v/c.maxV); };
  var i, x, y, px, py, dx, dy, len, d;
  g.clearRect(0,0,W,H);
  g.fillStyle='#fbfcfe'; g.fillRect(0,0,W,H);
  g.font='bold 9px "Courier New", monospace';
  g.textAlign='right'; g.textBaseline='alphabetic';
  for(i=0;i<=c.maxV;i+=40){
    y=Math.round(yOf(i));
    g.fillStyle='#d4dae7'; g.fillRect(L,y,W-L-R,1);
    g.fillStyle='#42557a'; g.fillText(String(i),L-5,y+3);
  }
  g.fillStyle='#141b30';
  g.fillRect(L,T-4,2,H-T-B+4);
  g.fillRect(L,H-B,W-L-R,2);
  for(i=0;i<c.actual.length;i++){
    x=Math.round(L+i*step+3); y=Math.round(yOf(c.actual[i]));
    g.fillStyle='#23c4b4'; g.fillRect(x,y,Math.round(step-6),H-B-y);
  }
  g.fillStyle='#c98f1d';
  px=L+(c.actual.length-.5)*step; py=yOf(c.actual[c.actual.length-1]);
  for(i=0;i<c.projected.length;i++){
    x=L+(c.actual.length+i+.5)*step; y=yOf(c.projected[i]);
    dx=x-px; dy=y-py; len=Math.sqrt(dx*dx+dy*dy);
    for(d=0;d<len;d+=5) g.fillRect(Math.round(px+dx*d/len)-1,Math.round(py+dy*d/len)-1,2,2);
    g.fillRect(Math.round(x)-2,Math.round(y)-2,4,4);
    px=x; py=y;
  }
  y=Math.round(yOf(c.capacity));
  g.fillStyle='#e05252';
  for(x=L;x<W-R;x+=8) g.fillRect(x,y,4,2);
}

function renderDecisionOutcome(outcome){
  var el=$('repOutcome'), chips=_reportImpactChips(outcome.effects);
  el.hidden=false;
  el.innerHTML='<h4>Decision Outcome</h4>'+
    '<p>'+escapeHTML(outcome.decisionSummary)+'</p>'+
    '<div class="rep-chips">'+chips.map(function(ch){ return '<i class="'+ch.tone+'">'+escapeHTML(ch.text)+'</i>'; }).join('')+'</div>';
}
