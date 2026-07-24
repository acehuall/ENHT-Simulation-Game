'use strict';
/* ---------- year end report overlay (phase 5) ----------
   The terminal screen of a session: a full-screen modal opened after the fourth
   quarter's decision is committed and the board presses the final advance. Five
   sections, revealed one at a time so a facilitator can pace the reveal in front
   of a room. Everything is DERIVED - GAME.stats, getStatsHistory(), GAME.alerts,
   GAME.roles, computeTrustRating(), evaluateAllRoles() - and nothing is written
   back (Stats_Spec §0). Structure mirrors ui/brief.js and ui/facilitator.js:
   DOM construction (not string templates), backdrop-click close, stored focus.

   Divergence from brief/facilitator, and it is deliberate: the year is over, so
   there is nothing left to resume. closeYearEnd() lands on the boardroom and
   STAYS PAUSED rather than restoring a prior run state - do not "fix" this into
   a _yearEndPrevPaused restore. All key bindings live in ui/controls.js (the Y
   toggle and the modal's hotkey suppression); this file only owns the small
   section-reveal navigation listener, following report-overlay.js's precedent.
------------------------------------------------------------------------ */

/* Authored debrief copy - vetted by a facilitator, never generated, same rule
   as REPORTING_COMMENTARY. The four verdict lines are the 2x2 of {trust rated
   Good+/not} x {roles mostly passed/not}. */
var YEAR_END_COPY = {
  title:'YEAR END REPORT',
  interimTitle:'INTERIM POSITION',
  sectionNames:['Final Position','Decision Timeline','CQC Rating','Role Scorecards','Board Verdict'],
  verdict:{
    goodPassed:'Collective and individual success aligned. The board held the trust together and every portfolio held its line - the year is a clean win to build on.',
    goodFailed:'The trust succeeded while individual portfolios suffered. Ask the room who absorbed the cost of the headline rating, and whether that trade was chosen or simply allowed to happen.',
    failPassed:'Every executive met their brief and the trust still failed. This is the most important slide in the game: individually rational choices did not add up to a safe, sustainable year. Whose job was the whole?',
    failFailed:'Both levels failed - the board and the portfolios went down together. Walk back through the timeline and find the quarter where the trust stopped steering.'
  },
  trustOnly:{
    good:'The trust closed the year rated well. No individual portfolios were played this run, so there are no scorecards to weigh against it.',
    fail:'The trust closed the year rated poorly. No individual portfolios were played this run - replay with a board assembled to see where the accountability sits.'
  },
  noRoles:'No board was assembled for this run (the pregame was skipped), so there are no individual scorecards. The trust rating above still stands.',
  provisional:'PROVISIONAL - the year is not complete; this rating is computed off the current position.'
};

/* Series inks for the full-year charts. Dark-overlay legible; distinct hues. */
var YE_SERIES_COLORS = {
  waiting:'#e9b44c', patsat:'#5fbf72', morale:'#23c4b4', safety:'#e05252', rep:'#9a93c9', budget:'#23c4b4'
};
/* The five 0..100 index metrics plotted together (budget is off-scale, drawn on
   its own -5..+2 chart). */
var YE_INDEX_KEYS = ['waiting','patsat','morale','safety','rep'];

var _yePrevFocus=null;
var _yeRevealed=1;      /* how many of the five sections are currently visible */

function _yeRoot(){ return $('yearEndRoot'); }

function isYearEndOpen(){
  var root=_yeRoot();
  return !!(root && !root.hidden);
}

/* ---- small formatting helpers (plain text for textContent) ---- */
function _yeMoney(v){
  return (v<-0.05?'−£':'£')+Math.abs(v).toFixed(1)+'m';
}
function _yeValueText(key, v){
  var def=(typeof getMetricDef==='function') ? getMetricDef(key) : null;
  return (def && def.money) ? _yeMoney(v) : String(Math.round(v));
}
/* Signed movement, direction-agnostic display. */
function _yeDeltaText(key, v){
  var def=(typeof getMetricDef==='function') ? getMetricDef(key) : null;
  if(Math.abs(v)<0.05) return '±0';
  if(def && def.money) return (v<0?'−£':'+£')+Math.abs(v).toFixed(1)+'m';
  return (v<0?'−':'+')+String(Math.abs(Math.round(v)));
}
/* Is a raw movement in the desirable direction for this metric? */
function _yeDeltaTone(key, v){
  var def=(typeof getMetricDef==='function') ? getMetricDef(key) : null;
  if(Math.abs(v)<0.05 || !def) return 'flat';
  return ((v>0)===!!def.goodUp) ? 'good' : 'bad';
}
function _yeBandToneClass(band){
  return 'band-'+((band && band.tone) || 'neutral');
}

