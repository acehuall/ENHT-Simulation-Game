'use strict';
/* ---------- round-end board report content ---------- */
/* end-of-quarter values follow METRIC_DEFS starts + STAT_EVENTS in scenario-data.js */
var REPORT_DATA = {
  quarter:'Q1', quarterName:'WINTER PRESSURE',

  /* last = start of quarter, cur = end of quarter */
  metrics:[
    {key:'budget', label:'BUDGET',  full:'Budget',               money:true, goodUp:true,  last:0,  cur:-1.8, min:-5, max:2},
    {key:'waiting',label:'WAITING', full:'Waiting Times',        goodUp:false, last:68, cur:71,   min:0,  max:100},
    {key:'patsat', label:'PAT SAT', full:'Patient Satisfaction', goodUp:true,  last:63, cur:58,   min:0,  max:100},
    {key:'morale', label:'MORALE',  full:'Staff Morale',         goodUp:true,  last:58, cur:53,   min:0,  max:100},
    {key:'safety', label:'SAFETY',  full:'Safety',               goodUp:true,  last:66, cur:56,   min:0,  max:100},
    {key:'rep',    label:'REP',     full:'Reputation',           goodUp:true,  last:60, cur:55,   min:0,  max:100}
  ],

  summary:[
    'The trust closed the quarter in a mixed but deteriorating position. Demand rose through all three months and operational grip weakened once the norovirus outbreak took hold on Ward 4.',
    'Safety is the board’s headline concern following the Ward 4 incident. Morale remains fragile and will worsen if escalation beds stay open without funded cover.'
  ],

  issue:{
    tag:'⚠ PRIORITY ESCALATION — DECISION REQUIRED TONIGHT',
    title:'WINTER PRESSURE ESCALATION',
    paras:[
      'A norovirus outbreak has closed two bays on Ward 4 and staff sickness is running at three times plan. Escalation beds are open but unfunded, and corridor care was reported on four days last week.',
      'Emergency demand is projected to rise a further 40% over the next six weeks as winter pressure peaks. On current staffing the trust cannot open additional capacity without breaching safe cover ratios.',
      'The board is asked to agree ONE response before the meeting closes. Doing nothing is itself a decision: on the current trajectory, confirmed cases cross safe ward capacity in week 9.'
    ],
    risk:'⚠ RISK — projected cases breach safe capacity (80 / wk) at week 9 on the do-nothing trajectory.',
    chart:{
      actual:[14,18,23,30,38,47],
      projected:[56,66,78,90,103,116],
      capacity:80, maxV:120
    }
  },

  options:[
    {
      title:'AGENCY NURSING COVER',
      desc:'Buy in agency staff to hold rotas through the peak.',
      pros:['Fast to mobilise', 'Protects safe staffing'],
      cons:['Agency premium is costly', 'Substantive staff resent rates'],
      impact:[{t:'BUDGET −£1.8m',tone:'bad'},{t:'SAFETY +3',tone:'good'},{t:'WAITING −5',tone:'good'}]
    },
    {
      title:'OPEN ESCALATION WARD',
      desc:'Open 18 escalation beds on the old day unit.',
      pros:['Real extra capacity', 'Cuts corridor care'],
      cons:['Stretches existing staff', 'Morale and safety risk if thin'],
      impact:[{t:'WAITING −8',tone:'good'},{t:'MORALE −4',tone:'bad'},{t:'BUDGET −£0.9m',tone:'bad'}]
    },
    {
      title:'POSTPONE ELECTIVE ACTIVITY',
      desc:'Pause routine surgery for four weeks, free beds and staff.',
      pros:['Frees beds immediately', 'Nearly cost neutral'],
      cons:['Waiting list grows', 'Reputational damage'],
      impact:[{t:'WAITING +9',tone:'bad'},{t:'REP −4',tone:'bad'},{t:'BUDGET +£0.4m',tone:'good'}]
    },
    {
      title:'REGIONAL MUTUAL AID',
      desc:'Divert ambulance flow to neighbouring trusts at peak.',
      pros:['Low direct cost', 'Protects safety on site'],
      cons:['Rep hit with region', 'Depends on neighbours’ goodwill'],
      impact:[{t:'REP −3',tone:'bad'},{t:'PAT SAT −2',tone:'bad'},{t:'SAFETY +2',tone:'good'}]
    }
  ]
};
