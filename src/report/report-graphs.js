'use strict';
/* =========================================================
   REPORT GRAPHS — page 2 visualisations, one style per
   quarter, drawn in the pixel-paper style on a 360x180
   canvas. drawQuarterGraph() dispatches on the quarter's
   page2GraphType:

     'winterPressure' - Q1 multi-line winter pressure chart
     'financeGap'     - Q2 CIP savings waterfall vs target
     'cultureSafety'  - Q3 incident bars + survey-score line
     'waitingFunding' - Q4 backlog actuals + two forecasts

   Graph DATA lives in quarters-data.js (page2GraphData).
   To add a graph for a future Q5: write a _gDrawXxx(ctx,g,d)
   renderer here and add its case to drawQuarterGraph().
========================================================= */

var G_INK='#141b30', G_MID='#8b94ab', G_GRID='#d4dae7';
var G_TEAL='#23c4b4', G_AMBER='#c98f1d', G_RED='#e05252';

/* frame, gridlines + y labels; returns plot geometry helpers */
function _gFrame(ctx,W,H,maxV,yStep,fmt){
  var L=36,Rr=8,T=14,B=24;
  ctx.clearRect(0,0,W,H);
  ctx.font='bold 8px "Courier New", monospace';
  var yOf=function(v){ return T+(H-T-B)*(1-v/maxV); };
  var i,y;
  for(i=0;i<=maxV+0.001;i+=yStep){
    y=Math.round(yOf(i));
    ctx.fillStyle=G_GRID; ctx.fillRect(L,y,W-L-Rr,1);
    ctx.fillStyle=G_MID; ctx.textAlign='right';
    ctx.fillText(fmt?fmt(i):String(Math.round(i)),L-4,y+3);
  }
  ctx.fillStyle=G_INK;
  ctx.fillRect(L,T-4,2,H-T-B+4);
  ctx.fillRect(L,H-B,W-L-Rr,2);
  return {L:L,R:Rr,T:T,B:B,W:W,H:H,yOf:yOf,plotW:W-L-Rr,plotH:H-T-B};
}

/* horizontal dashed rule with a label */
function _gDashH(ctx,g,v,color,label){
  var y=Math.round(g.yOf(v)),x;
  ctx.fillStyle=color;
  for(x=g.L;x<g.W-g.R;x+=8) ctx.fillRect(x,y,4,2);
  ctx.textAlign='left'; ctx.fillText(label,g.L+4,y-4);
}

/* solid pixel line with square point markers */
function _gLine(ctx,g,xs,vals,color){
  var i;
  ctx.strokeStyle=color; ctx.lineWidth=2;
  ctx.beginPath();
  for(i=0;i<vals.length;i++){
    if(i===0) ctx.moveTo(xs[i],g.yOf(vals[i])); else ctx.lineTo(xs[i],g.yOf(vals[i]));
  }
  ctx.stroke();
  ctx.fillStyle=color;
  for(i=0;i<vals.length;i++) ctx.fillRect(Math.round(xs[i])-2,Math.round(g.yOf(vals[i]))-2,4,4);
}

/* dotted line (projection style) from a start point through vals */
function _gDotLine(ctx,g,x0,v0,xs,vals,color){
  var px=x0,py=g.yOf(v0),i,x,y,dx,dy,len,d;
  ctx.fillStyle=color;
  for(i=0;i<vals.length;i++){
    x=xs[i]; y=g.yOf(vals[i]);
    dx=x-px; dy=y-py; len=Math.sqrt(dx*dx+dy*dy);
    for(d=0;d<len;d+=5) ctx.fillRect(Math.round(px+dx*d/len)-1,Math.round(py+dy*d/len)-1,2,2);
    ctx.fillRect(Math.round(x)-2,Math.round(y)-2,4,4);
    px=x; py=y;
  }
}

/* small colour-key legend across the top of the plot */
function _gLegend(ctx,g,items){
  var x=g.L+6,i;
  ctx.font='bold 7px "Courier New", monospace';
  ctx.textAlign='left';
  for(i=0;i<items.length;i++){
    ctx.fillStyle=items[i].color; ctx.fillRect(x,g.T-9,6,6);
    ctx.fillStyle=G_INK; ctx.fillText(items[i].label,x+9,g.T-3);
    x+=9+items[i].label.length*5+12;
  }
}

