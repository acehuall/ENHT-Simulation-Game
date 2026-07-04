'use strict';
/* -------------------------------------------------------------------------
   Quarter authoring guide
   - Quarter text lives in title, scenarioText, page1Summary and page2Issue.
   - Deterministic stat changes live in options[*].optionImpacts.
   - Random/luck changes live in riskEvents and are matched by optionId.
   - Page 2 visual data lives in page2GraphType and page2GraphData.
   - To add Q5, add another QUARTERS object with the same shape and, if
     needed, add optional scene visuals in quarter-events.js.
------------------------------------------------------------------------- */

var QUARTER_STAT_DEFS = [
  {key:'budget', label:'BUDGET', money:true, goodUp:true, start:0, min:-25, max:20},
  {key:'waiting', label:'PATIENTS MET', money:false, goodUp:true, start:68, min:0, max:100},
  {key:'patsat', label:'PAT SAT', money:false, goodUp:true, start:63, min:0, max:100},
  {key:'morale', label:'MORALE', money:false, goodUp:true, start:58, min:0, max:100},
  {key:'safety', label:'SAFETY', money:false, goodUp:true, start:66, min:0, max:100},
  {key:'rep', label:'REP', money:false, goodUp:true, start:60, min:0, max:100}
];

var QUARTERS = [
  {
    id:'Q1', label:'Q1', title:'The Corridor Crisis', displayName:'Q1 - THE CORRIDOR CRISIS',
    scenarioText:'It is early January and there has been an immense rise in flu cases impacting the Trust. Bed occupancy is at 97%, and staff sickness has caused understaffing across the wards.',
    page1Summary:[
      'Northbrook enters the year with demand already above plan. Bed occupancy is near the point where routine flow breaks down, and sickness gaps are forcing senior nurses to redeploy staff shift by shift.',
      'The board needs one clear winter-pressure response. The safest answer is expensive; the cheapest answers move pressure elsewhere.'
    ],
    page2Issue:{
      tag:'PRIORITY ESCALATION - DECISION REQUIRED TONIGHT',
      title:'WINTER PRESSURE AT BREAKING POINT',
      paras:[
        'Flu admissions have risen sharply over the last four weeks. Several wards are running short staffed, and bed occupancy is now close to the level where corridor care becomes routine.',
        'Operational teams can create some flow, but every route has a trade-off: money, safety, waiting-list performance, or local reputation.',
        'The board is asked to agree one response for the quarter before the winter peak lands fully.'
      ],
      risk:'Risk: if no action is taken, occupancy remains above safe operating headroom and delayed discharges compound daily.'
    },
    page2GraphType:'winterPressure',
    page2GraphData:{weeks:['WK-3','WK-2','WK-1','NOW'], bedOccupancy:[91,94,96,97], fluAdmissions:[28,41,58,73], staffSickness:[6,9,14,18], safeOccupancy:92},
    options:[
      {id:'hire_temporary_staff', label:'A', title:'Hire Temporary Staff', description:'Bring in temporary agency staff to cover sickness and stabilise ward staffing through the flu peak.', pros:['Patient safety increases','Patients met within 18 weeks improves'], cons:['Large increase in costs'], optionImpacts:{budget:-8, waiting:+5, patsat:+3, morale:+1, safety:+6, rep:+1}, outcomeText:'Agency cover protects safety and flow, but the premium cost lands immediately.'},
      {id:'slow_non_essential_care', label:'B', title:'Slow Non-Essential Care', description:'Pause lower-priority activity so urgent care can use the available beds and staff.', pros:['Improved staff coverage','Improved reputation for protecting urgent care'], cons:['Waiting list worsens'], optionImpacts:{budget:+1, waiting:-7, patsat:-3, morale:+3, safety:+2, rep:+2}, outcomeText:'Urgent services stabilise, but elective patients wait longer.'},
      {id:'rapid_discharge', label:'C', title:'Rapid Discharge', description:'Accelerate discharge planning and step-down arrangements to free beds faster.', pros:['Improves patient flow and utilisation'], cons:['Could be slow to implement','Carries discharge-readiness risk'], optionImpacts:{budget:+1, waiting:+4, patsat:-1, morale:-1, safety:-1, rep:0}, outcomeText:'Flow improves where discharge pathways work, but the risk sits with frail patients and ward teams.'},
      {id:'divert_to_other_trusts', label:'D', title:'Divert to Other Trusts', description:'Ask regional partners to absorb some demand while Northbrook restores safe cover.', pros:['Improves staff morale','Improves patient safety'], cons:['Reputational damage'], optionImpacts:{budget:-3, waiting:+3, patsat:-2, morale:+4, safety:+4, rep:-5}, outcomeText:'Internal pressure eases, but the Trust looks dependent on neighbours.'}
    ],
    riskEvents:[
      {optionId:'hire_temporary_staff', name:'Temporary staff integrate well', chance:0.35, impacts:{safety:+2, morale:+1}, explanation:'The agency team picked up ward routines quickly.'},
      {optionId:'hire_temporary_staff', name:'Agency cost overrun', chance:0.25, impacts:{budget:-3, rep:-1}, explanation:'Premium shifts ran above the first estimate.'},
      {optionId:'rapid_discharge', name:'Community capacity holds', chance:0.30, impacts:{waiting:+2, patsat:+1}, explanation:'Community partners accepted more supported discharges than expected.'},
      {optionId:'rapid_discharge', name:'Readmission spike', chance:0.28, impacts:{safety:-3, rep:-2}, explanation:'A small number of patients bounced back into urgent care.'},
      {optionId:'divert_to_other_trusts', name:'Neighbouring trust pushes back', chance:0.25, impacts:{rep:-2, waiting:-1}, explanation:'Regional partners accepted fewer patients than planned.'}
    ],
    reportTone:'Winter operational pressure with a safety-first board dilemma.',
    nextQuarterIntro:'Finance now moves to the top of the board agenda.',
    timelineEvents:[
      {t:8, name:'Flu admissions rise', toast:'Flu admissions rising across wards', effects:{waiting:-4, patsat:-2, morale:-4, safety:-4, rep:-1}},
      {t:28, name:'Corridor-care warning', toast:'Corridor-care warning logged', effects:{waiting:-2, patsat:-3, morale:-2, safety:-5, rep:-4}}
    ]
  },
  {
    id:'Q2', label:'Q2', title:'The Treasury Dilemma', displayName:'Q2 - THE TREASURY DILEMMA',
    scenarioText:'Due to financial restraints, the Trust has been asked to deliver a GBP12 million Cost Improvement Plan by year end. Around 70% of the Trust budget is pay.',
    page1Summary:[
      'Winter decisions have left the Trust with limited financial room. The new national savings target is material enough to shape every service line.',
      'Pay is the largest cost base, but every financial option has a visible operational or ethical consequence.'
    ],
    page2Issue:{
      tag:'FINANCE ESCALATION - COST IMPROVEMENT PLAN',
      title:'GBP12M SAVINGS TARGET',
      paras:[
        'The Trust has been asked to identify GBP12m of savings by year end. Currently identified schemes are well short of the ask.',
        'Around 70% of controllable spend is pay, so the board cannot treat the target as a back-office issue only.',
        'The board must decide whether to raise income, automate work, accept a deficit position, or pursue lower-risk waste reduction.'
      ],
      risk:'Risk: a weak plan may protect staff now but reduce board control later in the year.'
    },
    page2GraphType:'financePressure',
    page2GraphData:{target:12, identified:4.2, budgetGapByQuarter:[2.1,4.8,8.4,12.0], costSplit:{pay:70, nonPay:30}, waterfall:[{label:'Target', value:12.0},{label:'Identified', value:-4.2},{label:'Unresolved', value:7.8}]},
    options:[
      {id:'increase_private_revenue', label:'A', title:'Increase Private Revenue', description:'Use spare sessions and selected capacity to increase private income.', pros:['Improved revenue','Staff mostly unaffected'], cons:['Ethical and reputational hit','Decreased bed capacity'], optionImpacts:{budget:+7, waiting:-3, patsat:-2, morale:0, safety:-1, rep:-4}, outcomeText:'Income improves, but public-facing capacity and reputation take the strain.'},
      {id:'automate_workforce_processes', label:'B', title:'Automate Workforce Processes', description:'Invest in rostering, HR and payroll automation to reduce manual work and agency leakage.', pros:['Cost saving','Time saving'], cons:['Staff unhappy','Reputational hit'], optionImpacts:{budget:+5, waiting:+2, patsat:0, morale:-4, safety:0, rep:-2}, outcomeText:'The back office gets leaner, but staff feel change is being done to them.'},
      {id:'submit_deficit_plan', label:'C', title:'Submit Deficit Plan', description:'Be transparent that the Trust cannot safely deliver the full saving this year.', pros:['No direct staff impact'], cons:['Reduced control','Could restrict future options'], optionImpacts:{budget:-4, waiting:+1, patsat:+1, morale:+2, safety:+1, rep:-3}, outcomeText:'Services avoid immediate cuts, but external scrutiny increases.'},
      {id:'reduce_waste', label:'D', title:'Reduce Waste', description:'Target procurement variation, stock loss, energy use and low-value process waste.', pros:['Better value for money','Lower cost pressure','Low direct patient impact'], cons:['Savings may be limited','Takes time to identify properly'], optionImpacts:{budget:+4, waiting:+1, patsat:+1, morale:+1, safety:+1, rep:+1}, outcomeText:'The board chooses a slower but broadly acceptable savings route.'}
    ],
    riskEvents:[
      {optionId:'increase_private_revenue', name:'Private demand stronger than forecast', chance:0.25, impacts:{budget:+3}, explanation:'Additional activity filled more quickly than expected.'},
      {optionId:'increase_private_revenue', name:'Capacity criticism lands', chance:0.30, impacts:{rep:-3, patsat:-1}, explanation:'Local coverage questions whether NHS patients are being displaced.'},
      {optionId:'automate_workforce_processes', name:'Rostering benefits land early', chance:0.35, impacts:{budget:+2, morale:+1}, explanation:'Roster gaps reduced sooner than expected.'},
      {optionId:'automate_workforce_processes', name:'Implementation disruption', chance:0.25, impacts:{morale:-2, waiting:-1}, explanation:'Teams lost time while new processes bedded in.'},
      {optionId:'submit_deficit_plan', name:'Regulator accepts realism', chance:0.20, impacts:{rep:+2, budget:+1}, explanation:'The deficit plan is seen as honest and clinically grounded.'},
      {optionId:'reduce_waste', name:'Waste scheme under-delivers', chance:0.32, impacts:{budget:-2}, explanation:'Savings are real, but not as large as the paper suggested.'}
    ],
    reportTone:'Finance, control and ethical trade-offs rather than clinical firefighting.',
    nextQuarterIntro:'Quality and culture now become unavoidable.',
    timelineEvents:[
      {t:8, name:'Savings gap confirmed', toast:'GBP12m CIP target confirmed', effects:{budget:-2, rep:-1}},
      {t:28, name:'Forecast gap widens', toast:'Forecast gap widening without grip', effects:{budget:-3, morale:-1, rep:-2}}
    ]
  },
  {
    id:'Q3', label:'Q3', title:'The Maternity Ward', displayName:'Q3 - THE MATERNITY WARD',
    scenarioText:'A baby in the maternity ward was seriously injured after a failure to escalate an issue to senior staff. Staff say this links to a culture of bullying. The board must decide how to respond.',
    page1Summary:[
      'The Trust is no longer dealing only with operational and financial pressure. Staff survey results are declining, incident escalation has failed, and safety culture concerns are visible.',
      'This quarter tests whether the board values transparency and learning when the short-term reputational cost is high.'
    ],
    page2Issue:{
      tag:'QUALITY AND GOVERNANCE ESCALATION',
      title:'MATERNITY SAFETY AND CULTURE',
      paras:[
        'A serious maternity incident has exposed a failure to escalate to senior staff. Initial staff feedback links the failure to a culture where people are afraid to challenge.',
        'Staff survey culture scores have declined for three periods in a row. Incident reports show more missed escalation steps.',
        'The board must decide how visibly and how forcefully to intervene.'
      ],
      risk:'Risk: a process-only response may miss the cultural cause of the safety failure.'
    },
    page2GraphType:'safetyCulture',
    page2GraphData:{periods:['T-3','T-2','T-1','NOW'], cultureScore:[72,67,61,54], bullyingConcerns:[14,21,29,38], escalationFailures:[3,5,8,12], seriousIncidents:[1,1,2,3]},
    options:[
      {id:'immediate_investigation', label:'A', title:'Immediate Investigation', description:'Commission an immediate independent investigation and protect staff who speak up.', pros:['Improves patient safety','Finds root causes'], cons:['Staff morale may decrease temporarily','Reputation hit if leaked'], optionImpacts:{budget:-2, waiting:0, patsat:+1, morale:-3, safety:+7, rep:-3}, outcomeText:'The Trust chooses learning and grip, accepting short-term discomfort.'},
      {id:'add_remedy_procedures', label:'B', title:'Add Remedy Procedures', description:'Introduce tighter escalation checklists, sign-off points and legal remedy controls.', pros:['Decreased negligence and insurance risk','Improved patient safety'], cons:['Slower processes','Staff may feel more monitored'], optionImpacts:{budget:-1, waiting:-2, patsat:0, morale:-2, safety:+5, rep:+1}, outcomeText:'The process gets safer, but staff feel watched unless leaders explain the why.'},
      {id:'issue_public_apology', label:'C', title:'Issue Public Apology', description:'Make a public apology and invite staff and families into a transparent improvement plan.', pros:['Improves staff reporting and openness','Shows transparency'], cons:['Reputation decreases in short term'], optionImpacts:{budget:-1, waiting:0, patsat:+3, morale:+4, safety:+3, rep:-4}, outcomeText:'Openness improves reporting, even though the public story is painful.'},
      {id:'executive_resignation', label:'D', title:'Executive Resignation', description:'Ask a senior executive to step down and reset accountability at the top.', pros:['Reputation may increase due to accountability'], cons:['Someone has to step down','Leadership instability'], optionImpacts:{budget:0, waiting:-1, patsat:+1, morale:-4, safety:+2, rep:+4}, outcomeText:'Accountability is visible, but leadership continuity becomes a live risk.'}
    ],
    riskEvents:[
      {optionId:'immediate_investigation', name:'Whistleblowers come forward', chance:0.30, impacts:{safety:+3, morale:+2}, explanation:'Protected listening sessions reveal fixable risks.'},
      {optionId:'immediate_investigation', name:'Investigation leaks early', chance:0.25, impacts:{rep:-3, morale:-1}, explanation:'The story breaks before the Trust can explain the process.'},
      {optionId:'add_remedy_procedures', name:'Checklist prevents repeat event', chance:0.28, impacts:{safety:+2, rep:+1}, explanation:'A senior review catches a deterioration earlier than before.'},
      {optionId:'add_remedy_procedures', name:'Staff feel blamed', chance:0.30, impacts:{morale:-3}, explanation:'The new controls are interpreted as surveillance.'},
      {optionId:'issue_public_apology', name:'Transparency builds trust', chance:0.32, impacts:{rep:+2, morale:+1}, explanation:'Families and staff respond well to the tone of the apology.'},
      {optionId:'executive_resignation', name:'Interim leadership steadies team', chance:0.25, impacts:{morale:+2, safety:+1}, explanation:'The interim leader is trusted by maternity teams.'}
    ],
    reportTone:'Governance, culture and patient safety crisis with public accountability pressure.',
    nextQuarterIntro:'The final quarter offers funding, but only if the board uses it well.',
    timelineEvents:[
      {t:8, name:'Escalation failure reported', toast:'Escalation failure under review', effects:{patsat:-2, morale:-4, safety:-5, rep:-3}},
      {t:28, name:'Culture concern visible', toast:'Staff survey culture score falling', effects:{morale:-5, safety:-3, rep:-2}}
    ]
  },
  {
    id:'Q4', label:'Q4', title:'Waiting List Promise', displayName:'Q4 - WAITING LIST PROMISE',
    scenarioText:'Due to government initiatives, the Trust has been offered GBP10 million of funding to reduce waiting lists. It is the largest allocation in the county.',
    page1Summary:[
      'The year closes with a strategic opportunity. Northbrook has secured the largest waiting-list allocation in the county, but the money can only solve one version of the problem.',
      'The board can protect the balance sheet, automate flow, partner regionally, or take a longer research bet.'
    ],
    page2Issue:{
      tag:'STRATEGIC OPPORTUNITY - FUNDING ALLOCATION',
      title:'GBP10M WAITING-LIST FUNDING',
      paras:[
        'Government funding gives Northbrook a one-off GBP10m allocation to reduce the waiting-list backlog and improve 18-week performance.',
        'The allocation is large enough to shift the year-end story, but only if it is deployed into capacity, process or partnership quickly.',
        'The board must decide whether to bank the windfall, improve automation, work with other trusts, or fund research.'
      ],
      risk:'Risk: using the money for the balance sheet may help finance but leave patients waiting.'
    },
    page2GraphType:'waitingListFunding',
    page2GraphData:{periods:['APR','JUN','SEP','NOW'], backlog:[7200,7800,8350,9100], within18Weeks:[69,67,64,61], forecastWithFunding:[61,66,72,78], fundingOptions:[{label:'Theatre lists', value:4.0},{label:'Automation', value:2.2},{label:'Partners', value:2.8},{label:'Reserve', value:1.0}]},
    options:[
      {id:'keep_as_savings', label:'A', title:'Keep as Savings', description:'Use the funding to improve the budget position rather than spend it on new activity.', pros:['Large financial windfall','Helps budget position'], cons:['Staff upset','No improvement in waiting lists'], optionImpacts:{budget:+10, waiting:-5, patsat:-4, morale:-4, safety:0, rep:-5}, outcomeText:'The accounts improve sharply, but the waiting-list promise is broken.'},
      {id:'improve_process_automation', label:'B', title:'Improve Process Automation', description:'Invest in pathway automation, validation and scheduling to move patients through faster.', pros:['Staff morale increases','Patients met increases'], cons:['Reduced manual checking','Patient safety risk'], optionImpacts:{budget:-6, waiting:+8, patsat:+3, morale:+3, safety:-2, rep:+2}, outcomeText:'Patients move faster through the pathway, though safety assurance must keep pace.'},
      {id:'partner_with_trusts', label:'C', title:'Partner With Trusts', description:'Pay partner trusts for mutual waiting-list capacity, transport support and data-sharing.', pros:['Patient satisfaction improves','Patients met increases','Better ambulance transport and data sharing'], cons:['Paying other trusts costs','Less direct control'], optionImpacts:{budget:-8, waiting:+10, patsat:+5, morale:+2, safety:+2, rep:+3}, outcomeText:'Regional capacity cuts the backlog, but Northbrook loses some direct grip.'},
      {id:'research_funding', label:'D', title:'Research Funding', description:'Use the allocation to seed research activity and potential breakthrough therapies.', pros:['Potential breakthrough therapies','Patient satisfaction and reputation could improve'], cons:['All funding spent','Takes time','Short-term waiting list impact may be limited'], optionImpacts:{budget:-10, waiting:+1, patsat:+3, morale:+2, safety:+1, rep:+6}, outcomeText:'The Trust invests in future benefit, but short-term access barely moves.'}
    ],
    riskEvents:[
      {optionId:'keep_as_savings', name:'Finance praise lands', chance:0.25, impacts:{rep:+2, budget:+1}, explanation:'Regional finance leaders praise the recovery discipline.'},
      {optionId:'keep_as_savings', name:'Waiting-list criticism intensifies', chance:0.35, impacts:{rep:-3, patsat:-2}, explanation:'Patient groups challenge the board for not using the funding as intended.'},
      {optionId:'improve_process_automation', name:'Validation finds duplicates', chance:0.34, impacts:{waiting:+3, budget:+1}, explanation:'A data cleanse removes duplicated waits and improves booking accuracy.'},
      {optionId:'improve_process_automation', name:'Automation misses safety flag', chance:0.20, impacts:{safety:-3, rep:-1}, explanation:'A manual check would have caught a pathway risk earlier.'},
      {optionId:'partner_with_trusts', name:'Partners deliver extra sessions', chance:0.30, impacts:{waiting:+3, patsat:+2}, explanation:'Neighbouring trusts open more weekend capacity than planned.'},
      {optionId:'research_funding', name:'Research partnership announced', chance:0.28, impacts:{rep:+3, patsat:+1}, explanation:'A university partner gives the programme credibility.'}
    ],
    reportTone:'Final strategic opportunity with a visible access, money and reputation trade-off.',
    nextQuarterIntro:'Year complete. Prepare the final board rating.',
    timelineEvents:[
      {t:8, name:'Funding letter received', toast:'GBP10m waiting-list funding confirmed', effects:{budget:+2, rep:+1}},
      {t:28, name:'Backlog pressure visible', toast:'Backlog trajectory still rising', effects:{waiting:-4, patsat:-3, morale:-1, rep:-2}}
    ]
  }
];