function _yeLine(parent, cls, text){
  var el=document.createElement('div');
  el.className=cls;
  if(text!=null) el.textContent=text;
  parent.appendChild(el);
  return el;
}
function _yeChip(parent, cls, text){
  var el=document.createElement('span');
  el.className=cls;
  el.textContent=text;
  parent.appendChild(el);
  return el;
}

/* ---- shared derivation context for one build ---- */
function _yeContext(){
  var history=(typeof getStatsHistory==='function') ? getStatsHistory() : [];
  var endStats=(typeof GAME!=='undefined' && GAME.stats) ? GAME.stats
             : (typeof initialMetricStats==='function' ? initialMetricStats() : {});
  var startStats=history.length ? history[0].startStats
             : (typeof initialMetricStats==='function' ? initialMetricStats() : endStats);
  return {
    history:history,
    startStats:startStats,
    endStats:endStats,
    quarterCount:history.length,
    interim:history.length<4
  };
}

/* ---------- section builders ---------- */

function _yeSection(index, title){
  var sec=document.createElement('section');
  sec.className='ye-section';
  sec.setAttribute('data-ye-section', String(index));
  var head=document.createElement('div');
  head.className='ye-sec-head';
  var num=document.createElement('span');
  num.className='ye-sec-num';
  num.textContent=(index+1<10?'0':'')+(index+1);
  var h3=document.createElement('h3');
  h3.textContent=title;
  head.appendChild(num);
  head.appendChild(h3);
  sec.appendChild(head);
  return sec;
}

/* Section 1 - Final Position: six START -> END metric rows with band chips and
   raw bars, plus the full-year line charts. */
function _yeBuildFinalPosition(ctx){
  var sec=_yeSection(0, YEAR_END_COPY.sectionNames[0]);
  var defs=(typeof METRIC_DEFS!=='undefined') ? METRIC_DEFS : [];
  var rows=document.createElement('div');
  rows.className='ye-metric-rows';
  var i, def, s, e, d, band, row, bars, barWrap;
  for(i=0;i<defs.length;i++){
    def=defs[i];
    s=ctx.startStats[def.key];
    e=ctx.endStats[def.key];
    d=e-s;
    band=(typeof getMetricBand==='function') ? getMetricBand(def.key, e) : null;
    row=document.createElement('div');
    row.className='ye-metric-row';
    _yeLine(row, 'ye-metric-name', def.full || def.label);
    _yeLine(row, 'ye-metric-se', _yeValueText(def.key, s)+' → '+_yeValueText(def.key, e));
    var delta=_yeLine(row, 'ye-metric-delta '+_yeDeltaTone(def.key, d), _yeDeltaText(def.key, d));
    delta.classList.add('ye-'+_yeDeltaTone(def.key, d));
    if(band) _yeChip(row, 'ye-band '+_yeBandToneClass(band), band.label);
    /* raw bar: opening (ghost) vs closing, via the shared metric-visuals helper */
    barWrap=document.createElement('div');
    barWrap.className='ye-metric-bar';
    bars=document.createElement('i');
    bars.className='ye-bar last';
    bars.style.height=(typeof metricBarHeightPct==='function' ? metricBarHeightPct(def, s) : 4)+'%';
    barWrap.appendChild(bars);
    bars=document.createElement('i');
    bars.className='ye-bar cur';
    bars.style.height=(typeof metricBarHeightPct==='function' ? metricBarHeightPct(def, e) : 4)+'%';
    barWrap.appendChild(bars);
    row.appendChild(barWrap);
    rows.appendChild(row);
  }
  sec.appendChild(rows);

  /* charts: index metrics together (0..100), budget on its own axis */
  var charts=document.createElement('div');
  charts.className='ye-charts';

  var indexBox=document.createElement('div');
  indexBox.className='ye-chart-box';
  _yeLine(indexBox, 'ye-chart-title', 'INDEX METRICS (0–100)');
  var cvi=document.createElement('canvas');
  cvi.id='yeChartIndex';
  cvi.className='ye-chart';
  cvi.width=520; cvi.height=200;
  indexBox.appendChild(cvi);
  var legend=document.createElement('div');
  legend.className='ye-chart-legend';
  for(i=0;i<YE_INDEX_KEYS.length;i++){
    var span=document.createElement('span');
    var sw=document.createElement('i');
    sw.style.background=YE_SERIES_COLORS[YE_INDEX_KEYS[i]];
    span.appendChild(sw);
    var def2=getMetricDef(YE_INDEX_KEYS[i]);
    span.appendChild(document.createTextNode(def2 ? def2.label : YE_INDEX_KEYS[i]));
    legend.appendChild(span);
  }
  indexBox.appendChild(legend);
  charts.appendChild(indexBox);

  var budgetBox=document.createElement('div');
  budgetBox.className='ye-chart-box';
  _yeLine(budgetBox, 'ye-chart-title', 'BUDGET (£m, −5 to +2)');
  var cvb=document.createElement('canvas');
  cvb.id='yeChartBudget';
  cvb.className='ye-chart';
  cvb.width=520; cvb.height=200;
  budgetBox.appendChild(cvb);
  charts.appendChild(budgetBox);

  sec.appendChild(charts);
  return sec;
}

