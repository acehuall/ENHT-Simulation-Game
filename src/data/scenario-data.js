'use strict';
/* ---------- board metric definitions ----------
   `start` is the new-game baseline. Per-quarter playback starts come from
   the resolved outcome on TIMELINE, not from fixed scenario events.
------------------------------------------------------------------------ */
/* `label` is the short tag used on tight UI (impact chips, live sim chart).
   `full` is the readable name shown on the board report where there is room. */
/* ---------- band authoring rules ----------
   1. Bands are ordered ascending by `to`. The last band's `to` must equal
      the metric's `max`.
   2. `to` is inclusive. A value falls in the FIRST band where v <= to.
   3. `tone` is assigned by DESIRABILITY, not by position. For goodUp:false
      metrics (waiting) the tones run great -> critical as the value rises.
      Do not infer tone from index in code. State it here explicitly.
   4. `label` is the short tag shown on tickers and in the report.
      `line` is the plain-language explanation shown on hover / in the pack.
   5. Thresholds are separate from bands: bands are ambient status, thresholds
      are hard lines that fire an alert exactly once on crossing (phase 2).
   6. `owner` is the display name shown in the board pack; `ownerRole` is the
      stable role slug (matches PREGAME.roles[n].id) that owns the metric.
      Phase 4 objectives resolve owner<->role by `ownerRole`, NEVER by parsing
      the display name - one convention, stated here so the two never diverge.
-------------------------------------------------------------------------- */
var METRIC_DEFS = [
  {key:'budget',  label:'BUDGET',  full:'Budget',               money:true,  goodUp:true,  start:0,  min:-5, max:2,
   unit:'£m',
   meaning:'In-year financial position against the annual plan, after agency, capital charges and CIP delivery.',
   proxy:'A 0.1 movement is roughly £100k over the year, or about two months of one agency ward shift pattern.',
   owner:'CHIEF FINANCE OFFICER', ownerRole:'cfo',
   bands:[
     {id:'critical', to:-3.0, tone:'critical', label:'CRITICAL',
      line:'Financial control has failed. Formal intervention and a year-end rating cap are likely.'},
     {id:'concern',  to:-1.5, tone:'warn',     label:'CONCERN',
      line:'The deficit is beyond plan. A credible recovery trajectory is now required.'},
     {id:'stable',   to:0.0,  tone:'neutral',  label:'STABLE',
      line:'The position remains within the board\'s current financial tolerance.'},
     {id:'strong',   to:1.0,  tone:'good',     label:'STRONG',
      line:'A modest surplus is creating headroom for resilience and capital.'},
     {id:'exemplar', to:2.0,  tone:'great',    label:'EXEMPLAR',
      line:'A strong surplus is protecting investment without weakening care.'}
   ],
   thresholds:[
     {at:-1.5, dir:'below', severity:'warn',
      title:'DEFICIT NOTIFIABLE',
      line:'Run rate now exceeds plan. NHSE will expect a recovery trajectory.'},
     {at:-3.0, dir:'below', severity:'critical',
      title:'DEFICIT BREACH',
      line:'Beyond the control total. Rating capped regardless of other performance.'},
     {at:1.0, dir:'above', severity:'praise',
      title:'SURPLUS DELIVERED',
      line:'Ahead of plan. Creates headroom for capital and winter resilience.'}
   ]
  },
  {key:'waiting', label:'WAITING', full:'Waiting Times',        money:false, goodUp:false, start:68, min:0,  max:100,
   unit:'index',
   meaning:'Composite of referral-to-treatment position, 4-hour performance and diagnostic waits. Lower is better.',
   proxy:'A 1-point rise is roughly 200 more patients waiting beyond 18 weeks.',
   owner:'CHIEF OPERATING OFFICER', ownerRole:'coo',
   bands:[
     {id:'exemplar', to:48,  tone:'great',    label:'EXEMPLAR',
      line:'Access performance in the top decile. Referral to treatment is holding.'},
     {id:'strong',   to:60,  tone:'good',     label:'STRONG',
      line:'Waits below peer median. Elective recovery is on plan.'},
     {id:'stable',   to:72,  tone:'neutral',  label:'STABLE',
      line:'Within expected tolerance for a trust under this level of pressure.'},
     {id:'concern',  to:85,  tone:'warn',     label:'CONCERN',
      line:'Waiting list growing faster than clearance. 52-week breaches likely.'},
     {id:'critical', to:100, tone:'critical', label:'CRITICAL',
      line:'Access standards failed. Regulatory escalation and NHSE scrutiny.'}
   ],
   thresholds:[
     {at:72, dir:'above', severity:'warn',
      title:'ACCESS UNDER PRESSURE',
      line:'Clearance is losing to demand. 52-week breaches will follow.'},
     {at:85, dir:'above', severity:'critical',
      title:'ACCESS STANDARD FAILED',
      line:'Constitutional standard missed. Formal NHSE escalation expected.'},
     {at:48, dir:'below', severity:'praise',
      title:'ACCESS EXEMPLAR',
      line:'Top-decile waits. Worth defending in the operating plan.'}
   ]
  },
  {key:'patsat',  label:'PAT SAT', full:'Patient Satisfaction', money:false, goodUp:true,  start:63, min:0,  max:100,
   unit:'index',
   meaning:'Composite of Friends and Family scores, complaints volume and national inpatient survey results.',
   proxy:'A 1-point fall is roughly a 2% rise in formal complaints received.',
   owner:'CHIEF NURSE', ownerRole:'cno',
   bands:[
     {id:'critical', to:35,  tone:'critical', label:'CRITICAL',
      line:'Sustained poor experience is driving external scrutiny from Healthwatch and CQC.'},
     {id:'concern',  to:50,  tone:'warn',     label:'CONCERN',
      line:'Complaints are outpacing resolution and confidence in care is falling.'},
     {id:'stable',   to:68,  tone:'neutral',  label:'STABLE',
      line:'Patient experience remains within expected tolerance for current operational pressure.'},
     {id:'strong',   to:82,  tone:'good',     label:'STRONG',
      line:'Positive feedback is above peer median and complaints are being contained.'},
     {id:'exemplar', to:100, tone:'great',    label:'EXEMPLAR',
      line:'Top-decile patient experience is strengthening public confidence in care.'}
   ],
   thresholds:[
     {at:50, dir:'below', severity:'warn',
      title:'PATIENT EXPERIENCE DECLINING',
      line:'Complaints rising faster than they are being closed.'},
     {at:35, dir:'below', severity:'critical',
      title:'PATIENT EXPERIENCE FAILURE',
      line:'Sustained poor feedback. Healthwatch and CQC will act on this.'},
     {at:82, dir:'above', severity:'praise',
      title:'PATIENT EXPERIENCE EXEMPLAR',
      line:'Friends and Family scores in the top decile.'}
   ]
  },
  {key:'morale',  label:'MORALE',  full:'Staff Morale',         money:false, goodUp:true,  start:58, min:0,  max:100,
   unit:'index',
   meaning:'Composite of staff survey engagement, sickness absence, turnover and vacancy rate.',
   proxy:'A 1-point fall is roughly a 0.3% rise in turnover, which is about 20 leavers a year.',
   owner:'CHIEF EXECUTIVE', ownerRole:'ceo',
   bands:[
     {id:'critical', to:32,  tone:'critical', label:'CRITICAL',
      line:'Retention is failing and workforce capacity can no longer sustain safe services.'},
     {id:'concern',  to:48,  tone:'warn',     label:'CONCERN',
      line:'Vacancy and sickness pressures are increasing dependence on temporary staffing.'},
     {id:'stable',   to:65,  tone:'neutral',  label:'STABLE',
      line:'Workforce resilience is holding, but teams have little spare capacity.'},
     {id:'strong',   to:80,  tone:'good',     label:'STRONG',
      line:'Engagement and retention are above peer median, supporting reliable services.'},
     {id:'exemplar', to:100, tone:'great',    label:'EXEMPLAR',
      line:'A thriving workforce is attracting staff and sustaining high-quality care.'}
   ],
   thresholds:[
     {at:48, dir:'below', severity:'warn',
      title:'WORKFORCE AT RISK',
      line:'Vacancy and sickness rates climbing. Agency spend will follow.'},
     {at:32, dir:'below', severity:'critical',
      title:'WORKFORCE CRISIS',
      line:'Retention failing. Staff survey will be bottom quartile nationally.'},
     {at:80, dir:'above', severity:'praise',
      title:'WORKFORCE THRIVING',
      line:'Retention and engagement above peer median. Protect this.'}
   ]
  },
  {key:'safety',  label:'SAFETY',  full:'Safety',               money:false, goodUp:true,  start:66, min:0,  max:100,
   unit:'index',
   meaning:'Composite of incident rate, never events, harm-free care and the CQC safety domain.',
   proxy:'A 1-point fall is roughly one extra moderate-harm incident per month.',
   owner:'MEDICAL DIRECTOR', ownerRole:'md',
   bands:[
     {id:'critical', to:35,  tone:'critical', label:'CRITICAL',
      line:'Regulatory intervention likely. Serious incidents are not being contained.'},
     {id:'concern',  to:55,  tone:'warn',     label:'CONCERN',
      line:'Harm indicators rising. Safety huddles are not holding the line.'},
     {id:'stable',   to:72,  tone:'neutral',  label:'STABLE',
      line:'Within expected tolerance for a trust under this level of pressure.'},
     {id:'strong',   to:85,  tone:'good',     label:'STRONG',
      line:'Harm-free care above peer median. Governance grip is visible.'},
     {id:'exemplar', to:100, tone:'great',    label:'EXEMPLAR',
      line:'Top-decile safety performance. This is what the board should protect.'}
   ],
   thresholds:[
     {at:55, dir:'below', severity:'warn',
      title:'SAFETY BELOW TOLERANCE',
      line:'Board must record mitigating actions in the risk register.'},
     {at:35, dir:'below', severity:'critical',
      title:'SAFETY BREACH',
      line:'Automatic Inadequate rating at year end unless recovered.'},
     {at:85, dir:'above', severity:'praise',
      title:'SAFETY EXEMPLAR',
      line:'Sustained top-decile performance. Worth publishing.'}
   ]
  },
  {key:'rep',     label:'REP',     full:'Reputation',           money:false, goodUp:true,  start:60, min:0,  max:100,
   unit:'index',
   meaning:'Composite of local media sentiment, regulator confidence and system partner standing.',
   proxy:'A 1-point fall is roughly one additional critical local news cycle per quarter.',
   owner:'DIRECTOR OF GOVERNANCE', ownerRole:'gov',
   bands:[
     {id:'critical', to:35,  tone:'critical', label:'CRITICAL',
      line:'Public confidence has collapsed and system partners are distancing themselves.'},
     {id:'concern',  to:50,  tone:'warn',     label:'CONCERN',
      line:'Adverse coverage is defining the Trust and weakening partner confidence.'},
     {id:'stable',   to:68,  tone:'neutral',  label:'STABLE',
      line:'External confidence is holding despite visible operational pressures.'},
     {id:'strong',   to:82,  tone:'good',     label:'STRONG',
      line:'The Trust is trusted locally, supporting recruitment and partnership working.'},
     {id:'exemplar', to:100, tone:'great',    label:'EXEMPLAR',
      line:'A top-tier public standing is amplifying confidence across patients, staff and partners.'}
   ],
   thresholds:[
     {at:50, dir:'below', severity:'warn',
      title:'REPUTATION DAMAGED',
      line:'Adverse coverage is shaping the public account of the trust.'},
     {at:35, dir:'below', severity:'critical',
      title:'PUBLIC CONFIDENCE LOST',
      line:'Sustained negative profile. System partners will distance themselves.'},
     {at:82, dir:'above', severity:'praise',
      title:'REPUTATION STRONG',
      line:'Trusted locally. Easier recruitment and smoother partnership working.'}
   ]
  }
];

