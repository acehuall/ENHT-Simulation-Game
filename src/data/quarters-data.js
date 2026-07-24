'use strict';
/* ---------- quarterly board decision data ---------- */
var QUARTERS = [
  {
    id:'Q1',
    label:'Q1',
    title:'Opening Position',
    displayName:'Q1 - OPENING POSITION',
    scenario:'Norovirus has closed two bays on Ward 4 while emergency demand rises. The board must protect safety without losing grip on finance, waiting times and staff morale.',
    issue:{
      tag:'PRIORITY ESCALATION - DECISION REQUIRED',
      title:'INFECTION PRESSURE ESCALATION',
      paras:[
        'A norovirus outbreak has closed two bays on Ward 4 and staff sickness is running well above plan.',
        'Escalation beds are open but unfunded. Corridor care has been reported and the trust needs one clear response before the pressure peak.',
        'Doing nothing is itself a decision: without intervention, the outbreak will keep pulling staff away from safe cover.'
      ],
      risk:'Projected cases breach safe ward capacity before the end of the quarter unless the board acts.',
      chart:{actual:[14,18,23,30,38,47], projected:[56,66,78,90,103,116], capacity:80, maxV:120}
    },
    options:[
      {
        id:'hire_temporary_staff',
        label:'A',
        title:'Hire Temporary Staff',
        description:'Hire temporary agency staff to cover sickness and stabilise ward staffing.',
        effects:{budget:-2.2, waiting:-9, patsat:+4, morale:+5, safety:+7, rep:+2},
        pros:['Fast to mobilise','Protects safe staffing'],
        cons:['Agency premium is costly','Can irritate substantive staff'],
        decisionSummary:'Temporary staff protected safety and flow, but created a major financial pressure.'
      },
      {
        id:'slow_non_essential_care',
        label:'B',
        title:'Slow Non-Essential Care',
        description:'Pause lower-priority activity so staff and beds can be moved to urgent pressure.',
        effects:{budget:+0.5, waiting:+13, patsat:-4, morale:+2, safety:-2, rep:-6},
        pros:['Frees beds immediately','Almost cost neutral'],
        cons:['Waiting list grows','Reputational damage'],
        decisionSummary:'Urgent care stabilised, but elective waits and public confidence worsened.'
      },
      {
        id:'rapid_discharge',
        label:'C',
        title:'Rapid Discharge',
        description:'Accelerate discharge planning to free beds faster.',
        effects:{budget:+0.2, waiting:-6, patsat:-4, morale:-5, safety:-15, rep:-3},
        pros:['Creates bed capacity quickly','Low direct cost'],
        cons:['Pressure shifts to wards','Discharge risk rises'],
        decisionSummary:'Beds were freed quickly, but pressure moved onto wards and discharge teams.'
      },
      {
        id:'divert_to_other_trusts',
        label:'D',
        title:'Divert to Other Trusts',
        description:'Divert some ambulance flow to neighbouring trusts during the peak.',
        effects:{budget:-1.0, waiting:-8, patsat:-2, morale:+4, safety:+3, rep:-4},
        pros:['Reduces immediate site pressure','Protects safety on site'],
        cons:['Depends on neighbours','Reputation hit with region'],
        decisionSummary:'Internal pressure reduced, but the trust relied visibly on neighbouring hospitals.'
      }
    ]
  },
  {
    id:'Q2',
    label:'Q2',
    title:'Capacity Strain',
    displayName:'Q2 - CAPACITY STRAIN',
    scenario:'Delayed discharges and bed occupancy are rising. The trust needs extra capacity without creating unsafe staffing gaps.',
    issue:{
      tag:'CAPACITY PAPER - BOARD DECISION',
      title:'BED CAPACITY STRAIN',
      paras:[
        'The hospital is running above planned occupancy and discharge delays are blocking assessment areas.',
        'Opening capacity helps flow, but every extra bed requires staff, support services and governance grip.',
        'The board must choose whether to create capacity, shift demand, or accept operational deterioration.'
      ],
      risk:'Bed occupancy is projected to stay above safe operating levels unless discharge delays improve.',
      chart:{actual:[82,86,88,91,94,96], projected:[98,101,104,107,110,112], capacity:92, maxV:120}
    },
    options:[
      {
        id:'open_escalation_ward',
        label:'A',
        title:'Open Escalation Ward',
        description:'Open 18 escalation beds in the old day unit.',
        effects:{budget:-2.2, waiting:-12, patsat:+3, morale:-6, safety:-6, rep:+1},
        pros:['Real extra capacity','Cuts corridor care'],
        cons:['Stretches staff','Adds direct cost'],
        decisionSummary:'Extra beds improved flow, but thin staffing hurt morale and safety confidence.'
      },
      {
        id:'virtual_ward',
        label:'B',
        title:'Expand Virtual Ward',
        description:'Move suitable patients home with remote monitoring and rapid response support.',
        effects:{budget:-0.9, waiting:-8, patsat:+5, morale:+4, safety:+3, rep:+3},
        pros:['Patients recover at home','Moderate cost'],
        cons:['Needs clinical oversight','Not suitable for every patient'],
        decisionSummary:'The virtual ward reduced bed pressure and improved patient experience.'
      },
      {
        id:'cancel_electives',
        label:'C',
        title:'Cancel Electives',
        description:'Cancel routine elective work for four weeks to release beds and theatre staff.',
        effects:{budget:+0.6, waiting:+14, patsat:-6, morale:+1, safety:-3, rep:-7},
        pros:['Rapid capacity release','Low immediate spend'],
        cons:['Waiting list damage','Public criticism'],
        decisionSummary:'Cancelling electives created space quickly, but waiting performance and reputation suffered.'
      },
      {
        id:'discharge_partnership',
        label:'D',
        title:'Fund Discharge Partnership',
        description:'Fund extra social care brokerage and transport to unblock medically fit patients.',
        effects:{budget:-1.1, waiting:-9, patsat:+3, morale:+3, safety:+4, rep:+2},
        pros:['Tackles root cause','Supports wards'],
        cons:['Requires partners','Benefits build over weeks'],
        decisionSummary:'Partnership funding improved discharge flow and reduced ward frustration.'
      }
    ]
  },
  {
    id:'Q3',
    label:'Q3',
    title:'Media Pressure',
    displayName:'Q3 - MEDIA PRESSURE',
    scenario:'Local media are covering delays and patient stories. The board must respond without overpromising or damaging trust.',
    issue:{
      tag:'REPUTATION RISK - RESPONSE REQUIRED',
      title:'MEDIA AND PUBLIC CONFIDENCE',
      paras:[
        'A local news team is outside the entrance after several patient stories reached the press.',
        'Staff want visible support from the board, but any response must be accurate and deliverable.',
        'Silence may avoid a difficult interview today while making tomorrow harder.'
      ],
      risk:'Public confidence and staff morale are both at risk if the trust appears evasive.',
      chart:{actual:[18,22,29,36,42,49], projected:[55,62,70,79,88,96], capacity:65, maxV:100}
    },
    options:[
      {
        id:'hold_press_briefing',
        label:'A',
        title:'Hold Press Briefing',
        description:'Hold a short briefing with clear facts, apologies and next steps.',
        effects:{budget:0, waiting:0, patsat:+2, morale:+3, safety:0, rep:+9},
        pros:['Transparent','Supports staff confidence'],
        cons:['Public scrutiny','Needs careful messaging'],
        decisionSummary:'The briefing improved confidence because it acknowledged pressure and named credible actions.'
      },
      {
        id:'publish_recovery_plan',
        label:'B',
        title:'Publish Recovery Plan',
        description:'Publish a measurable recovery plan and weekly performance update.',
        effects:{budget:-0.5, waiting:-3, patsat:+3, morale:+2, safety:+2, rep:+6},
        pros:['Turns criticism into action','Gives measurable commitments'],
        cons:['Creates delivery pressure','Small support cost'],
        decisionSummary:'The recovery plan rebuilt some confidence and gave managers a clearer operating rhythm.'
      },
      {
        id:'restrict_media_access',
        label:'C',
        title:'Restrict Media Access',
        description:'Limit filming around the entrance and route all requests through communications.',
        effects:{budget:0, waiting:+1, patsat:-3, morale:-3, safety:-3, rep:-8},
        pros:['Limits media intrusion','Reduces disruption'],
        cons:['Looks defensive','Frustrates journalists'],
        decisionSummary:'Restricting access reduced disruption, but the trust looked defensive in the coverage.'
      },
      {
        id:'no_comment',
        label:'D',
        title:'No Comment',
        description:'Decline interviews until operational pressure has eased.',
        effects:{budget:+0.2, waiting:+2, patsat:-4, morale:-6, safety:-7, rep:-11},
        pros:['Avoids live mistake','No direct cost'],
        cons:['Narrative runs without the trust','Staff feel exposed'],
        decisionSummary:'The trust avoided a difficult interview but lost control of the public story.'
      }
    ]
  },
  {
    id:'Q4',
    label:'Q4',
    title:'Winter Surge',
    displayName:'Q4 - WINTER SURGE',
    scenario:'A cold snap has increased ambulance arrivals and staff sickness. The year closes with a final resilience decision.',
    issue:{
      tag:'WINTER RESILIENCE - FINAL DECISION',
      title:'COLD SNAP SURGE',
      paras:[
        'Ambulance arrivals are climbing and sickness absence is rising across clinical and support teams.',
        'The board can spend to protect resilience, trade off planned care, or lean on regional partners.',
        'The final decision will shape the year-end position shown to governors.'
      ],
      risk:'Without a resilience response, the trust risks a visible year-end deterioration in safety and morale.',
      chart:{actual:[44,50,57,63,71,79], projected:[86,94,101,109,116,124], capacity:96, maxV:130}
    },
    options:[
      {
        id:'staff_wellbeing_fund',
        label:'A',
        title:'Fund Staff Wellbeing',
        description:'Fund rest spaces, hot food, transport support and extra clinical supervision.',
        effects:{budget:-1.9, waiting:0, patsat:+2, morale:+8, safety:+5, rep:+2},
        pros:['Protects morale','Reduces fatigue risk'],
        cons:['Costs money','Flow impact is indirect'],
        decisionSummary:'Staff support reduced fatigue and improved morale during the surge.'
      },
      {
        id:'expand_discharge_lounge',
        label:'B',
        title:'Expand Discharge Lounge',
        description:'Extend discharge lounge hours and transport support through the cold snap.',
        effects:{budget:-1.0, waiting:-9, patsat:+3, morale:+2, safety:+3, rep:+2},
        pros:['Improves flow','Visible practical action'],
        cons:['Needs staffing','Moderate cost'],
        decisionSummary:'The discharge lounge extension improved flow and reduced bed pressure.'
      },
      {
        id:'mutual_aid_winter',
        label:'C',
        title:'Request Mutual Aid',
        description:'Ask neighbouring trusts and community partners for short-term surge support.',
        effects:{budget:-0.3, waiting:-5, patsat:-2, morale:+2, safety:+2, rep:-3},
        pros:['Protects safety','Lower direct spend'],
        cons:['Depends on partners','Reputation cost'],
        decisionSummary:'Mutual aid helped safety, but the trust looked dependent on regional support.'
      },
      {
        id:'defer_capital',
        label:'D',
        title:'Defer Capital Spend',
        description:'Defer non-urgent capital spending to fund temporary winter resilience.',
        effects:{budget:+1.0, waiting:-2, patsat:-1, morale:-4, safety:-13, rep:-3},
        pros:['Protects revenue budget','Funds short-term pressure'],
        cons:['Lets estates and equipment risk build','Signals financial strain'],
        decisionSummary:'Deferring capital protected the immediate position, but ageing estates and equipment let safety risk build through the year.'
      }
    ]
  }
];