/* x labels + per-key value series from the committed history (OPEN, Q1..Qn),
   falling back to a single point when nothing is committed yet - the same
   fallback _drawPerformanceCharts uses. */
function _yeChartSeries(ctx, key){
  var vals=[], labels=[], i;
  if(ctx.history.length){
    vals.push(ctx.startStats[key]); labels.push('OPEN');
    for(i=0;i<ctx.history.length;i++){
      vals.push(ctx.history[i].endStats[key]);
      labels.push(ctx.history[i].quarterId);
    }
  }else{
    vals.push(ctx.endStats[key]); labels.push('NOW');
  }
  var n=vals.length, pts=[], xLabels=[], xf;
  for(i=0;i<n;i++){
    xf = n<=1 ? 0.5 : i/(n-1);
    pts.push({xFrac:xf, value:vals[i]});
    xLabels.push({xFrac:xf, text:labels[i], align:'center'});
  }
  return {points:pts, xLabels:xLabels};
}

function _yeDrawCharts(ctx){
  if(typeof renderLineChart!=='function') return;
  var colors={bg:'#0a0c13', grid:'#242b40', yLabel:'#8b94ab', xLabel:'#8b94ab'};
  var font='bold 9px "Courier New", monospace';
  var ss=Math.max(2, Math.ceil((window.devicePixelRatio||1)*2));
  var i, cvi=$('yeChartIndex');
  if(cvi){
    var gi=cvi.getContext('2d'), W=520, H=200;
    if(cvi.width!==W*ss){ cvi.width=W*ss; cvi.height=H*ss; }
    gi.setTransform(ss,0,0,ss,0,0);
    var series=[], xLabels=null;
    for(i=0;i<YE_INDEX_KEYS.length;i++){
      var s=_yeChartSeries(ctx, YE_INDEX_KEYS[i]);
      if(!xLabels) xLabels=s.xLabels;
      series.push({color:YE_SERIES_COLORS[YE_INDEX_KEYS[i]], width:2, points:s.points, marker:'all', markerSize:3});
    }
    renderLineChart(gi, {
      W:W, H:H, pad:{l:30, r:12, t:14, b:26}, maxV:100,
      yTicks:[0,25,50,75,100], font:font, colors:colors, yLabelDx:5, xLabelDy:5,
      series:series, xLabels:xLabels, frame:'axis', frameColor:'#3a4458'
    });
  }
  var cvb=$('yeChartBudget');
  if(cvb){
    var gb=cvb.getContext('2d'), W2=520, H2=200;
    if(cvb.width!==W2*ss){ cvb.width=W2*ss; cvb.height=H2*ss; }
    gb.setTransform(ss,0,0,ss,0,0);
    var bs=_yeChartSeries(ctx, 'budget');
    renderLineChart(gb, {
      W:W2, H:H2, pad:{l:34, r:12, t:14, b:26}, minV:-5, maxV:2,
      yTicks:[-5,-3,0,2], font:font, colors:colors, yLabelDx:5, xLabelDy:5,
      series:[{color:YE_SERIES_COLORS.budget, width:2, points:bs.points, marker:'all', markerSize:3}],
      xLabels:bs.xLabels, frame:'axis', frameColor:'#3a4458'
    });
  }
}

