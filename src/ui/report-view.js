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
  var ml=simMonthLength();
  var snap={
    outcome:    outcome,
    quarterId:  outcome.quarterId,
    optionId:   outcome.optionId,
    startStats: outcome.startStats,
    endStats:   outcome.endStats,
    history:    (typeof getStatsHistory==='function' ? getStatsHistory() : []),

    /* new: intra-quarter month closes, captured once at pack-open time */
    monthEnds:[
      {id:'M1', label:'M1', stats:getMetricSnapshotAt(ml)},
      {id:'M2', label:'M2', stats:getMetricSnapshotAt(ml*2)},
      {id:'M3', label:'M3', stats:getMetricSnapshotAt(QLEN)}
    ],
    signature:null
  };
  snap.signature=reportSnapshotSignature(snap);
  return snap;
}

/* A cheap stable fingerprint of the frozen snapshot (quarter, option and every
   metric close). No consumer yet - it exists so per-tab lazy rendering can
   detect a stale canvas later without a snapshot-shape migration. */
function reportSnapshotSignature(s){
  var parts=[s.quarterId, s.optionId], i, key;
  for(i=0;i<METRIC_DEFS.length;i++){
    key=METRIC_DEFS[i].key;
    parts.push(key+':'+s.endStats[key]);
  }
  return parts.join('|');
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

/* .rep-paper is Courier New (base.css), which renders the &pound; and &#8722;
   entities correctly, and the result is inserted raw (never through
   escapeHTML), so the entities resolve to a real "-£1.8m". The canvas font in
   scenario-data.js still needs the GBP fallback, so fmtMoney() is left alone -
   this is the one report-layer caller. */
function _metricDisplay(metric, value){
  return metric.money ? fmtMoney(value) : String(Math.round(value));
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
                cannot be done from an HTML string.
   period:      which temporal frame the page describes - 'outcome' for a
                closed quarter, 'decision' for the live one. Drives the
                period strip under the heading. A page with no `period`
                gets no strip.
   titleFor:    optional (data) -> string, overriding `title` for this
                pack. `title` stays a plain string and remains the default:
                the descriptor list is read as data (the page titles are
                asserted straight off it), and a function-valued `title`
                turns that into an undefined. */
var REPORT_PAGES=[
  {id:'results',     title:'Prior Quarter Results', period:'outcome',
   /* At Q1 there is no prior quarter, so the static title claims either that a
      decision has already been taken or that there is an earlier playable
      period. Naming it the opening position also gives the flat Q1 pack an
      honest account of its own flatness. */
   titleFor:function(data){
     return _isBaselinePack(data) ? 'Opening Board Position' : 'Prior Quarter Results';
   },
   build:_fillReportPage1,
   afterRender:function(data){ _drawBoardBalanceRadar(data); }},
  {id:'performance', title:'Performance Analysis',  period:'outcome', build:_fillReportPerformance,
   afterRender:function(data){ _drawPerformanceCharts(data); _drawOccupancyGauge(data); }},
  {id:'issue',       title:'Issue At Hand',         period:'decision', build:_fillReportPage2,
   afterRender:function(data){ _drawReportIssueChart(data.issue); }},
  {id:'options',     title:'Options For Decision',  period:'decision', build:_fillReportPage3}
];

/* True when pages 1-2 describe the opening board position rather than the outcome
   of a committed decision. _reportSnapshot() falls back to DEFAULT_OUTCOME before
   the first decision, whose quarterId is the sentinel 'Q0' - an id that is not in
   QUARTERS. hasQuarter() is the non-warning way to detect that; getQuarterById()
   would warn and hand back Q1, labelling the Q1 baseline as a prior Q1 decision.
   The string 'Q0' must never reach the page. */
function _isBaselinePack(data){
  return _isBaselineSnapshot(data ? data.snapshot : null);
}

/* Same test against a bare snapshot, for the radar builders - they are handed a
   snapshot rather than the whole pack data object. */
function _isBaselineSnapshot(snapshot){
  var outcome=snapshot ? snapshot.outcome : null;
  if(!outcome) return true;
  if(typeof hasQuarter==='function') return !hasQuarter(outcome.quarterId);
  return outcome.quarterId===DEFAULT_OUTCOME.quarterId;
}

/* ---------- period strip (X5) ----------
   The pack presents three temporal frames at once and used to name exactly one:
   the header chip carried the current decision quarter, while pages 1-2 (this
   quarter's month closes, driven by the PREVIOUSLY committed decision) were
   headed with the static string 'Prior Quarter Results' and pages 3-4 (the
   current quarter's issue and options) said nothing at all. A player could
   reasonably read the Q3 Finance tab as the live Q3 situation. The footer did
   carry the prior decision, but in small type at the bottom of the modal.

   One short line under each page heading, with a stable text label rather than
   colour alone. One line, not a paragraph: page 1 has no height budget for prose
   (see the note on _reportMetricCard). */
function _reportPeriodStrip(period, data){
  var label, name, q;
  if(period==='outcome'){
    if(_isBaselinePack(data)){
      /* States the absence rather than implying a decision, matching the
         'Opening Board Position' title. */
      label='BASELINE POSITION'; name='NO PRIOR DECISION';
    }else{
      q=getQuarterById(data.snapshot.outcome.quarterId);
      label='OUTCOME REPORTED';
      /* Uppercased to match how _showRecordedDecision() prints the same title in
         the footer. */
      name=q.label+' - '+String(data.snapshot.outcome.optionTitle||'').toUpperCase();
    }
  }else if(period==='decision'){
    label='DECISION REQUIRED';
    name=data.quarter.displayName;
  }else{
    return '';
  }
  return '<div class="rep-period"><b>'+escapeHTML(label)+'</b>'+
         '<span>&middot; '+escapeHTML(name)+'</span></div>';
}

function _reportPageHead(pageId, data){
  var i, n, p, title;
  for(i=0;i<REPORT_PAGES.length;i++){
    if(REPORT_PAGES[i].id===pageId){
      p=REPORT_PAGES[i]; n=i+1;
      title=(typeof p.titleFor==='function' && data) ? p.titleFor(data) : p.title;
      return '<div class="rep-page-head"><span>'+
             (n<10?'0':'')+n+'</span><h3>'+
             escapeHTML(title)+'</h3></div>'+
             _reportPeriodStrip(p.period, data);
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
        /* Just the masthead. It used to read "... - DECISION REQUIRED" above all
           four pages, which contradicts the OUTCOME REPORTED strip on pages 1-2
           at the top of the same screen - the ambiguity the strips exist to
           remove. The per-page strip carries the distinction now. */
        '<div class="rep-sub">QUARTERLY BOARD PACK</div></div>',
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

/* ---------- board balance radar (page 1) ----------
   Six metrics in five different units cannot share one axis, so every spoke
   plots getMetricHealthScore() rather than the raw value. That normalisation
   is why the "further outward is better" subtitle is mandatory and not
   decoration: without it the chart reads as raw values, which inverts the
   meaning of the waiting axis - exactly the misreading normalisation exists to
   prevent.

   The two rings are quarter OPEN and quarter CLOSE, the same window the six
   metric cards beside them read. They used to be Month 2 and Month 3, on the
   argument that the board's question on page 1 is which way the quarter was
   travelling as it ended. That is a real argument, and it lost: a full-quarter
   comparison and a single-month comparison sat adjacent on one page, always
   disagreeing in magnitude and sometimes in direction, with no shared label. A
   reader assumes two neighbouring panels share a basis, and the radar's own
   legend is not enough to overturn that.

   The intra-quarter trend is retained as context, not as the headline: page 2's
   waiting-pressure chart plots OPEN/M1/M2/M3 and declares its own time base, and
   the month closes stay in the snapshot. The window is now labelled once for the
   whole page by the X5 period strip, which is why no second caption is added to
   the metric grid.

   The opening ring IS the previous quarter's close - startStats is the position
   the Trust held before this quarter's decision was applied - so the chart is
   read as "where the board was, and where it is now". The legend says exactly
   that rather than "quarter open", which described the same numbers in a frame
   nobody reads them in. */

/* Previous quarter in inert grey, this quarter in the live teal. Both carry a
   translucent fill: the grey area is what makes a CONTRACTION legible - without
   it a spoke that fell shows only as a teal line sitting inside a thin dashed
   one, which reads as noise at this size. Alphas are kept low enough that the
   overlap (most of the chart, most quarters) does not turn muddy, and the two
   are still told apart by line style alone for greyscale printing. */
var RADAR_PRIOR_COLOR='#98a3bd';
var RADAR_PRIOR_FILL='rgba(152,163,189,.22)';
var RADAR_LATEST_COLOR='#23c4b4';
var RADAR_LATEST_FILL='rgba(35,196,180,.16)';

/* Band tones as PAPER inks, matching .rep-perf-cell.band-{tone} in ui.css exactly.
   Canvas cannot read a CSS class, so the two lists have to be kept in step by
   hand; a mismatch shows up as a gauge arc that disagrees with the tone of the
   figure printed under it. */
var REPORT_TONE_INK = {
  critical:'#e05252', warn:'#b07d10', neutral:'#1a2236',
  good:'#1e8f4e',     great:'#0f8f82'
};

/* The quarter, open to close - exactly the window _reportMetricValues() gives the
   six cards beside the radar, so a card and its spoke can never disagree about
   which period they describe. `prior` is the position carried in from the
   previous quarter's close; `latest` is where this quarter ended. */
function _radarStatsPair(snapshot){
  return { prior: snapshot.startStats, latest: snapshot.endStats };
}

function _radarScores(stats){
  var out=[], i, key;
  for(i=0;i<METRIC_DEFS.length;i++){
    key=METRIC_DEFS[i].key;
    out.push(getMetricHealthScore(key, stats[key]));
  }
  return out;
}

/* Health-score movement for one metric, in words. The scores are normalised so
   higher is always better, which is why this says improved/weakened rather than
   up/down - "waiting times up 4" would be read as a deterioration on a scale
   where it is an improvement. Below a point of movement it says unchanged: the
   card grid beside it applies the same floor (MOVEMENT_EPSILON). */
function _radarScoreMovement(key, prior, latest){
  var d=getMetricHealthScore(key, latest)-getMetricHealthScore(key, prior);
  if(Math.abs(d)<1) return 'unchanged on the previous quarter';
  return (d>0?'improved ':'weakened ')+Math.round(Math.abs(d))+' on the previous quarter';
}

/* The six cards beside the radar already carry every figure as text, so to a
   screen-reader user the chart is duplication - that is the correct
   relationship for a decorative-but-informative graphic, and the reason this
   is a one-line summary rather than a data table. The same string is used as
   the <canvas> fallback content for the no-canvas case.

   The movement clause is what makes the text carry the SAME information as the
   chart: once the grey ring is the point of the graphic, a list of closing
   scores alone is a smaller reading of it than a sighted user gets. At the
   baseline pack there is no previous quarter, so the clause is dropped rather
   than printed as six "unchanged"s. */
function _radarAccessibleText(snapshot){
  var pair=_radarStatsPair(snapshot);
  var baseline=_isBaselineSnapshot(snapshot);
  var parts=[], i, def, score;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    score=Math.round(getMetricHealthScore(def.key, pair.latest[def.key]));
    parts.push(def.full+' '+score+
      (baseline ? '' : ', '+_radarScoreMovement(def.key, pair.prior[def.key], pair.latest[def.key])));
  }
  if(baseline){
    return 'Board balance at the opening position, before any decision. '+
           'Normalised health out of 100, higher is better: '+parts.join(', ')+'.';
  }
  return 'Board balance at quarter close, compared with the previous quarter close. '+
         'Normalised health out of 100, higher is better: '+parts.join(', ')+'.';
}

/* The legend is the only thing naming which ring is which, so it states the
   colour as well as the line style - "grey" is what a player looking at the
   chart actually has to match, and the line style is what survives a greyscale
   print of the pack. At the baseline pack there is no second ring to name, and
   saying so is what stops a single shape reading as a chart that failed to draw
   its comparison.

   One <span> per key, not one run of text with separators: the strip is
   narrower than the two keys laid end to end at most window widths, and a
   single string wraps mid-key ("... THIS QUARTER / (SOLID)"). As flex items
   each key wraps whole. */
function _radarLegendText(snapshot){
  if(_isBaselineSnapshot(snapshot)){
    return '<span>Opening position &mdash; no previous quarter to compare</span>';
  }
  return '<span>Grey dashed &mdash; previous quarter</span>'+
         '<span>Teal solid &mdash; this quarter</span>';
}

function _reportRadarBlock(snapshot){
  var text=_radarAccessibleText(snapshot);
  return [
    '<div class="rep-radar-wrap">',
      '<h4>Board balance &mdash; normalised health</h4>',
      '<p class="rep-radar-sub">Further outward is better on every axis.</p>',
      '<canvas id="repBalanceRadar" class="rep-radar" width="360" height="300"',
        ' role="img" aria-label="'+escapeHTML(text)+'">'+escapeHTML(text)+'</canvas>',
      '<p class="rep-radar-legend">'+_radarLegendText(snapshot)+'</p>',
    '</div>'
  ].join('');
}

function _drawBoardBalanceRadar(data){
  var cv=$('repBalanceRadar');
  /* Guarded so a failure to load report-infographics.js costs the chart, not
     the whole board pack. */
  if(!cv || typeof renderRadarChart!=='function') return null;
  var pair=_radarStatsPair(data.snapshot), axes=[], series=[], i;
  for(i=0;i<METRIC_DEFS.length;i++) axes.push({label:METRIC_DEFS[i].label});

  /* The baseline pack has no previous quarter: startStats and endStats are the
     same numbers, so a second series would draw a grey dashed fringe exactly
     under the teal one and invite the reading that the quarter moved by a
     hair. One ring, and a legend that says why. */
  if(!_isBaselineSnapshot(data.snapshot)){
    series.push({values:_radarScores(pair.prior), color:RADAR_PRIOR_COLOR, width:1.5,
                 dash:[4,3], fill:RADAR_PRIOR_FILL, marker:'hollow', markerSize:3});
  }
  /* Drawn last, so the live position reads over the grey wherever they cross. */
  series.push({values:_radarScores(pair.latest), color:RADAR_LATEST_COLOR, width:2,
               fill:RADAR_LATEST_FILL, marker:'filled', markerSize:3});

  return renderRadarChart(cv, {axes:axes, series:series});
}

/* The standing position, in one line, read before anything else on the page.
   Carries no alert text on purpose: the strip is where the Trust IS, the list
   under it is what HAPPENED. Mixing the two is what made the old page 1
   unreadable in twenty seconds. */
function _reportPostureStrip(snapshot){
  var posture=getBoardPosture(snapshot.endStats);
  var def=posture.worstKey ? getMetricDef(posture.worstKey) : null;
  var counts=[];
  if(posture.criticalCount) counts.push(posture.criticalCount+' critical');
  if(posture.warnCount) counts.push(posture.warnCount+' under warning');
  if(!counts.length) counts.push('no metric in a failing band');
  return '<div class="rep-posture band-'+posture.tone+'">'+
    '<b>'+escapeHTML(posture.label)+'</b>'+
    '<span>'+escapeHTML(counts.join(', '))+
      (def ? ' &middot; main pressure: '+escapeHTML(def.full||def.label) : '')+
    '</span></div>';
}

/* Three is the cap because page 1 is a headline, not a log. */
var REPORT_ALERT_LIMIT=3;

/* The Patient & Safety tab lists these same alerts in full. The duplication is
   deliberate: page 1 has to work as a standalone twenty-second read, and
   "a constitutional standard was breached" cannot be something the board only
   discovers by paging into a tab. */
function _reportAlertList(snapshot){
  var alerts=(typeof getAlertsForDecisionQuarter==='function')
    ? getAlertsForDecisionQuarter(snapshot.quarterId) : [];
  if(!alerts.length){
    /* Every Q1 pack lands here by construction - alerts are only recorded when
       a decision is committed, so the opening quarter has none. */
    return '<p class="rep-alert-empty">No threshold breaches recorded during this period.</p>';
  }
  /* Same critical -> warn -> praise ordering the live alert queue uses; there
     is no second ordering in the codebase and there should not be. */
  var rank=(typeof _severityRank==='function') ? _severityRank : function(){ return 9; };
  var ranked=alerts.slice().sort(function(a,b){ return rank(a.severity)-rank(b.severity); });
  var items=[], i, a;
  for(i=0;i<ranked.length && i<REPORT_ALERT_LIMIT;i++){
    a=ranked[i];
    items.push('<div class="rep-alert-item sev-'+a.severity+'"><b>'+escapeHTML(a.title)+'</b>'+
      '<span>'+escapeHTML(a.line)+'</span></div>');
  }
  if(ranked.length>REPORT_ALERT_LIMIT){
    items.push('<p class="rep-alert-more">+'+(ranked.length-REPORT_ALERT_LIMIT)+' further events</p>');
  }
  return '<div class="rep-alert-list">'+items.join('')+'</div>';
}

/* Movement chip for a card. The ARROW states what the number did; the WORD
   states what that did to the Trust. A rise in waiting times is an up arrow
   and "Deteriorated". Collapsing the two into one symbol makes either the
   waiting card or every other card lie, so they stay decoupled. */
function _reportMetricMovement(metric){
  var d=metric.cur-metric.last, up, good, mag;
  if(Math.abs(d)<0.05) return {tone:'flat', text:'&#9644; No change'};
  up=d>0;
  good=(up===metric.goodUp);
  mag=metric.money ? ('&pound;'+Math.abs(d).toFixed(1)+'m')
                   : (Math.abs(d)<1 ? Math.abs(d).toFixed(1) : String(Math.round(Math.abs(d))));
  return {
    tone: good ? 'good' : 'bad',
    text: (up?'&#9650;':'&#9660;')+' '+mag+' &middot; '+(good?'Improved':'Deteriorated')
  };
}

/* Name, value, band label, movement - and deliberately NO per-card band
   description. Six prose lines is what blew the height budget in v1 and it
   defeats the twenty-second scan; the band line still lives on the
   Performance Analysis tabs where there is room to read it.

   The <b> name plus <span> value pairing is the card contract page-1 tests
   read the money format from. Keep it. */
function _reportMetricCard(metric){
  var band=getMetricBand(metric.key, metric.cur);
  var move=_reportMetricMovement(metric);
  return '<div class="rep-metric-row band-'+(band?band.tone:'neutral')+'">'+
    '<b>'+escapeHTML(metric.full)+'</b>'+
    '<span>'+_metricDisplay(metric, metric.cur)+'</span>'+
    '<em>'+(band?escapeHTML(band.label):'')+'</em>'+
    '<i class="'+move.tone+'">'+move.text+'</i>'+
  '</div>';
}

/* Health points. Below this a movement is noise, and naming noise as the
   quarter's main pressure or strongest improvement discredits the whole
   panel - so the line is suppressed rather than printed. */
var MOVEMENT_EPSILON=1.0;

/* Ranked by health-score delta, NEVER by raw delta: budget moves in £m across
   a 10-point range while waiting is a 100-point index that inverts, so raw
   movements are not comparable between metrics at all. */
function _reportMovementRanking(metrics){
  var moved=[], i, m;
  for(i=0;i<metrics.length;i++){
    m=metrics[i];
    moved.push({
      metric:m,
      delta:getMetricHealthScore(m.key, m.cur)-getMetricHealthScore(m.key, m.last)
    });
  }
  moved.sort(function(a,b){ return a.delta-b.delta; });
  return {worst:moved[0], best:moved[moved.length-1]};
}

/* 'CONCERN' -> 'Concern'. Band labels are authored in caps for chips; in a
   sentence they read as shouting. */
function _bandWord(band){
  if(!band) return 'its band';
  var s=String(band.label);
  return s.charAt(0).toUpperCase()+s.substring(1).toLowerCase();
}

function _movementMagnitude(metric){
  var d=Math.abs(metric.cur-metric.last);
  if(metric.money) return '&pound;'+d.toFixed(1)+'m';
  return (d<1 ? d.toFixed(1) : String(Math.round(d)))+' point'+(Math.round(d)===1?'':'s');
}

/* A band change is the more informative sentence, so it wins when there is
   one; otherwise the movement is reported inside the band it stayed in. */
function _movementSentence(entry){
  var m=entry.metric;
  var from=getMetricBand(m.key, m.last), to=getMetricBand(m.key, m.cur);
  if(from && to && from!==to){
    return escapeHTML(m.full)+' moved from '+escapeHTML(_bandWord(from))+
           ' to '+escapeHTML(_bandWord(to))+'.';
  }
  return escapeHTML(m.full)+' '+(entry.delta>0?'improved':'weakened')+' by '+
         _movementMagnitude(m)+' and remained '+escapeHTML(_bandWord(to))+'.';
}

function _reportMovementSummary(metrics){
  var ranked=_reportMovementRanking(metrics), lines=[];
  if(ranked.worst && ranked.worst.delta<=-MOVEMENT_EPSILON){
    lines.push('<div><b>Main pressure</b><span>'+_movementSentence(ranked.worst)+'</span></div>');
  }
  if(ranked.best && ranked.best.delta>=MOVEMENT_EPSILON){
    lines.push('<div><b>Strongest improvement</b><span>'+_movementSentence(ranked.best)+'</span></div>');
  }
  if(!lines.length){
    /* Q1 always lands here: the opening quarter plays back flat by design. */
    lines.push('<div><span>No metric moved materially over the quarter.</span></div>');
  }
  return '<div class="rep-movement">'+lines.join('')+'</div>';
}

function _fillReportPage1(data){
  var cards=[], i;
  for(i=0;i<data.metrics.length;i++) cards.push(_reportMetricCard(data.metrics[i]));
  return [
    '<div class="rep-paper">',
      _reportPageHead('results', data),
      _reportPostureStrip(data.snapshot),
      _reportAlertList(data.snapshot),
      '<div class="rep-position-grid">',
        _reportRadarBlock(data.snapshot),
        '<div class="rep-metric-grid">'+cards.join('')+'</div>',
      '</div>',
      _reportMovementSummary(data.metrics),
    '</div>'
  ].join('');
}

/* Page 3 opens a NEW quarter, and its issue can legitimately read against the
   outcome on pages 1-2: a Capacity Strain paper warning about unsafe occupancy
   after an intervention that pulled occupancy below the operating norm is a change
   in external conditions, not the pack contradicting itself. Nothing on the page
   said so, so it read as a contradiction. One line says it.

   The fix is the label, never the figures. Adjusting prior-quarter numbers so
   pages 1-2 agree with the page-3 issue would corrupt a reported outcome to
   resolve a labelling problem (BPS-001 section 5 rejects it explicitly).

   The fixed prefix is a view string and inserts its entities raw; the authored
   sentence comes from quarters-data.js and goes through escapeHTML(), which is why
   it is authored with plain ASCII punctuation.

   Suppressed at the baseline pack: at Q1 there is no committed decision and pages
   1-2 are an opening position, so "occurs after the outcome reported on pages 1-2"
   would be untrue in exactly the way this commit exists to remove. */
function _reportIssueBridge(data){
  var bridge=data.issue && data.issue.bridge;
  if(_isBaselinePack(data)) return '';
  return '<p class="rep-bridge"><b>NEW QUARTER DEVELOPMENT</b> &#8212; occurs after the '+
    'outcome reported on pages 1&#8211;2.'+(bridge ? (' '+escapeHTML(bridge)) : '')+'</p>';
}

function _fillReportPage2(data){
  var issue=data.issue;
  return [
    '<div class="rep-paper">',
      _reportPageHead('issue', data),
      _reportIssueBridge(data),
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
    /* aria-pressed makes the card a toggle rather than a commit button: the
       first click only proposes an option, so the card has a selected state
       that assistive tech has to be able to read back. */
    html.push('<button type="button" class="rep-option" data-index="'+i+'" aria-pressed="false">'+
      '<h4>'+escapeHTML(o.label+' - '+o.title)+'</h4>'+
      '<span class="rep-option-flag" hidden>Selected &#8212; not confirmed</span>'+
      '<p class="rep-option-summary">'+escapeHTML(o.description)+'</p>'+
      '<div class="rep-option-cost"><span class="rep-cost-label">Cost this quarter</span>'+
        _optionCostText(o.cost)+'</div>'+
      '<div class="rep-option-tradeoff">'+escapeHTML(o.tradeoff||'')+'</div>'+
    '</button>');
  }
  return [
    '<div class="rep-paper">',
      _reportPageHead('options', data),
      '<p class="rep-options-intro">Select an option, discuss it as a board, then confirm your decision.</p>',
      '<div class="rep-options">'+html.join('')+'</div>',
      /* Proposal and commit control share a row so the button stays beside
         what it commits, and so page 4 still fits a projector without
         scrolling the confirm control off the bottom. */
      '<div class="rep-decide">',
        '<div class="rep-proposed" id="repProposed" aria-live="polite" hidden></div>',
        /* Plain text content only: the delegated handler in report-overlay.js
           resolves actions with closest(), but a childless button also keeps
           the raw e.target path correct if that ever changes back. */
        '<button type="button" class="btn rep-confirm" id="repConfirm" ' +
          'data-report-action="confirm-decision" disabled>Confirm Board Decision</button>',
      '</div>',
      '<div class="rep-outcome" id="repOutcome" hidden></div>',
    '</div>'
  ].join('');
}

/* Compact restatement of the option under discussion, shown between selection
   and confirmation. It reuses the authored `cost` fact through
   _optionCostText() and never reads o.effects, so the panel supports the
   board's discussion without previewing what the simulation will do.
   `confirmed` switches the same panel to the committed wording. */
function renderProposedDecision(option, confirmed){
  var el=$('repProposed'), announcement;
  if(!el || !option) return;
  if(confirmed){
    /* Once committed, the detail below is redundant with the decision outcome
       panel, so the confirmed form collapses to a one-line record. */
    announcement='Board decision confirmed: '+option.title+'.';
    el.className='rep-proposed confirmed';
    el.innerHTML='<h4>Confirmed Board Decision</h4>'+
      '<p class="rep-proposed-title">'+escapeHTML(option.label+' - '+option.title)+'</p>'+
      '<p class="rep-proposed-status confirmed">Confirmed</p>'+
      '<p class="rep-sr">'+escapeHTML(announcement)+'</p>';
    el.hidden=false;
    return;
  }
  announcement='Option '+option.label+', '+option.title+', selected. Decision not yet confirmed.';
  el.className='rep-proposed';
  el.innerHTML='<h4>Proposed Board Decision</h4>'+
    '<p class="rep-proposed-title">'+escapeHTML(option.label+' - '+option.title)+'</p>'+
    '<p class="rep-proposed-summary">'+escapeHTML(option.description)+'</p>'+
    '<div class="rep-option-cost"><span class="rep-cost-label">Cost this quarter</span>'+
      _optionCostText(option.cost)+'</div>'+
    '<p class="rep-proposed-tradeoff">'+escapeHTML(option.tradeoff||'')+'</p>'+
    '<p class="rep-proposed-status">Not yet confirmed</p>'+
    '<p class="rep-sr">'+escapeHTML(announcement)+'</p>';
  el.hidden=false;
}

/* ---------- Performance Analysis page (phase 3) ----------
   The four tabs read the report snapshot built in _reportData. Tab state is a
   module-level var (not in the DOM, not on REPORT); switching tabs only toggles
   visibility, so it never re-runs paging or resets scroll. */
var PERF_TABS=[
  {id:'finance',    label:'Finance',          metric:'budget'},
  {id:'operations', label:'Operations',       metric:'waiting'},
  {id:'workforce',  label:'Workforce',        metric:'morale'},
  {id:'quality',    label:'Patient & Safety', metric:'safety'}
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

/* Wraps at the ends so left/right keys cycle the tabs. Unlike setPerfTab (which
   also runs programmatically on render and reset), this moves DOM focus onto
   the newly selected tab - the point of a roving tabindex. Called after
   setPerfTab returns, since setPerfTab early-returns without re-rendering when
   the index is unchanged. */
function movePerfTab(delta){
  setPerfTab((_perfTab+delta+PERF_TABS.length)%PERF_TABS.length);
  var root=$('repRoot'), heads=root && root.querySelectorAll('.rep-perf-tab');
  if(heads && heads[_perfTab]) heads[_perfTab].focus();
}

function _syncPerfTabs(){
  var root=$('repRoot');
  if(!root) return;
  var heads=root.querySelectorAll('.rep-perf-tab'), panels=root.querySelectorAll('.rep-perf-panel'), i;
  for(i=0;i<heads.length;i++){
    heads[i].classList.toggle('active', i===_perfTab);
    heads[i].setAttribute('aria-selected', i===_perfTab ? 'true' : 'false');
    heads[i].tabIndex = i===_perfTab ? 0 : -1;
  }
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

/* DOM id suffix for a tab/panel pair, e.g. 'finance' -> 'Finance', giving
   perfTabFinance / perfPanelFinance. */
function _perfTabDomId(tabId){
  return tabId.charAt(0).toUpperCase()+tabId.substring(1);
}

/* The tablist is a single tab stop: only the active tab is aria-selected and
   tabbable (tabindex 0); the rest are -1 and reached with the arrow keys. */
function _perfTabHeaders(data){
  var out=[], i, tab, band, value, tone, sel, dom;
  for(i=0;i<PERF_TABS.length;i++){
    tab=PERF_TABS[i];
    value=data.snapshot.endStats[tab.metric];
    band=getMetricBand(tab.metric, value);
    tone=band?band.tone:'neutral';
    sel=i===_perfTab;
    dom=_perfTabDomId(tab.id);
    out.push('<button type="button" role="tab"'+
      ' id="perfTab'+dom+'"'+
      ' aria-selected="'+(sel?'true':'false')+'"'+
      ' aria-controls="perfPanel'+dom+'"'+
      ' tabindex="'+(sel?'0':'-1')+'"'+
      ' class="rep-perf-tab band-'+tone+(sel?' active':'')+'"'+
      ' data-perf-tab="'+i+'">'+escapeHTML(tab.label)+'</button>');
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
  /* A variance that rounds to nothing reads as a real £0.0m figure, so show an
     em dash for "on plan" instead. */
  if(Math.abs(fav)<0.05) return '&mdash;';
  var sign=fav>0.05?'+':'&#8722;';
  return sign+'&pound;'+Math.abs(fav).toFixed(1)+'m';
}

function _finRow(r){
  var cls=r.kind==='income'?'fin-income':'fin-expenditure';
  return '<tr class="rep-fin-line '+cls+'"><td>'+escapeHTML(r.label)+'</td>'+
    '<td>'+_finMoney(r.plan,r.kind)+'</td>'+
    '<td>'+_finMoney(r.value,r.kind)+'</td>'+
    '<td class="rep-perf-cell band-'+r.tone+'">'+_finVariance(r)+'</td></tr>';
}

/* Direction-aware wording for the nearest authored threshold, with the metric's
   own unit on the number.

   The line used to read Math.abs(distance) + ' to ' + title unconditionally, so
   once a threshold was passed it asserted the opposite of the truth: at budget
   -3.1 the board had breached the control total and the pack said it was 0.1
   away from doing so. It was also the only unitless figure on the Finance tab.

   `state` decides the preposition and comes from describeThresholdDistance(),
   which reads threshold.dir - the sign of the distance is inverted for an
   'above' threshold and would get SURPLUS DELIVERED backwards.

   The pack's typographic register is uppercase here (BUDGET CRITICAL &middot;
   ...) and the authored titles are uppercase, so both are left alone and only
   the connectives are lower case. &pound; is inserted raw, as everywhere else in
   this layer; the authored title still goes through escapeHTML(). def.money
   picks the unit so a non-money metric reusing this never prints a pound sign.
   -> '' when the metric has no authored thresholds. */
function _thresholdDistanceText(key, value){
  var d=describeThresholdDistance(key, value), def, mag;
  if(!d) return '';
  if(d.state==='reached') return escapeHTML(d.threshold.title)+' threshold reached';
  def=getMetricDef(key);
  mag=(def && def.money) ? ('&pound;'+d.magnitude.toFixed(1)+'m')
                         : (d.magnitude.toFixed(1)+(def && def.unit ? ' '+escapeHTML(def.unit) : ''));
  return mag+' '+(d.state==='crossed' ? 'beyond' : 'to')+' '+escapeHTML(d.threshold.title);
}

function _perfFinancePanel(data){
  var ctx=_snapshotCtx(data.snapshot);
  var section=getReportSection('finance', data.snapshot.endStats, ctx);
  var budget=data.snapshot.endStats.budget;
  var band=getMetricBand('budget', budget);
  var near=_thresholdDistanceText('budget', budget);
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
    (near?(' &middot; '+near):'');
  return [
    '<div class="rep-perf-panel" role="tabpanel" id="perfPanelFinance" aria-labelledby="perfTabFinance"'+
      (_perfTab===0?'':' hidden')+' data-perf-panel="0">',
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

/* True once at least one quarter has been committed, so the dashed year-to-date
   series (and its legend half) has something to plot. The intra-quarter solid
   series is always present, so the canvas itself renders every quarter. */
function _hasYearToDate(data){
  return !!(data && data.snapshot && data.snapshot.history && data.snapshot.history.length>=1);
}

/* ---------- bed occupancy gauge (Operations tab) ----------
   Occupancy is the single most legible operational figure an NHS board reads,
   and its meaning is entirely relative: 94.2% says nothing without knowing where
   the trust normally sits. A number in a row list cannot carry that; the position
   of the value against a marked norm IS the reading.

   No figure changes here. The value drawn is exactly the one deriveOperational()
   already returns and exactly the one in the row list beside it. */

/* Plain-language distance from the operating norm. Reads as a sentence a
   non-finance board member can act on, not as a delta. */
function _occupancyStatusText(gauge){
  var d=Math.abs(gauge.delta);
  if(d<0.05) return 'Exactly at the '+gauge.normLabel.toLowerCase()+' of '+
                    _perfFixed(gauge.norm,0)+'%.';
  return _perfFixed(d,1)+' percentage points '+
         (gauge.delta>0 ? 'above' : 'below')+' the '+
         gauge.normLabel.toLowerCase()+' of '+_perfFixed(gauge.norm,0)+'%.';
}

/* Authored, not derived from the band list: "At norm" is the reading a board
   wants for the neutral band, and no rule generates that from a boundary. */
var OCCUPANCY_BAND_WORD={
  good:'Below norm', neutral:'At norm', warn:'Elevated', critical:'Severe'
};

/* One string, used both as the aria-label and as the <canvas> fallback content -
   the same relationship _radarAccessibleText() has with the radar. */
function _occupancyAccessibleText(gauge){
  return 'Bed occupancy '+_perfFixed(gauge.value,1)+'%, '+
         (OCCUPANCY_BAND_WORD[gauge.tone]||'').toLowerCase()+'. '+
         _occupancyStatusText(gauge);
}

function _occupancyGaugeBlock(gauge){
  var text=_occupancyAccessibleText(gauge);
  return [
    '<div class="rep-gauge-wrap">',
      '<h4>BED OCCUPANCY</h4>',
      '<canvas id="repOccGauge" class="rep-gauge" width="300" height="180"',
        ' role="img" aria-label="'+escapeHTML(text)+'">'+escapeHTML(text)+'</canvas>',
      '<p class="rep-gauge-status band-'+gauge.tone+'">'+escapeHTML(_occupancyStatusText(gauge))+'</p>',
      '<p class="rep-gauge-legend">Marker shows the '+escapeHTML(gauge.normLabel.toLowerCase())+
        ' &middot; scale '+_perfFixed(gauge.min,0)+'&ndash;'+_perfFixed(gauge.max,0)+'%</p>',
    '</div>'
  ].join('');
}

/* Build and draw are separate, matching _reportRadarBlock/_drawBoardBalanceRadar.
   Guarded so a failure to load report-infographics.js costs the gauge, not the
   pack. */
function _drawOccupancyGauge(data){
  var cv=$('repOccGauge');
  if(!cv || typeof renderSemicircleGauge!=='function') return null;
  var gauge=getOccupancyGauge(data.snapshot.endStats, _snapshotCtx(data.snapshot));
  var bands=[], i;
  for(i=0;i<gauge.bands.length;i++){
    bands.push({to:gauge.bands[i].to,
                color:REPORT_TONE_INK[gauge.bands[i].tone] || REPORT_TONE_INK.neutral});
  }
  return renderSemicircleGauge(cv, {
    value:       gauge.value,
    min:         gauge.min,
    max:         gauge.max,
    bands:       bands,
    norm:        gauge.norm,
    markerColor: REPORT_TONE_INK[gauge.tone] || REPORT_TONE_INK.neutral,
    valueText:   _perfFixed(gauge.value,1)+'%',
    bandText:    OCCUPANCY_BAND_WORD[gauge.tone] || '',
    minText:     _perfFixed(gauge.min,0)+'%',
    maxText:     _perfFixed(gauge.max,0)+'%'
  });
}

function _perfOperationsPanel(data){
  var ctx=_snapshotCtx(data.snapshot);
  var section=getReportSection('operations', data.snapshot.endStats, ctx);
  var gauge=getOccupancyGauge(data.snapshot.endStats, ctx);
  /* A direct text legend (not a colour key): the solid/dashed distinction and
     the words carry the meaning in greyscale. The year-to-date half is
     suppressed in Q1, where that series is absent. */
  var legend='THIS QUARTER (solid)'+
    (_hasYearToDate(data) ? ' &middot; YEAR TO DATE (dashed)' : '');
  /* The gauge leads: occupancy is the standing position, the trend is the
     direction of travel, and the board reads position first. */
  return [
    '<div class="rep-perf-panel" role="tabpanel" id="perfPanelOperations" aria-labelledby="perfTabOperations"'+
      (_perfTab===1?'':' hidden')+' data-perf-panel="1">',
      '<div class="rep-perf-opsrow">',
        _occupancyGaugeBlock(gauge),
        '<div class="rep-perf-trendcol">',
          '<h4>WAITING-PRESSURE TREND &mdash; LOWER IS BETTER</h4>',
          '<div class="rep-perf-chartwrap"><canvas id="repWaitTrend" class="rep-perf-chart" width="480" height="180"></canvas></div>',
          '<p class="rep-perf-legend">'+legend+'</p>',
        '</div>',
      '</div>',
      _perfRowList(section),
      '<p class="rep-perf-note">'+escapeHTML(section.commentary)+'</p>',
    '</div>'
  ].join('');
}

function _perfWorkforcePanel(data){
  var ctx=_snapshotCtx(data.snapshot);
  var section=getReportSection('workforce', data.snapshot.endStats, ctx);
  var band=getMetricBand('morale', data.snapshot.endStats.morale);
  return [
    '<div class="rep-perf-panel" role="tabpanel" id="perfPanelWorkforce" aria-labelledby="perfTabWorkforce"'+
      (_perfTab===2?'':' hidden')+' data-perf-panel="2">',
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
    '<div class="rep-perf-panel" role="tabpanel" id="perfPanelQuality" aria-labelledby="perfTabQuality"'+
      (_perfTab===3?'':' hidden')+' data-perf-panel="3">',
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
      _reportPageHead('performance', data),
      _perfTabHeaders(data),
      _perfFinancePanel(data),
      _perfOperationsPanel(data),
      _perfWorkforcePanel(data),
      _perfQualityPanel(data),
    '</div>'
  ].join('');
}

/* Waiting-pressure trend, rendered through the shared line-chart helper. Two
   series share the same 0->1 x-span even though their time bases differ - the
   quarter is the foreground reading and the year is context behind it:

     1. This quarter (solid, teal): OPEN plus the three month closes captured in
        the frozen snapshot. Always four points, every quarter.
     2. Year to date (dashed, dim): the year-opening value then each committed
        quarter's close. Only when at least one quarter has been committed.

   Lower is better, so the series plot directly on the 0..100 index. Returns the
   series array handed to renderLineChart so tests can assert point counts
   without pixel-diffing. */
function _drawPerformanceCharts(data){
  var cv=$('repWaitTrend');
  if(!cv) return null;
  var g=cv.getContext('2d');
  var snap=data.snapshot;

  var W=480, H=180;
  var ss=Math.max(2, Math.ceil((window.devicePixelRatio||1)*2));
  if(cv.width!==W*ss){ cv.width=W*ss; cv.height=H*ss; }
  g.setTransform(ss,0,0,ss,0,0);

  /* Series 1 - this quarter, always OPEN/M1/M2/M3. */
  var qPoints=[
    {xFrac:0,   value:snap.startStats.waiting},
    {xFrac:1/3, value:snap.monthEnds[0].stats.waiting},
    {xFrac:2/3, value:snap.monthEnds[1].stats.waiting},
    {xFrac:1,   value:snap.monthEnds[2].stats.waiting}
  ];
  var xLabels=[
    {xFrac:0,   text:'OPEN', align:'center'},
    {xFrac:1/3, text:'M1',   align:'center'},
    {xFrac:2/3, text:'M2',   align:'center'},
    {xFrac:1,   text:'M3',   align:'center'}
  ];
  var series=[{color:'#23c4b4', width:2, points:qPoints, marker:'all', markerSize:4}];

  /* Series 2 - year to date, only once a quarter has been committed. */
  var h=snap.history, i, yPoints, xf;
  if(h && h.length>=1){
    yPoints=[{xFrac:0, value:h[0].startStats.waiting}];
    for(i=0;i<h.length;i++){
      xf=(i+1)/h.length;
      yPoints.push({xFrac:xf, value:h[i].endStats.waiting});
    }
    series.push({color:'#42557a', width:1, dash:[4,3], points:yPoints, marker:'all', markerSize:3});
  }

  /* Tolerance line at the authored `warn` threshold for waiting, read from
     METRIC_DEFS rather than hard-coded so it cannot drift from the data. */
  var def=getMetricDef('waiting'), tol=null;
  if(def && def.thresholds){
    for(i=0;i<def.thresholds.length;i++){
      if(def.thresholds[i].severity==='warn'){ tol=def.thresholds[i]; break; }
    }
  }
  var decorate=function(gg, rect, scale){
    if(!tol) return;
    var y=Math.round(scale.yOf(tol.at));
    gg.fillStyle='#e9b44c';
    gg.fillRect(rect.l, y, rect.plotW, 1);
    gg.font='bold 9px "Courier New", monospace';
    gg.textAlign='right'; gg.textBaseline='bottom';
    gg.fillText(tol.title, rect.r, y-2);
  };

  renderLineChart(g, {
    W:W, H:H, pad:{l:32, r:12, t:14, b:26}, maxV:100,
    yTicks:[0,25,50,75,100], font:'bold 9px "Courier New", monospace',
    colors:{bg:'#fbfcfe', grid:'#d4dae7', yLabel:'#42557a', xLabel:'#42557a'},
    yLabelDx:5, xLabelDy:5,
    series:series,
    xLabels:xLabels,
    decorate:decorate,
    frame:'axis', frameColor:'#141b30'
  });
  return series;
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