var QUARTER_IDS = QUARTERS.map(function(q){ return q.id; });

function getQuarterIndexById(quarterId){
  for(var i=0;i<QUARTERS.length;i++){
    if(QUARTERS[i].id===quarterId) return i;
  }
  return 0;
}

function getQuarterById(quarterId){
  return QUARTERS[getQuarterIndexById(quarterId)];
}

function getNextQuarterId(quarterId){
  var idx=getQuarterIndexById(quarterId);
  return idx<QUARTERS.length-1 ? QUARTERS[idx+1].id : null;
}

function getFirstQuarterId(){
  return QUARTERS[0].id;
}

function getQuarterOption(quarterOrId, optionId){
  var q=typeof quarterOrId==='string' ? getQuarterById(quarterOrId) : quarterOrId;
  if(!q || !q.options || !q.options.length) return null;
  for(var i=0;i<q.options.length;i++){
    if(q.options[i].id===optionId || q.options[i].label===optionId) return q.options[i];
  }
  return q.options[0];
}

function getOptionRiskEvents(quarterOrId, optionId){
  var q=typeof quarterOrId==='string' ? getQuarterById(quarterOrId) : quarterOrId;
  var risks=[];
  if(!q || !q.riskEvents) return risks;
  for(var i=0;i<q.riskEvents.length;i++){
    if(q.riskEvents[i].optionId===optionId) risks.push(q.riskEvents[i]);
  }
  return risks;
}