/* Section 2 - Decision Timeline: one row per committed decision with its impact
   chips and any alerts it fired. */
function _yeBuildTimeline(ctx){
  var sec=_yeSection(1, YEAR_END_COPY.sectionNames[1]);
  var decisions=(typeof GAME!=='undefined' && GAME.decisions) ? GAME.decisions : [];
  if(!decisions.length){
    _yeLine(sec, 'ye-empty', 'No decisions have been committed yet.');
    return sec;
  }
  var list=document.createElement('div');
  list.className='ye-timeline';
  var i, d, q, row, chips, chipData, c, alerts, a, alertBox;
  for(i=0;i<decisions.length;i++){
    d=decisions[i];
    q=(typeof getQuarterById==='function') ? getQuarterById(d.quarter) : null;
    row=document.createElement('div');
    row.className='ye-tl-row';
    var top=document.createElement('div');
    top.className='ye-tl-top';
    _yeChip(top, 'ye-tl-q', q ? (q.label || q.displayName || d.quarter) : d.quarter);
    _yeLine(top, 'ye-tl-title', d.title || d.optionId);
    row.appendChild(top);
    if(d.summary) _yeLine(row, 'ye-tl-summary', d.summary);

    chipData=(typeof _reportImpactChips==='function') ? _reportImpactChips(d.effects||{}) : [];
    if(chipData.length){
      chips=document.createElement('div');
      chips.className='ye-tl-chips';
      for(c=0;c<chipData.length;c++){
        _yeChip(chips, 'ye-chip ye-'+chipData[c].tone, chipData[c].text);
      }
      row.appendChild(chips);
    }

    alerts=(typeof getAlertsForDecisionQuarter==='function') ? getAlertsForDecisionQuarter(d.quarter) : [];
    if(alerts.length){
      alertBox=document.createElement('div');
      alertBox.className='ye-tl-alerts';
      for(a=0;a<alerts.length;a++){
        var al=document.createElement('div');
        al.className='ye-tl-alert sev-'+alerts[a].severity;
        var b=document.createElement('b');
        b.textContent=alerts[a].title;
        al.appendChild(b);
        al.appendChild(document.createTextNode(' '+alerts[a].line));
        alertBox.appendChild(al);
      }
      row.appendChild(alertBox);
    }
    list.appendChild(row);
  }
  sec.appendChild(list);
  return sec;
}

/* Section 3 - CQC Rating: the stamp, the auditable breakdown, the budget
   adjustment line, and any cap callout. */
