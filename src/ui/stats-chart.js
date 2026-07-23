'use strict';
/* =========================================================
   STATS CHART — live board-metric trend
   Pixel-style line chart drawn on #statsChart. Reads the
   stored metric history from metrics.js; no external libs.

   Depends on: dom.js ($)
               metrics.js (getMetricHistory)
               map-data.js (QLEN)
               timeline-compiler.js (getTimelineStatEvents)
========================================================= */

var statsChart=$('statsChart'), scc=statsChart.getContext('2d');

var CHART_SERIES=[
  {key:'waiting', label:'WAIT'},
  {key:'patsat',  label:'SAT'},
  {key:'morale',  label:'MOR'},
  {key:'safety',  label:'SAFE'},
  {key:'rep',     label:'REP'}
];

/* palette mirrors the CSS variables (amber/green/teal/red/ink) */
var CHART_COLORS={
  waiting:'#e9b44c',
  patsat: '#5fbf72',
  morale: '#23c4b4',
  safety: '#e05252',
  rep:    '#c3cade'
};

function _chartMonth(index){ return 'M'+index; }

function drawStatsChart(){
  var W=statsChart.width, H=statsChart.height;      /* 220 x 120 */
  var hist=getMetricHistory();

  /* one line per board series, straight from the stored history */
  var series=[], s, key, points, i;
  for(s=0;s<CHART_SERIES.length;s++){
    key=CHART_SERIES[s].key;
    points=[];
    for(i=0;i<hist.length;i++) points.push({xFrac:hist[i].t/QLEN, value:hist[i][key]});
    series.push({color:CHART_COLORS[key], width:1, points:points, marker:'end', markerSize:3});
  }

  /* month labels + subtle vertical month / timeline-event markers, drawn under
     the series in the shared renderer's decorate pass */
  var xLabels=[];
  for(var mo=1;mo<=SIM_MONTHS;mo++){
    xLabels.push({xFrac:mo/SIM_MONTHS, text:_chartMonth(mo), align:(mo===SIM_MONTHS)?'right':'center'});
  }
  function decorate(g, rect){
    var m, ex, events;
    g.fillStyle='rgba(195,202,222,0.22)';
    for(m=1;m<=SIM_MONTHS;m++){
      g.fillRect(Math.round(rect.l+(m/SIM_MONTHS)*rect.plotW), rect.t, 1, rect.plotH);
    }
    if(typeof getTimelineStatEvents==='function'){
      events=getTimelineStatEvents();
      g.fillStyle='rgba(233,180,76,0.20)';
      for(var e=0;e<events.length;e++){
        ex=Math.round(rect.l+(events[e].t/QLEN)*rect.plotW);
        g.fillRect(ex, rect.t, 1, rect.plotH);
      }
    }
  }

  renderLineChart(scc, {
    W:W, H:H, pad:{l:22, r:6, t:10, b:18}, maxV:100,
    yTicks:[0,50,100], font:'8px "Courier New", monospace',
    colors:{bg:'#0a0c13', grid:'rgba(139,148,171,0.15)', yLabel:'#8b94ab', xLabel:'#8b94ab'},
    yLabelDx:3, xLabelDy:3,
    series:series, xLabels:xLabels, decorate:decorate,
    frame:'border', frameColor:'#242b40'
  });
}