function initialQuarterStats(){
  var stats={};
  for(var i=0;i<QUARTER_STAT_DEFS.length;i++) stats[QUARTER_STAT_DEFS[i].key]=QUARTER_STAT_DEFS[i].start;
  return stats;
}

function cloneQuarterStats(stats){
  var copy={};
  for(var i=0;i<QUARTER_STAT_DEFS.length;i++){
    var key=QUARTER_STAT_DEFS[i].key;
    copy[key]=Number(stats && stats[key] != null ? stats[key] : QUARTER_STAT_DEFS[i].start);
  }
  return copy;
}

function getQuarterStatDef(key){
  for(var i=0;i<QUARTER_STAT_DEFS.length;i++){
    if(QUARTER_STAT_DEFS[i].key===key) return QUARTER_STAT_DEFS[i];
  }
  return null;
}

function clampQuarterStat(key, value){
  var def=getQuarterStatDef(key);
  return def ? Math.max(def.min, Math.min(def.max, value)) : value;
}

function applyQuarterImpacts(stats, impacts){
  var next=cloneQuarterStats(stats);
  for(var key in impacts){
    if(impacts.hasOwnProperty(key) && next.hasOwnProperty(key)){
      next[key]=clampQuarterStat(key, next[key]+impacts[key]);
    }
  }
  return next;
}

function mergeQuarterImpacts(a,b){
  var merged={}, key;
  for(key in a){ if(a.hasOwnProperty(key)) merged[key]=a[key]; }
  for(key in b){ if(b.hasOwnProperty(key)) merged[key]=(merged[key]||0)+b[key]; }
  return merged;
}

function resolveQuarterOutcome(quarterOrId, optionId, currentStats, rng){
  var q=typeof quarterOrId==='string' ? getQuarterById(quarterOrId) : quarterOrId;
  var option=getQuarterOption(q, optionId);
  var random=typeof rng==='function' ? rng : Math.random;
  var triggered=[], total=mergeQuarterImpacts(option.optionImpacts, {});
  var risks=getOptionRiskEvents(q, option.id);
  for(var i=0;i<risks.length;i++){
    if(random()<risks[i].chance){
      triggered.push(risks[i]);
      total=mergeQuarterImpacts(total, risks[i].impacts);
    }
  }
  return {
    quarter:q,
    option:option,
    before:cloneQuarterStats(currentStats),
    impacts:total,
    after:applyQuarterImpacts(currentStats, total),
    triggeredRisks:triggered
  };
}
