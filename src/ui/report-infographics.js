'use strict';
/* ---------- board pack infographics (pure canvas rendering) ----------
   Chart builders for the quarterly board pack. Everything arrives as an
   argument: nothing here reads GAME, REPORT, METRIC_CUR, QUARTERS or the
   perf-tab index. That is what lets the Year End Report reuse these later
   without dragging board-pack state along with them.

   Colours are the report PAPER palette (light board paper), taken from the two
   canvases already rendering in the pack - NOT the dark shell's CSS variables.
   var(--ink) on paper would come out the wrong way round.
------------------------------------------------------------------------- */

/* Super-sampled backing store at the same ratio the existing report canvases
   use, so a new chart is exactly as crisp as the waiting-times trend beside it.
   Two things here are deliberate:

     1. The bitmap is only resized when the logical size actually changed.
        Assigning canvas.width always clears the canvas, so an unguarded
        reassignment would wipe a chart that is merely being redrawn.
     2. The transform is set ABSOLUTELY (setTransform, never scale). The pack
        rebuilds and redraws its pages on every open, and a relative scale
        would compound on the second open.

   -> {ctx, width, height, scale}, or null for a canvas-less element. */
function prepareReportCanvas(canvas, logicalW, logicalH){
  if(!canvas || !canvas.getContext) return null;
  var ctx=canvas.getContext('2d');
  var ss=Math.max(2, Math.ceil((window.devicePixelRatio||1)*2));
  if(canvas.width!==logicalW*ss){
    canvas.width=logicalW*ss;
    canvas.height=logicalH*ss;
  }
  ctx.setTransform(ss,0,0,ss,0,0);
  ctx.clearRect(0,0,logicalW,logicalH);
  return {ctx:ctx, width:logicalW, height:logicalH, scale:ss};
}

/* Radar geometry and paper colours. The caller supplies axes and series; the
   rest has one right answer for this pack and is not worth repeating at every
   call site. */
var RADAR_DEFAULTS={
  width:360, height:300, cx:180, cy:142, maxRadius:100,
  rings:[20,40,60,80,100],
  font:'bold 9px "Courier New", monospace',
  labelGap:15,
  colors:{bg:'#fbfcfe', ring:'#d4dae7', axis:'#141b30', label:'#42557a'}
};

function _radarOpt(config, key){
  return (config && config[key]!==undefined) ? config[key] : RADAR_DEFAULTS[key];
}

/* Axis i points at -90 degrees + a full turn spread over n axes, so the first
   axis is always straight up and the reading order runs clockwise - matching
   the order the six cards are laid out in. */
function _radarAngle(i, n){
  return -Math.PI/2 + 2*Math.PI*i/n;
}

function _radarPoint(cx, cy, maxR, i, n, score){
  var r=maxR*Math.max(0, Math.min(100, score))/100, a=_radarAngle(i,n);
  return {x:cx+r*Math.cos(a), y:cy+r*Math.sin(a)};
}

function _radarTracePolygon(g, cx, cy, maxR, n, scoreAt){
  var i, p;
  g.beginPath();
  for(i=0;i<n;i++){
    p=_radarPoint(cx, cy, maxR, i, n, scoreAt(i));
    if(i===0) g.moveTo(p.x,p.y); else g.lineTo(p.x,p.y);
  }
  g.closePath();
}

/* Radar / spider chart of already-normalised 0..100 scores.

     config.axes    [{label}]                one entry per spoke
     config.series  [{values:[0..100 x n], color, width, dash, fill,
                      marker:'filled'|'hollow'|'none', markerSize}]
     config.width/height/cx/cy/maxRadius/rings/colors/font/labelGap  optional

   Series are distinguished by LINE STYLE (solid vs dashed) and marker fill,
   never by a six-colour key: the chart has to survive greyscale printing and
   the board pack is routinely printed. The caller pairs it with a text legend.

   Returns the resolved geometry ({width, height, scale, points}) so tests can
   assert placement without diffing pixels. */
