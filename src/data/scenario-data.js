'use strict';
/* =========================================================
   BOARD METRIC DEFINITIONS
   The six core stats. Order here IS the ticker order
   (v0..v5 / d0..d5 in index.html) and the report row order.

   - start:  the value the game begins with in Q1
             (later quarters start from the post-decision
              stats via setMetricStarts in metrics.js)
   - min/max: clamp range, also scales the report page-1 bars
   - money:  render as £m instead of points
   - goodUp: whether an increase is good (colours deltas/chips)

   NOTE: 'waiting' is "% of patients met within 18 weeks",
   so HIGHER is BETTER for every metric, including budget.

   Per-quarter scenario content (events, options, graphs)
   lives in src/data/quarters-data.js.
========================================================= */
var METRIC_DEFS = [
  {key:'budget', label:'BUDGET',  money:true, goodUp:true, start:0,  min:-8, max:8},
  {key:'waiting',label:'PAT MET',             goodUp:true, start:68, min:0,  max:100},
  {key:'patsat', label:'PAT SAT',             goodUp:true, start:63, min:0,  max:100},
  {key:'morale', label:'MORALE',              goodUp:true, start:58, min:0,  max:100},
  {key:'safety', label:'SAFETY',              goodUp:true, start:66, min:0,  max:100},
  {key:'rep',    label:'REP',                 goodUp:true, start:60, min:0,  max:100}
];

function fmtMoney(v){ return (v<-0.05?'&#8722;':'')+'£'+Math.abs(v).toFixed(1)+'m'; }
