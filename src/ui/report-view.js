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

/* The board pack is a snapshot of one committed decision, not a live view, so
   it reads the resolved outcome on the timeline - never METRIC_CUR, which moves
   every frame during playback. Built once per report open (in _reportData);
   the Performance Analysis tabs all read this object. */
function _reportSnapshot(){
  var timeline=getTimeline && getTimeline();
  var outcome=timeline && timeline.outcome ? timeline.outcome : DEFAULT_OUTCOME;
  return {
    outcome:    outcome,
    quarterId:  outcome.quarterId,
    optionId:   outcome.optionId,
    startStats: outcome.startStats,
    endStats:   outcome.endStats,
    history:    (typeof getStatsHistory==='function' ? getStatsHistory() : [])
  };
}

/* The derivation context handed to every derive* / getReportSection call. */
function _snapshotCtx(snapshot){
  return {
    quarterId: snapshot.quarterId,
    optionId:  snapshot.optionId,
    outcome:   snapshot.outcome,
    history:   snapshot.history
  };
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
  {id:'results',     title:'Prior Quarter Results', build:_fillReportPage1},
  {id:'performance', title:'Performance Analysis',  build:_fillReportPerformance,
   afterRender:function(data){ _drawPerformanceCharts(data); }},
  {id:'issue',       title:'Issue At Hand',         build:_fillReportPage2,
   afterRender:function(data){ _drawReportIssueChart(data.issue); }},
  {id:'options',     title:'Options For Decision',  build:_fillReportPage3}
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

/* The one finance figure legitimately knowable before the decision: the
   resource the option commits this quarter. This is NOT read from o.effects
   (the engine's outcome deltas) - it is the authored `cost` fact, kept separate
   so the card shows a commitment, never a projected outcome. Expenditure follows
   the game-wide finance sign convention: an explicit minus on a spend, and a
   plain "no new spend" when nothing is committed. */
function _optionCostText(cost){
  if(!cost || cost<0.05){
    return '<span class="rep-cost-value neutral">No new spend</span>';
  }
  return '<span class="rep-cost-value spend">&#8722;&pound;'+cost.toFixed(1)+'m</span>';
}

/* Each option reduces to four scannable fields: title, one-line summary, the
   cost commitment, and a single qualitative trade-off line. No projected
   deltas, forecast values or per-role status pips appear here - those read the
   outcome before it is chosen and are deliberately gone. */
function _fillReportPage3(data){
  var html=[], i, o;
  for(i=0;i<data.options.length;i++){
    o=data.options[i];
    html.push('<button type="button" class="rep-option" data-index="'+i+'">'+
      '<h4>'+escapeHTML(o.label+' - '+o.title)+'</h4>'+
      '<p class="rep-option-summary">'+escapeHTML(o.description)+'</p>'+
      '<div class="rep-option-cost"><span class="rep-cost-label">Cost this quarter</span>'+
        _optionCostText(o.cost)+'</div>'+
      '<div class="rep-option-tradeoff">'+escapeHTML(o.tradeoff||'')+'</div>'+
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

/* ---------- Performance Analysis page (phase 3) ----------
   The four tabs read the report snapshot built in _reportData. Tab state is a
   module-level var (not in the DOM, not on REPORT); switching tabs only toggles
   visibility, so it never re-runs paging or resets scroll. */
var PERF_TABS=[
  {id:'finance',    label:'Finance',          metric:'budget'},
  {id:'operations', label:'Operations',       metric:'waiting'},
  {id:'workforce',  label:'Workforce',        metric:'morale'},
  {id:'quality',    label:'Quality & Safety', metric:'safety'}
];
var _perfTab=0;

function resetPerfTab(){ _perfTab=0; }
function getPerfTabCount(){ return PERF_TABS.length; }
function getActivePerfTab(){ return _perfTab; }

function setPerfTab(index){
  if(index<0 || index>=PERF_TABS.length || index===_perfTab) return;
  _perfTab=index;
  _syncPerfTabs();
}

/* Wraps at the ends so left/right keys cycle the tabs. */
function movePerfTab(delta){
  setPerfTab((_perfTab+delta+PERF_TABS.length)%PERF_TABS.length);
}

function _syncPerfTabs(){
  var root=$('repRoot');
  if(!root) return;
  var heads=root.querySelectorAll('.rep-perf-tab'), panels=root.querySelectorAll('.rep-perf-panel'), i;
  for(i=0;i<heads.length;i++) heads[i].classList.toggle('active', i===_perfTab);
  for(i=0;i<panels.length;i++) panels[i].hidden=i!==_perfTab;
}

/* True when the pager is currently on the Performance Analysis page. */
function isPerformancePageActive(){
  return typeof REPORT!=='undefined' && REPORT && REPORT_PAGES[REPORT.page] &&
         REPORT_PAGES[REPORT.page].id==='performance';
}

/* ---- presentation-time formatting (rounding happens here, never in the
   derivation, so the I&E reconciliation is not broken by intermediate
   rounding) ---- */
function _perfFixed(v, dp){
  var f=Math.pow(10,dp);
  return (Math.round(v*f)/f).toFixed(dp);
}

/* £m with an optional leading sign (used signed for variance columns). */
function _perfMoney(v, signed){
  var sign = signed ? (v>0.05?'+':(v<-0.05?'&#8722;':'')) : (v<-0.005?'&#8722;':'');
  return sign+'&pound;'+Math.abs(v).toFixed(1)+'m';
}

/* Format a non-finance row value by its unit. */
function _perfValueText(row){
  var u=row.unit||'', v=row.value;
  if(u==='£m') return _perfMoney(v,false);
  if(u.indexOf('%')>=0) return _perfFixed(v,1)+'%';
  if(u.indexOf('/ 10')>=0) return _perfFixed(v,1)+' / 10';
  return String(Math.round(v))+u;
}

function _perfTabHeaders(data){
  var out=[], i, tab, band, value, tone;
  for(i=0;i<PERF_TABS.length;i++){
    tab=PERF_TABS[i];
    value=data.snapshot.endStats[tab.metric];
    band=getMetricBand(tab.metric, value);
    tone=band?band.tone:'neutral';
    out.push('<button type="button" class="rep-perf-tab band-'+tone+(i===_perfTab?' active':'')+
      '" data-perf-tab="'+i+'">'+escapeHTML(tab.label)+'</button>');
  }
  return '<div class="rep-perf-tabs" role="tablist">'+out.join('')+'</div>';
}

/* Finance figures follow one game-wide convention so income and expenditure can
   never be misread: income is a plain positive amount, expenditure carries an
   explicit minus. Colour (fin-income / fin-expenditure) and the panel's layout
   divider each carry the same distinction independently, so the split survives
   greyscale and colour-blindness. */
function _finMoney(v, kind){
  var mag='&pound;'+Math.abs(v).toFixed(1)+'m';
  return kind==='expenditure' ? '&#8722;'+mag : mag;
}

/* Variance shown by favourability, not raw arithmetic sign: a favourable
   movement (income over-recovery OR an underspend) reads "+", an adverse one
   reads "-", so the sign always agrees with the tone colour for both kinds. */
function _finVariance(r){
  var fav=r.kind==='income' ? r.variance : -r.variance;
  var sign=fav>0.05?'+':(fav<-0.05?'&#8722;':'');
  return sign+'&pound;'+Math.abs(fav).toFixed(1)+'m';
}

function _finRow(r){
  var cls=r.kind==='income'?'fin-income':'fin-expenditure';
  return '<tr class="rep-fin-line '+cls+'"><td>'+escapeHTML(r.label)+'</td>'+
    '<td>'+_finMoney(r.plan,r.kind)+'</td>'+
    '<td>'+_finMoney(r.value,r.kind)+'</td>'+
    '<td class="rep-perf-cell band-'+r.tone+'">'+_finVariance(r)+'</td></tr>';
}

function _perfFinancePanel(data){
  var ctx=_snapshotCtx(data.snapshot);
  var section=getReportSection('finance', data.snapshot.endStats, ctx);
  var budget=data.snapshot.endStats.budget;
  var band=getMetricBand('budget', budget);
  var near=getNearestThreshold('budget', budget);
  var income=[], spend=[], net=null, i, r;
  for(i=0;i<section.rows.length;i++){
    r=section.rows[i];
    if(r.id==='surplus'){ net=r; continue; }
    if(r.kind==='income') income.push(_finRow(r));
    else spend.push(_finRow(r));
  }
  /* The net position is the number a board acts on, so it is the dominant
     figure: its own footer row, below both blocks, sign-carrying and large. */
  var netRow=net ? ('<tr class="rep-fin-net band-'+net.tone+'"><td>'+escapeHTML(net.label)+'</td>'+
    '<td></td><td class="rep-perf-cell band-'+net.tone+'">'+_perfMoney(net.value,false)+'</td>'+
    '<td></td></tr>') : '';
  var bandLine='BUDGET '+(band?escapeHTML(band.label):'')+
    (near?(' &middot; '+Math.abs(near.distance).toFixed(1)+'m to '+escapeHTML(near.threshold.title)):'');
  return [
    '<div class="rep-perf-panel" role="tabpanel"'+(_perfTab===0?'':' hidden')+' data-perf-panel="0">',
      '<div class="rep-perf-note rep-perf-band band-'+(band?band.tone:'neutral')+'">'+bandLine+'</div>',
      '<table class="rep-perf-table rep-fin-table">',
        '<thead><tr><th>Line</th><th>Plan</th><th>Actual</th><th>Variance</th></tr></thead>',
        '<tbody>',
          '<tr class="rep-fin-subhead fin-income"><td colspan="4">Income</td></tr>',
          income.join(''),
          '<tr class="rep-fin-subhead fin-expenditure"><td colspan="4">Expenditure</td></tr>',
          spend.join(''),
        '</tbody>',
        '<tfoot>'+netRow+'</tfoot>',
      '</table>',
      '<p class="rep-perf-note">'+escapeHTML(section.commentary)+'</p>',
    '</div>'
  ].join('');
}

function _perfRowList(section){
  var out=[], i, r, cmt, lastCmt='';
  for(i=0;i<section.rows.length;i++){
    r=section.rows[i];
    /* The model returns commentary per figure (keyed off its source band);
       figures sharing a source share a line, so only show it on the first of a
       run to keep the tab reading as narrative rather than a repeated sentence. */
    cmt=r.commentary||'';
    if(cmt===lastCmt) cmt=''; else lastCmt=cmt;
    out.push('<div class="rep-perf-row"><span class="lbl">'+escapeHTML(r.label)+'</span>'+
      '<span class="val rep-perf-cell band-'+r.tone+'">'+_perfValueText(r)+'</span>'+
      '<span class="cmt">'+escapeHTML(cmt)+'</span></div>');
  }
  return '<div class="rep-perf-list">'+out.join('')+'</div>';
}

function _perfOperationsPanel(data){
  var ctx=_snapshotCtx(data.snapshot);
  var section=getReportSection('operations', data.snapshot.endStats, ctx);
  /* A trend needs at least two committed points. Q1 legitimately has a single
     datapoint (no decision recorded yet), so show an explicit insufficient-data
     state rather than a degenerate single-point chart. */
  var trend=hasWaitTrendData(data)
    ? '<div class="rep-perf-chartwrap"><canvas id="repWaitTrend" class="rep-perf-chart" width="480" height="180"></canvas></div>'
    : '<p class="rep-perf-nodata">Insufficient data for a trend: only one quarter has been recorded so far. '+
      'The waiting-times trend appears once a second quarter closes.</p>';
  return [
    '<div class="rep-perf-panel" role="tabpanel"'+(_perfTab===1?'':' hidden')+' data-perf-panel="1">',
      '<h4>Waiting-times trend</h4>',
      trend,
      _perfRowList(section),
      '<p class="rep-perf-note">'+escapeHTML(section.commentary)+'</p>',
    '</div>'
  ].join('');
}

/* True once there are at least two points to plot (the year-opening value plus
   one committed quarter close). Shared by the panel builder and the chart
   renderer so they agree on when a trend exists. */
function hasWaitTrendData(data){
  return !!(data && data.snapshot && data.snapshot.history && data.snapshot.history.length>=1);
}

function _perfWorkforcePanel(data){
  var ctx=_snapshotCtx(data.snapshot);
  var section=getReportSection('workforce', data.snapshot.endStats, ctx);
  var band=getMetricBand('morale', data.snapshot.endStats.morale);
  return [
    '<div class="rep-perf-panel" role="tabpanel"'+(_perfTab===2?'':' hidden')+' data-perf-panel="2">',
      '<div class="rep-perf-note rep-perf-band band-'+(band?band.tone:'neutral')+'">MORALE '+
        (band?escapeHTML(band.label):'')+'</div>',
      _perfRowList(section),
      '<p class="rep-perf-note">'+escapeHTML(section.commentary)+'</p>',
    '</div>'
  ].join('');
}

function _perfQualityPanel(data){
  var ctx=_snapshotCtx(data.snapshot);
  var section=getReportSection('quality', data.snapshot.endStats, ctx);
  var band=getMetricBand('safety', data.snapshot.endStats.safety);
  var alerts=(typeof getAlertsForDecisionQuarter==='function')
    ? getAlertsForDecisionQuarter(data.snapshot.quarterId) : [];
  var alertHtml='', i, a;
  if(alerts.length){
    var items=[];
    for(i=0;i<alerts.length;i++){
      a=alerts[i];
      items.push('<div class="rep-perf-alert sev-'+a.severity+'"><b>'+escapeHTML(a.title)+'</b> '+
        escapeHTML(a.line)+'</div>');
    }
    alertHtml='<div class="rep-perf-alerts">'+items.join('')+'</div>';
  }else{
    alertHtml='<p class="rep-perf-note">No threshold alerts were logged for this quarter.</p>';
  }
  return [
    '<div class="rep-perf-panel" role="tabpanel"'+(_perfTab===3?'':' hidden')+' data-perf-panel="3">',
      '<div class="rep-perf-note rep-perf-band band-'+(band?band.tone:'neutral')+'">SAFETY '+
        (band?escapeHTML(band.label):'')+'</div>',
      _perfRowList(section),
      alertHtml,
      '<p class="rep-perf-note">'+escapeHTML(section.commentary)+'</p>',
    '</div>'
  ].join('');
}

function _fillReportPerformance(data){
  return [
    '<div class="rep-paper rep-perf">',
      _reportPageHead('performance'),
      _perfTabHeaders(data),
      _perfFinancePanel(data),
      _perfOperationsPanel(data),
      _perfWorkforcePanel(data),
      _perfQualityPanel(data),
    '</div>'
  ].join('');
}

/* Waiting-times trend from the committed history (oldest first), rendered
   through the shared line-chart helper. The year-opening position is prepended
   so the first committed quarter reads as movement from the year's starting
   point (section 4: GAME.decisions[0].startStats, or initialMetricStats() when
   empty). Falls back to the single current value when no decisions exist yet.
   Lower is better, so the series is plotted directly on a 0..100 index. */
function _drawPerformanceCharts(data){
  var cv=$('repWaitTrend');
  /* The canvas is only emitted when there is a real trend to draw (see
     hasWaitTrendData); the single-datapoint case renders an insufficient-data
     note instead, so there is nothing to plot here. */
  if(!cv || !hasWaitTrendData(data)) return;
  var g=cv.getContext('2d');
  var h=data.snapshot.history, labels=[], values=[], i;

  /* opening value of the year, then each committed quarter's close */
  values.push(h[0].startStats.waiting);
  labels.push('OPEN');
  for(i=0;i<h.length;i++){
    values.push(h[i].endStats.waiting);
    labels.push(h[i].quarterId);
  }

  var W=480, H=180;
  var ss=Math.max(2, Math.ceil((window.devicePixelRatio||1)*2));
  if(cv.width!==W*ss){ cv.width=W*ss; cv.height=H*ss; }
  g.setTransform(ss,0,0,ss,0,0);

  var n=values.length;
  var xFrac=function(idx){ return n<=1 ? 0.5 : idx/(n-1); };
  var points=[], xLabels=[];
  for(i=0;i<n;i++){
    points.push({xFrac:xFrac(i), value:values[i]});
    xLabels.push({xFrac:xFrac(i), text:labels[i], align:'center'});
  }

  renderLineChart(g, {
    W:W, H:H, pad:{l:32, r:12, t:14, b:26}, maxV:100,
    yTicks:[0,25,50,75,100], font:'bold 9px "Courier New", monospace',
    colors:{bg:'#fbfcfe', grid:'#d4dae7', yLabel:'#42557a', xLabel:'#42557a'},
    yLabelDx:5, xLabelDy:5,
    series:[{color:'#23c4b4', width:2, points:points, marker:'all', markerSize:4}],
    xLabels:xLabels,
    frame:'axis', frameColor:'#141b30'
  });
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