/* ---------- Q1 : winter pressure multi-line ---------- */
function _gDrawWinter(ctx,d,W,H){
  var g=_gFrame(ctx,W,H,d.maxV,40);
  var n=d.periods.length, step=g.plotW/n, xs=[], i,s;
  for(i=0;i<n;i++) xs.push(g.L+(i+0.5)*step);
  for(s=0;s<d.series.length;s++) _gLine(ctx,g,xs,d.series[s].values,d.series[s].color);
  if(d.capacity) _gDashH(ctx,g,d.capacity.v,G_RED,d.capacity.label);
  _gLegend(ctx,g,d.series.map(function(sr){ return {label:sr.label,color:sr.color}; }));
  ctx.fillStyle=G_MID; ctx.textAlign='center';
  ctx.font='bold 8px "Courier New", monospace';
  for(i=0;i<n;i++) ctx.fillText(d.periods[i],xs[i],H-g.B+12);
}

/* ---------- Q2 : CIP savings waterfall vs target ---------- */
function _gDrawFinance(ctx,d,W,H){
  var maxV=Math.ceil(d.target*1.15);
  var g=_gFrame(ctx,W,H,maxV,4,function(v){ return String(v); });
  var n=d.steps.length+1, step=g.plotW/n, cum=0, i, x, y0, y1, bw=Math.round(step-14);

  for(i=0;i<d.steps.length;i++){
    x=Math.round(g.L+i*step+7);
    y0=Math.round(g.yOf(cum));
    cum+=d.steps[i].v;
    y1=Math.round(g.yOf(cum));
    ctx.fillStyle=G_TEAL; ctx.fillRect(x,y1,bw,y0-y1);
    ctx.strokeStyle=G_INK; ctx.lineWidth=2; ctx.strokeRect(x+1,y1+1,bw-2,y0-y1-2);
    /* connector to the next bar's floor */
    ctx.fillStyle=G_MID; ctx.fillRect(x+bw,y1,Math.round(step-bw),1);
    ctx.fillStyle=G_INK; ctx.textAlign='center'; ctx.font='bold 7px "Courier New", monospace';
    ctx.fillText(d.unit.replace('£','')==='m'?('£'+d.steps[i].v.toFixed(1)+'m'):String(d.steps[i].v),x+bw/2,y1-3);
    ctx.fillStyle=G_MID; ctx.font='bold 7px "Courier New", monospace';
    ctx.fillText(d.steps[i].label,x+bw/2,H-g.B+12);
  }

  /* unidentified gap: hatched red block from cum up to target */
  x=Math.round(g.L+d.steps.length*step+7);
  y0=Math.round(g.yOf(cum)); y1=Math.round(g.yOf(d.target));
  ctx.strokeStyle=G_RED; ctx.lineWidth=2; ctx.strokeRect(x+1,y1+1,bw-2,y0-y1-2);
  ctx.fillStyle=G_RED;
  var hy;
  for(hy=y1+4;hy<y0-2;hy+=6) ctx.fillRect(x+3,hy,bw-6,2);
  ctx.textAlign='center'; ctx.font='bold 7px "Courier New", monospace';
  ctx.fillText('£'+(d.target-cum).toFixed(1)+'m',x+bw/2,y1-3);
  ctx.fillStyle=G_MID; ctx.fillText(d.gapLabel,x+bw/2,H-g.B+12);

  _gDashH(ctx,g,d.target,G_AMBER,'TARGET £'+d.target+'M');
}