function _yeBuildRating(ctx){
  var sec=_yeSection(2, YEAR_END_COPY.sectionNames[2]);
  var rating=(typeof computeTrustRating==='function') ? computeTrustRating(ctx.endStats) : null;
  if(!rating){ _yeLine(sec, 'ye-empty', 'Rating unavailable.'); return sec; }

  var stampWrap=document.createElement('div');
  stampWrap.className='ye-stamp-wrap';
  var stamp=document.createElement('div');
  stamp.className='ye-stamp '+_yeBandToneClass(rating.band);
  stamp.textContent=rating.band.stamp;
  stampWrap.appendChild(stamp);
  _yeLine(stampWrap, 'ye-stamp-score', 'SCORE '+rating.score.toFixed(1));
  if(ctx.interim) _yeLine(stampWrap, 'ye-provisional', YEAR_END_COPY.provisional);
  sec.appendChild(stampWrap);

  /* breakdown table - shows raw closing value AND the direction-normalised
     rating value, so the arithmetic is auditable and the waiting inversion is
     explicit rather than looking like a mistake. */
  var table=document.createElement('table');
  table.className='ye-breakdown';
  var thead=document.createElement('thead');
  thead.innerHTML='<tr><th>Metric</th><th>Closing</th><th>Rated</th><th>Weight</th><th>Contribution</th></tr>';
  table.appendChild(thead);
  var tbody=document.createElement('tbody');
  var i, r, tr, ratedText;
  for(i=0;i<rating.breakdown.length;i++){
    r=rating.breakdown[i];
    tr=document.createElement('tr');
    ratedText=String(Math.round(r.ratingValue))+(r.inverted?' (inv)':'');
    _yeTd(tr, r.label);
    _yeTd(tr, _yeValueText(r.key, r.value));
    _yeTd(tr, ratedText);
    _yeTd(tr, r.weight.toFixed(2));
    _yeTd(tr, r.contribution.toFixed(1));
    tbody.appendChild(tr);
  }
  /* base subtotal row */
  var subtotal=document.createElement('tr');
  subtotal.className='ye-breakdown-sub';
  _yeTd(subtotal, 'Weighted base');
  _yeTd(subtotal, '');
  _yeTd(subtotal, '');
  _yeTd(subtotal, '');
  _yeTd(subtotal, rating.baseScore.toFixed(1));
  tbody.appendChild(subtotal);
  table.appendChild(tbody);
  sec.appendChild(table);

  /* budget adjustment - shown even when zero */
  var adj=rating.adjustment;
  var adjText = (adj.amount!==0 && adj.reason)
    ? adj.reason+' (score '+rating.baseScore.toFixed(1)+' → '+rating.score.toFixed(1)+')'
    : 'No budget adjustment: the closing position is between −£3.0m and +£1.0m.';
  _yeLine(sec, 'ye-adjust', adjText);

  /* cap callout - the sustainability lesson; never a footnote */
  if(rating.caps.length){
    var callout=document.createElement('div');
    callout.className='ye-caps';
    _yeLine(callout, 'ye-caps-head', 'RATING CAPPED');
    var seen={}, c, cap, key, ev;
    for(c=0;c<rating.caps.length;c++){
      cap=rating.caps[c].cap;
      if(seen[cap.id]) continue;
      seen[cap.id]=true;
      key=rating.caps[c].evidenceKey;
      ev=(typeof getMetricDef==='function' && getMetricDef(key))
        ? (getMetricDef(key).label+' closed at '+_yeValueText(key, rating.caps[c].evidenceValue)) : '';
      var line=document.createElement('div');
      line.className='ye-cap-line';
      var strong=document.createElement('b');
      strong.textContent=cap.line;
      line.appendChild(strong);
      if(ev) line.appendChild(document.createTextNode(' — '+ev));
      callout.appendChild(line);
    }
    if(rating.cappedFrom){
      _yeLine(callout, 'ye-cap-from', 'Un-capped this would have rated '+rating.cappedFrom.label+'.');
    }
    sec.appendChild(callout);
  }
  return sec;
}
function _yeTd(tr, text){
  var td=document.createElement('td');
  td.textContent=text;
  tr.appendChild(td);
  return td;
}

/* Section 4 - Role Scorecards: one card per selected role, degrading to a
   responsive grid at six. Empty board -> one explanatory line, no empty grid. */
function _yeBuildScorecards(ctx){
  var sec=_yeSection(3, YEAR_END_COPY.sectionNames[3]);
  var results=(typeof evaluateAllRoles==='function') ? evaluateAllRoles() : [];
  if(!results.length){
    _yeLine(sec, 'ye-empty', YEAR_END_COPY.noRoles);
    return sec;
  }
  var grid=document.createElement('div');
  grid.className='ye-cards'+(results.length>3?' ye-cards-dense':'');
  var i, j, rr, role, card, band, res, obj, objRow, tickCls, tickTxt;
  for(i=0;i<results.length;i++){
    rr=results[i];
    role=rr.role;
    card=document.createElement('div');
    card.className='ye-card';
    if(role.accent) card.style.borderLeftColor=role.accent;

    var head=document.createElement('div');
    head.className='ye-card-head';
    _yeLine(head, 'ye-card-name', role.name);
    band=(typeof getMetricBand==='function') ? getMetricBand(role.primaryKey, ctx.endStats[role.primaryKey]) : null;
    if(band) _yeChip(head, 'ye-band '+_yeBandToneClass(band), band.label);
    card.appendChild(head);

    for(j=0;j<rr.results.length;j++){
      res=rr.results[j];
      obj=res.objective;
      objRow=document.createElement('div');
      objRow.className='ye-obj ye-obj-'+res.status;
      var meta=document.createElement('div');
      meta.className='ye-obj-meta';
      tickCls = res.status==='fail' ? 'ye-tick-fail' : (res.status==='marginal' ? 'ye-tick-marginal' : 'ye-tick-pass');
      tickTxt = res.status==='fail' ? '✗ FAIL' : (res.status==='marginal' ? '~ MARGINAL' : '✓ PASS');
      _yeChip(meta, 'ye-tick '+tickCls, tickTxt);
      _yeLine(meta, 'ye-obj-target', (typeof formatObjectiveTarget==='function' ? formatObjectiveTarget(obj) : ''));
      _yeChip(meta, 'ye-obj-weight', '×'+obj.weight);
      objRow.appendChild(meta);
      _yeLine(objRow, 'ye-obj-label', obj.label);
      var actualTxt = (res.actual==null) ? 'no data'
        : ('Actual '+ (obj.type==='delta' ? _yeDeltaText(obj.key, res.actual) : _yeValueText(obj.key, res.actual)));
      _yeLine(objRow, 'ye-obj-actual', actualTxt);
      /* authored outcome line: marginal is a scrape-through pass, so it reads
         the pass line but stays visually distinct via ye-obj-marginal. */
      var outcomeLine = res.status==='fail' ? obj.fail : obj.pass;
      if(outcomeLine) _yeLine(objRow, 'ye-obj-outcome', outcomeLine);
      card.appendChild(objRow);
    }

    var foot=document.createElement('div');
    foot.className='ye-card-foot';
    _yeLine(foot, 'ye-card-score', 'SCORE '+Math.round(rr.weightedScore)+' / 100');
    _yeChip(foot, 'ye-card-verdict', rr.verdict);
    card.appendChild(foot);
    grid.appendChild(card);
  }
  sec.appendChild(grid);
  return sec;
}

