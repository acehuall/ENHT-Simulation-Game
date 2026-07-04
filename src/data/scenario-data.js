'use strict';
/* ---------- board metric definitions ---------- */
/* order here IS the ticker order (v0..v5 / d0..d5) */
/* goodUp: true when a rising value is good news (waiting is the exception) */
var METRIC_DEFS = [
  {key:'budget', label:'BUDGET', money:true, goodUp:true,  start:0,  min:-5, max:2},
  {key:'waiting',label:'WAITING',            goodUp:false, start:68, min:0,  max:100},
  {key:'patsat', label:'PAT SAT',            goodUp:true,  start:63, min:0,  max:100},
  {key:'morale', label:'MORALE',             goodUp:true,  start:58, min:0,  max:100},
  {key:'safety', label:'SAFETY',             goodUp:true,  start:66, min:0,  max:100},
  {key:'rep',    label:'REP',                goodUp:true,  start:60, min:0,  max:100}
];

/* ---------- timed scenario events ---------- */
/* effects are applied as short gradual transitions (see metrics.js) */
var STAT_EVENTS = [
  {
    t:8, name:'Norovirus outbreak',
    toast:'&#9888; 3 nurses off sick &mdash; norovirus',
    effects:{ waiting:+6, patsat:-3, morale:-5, safety:-4, rep:-1 }
  },
  {
    t:18, name:'Agency cover arrives',
    toast:'&#10010; Agency cover arrives',
    effects:{ budget:-1.8, waiting:-5, patsat:+2, morale:+3, safety:+3, rep:+1 }
  },
  {
    t:28, name:'Ward 4 incident',
    toast:'&#9888; Incident reported &mdash; Ward 4',
    effects:{ waiting:+2, patsat:-4, morale:-3, safety:-9, rep:-5 }
  }
];

/* ---------- toasts derived from the events (single source of truth) ---------- */
var TOASTS = STAT_EVENTS.map(function(e){ return {t:e.t, msg:e.toast}; });

/* ---------- legacy ticker table (superseded by METRIC_DEFS + STAT_EVENTS) ---------- */
var TICKS=[
  {s:0,  e:-1.8, money:true},
  {s:68, e:69},
  {s:63, e:65},
  {s:58, e:61},
  {s:66, e:68},
  {s:60, e:60}
];

function fmtMoney(v){ return (v<-0.05?'&#8722;':'')+'£'+Math.abs(v).toFixed(1)+'m'; }
