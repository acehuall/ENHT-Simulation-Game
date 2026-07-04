'use strict';
/* =========================================================
   STATS CHART — live board-metric trend
   Pixel-style line chart drawn on #statsChart. Reads the
   stored metric history from metrics.js; no external libs.

   Depends on: dom.js ($)
               metrics.js (getMetricHistory)
               map-data.js (QLEN)
               scenario-data.js (STAT_EVENTS)
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

function _chartTime(sec){ return '0:'+('0'+Math.floor(sec)).slice(-2); }

function drawStatsChart(){
  var W=statsChart.width, H=statsChart.height;      /* 220 x 120 */
  var left=22, right=W-6, top=16, bottom=H-18;
  var plotW=right-left, plotH=bottom-top;

  /* background */
  scc.fillStyle='#0a0c13'; scc.fillRect(0,0,W,H);

  /* horizontal grid + y markers (0 / 50 / 100) */
  scc.font='8px "Courier New", monospace';
  scc.textAlign='right'; scc.textBaseline='middle';
  var yv=[0,50,100];
  for(var g=0;g<yv.length;g++){
    var gy=Math.round(top+(1-yv[g]/100)*plotH);
    scc.fillStyle='rgba(139,148,171,0.15)'; scc.fillRect(left,gy,plotW,1);
    scc.fillStyle='#8b94ab'; scc.fillText(String(yv[g]),left-3,gy);
  }

  /* subtle event markers (norovirus / agency / incident) */
  if(typeof STAT_EVENTS!=='undefined'){
    scc.fillStyle='rgba(233,180,76,0.20)';
    for(var e=0;e<STAT_EVENTS.length;e++){
      var ex=Math.round(left+(STAT_EVENTS[e].t/QLEN)*plotW);
      scc.fillRect(ex,top,1,plotH);
    }
  }

  /* one line per series, straight from the stored history */
  var hist=getMetricHistory();
  for(var s=0;s<CHART_SERIES.length;s++){
    var key=CHART_SERIES[s].key;
    scc.strokeStyle=CHART_COLORS[key]; scc.lineWidth=1;
    scc.beginPath();
    for(var i=0;i<hist.length;i++){
      var px=left+(hist[i].t/QLEN)*plotW;
      var py=top+(1-hist[i][key]/100)*plotH;
      if(i===0) scc.moveTo(px,py); else scc.lineTo(px,py);
    }
    scc.stroke();
    /* last-point marker */
    if(hist.length){
      var lp=hist[hist.length-1];
      var lx=Math.round(left+(lp.t/QLEN)*plotW);
      var ly=Math.round(top+(1-lp[key]/100)*plotH);
      scc.fillStyle=CHART_COLORS[key]; scc.fillRect(lx-1,ly-1,3,3);
    }
  }

  /* plot border */
  scc.fillStyle='#242b40';
  scc.fillRect(left,top,plotW,1); scc.fillRect(left,bottom,plotW,1);
  scc.fillRect(left,top,1,plotH); scc.fillRect(right,top,1,plotH);

  /* x-axis start / end labels */
  scc.fillStyle='#8b94ab'; scc.textBaseline='top';
  scc.textAlign='left';  scc.fillText(_chartTime(0),left,bottom+3);
  scc.textAlign='right'; scc.fillText(_chartTime(QLEN),right,bottom+3);

  /* small legend across the top */
  scc.textBaseline='middle'; scc.textAlign='left';
  var lx2=6, ly2=8;
  for(var c=0;c<CHART_SERIES.length;c++){
    var ck=CHART_SERIES[c].key, cl=CHART_SERIES[c].label;
    scc.fillStyle=CHART_COLORS[ck]; scc.fillRect(lx2,ly2-2,5,5); lx2+=8;
    scc.fillStyle='#8b94ab'; scc.fillText(cl,lx2,ly2); lx2+=cl.length*5+7;
  }
}