/* Section 5 - Board Verdict: the authored debrief line plus the year's headline
   figures (alerts by severity, worst band reached, biggest movers). */
function _yeBuildVerdict(ctx){
  var sec=_yeSection(4, YEAR_END_COPY.sectionNames[4]);
  var rating=(typeof computeTrustRating==='function') ? computeTrustRating(ctx.endStats) : null;
  var results=(typeof evaluateAllRoles==='function') ? evaluateAllRoles() : [];
  var ratingGood = rating && (rating.band.id==='good' || rating.band.id==='outstanding');

  var line;
  if(!results.length){
    line = ratingGood ? YEAR_END_COPY.trustOnly.good : YEAR_END_COPY.trustOnly.fail;
  }else{
    var passed=0, k;
    for(k=0;k<results.length;k++){
      if(results[k].verdict==='MET' || results[k].verdict==='EXCEEDED') passed++;
    }
    var mostlyPassed = passed*2 >= results.length;   /* simple majority */
    if(ratingGood) line = mostlyPassed ? YEAR_END_COPY.verdict.goodPassed : YEAR_END_COPY.verdict.goodFailed;
    else           line = mostlyPassed ? YEAR_END_COPY.verdict.failPassed : YEAR_END_COPY.verdict.failFailed;
  }
  _yeLine(sec, 'ye-verdict-line', line);

  /* headline figures */
  var figs=document.createElement('div');
  figs.className='ye-figs';

  var alerts=(typeof GAME!=='undefined' && GAME.alerts) ? GAME.alerts : [];
  var sev={critical:0, warn:0, praise:0}, i;
  for(i=0;i<alerts.length;i++){ if(sev.hasOwnProperty(alerts[i].severity)) sev[alerts[i].severity]++; }
  _yeFig(figs, 'Alerts fired', sev.critical+' critical · '+sev.warn+' warning · '+sev.praise+' praise');

  _yeFig(figs, 'Worst band reached', _yeWorstBand(ctx));

  var movers=_yeMovers(ctx);
  _yeFig(figs, 'Most improved', movers.up);
  _yeFig(figs, 'Most deteriorated', movers.down);

  sec.appendChild(figs);
  return sec;
}
function _yeFig(parent, label, value){
  var box=document.createElement('div');
  box.className='ye-fig';
  _yeLine(box, 'ye-fig-label', label);
  _yeLine(box, 'ye-fig-value', value);
  parent.appendChild(box);
  return box;
}

