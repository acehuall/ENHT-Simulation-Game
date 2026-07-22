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
