'use strict';
/* ---------- shared metric presentation helpers ----------
   Visual-only maths for rendering metrics as bars, fills and
   pips. The 4% floor is a legibility minimum so an at-minimum
   value still shows a visible sliver - it is deliberately not
   a true proportion, so never use this for calculations.
--------------------------------------------------------- */

/* Percentage width/height for a metric bar. Accepts anything with
   numeric min and max: a METRIC_DEFS entry or a report metric row. */
function metricBarHeightPct(def, value){
  var p=Math.round(100*(value-def.min)/(def.max-def.min));
  return Math.max(4, Math.min(100,p));
}

/* ---------- shared pixel line-chart renderer ----------
   One renderer for every board line chart (the live metric trend and the
   report waiting-times trend), so there is a single place that owns axis,
   gridlines, series and labels instead of two divergent copies.

   The caller sets up its own canvas (native or super-sampled) and passes the
   2d context plus an options object describing a logical WxH space:

     W, H                 logical drawing size
     pad {l,r,t,b}        plot margins inside W/H
     minV, maxV           value range mapped to the plot height (minV optional)
     yTicks []            values to draw gridlines + labels at
     font                 label font
     colors {bg, grid, yLabel, xLabel}
     yLabelDx             x offset of the y label from the left axis
     series []            {color, width, points:[{xFrac, value}],
                           marker:'none'|'end'|'all', markerSize}
     xLabels []           {xFrac, text, align}
     xLabelDy             y offset of x labels below the bottom axis
     decorate(g, rect, scale)  optional under-series pass (e.g. month markers)
     frame 'border'|'axis'     four thin sides, or a heavy left+bottom axis
     frameColor

   Returns the plot rect {l,r,t,b,plotW,plotH} so callers can overlay extras. */
function renderLineChart(g, o){
  var l=o.pad.l, r=o.W-o.pad.r, t=o.pad.t, b=o.H-o.pad.b;
  var plotW=r-l, plotH=b-t;
  var minV=o.minV||0, span=(o.maxV-minV)||1;
  var rect={l:l, r:r, t:t, b:b, plotW:plotW, plotH:plotH};
  var yOf=function(v){ return t+plotH*(1-(v-minV)/span); };
  var xOf=function(f){ return l+plotW*f; };
  var i, s, p, y, x, first;

  g.fillStyle=o.colors.bg; g.fillRect(0,0,o.W,o.H);

  if(o.yTicks && o.yTicks.length){
    g.font=o.font; g.textAlign='right'; g.textBaseline='middle';
    for(i=0;i<o.yTicks.length;i++){
      y=Math.round(yOf(o.yTicks[i]));
      g.fillStyle=o.colors.grid; g.fillRect(l,y,plotW,1);
      g.fillStyle=o.colors.yLabel; g.fillText(String(o.yTicks[i]), l-(o.yLabelDx||3), y);
    }
  }

  if(o.decorate) o.decorate(g, rect, {xOf:xOf, yOf:yOf});

  for(s=0;s<o.series.length;s++){
    var ser=o.series[s];
    g.strokeStyle=ser.color; g.lineWidth=ser.width||1;
    g.beginPath();
    first=true;
    for(i=0;i<ser.points.length;i++){
      p=ser.points[i];
      x=xOf(p.xFrac); y=yOf(p.value);
      if(first){ g.moveTo(x,y); first=false; } else g.lineTo(x,y);
    }
    g.stroke();
    if(ser.marker && ser.marker!=='none' && ser.points.length){
      var ms=ser.markerSize||3, half=Math.floor(ms/2);
      g.fillStyle=ser.color;
      if(ser.marker==='end'){
        p=ser.points[ser.points.length-1];
        g.fillRect(Math.round(xOf(p.xFrac))-half, Math.round(yOf(p.value))-half, ms, ms);
      }else if(ser.marker==='all'){
        for(i=0;i<ser.points.length;i++){
          p=ser.points[i];
          g.fillRect(Math.round(xOf(p.xFrac))-half, Math.round(yOf(p.value))-half, ms, ms);
        }
      }
    }
  }

  if(o.xLabels && o.xLabels.length){
    g.font=o.font; g.textBaseline='top'; g.fillStyle=o.colors.xLabel;
    for(i=0;i<o.xLabels.length;i++){
      var xl=o.xLabels[i];
      g.textAlign=xl.align||'center';
      g.fillText(xl.text, Math.round(xOf(xl.xFrac)), b+(o.xLabelDy||3));
    }
  }

  g.fillStyle=o.frameColor||o.colors.yLabel;
  if(o.frame==='axis'){
    g.fillRect(l, t-4, 2, plotH+4);
    g.fillRect(l, b, plotW, 2);
  }else if(o.frame==='border'){
    g.fillRect(l,t,plotW,1); g.fillRect(l,b,plotW,1);
    g.fillRect(l,t,1,plotH); g.fillRect(r,t,1,plotH);
  }
  return rect;
}