function renderRadarChart(canvas, config){
  config=config || {};
  var W=_radarOpt(config,'width'), H=_radarOpt(config,'height');
  var prep=prepareReportCanvas(canvas, W, H);
  if(!prep) return null;

  var g=prep.ctx;
  var cx=_radarOpt(config,'cx'), cy=_radarOpt(config,'cy');
  var maxR=_radarOpt(config,'maxRadius'), rings=_radarOpt(config,'rings');
  var colors=_radarOpt(config,'colors'), font=_radarOpt(config,'font');
  var labelGap=_radarOpt(config,'labelGap');
  var axes=config.axes || [], n=axes.length;
  var series=config.series || [];
  var points=[], i, s, ser, ring, p, a, tx, ty, cos, sin;

  g.fillStyle=colors.bg;
  g.fillRect(0,0,W,H);
  if(!n) return {width:W, height:H, scale:prep.scale, points:points};

  /* Rings. The outermost doubles as the chart frame, so it takes the heavy
     axis colour while the inner rings stay light - the same figure/ground
     split renderLineChart() uses for its axis versus its gridlines. */
  for(i=0;i<rings.length;i++){
    ring=rings[i];
    g.strokeStyle=(ring>=100) ? colors.axis : colors.ring;
    g.lineWidth=(ring>=100) ? 1.5 : 1;
    _radarTracePolygon(g, cx, cy, maxR, n, function(){ return ring; });
    g.stroke();
  }

  /* Spokes. */
  g.strokeStyle=colors.axis;
  g.lineWidth=1;
  for(i=0;i<n;i++){
    p=_radarPoint(cx, cy, maxR, i, n, 100);
    g.beginPath();
    g.moveTo(cx,cy);
    g.lineTo(p.x,p.y);
    g.stroke();
  }

  /* Series, in array order, so the caller controls what sits on top. */
  for(s=0;s<series.length;s++){
    ser=series[s];
    var values=ser.values || [];
    var scoreAt=function(idx){ return values[idx]||0; };
    var seriesPoints=[];
    for(i=0;i<n;i++) seriesPoints.push(_radarPoint(cx, cy, maxR, i, n, scoreAt(i)));
    points.push(seriesPoints);

    if(ser.fill){
      _radarTracePolygon(g, cx, cy, maxR, n, scoreAt);
      g.fillStyle=ser.fill;
      g.fill();
    }
    g.strokeStyle=ser.color;
    g.lineWidth=ser.width||2;
    if(ser.dash) g.setLineDash(ser.dash);
    _radarTracePolygon(g, cx, cy, maxR, n, scoreAt);
    g.stroke();
    g.setLineDash([]);

    if(ser.marker && ser.marker!=='none'){
      var ms=ser.markerSize||3;
      for(i=0;i<n;i++){
        p=seriesPoints[i];
        g.beginPath();
        g.arc(p.x, p.y, ms, 0, Math.PI*2);
        if(ser.marker==='hollow'){
          /* Filled with the chart background, not left transparent, so the
             dashed line does not read through the middle of its own marker. */
          g.fillStyle=colors.bg; g.fill();
          g.strokeStyle=ser.color; g.lineWidth=ser.width||1; g.stroke();
        }else{
          g.fillStyle=ser.color; g.fill();
        }
      }
    }
  }

  /* Axis labels, outside the outer ring. Alignment follows the spoke direction
     so a label never overlaps the ring it belongs to. */
  g.font=font;
  g.fillStyle=colors.label;
  for(i=0;i<n;i++){
    a=_radarAngle(i,n);
    cos=Math.cos(a); sin=Math.sin(a);
    tx=cx+(maxR+labelGap)*cos;
    ty=cy+(maxR+labelGap)*sin;
    g.textAlign=(Math.abs(cos)<0.2) ? 'center' : (cos>0 ? 'left' : 'right');
    g.textBaseline=(sin<-0.2) ? 'bottom' : (sin>0.2 ? 'top' : 'middle');
    g.fillText(String(axes[i].label||''), Math.round(tx), Math.round(ty));
  }

  return {width:W, height:H, scale:prep.scale, points:points};
}