function getFirstQuarterId(){ return QUARTERS[0].id; }

var _quarterWarned={};
function _warnQuarterFallback(msg){
  if(_quarterWarned[msg]) return;
  _quarterWarned[msg]=true;
  if(typeof console!=='undefined' && console.warn) console.warn('[quarters-data] '+msg);
}

function getQuarterIndexById(quarterId){
  for(var i=0;i<QUARTERS.length;i++){
    if(QUARTERS[i].id===quarterId) return i;
  }
  _warnQuarterFallback('unknown quarter id "'+quarterId+'" - falling back to '+QUARTERS[0].id);
  return 0;
}

function getQuarterById(quarterId){
  return QUARTERS[getQuarterIndexById(quarterId)];
}

function getNextQuarterId(quarterId){
  var next=getQuarterIndexById(quarterId)+1;
  return next<QUARTERS.length ? QUARTERS[next].id : null;
}

function getQuarterOption(quarterOrId, optionId){
  var q=typeof quarterOrId==='string' ? getQuarterById(quarterOrId) : quarterOrId;
  var fallback=q.options[0], i;
  if(!optionId) return fallback;
  for(i=0;i<q.options.length;i++){
    if(q.options[i].id===optionId) return q.options[i];
  }
  _warnQuarterFallback('unknown option id "'+optionId+'" in '+q.id+' - falling back to '+fallback.id);
  return fallback;
}