function getMetricDef(key){
  for(var i=0;i<METRIC_DEFS.length;i++){
    if(METRIC_DEFS[i].key===key) return METRIC_DEFS[i];
  }
  return null;
}

function initialMetricStats(){
  var stats={}, i, def;
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    stats[def.key]=def.start;
  }
  return stats;
}

function cloneMetricStats(stats){
  var copy={}, i, def;
  stats=stats || initialMetricStats();
  for(i=0;i<METRIC_DEFS.length;i++){
    def=METRIC_DEFS[i];
    copy[def.key]=Number(stats[def.key] != null ? stats[def.key] : def.start);
  }
  return copy;
}

function clampMetricStat(key, value){
  var def=getMetricDef(key);
  return def ? Math.max(def.min, Math.min(def.max, value)) : value;
}

function mergeMetricEffects(a,b){
  var merged={}, key, left=a || {}, right=b || {};
  for(key in left){ if(left.hasOwnProperty(key)) merged[key]=left[key]; }
  for(key in right){ if(right.hasOwnProperty(key)) merged[key]=(merged[key] || 0)+right[key]; }
  return merged;
}

function applyMetricEffects(stats, effects){
  var next=cloneMetricStats(stats), key, source=effects || {};
  for(key in source){
    if(source.hasOwnProperty(key) && next.hasOwnProperty(key)){
      next[key]=clampMetricStat(key, next[key]+source[key]);
    }
  }
  return next;
}

function metricDeltaText(def, value){
  if(Math.abs(value)<0.05) return '-';
  if(def.money){
    return (value<0 ? '-' : '+')+'GBP'+Math.abs(value).toFixed(1)+'m';
  }
  return (value<0 ? '-' : '+')+String(Math.abs(Math.round(value)));
}

function fmtMoney(v){
  var sign=v<-0.05 ? '&#8722;' : (v>0.05 ? '+' : '');
  return sign+'&pound;'+Math.abs(v).toFixed(1)+'m';
}

var DEFAULT_OUTCOME = {
  quarterId:'Q0',
  optionId:'status_quo',
  optionTitle:'Status Quo',
  decisionSummary:'Baseline winter pressure plays out before the board makes its first decision.',
  startStats:{budget:0, waiting:68, patsat:63, morale:58, safety:66, rep:60},
  endStats:{budget:-1.8, waiting:69, patsat:65, morale:61, safety:68, rep:60}
};