/* ---------- Q3 : incidents bars + survey-score line ---------- */
function _gDrawCulture(ctx,d,W,H){
  /* left scale = incident count; the survey line uses a 0-100 overlay scale */
  var g=_gFrame(ctx,W,H,d.maxBar,4);
  var n=d.periods.length, step=g.plotW/n, xs=[], i, x, y, bw=Math.round(step-16);

  for(i=0;i<n;i++) xs.push(g.L+(i+0.5)*step);

  /* incident bars */
  for(i=0;i<n;i++){
    x=Math.round(xs[i]-bw/2); y=Math.round(g.yOf(d.incidents[i]));
    ctx.fillStyle='#eab6b6'; ctx.fillRect(x,y,bw,g.H-g.B-y);
    ctx.strokeStyle=G_RED; ctx.lineWidth=2; ctx.strokeRect(x+1,y+1,bw-2,g.H-g.B-y-2);
  }

  /* escalation-failure × marks above each bar */
  ctx.fillStyle=G_INK; ctx.textAlign='center'; ctx.font='bold 8px "Courier New", monospace';
  for(i=0;i<n;i++){
    if(d.escalationFails[i]>0){
      y=Math.round(g.yOf(d.incidents[i]))-6;
      ctx.fillText('×'+d.escalationFails[i],xs[i],y);
    }
  }

  /* survey score line on a 0-100 overlay scale */
  var gs={yOf:function(v){ return g.T+g.plotH*(1-v/100); }};
  ctx.strokeStyle=G_TEAL; ctx.lineWidth=2; ctx.beginPath();
  for(i=0;i<n;i++){ if(i===0) ctx.moveTo(xs[i],gs.yOf(d.surveyScore[i])); else ctx.lineTo(xs[i],gs.yOf(d.surveyScore[i])); }
  ctx.stroke();
  ctx.fillStyle=G_TEAL;
  for(i=0;i<n;i++) ctx.fillRect(Math.round(xs[i])-2,Math.round(gs.yOf(d.surveyScore[i]))-2,4,4);
  ctx.textAlign='left'; ctx.font='bold 7px "Courier New", monospace';
  ctx.fillText('SURVEY '+d.surveyScore[n-1],xs[n-1]-30,gs.yOf(d.surveyScore[n-1])-6);

  _gLegend(ctx,g,[{label:'INCIDENTS',color:G_RED},{label:'SURVEY',color:G_TEAL}]);
  ctx.fillStyle=G_MID; ctx.textAlign='center'; ctx.font='bold 7px "Courier New", monospace';
  for(i=0;i<n;i++) ctx.fillText(d.periods[i],xs[i],H-g.B+12);
}

/* ---------- Q4 : backlog actuals + diverging forecasts ---------- */
function _gDrawWaiting(ctx,d,W,H){
  var g=_gFrame(ctx,W,H,d.maxV,5);
  var n=d.actual.length+d.invest.length, step=g.plotW/n, i, x, y;
  var xsA=[], xsP=[];
  for(i=0;i<d.actual.length;i++) xsA.push(g.L+(i+0.5)*step);
  for(i=0;i<d.invest.length;i++) xsP.push(g.L+(d.actual.length+i+0.5)*step);

  /* NOW divider */
  x=Math.round(g.L+d.actual.length*step);
  ctx.fillStyle=G_MID;
  for(y=g.T;y<H-g.B;y+=6) ctx.fillRect(x,y,1,3);
  ctx.textAlign='center'; ctx.font='bold 8px "Courier New", monospace';
  ctx.fillText('NOW',x,g.T-2);

  _gDashH(ctx,g,d.target.v,G_AMBER,d.target.label);

  /* actual backlog (solid ink line) then the two forecasts */
  _gLine(ctx,g,xsA,d.actual,G_INK);
  var x0=xsA[xsA.length-1], v0=d.actual[d.actual.length-1];
  _gDotLine(ctx,g,x0,v0,xsP,d.invest,G_TEAL);
  _gDotLine(ctx,g,x0,v0,xsP,d.noFunding,G_RED);

  _gLegend(ctx,g,[{label:'ACTUAL',color:G_INK},{label:'WITH £10M',color:G_TEAL},{label:'DO NOTHING',color:G_RED}]);
  ctx.fillStyle=G_MID; ctx.textAlign='center';
  ctx.fillText('M1',xsA[0],H-g.B+12);
  ctx.fillText('M'+n,xsP[xsP.length-1],H-g.B+12);
}

/* ---------- dispatcher ---------- */
function drawQuarterGraph(canvas,quarter){
  var ctx=canvas.getContext('2d');
  var d=quarter.page2GraphData, W=canvas.width, H=canvas.height;
  switch(quarter.page2GraphType){
    case 'winterPressure': _gDrawWinter(ctx,d,W,H); break;
    case 'financeGap':     _gDrawFinance(ctx,d,W,H); break;
    case 'cultureSafety':  _gDrawCulture(ctx,d,W,H); break;
    case 'waitingFunding': _gDrawWaiting(ctx,d,W,H); break;
    default:
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle=G_MID; ctx.textAlign='center';
      ctx.font='bold 10px "Courier New", monospace';
      ctx.fillText('NO GRAPH RENDERER: '+quarter.page2GraphType,W/2,H/2);
  }
}