/* Worst tone any metric reached at any committed quarter close. */
function _yeWorstBand(ctx){
  if(!ctx.history.length || typeof getMetricBand!=='function') return '—';
  var defs=(typeof METRIC_DEFS!=='undefined') ? METRIC_DEFS : [];
  var worstRank=5, worstBand=null, worstKey=null, worstQ=null, i, j, def, band, rank;
  for(i=0;i<ctx.history.length;i++){
    for(j=0;j<defs.length;j++){
      def=defs[j];
      band=getMetricBand(def.key, ctx.history[i].endStats[def.key]);
      rank=(typeof getToneRank==='function') ? getToneRank(band && band.tone) : 2;
      if(rank<worstRank){ worstRank=rank; worstBand=band; worstKey=def.label; worstQ=ctx.history[i].quarterId; }
    }
  }
  if(!worstBand) return '—';
  return worstBand.label+' ('+worstKey+', '+worstQ+')';
}

/* Biggest desirable / adverse full-year movers, normalised by each metric's
   range so budget (£m) and the index metrics are comparable. */
function _yeMovers(ctx){
  var defs=(typeof METRIC_DEFS!=='undefined') ? METRIC_DEFS : [];
  var bestUp=-Infinity, bestDown=Infinity, upKey=null, downKey=null, upRaw=0, downRaw=0, i, def, raw, good, frac, range;
  for(i=0;i<defs.length;i++){
    def=defs[i];
    raw=ctx.endStats[def.key]-ctx.startStats[def.key];
    good = def.goodUp ? raw : -raw;             /* desirability-signed movement */
    range=(def.max-def.min) || 1;
    frac=good/range;
    if(frac>bestUp){ bestUp=frac; upKey=def; upRaw=raw; }
    if(frac<bestDown){ bestDown=frac; downKey=def; downRaw=raw; }
  }
  return {
    up:   upKey   ? (upKey.label+'  '+_yeDeltaText(upKey.key, upRaw))     : '—',
    down: downKey ? (downKey.label+'  '+_yeDeltaText(downKey.key, downRaw)) : '—'
  };
}

/* ---------- reveal + assembly ---------- */

function _yeSyncReveal(){
  var root=_yeRoot();
  if(!root) return;
  var secs=root.querySelectorAll('.ye-section'), i;
  var total=secs.length;
  if(_yeRevealed>total) _yeRevealed=total;
  if(_yeRevealed<1) _yeRevealed=1;
  for(i=0;i<secs.length;i++) secs[i].hidden = i>=_yeRevealed;
  var ind=root.querySelector('.ye-progress');
  if(ind) ind.textContent='SECTION '+_yeRevealed+' / '+total;
  var cont=root.querySelector('.ye-continue');
  var showAll=root.querySelector('.ye-showall');
  var done=_yeRevealed>=total;
  if(cont) cont.hidden=done;
  if(showAll) showAll.hidden=done;
  /* keep the newest section in view */
  var last=secs[_yeRevealed-1];
  if(last && last.scrollIntoView) last.scrollIntoView({block:'nearest'});
}

function _yeAdvance(){
  _yeRevealed++;
  _yeSyncReveal();
}
function _yeRevealAll(){
  var root=_yeRoot();
  var secs=root ? root.querySelectorAll('.ye-section') : [];
  _yeRevealed=secs.length || 5;
  _yeSyncReveal();
}

function _buildYearEnd(){
  var root=_yeRoot();
  if(!root) return;
  var ctx=_yeContext();
  root.innerHTML='';
  _yeRevealed=1;

  var modal=document.createElement('div');
  modal.className='ye-modal';

  /* Backdrop click (but not the modal itself) closes. Assigned, not added, so a
     rebuild never stacks listeners (edge case §7: opened twice). */
  root.onclick=function(e){ if(e.target===root) closeYearEnd(); };

  /* header */
  var top=document.createElement('div');
  top.className='ye-top';
  var h2=document.createElement('h2');
  h2.id='yeTitle';
  h2.textContent = ctx.interim
    ? (YEAR_END_COPY.interimTitle+' — '+ctx.quarterCount+' OF 4 QUARTERS')
    : YEAR_END_COPY.title;
  var sub=document.createElement('span');
  sub.className='ye-sub';
  sub.textContent=(typeof PREGAME!=='undefined' && PREGAME.headerTitle) ? PREGAME.headerTitle : 'NORTHBROOK GENERAL HOSPITAL';
  top.appendChild(h2);
  top.appendChild(sub);
  modal.appendChild(top);

  /* body: all five sections, revealed progressively */
  var body=document.createElement('div');
  body.className='ye-body';
  body.appendChild(_yeBuildFinalPosition(ctx));
  body.appendChild(_yeBuildTimeline(ctx));
  body.appendChild(_yeBuildRating(ctx));
  body.appendChild(_yeBuildScorecards(ctx));
  body.appendChild(_yeBuildVerdict(ctx));
  modal.appendChild(body);

  /* footer: pacing controls on the left, terminal actions on the right */
  var foot=document.createElement('div');
  foot.className='ye-foot';
  var pace=document.createElement('div');
  pace.className='ye-pace';
  _yeLine(pace, 'ye-progress', '');
  var cont=document.createElement('button');
  cont.type='button'; cont.className='btn ye-continue'; cont.textContent='Continue →';
  cont.onclick=_yeAdvance;
  pace.appendChild(cont);
  var showAll=document.createElement('button');
  showAll.type='button'; showAll.className='btn ye-showall'; showAll.textContent='Show all';
  showAll.onclick=_yeRevealAll;
  pace.appendChild(showAll);
  foot.appendChild(pace);

  var actions=document.createElement('div');
  actions.className='ye-actions';
  var newGame=document.createElement('button');
  newGame.type='button'; newGame.className='btn ye-newgame'; newGame.textContent='New Game';
  newGame.onclick=function(){ if(typeof confirmNewGame==='function') confirmNewGame(); };
  actions.appendChild(newGame);
  var printBtn=document.createElement('button');
  printBtn.type='button'; printBtn.className='btn ye-print'; printBtn.textContent='Print / Export';
  printBtn.onclick=function(){ _yeRevealAll(); if(typeof window.print==='function') window.print(); };
  actions.appendChild(printBtn);
  var closeBtn=document.createElement('button');
  closeBtn.type='button'; closeBtn.className='btn ye-close'; closeBtn.textContent='Close';
  closeBtn.onclick=closeYearEnd;
  actions.appendChild(closeBtn);
  foot.appendChild(actions);

  modal.appendChild(foot);
  root.appendChild(modal);

  _yeDrawCharts(ctx);
  _yeSyncReveal();
}

function openYearEnd(){
  var root=_yeRoot();
  if(!root) return;
  /* The board pack is a spent instrument after Q4; drop it before we take over
     the screen (§4.4). */
  if(typeof closeReport==='function') closeReport();
  _yePrevFocus=(document.activeElement && document.activeElement.blur) ? document.activeElement : null;
  /* Rebuild from scratch every open so a replay never inherits stale DOM. */
  _buildYearEnd();
  root.hidden=false;
  /* The year is over: pause and leave it paused. Nothing runs behind this. */
  paused=true;
  if(typeof syncPauseButton==='function') syncPauseButton();
  var focusBtn=root.querySelector('.ye-continue:not([hidden])') || root.querySelector('.ye-newgame');
  if(focusBtn) focusBtn.focus();
}

function closeYearEnd(){
  var root=_yeRoot();
  if(!root || root.hidden) return;
  root.hidden=true;
  /* Land on the boardroom - the game's natural resting scene and the right
     backdrop for the debrief conversation. Unlike brief/facilitator we do NOT
     restore a prior paused state: the year is finished, there is nothing to
     resume, so we stay paused. Do not turn this into a _yearEndPrevPaused
     restore. */
  if(typeof setScene==='function') setScene('boardRoom');
  paused=true;
  if(typeof syncPauseButton==='function') syncPauseButton();
  if(_yePrevFocus && document.contains(_yePrevFocus)){
    _yePrevFocus.focus();
  }
  _yePrevFocus=null;
}

function toggleYearEnd(){
  if(isYearEndOpen()) closeYearEnd();
  else openYearEnd();
}

/* Section-reveal navigation. Self-contained (like report-overlay.js's tab-arrow
   listener) so it can act while controls.js suppresses every other hotkey; only
   fires while the overlay owns the screen. Escape is handled in controls.js. */
document.addEventListener('keydown', function(e){
  if(!isYearEndOpen()) return;
  if(e.key==='ArrowRight' || e.key===' ' || e.key==='Spacebar'){
    e.preventDefault();
    _yeAdvance();
  }else if(e.key==='ArrowLeft'){
    e.preventDefault();
    if(_yeRevealed>1){ _yeRevealed--; _yeSyncReveal(); }
  }
});
