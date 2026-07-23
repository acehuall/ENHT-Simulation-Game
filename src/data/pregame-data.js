'use strict';
/* Facilitator-editable content for the opening screens.
   Strings live here, not in markup. The portrait/accent fields drive the
   pixel portraits drawn in src/ui/pregame-scene.js. */
var PREGAME = {
  brand:'NORTHBROOK GENERAL HOSPITAL NHS TRUST',
  headerTitle:'NORTHBROOK GENERAL HOSPITAL',
  headerSub:'TRUST IN BALANCE — BOARD DECISION SIMULATION',
  chipLabel:'PREGAME',
  title:'TRUST IN BALANCE',
  titleLines:['TRUST IN','BALANCE'],
  kickerIntro:'BOARD DECISION SIMULATION',
  kickerTeam:'NORTHBROOK GENERAL / BOARD ROOM',
  introPrompt:'PRESS START',
  beginLabel:'BEGIN',
  teamHeading:'ASSEMBLE YOUR BOARD',
  teamInstruction:'Choose a perspective. Every voice protects a different part of the Trust.',
  continueLabel:'CONTINUE',
  hint:'ENTER / SPACE',
  hintContinue:'ENTER / SPACE TO CONTINUE',
  hintStart:'ENTER / SPACE TO START',
  briefingPages:[
    {tag:'BOARD BRIEFING', text:'YOU ARE THE TRUST BOARD.'},
    {tag:'YOUR TASK', text:'REVIEW THE EVIDENCE. AGREE ONE RESPONSE.'},
    {tag:'WHAT FOLLOWS', text:'THEN WATCH THE CONSEQUENCES.'}
  ],
  briefingNextLabel:'NEXT PAGE',
  briefingStartLabel:'START Q1',
  briefingPreviousLabel:'BACK',
  /* Each role carries (phase 4):
       id         stable slug - matches METRIC_DEFS[n].ownerRole; ceo/cfo/cno/coo/md/gov
       primaryKey the METRIC_DEFS key this role owns and is scored hardest on
       briefing   1-2 in-world sentences shown on the "Your Brief" confirm screen
       objectives exactly 3, weights 3/2/1 (primary / secondary / cross-cutting)
     Authoring rules honoured here:
       - weights are always 3, 2, 1 in that order (sum 6);
       - the weight-1 objective targets ANOTHER role's metric (the teaching
         device from Stats_Spec §5.2) - together they form a full teaching cycle
         budget->waiting->safety->patsat... every metric is somebody's cross link;
       - every id is globally unique (assertPregameData below is the guard);
       - every target is reachable: all 4^4 option paths were simulated and each
         objective is both passable and failable by some path.
     name/concern/accent/portrait are untouched - pregame-scene.js reads them. */
  roles:[
    {name:'CHIEF EXECUTIVE', id:'ceo', primaryKey:'morale',
     concern:'Keeps the whole Trust in balance: patient satisfaction, morale and reputation.',
     accent:'#e9b44c', portrait:{uniform:'#262b3a', hair:'#5a5348', accessory:'tie'},
     briefing:'You hold the whole Trust in balance. If the workforce buckles, every other number follows it down.',
     objectives:[
       {id:'ceo_morale_end', key:'morale', type:'end', target:62, weight:3,
        label:'Close the year with staff morale at 62 or better',
        pass:'Engagement is holding; the workforce can sustain the plan.',
        fail:'Morale has slipped below tolerance and retention is at risk.',
        note:'Your headline test: a board that loses its staff loses everything else.'},
       {id:'ceo_morale_delta', key:'morale', type:'delta', target:2, weight:2,
        label:'Leave morale at least 2 points up on where the year started',
        pass:'The year improved the felt experience of working here.',
        fail:'Staff ended the year no better, or worse, than they began it.'},
       {id:'ceo_rep_end', key:'rep', type:'end', target:60, weight:1,
        label:'Keep public reputation at 60+ (the Governance line)',
        pass:'External confidence in the Trust has held.',
        fail:'Reputation dipped below the board\'s shared floor.',
        note:'Cross-cutting: reputation is Governance\'s metric, but the CEO carries it too.'}
     ]},
    {name:'CHIEF FINANCE OFFICER', id:'cfo', primaryKey:'budget',
     concern:'Protects the budget while making sure resources can sustain safe care.',
     accent:'#23c4b4', portrait:{uniform:'#0f6e64', hair:'#2e2a26', accessory:'glasses'},
     briefing:'You protect the money that keeps care safe. Hold the deficit or the ICB holds it for you.',
     objectives:[
       {id:'cfo_deficit_floor', key:'budget', type:'floor', target:-3.0, weight:3,
        label:'Hold the deficit within £3.0m at every quarter close',
        pass:'Year-end position defensible to the ICB.',
        fail:'Formal financial review triggered.',
        note:'A single quarter breaching -£3.0m latches this to a fail - the ICB does not forget.'},
       {id:'cfo_budget_end', key:'budget', type:'end', target:-2.0, weight:2,
        label:'Close the year no worse than £2.0m adrift',
        pass:'The exit run-rate is credible going into next year.',
        fail:'The closing position undermines the recovery trajectory.'},
       {id:'cfo_waiting_ceiling', key:'waiting', type:'ceiling', target:80, weight:1,
        label:'Do not let the waiting index breach 80 (the Operations line)',
        pass:'Access never entered the critical band on your watch.',
        fail:'Waiting spiked into the critical band at least once.',
        note:'Cross-cutting: waiting is Operations\' metric - unfunded flow becomes a finance problem fast.'}
     ]},
    {name:'CHIEF NURSE', id:'cno', primaryKey:'patsat',
     concern:'Champions patient safety, care quality and the morale of clinical teams.',
     accent:'#e8b9c4', portrait:{uniform:'#3b6ea5', hair:'#7a4a2e', accessory:'watch'},
     briefing:'You speak for the patient\'s experience of care. Complaints are the early warning the board cannot ignore.',
     objectives:[
       {id:'cno_patsat_end', key:'patsat', type:'end', target:64, weight:3,
        label:'Lift patient satisfaction to 64 by year end',
        pass:'Experience of care improved measurably over the year.',
        fail:'Satisfaction closed below the board\'s expectation.',
        note:'Your headline test: does the year leave patients more confident than it found them?'},
       {id:'cno_patsat_floor', key:'patsat', type:'floor', target:56, weight:2,
        label:'Never let satisfaction fall below 56 in any quarter',
        pass:'Experience stayed inside tolerance all year.',
        fail:'A quarter dropped patients into the concern band.',
        note:'Latches: one bad quarter below 56 cannot be undone by a good one after.'},
       {id:'cno_morale_floor', key:'morale', type:'floor', target:55, weight:1,
        label:'Protect staff morale at 55+ (the CEO line)',
        pass:'Clinical teams held together through the pressure.',
        fail:'Morale sank below the shared floor at least once.',
        note:'Cross-cutting: morale is the CEO\'s metric - tired teams and unhappy patients travel together.'}
     ]},
    {name:'CHIEF OPERATING OFFICER', id:'coo', primaryKey:'waiting',
     concern:'Focuses on waiting times, flow and the capacity to deliver care.',
     accent:'#9fd0a6', portrait:{uniform:'#2e5c3a', hair:'#1d1a17', accessory:'lanyard'},
     briefing:'You own flow and access. Every blocked bed upstream becomes a waiting patient the board answers for.',
     objectives:[
       {id:'coo_waiting_end', key:'waiting', type:'end', target:62, weight:3,
        label:'Bring the waiting index down to 62 or better by year end',
        pass:'Access recovery is on plan; waits are below tolerance.',
        fail:'The waiting index closed the year above target.',
        note:'Waiting is a lower-is-better metric: the end target is a ceiling, not a floor.'},
       {id:'coo_waiting_ceiling', key:'waiting', type:'ceiling', target:80, weight:2,
        label:'Never let the waiting index breach 80 in any quarter',
        pass:'Access stayed out of the critical band all year.',
        fail:'A quarter pushed waits into the critical band.',
        note:'Latches: once access breaches 80 the board has to report it, recovered or not.'},
       {id:'coo_safety_floor', key:'safety', type:'floor', target:66, weight:1,
        label:'Keep safety at 66+ while chasing flow (the Medical line)',
        pass:'Faster flow did not come at the cost of safe care.',
        fail:'Safety dropped below 66 in the drive for capacity.',
        note:'Cross-cutting: safety is the Medical Director\'s metric - the trade-off you are most tempted to make.'}
     ]},
    {name:'MEDICAL DIRECTOR', id:'md', primaryKey:'safety',
     concern:'Safeguards clinical quality, patient safety and professional standards.',
     accent:'#8aa8d8', portrait:{uniform:'#e8ecf5', hair:'#b9bfcc', accessory:'stethoscope'},
     briefing:'You are the line the board does not cross. Safety recovers slowly and fails fast - guard it every quarter.',
     objectives:[
       {id:'md_safety_floor', key:'safety', type:'floor', target:64, weight:3,
        label:'Hold safety above the concern line (64+) every quarter',
        pass:'Harm indicators stayed within controlled tolerance all year.',
        fail:'Safety fell into the concern band - the board must record why.',
        note:'Your headline test, and it latches: a single unsafe quarter stands on the year-end record.'},
       {id:'md_safety_end', key:'safety', type:'end', target:68, weight:2,
        label:'Close the year with safety at 68 or better',
        pass:'The Trust exits the year on a strong safety footing.',
        fail:'Year-end safety sits below where governance grip should hold it.'},
       {id:'md_patsat_floor', key:'patsat', type:'floor', target:58, weight:1,
        label:'Guard the patient experience at 58+ (the Nursing line)',
        pass:'Quality of care held alongside safety all year.',
        fail:'Patient experience slipped below 58 at least once.',
        note:'Cross-cutting: satisfaction is the Chief Nurse\'s metric - safe care and felt care rise together.'}
     ]},
    {name:'DIRECTOR OF GOVERNANCE', id:'gov', primaryKey:'rep',
     concern:'Protects reputation, accountability and confidence in the Trust.',
     accent:'#9a93c9', portrait:{uniform:'#43315c', hair:'#4a3c55', accessory:'clipboard'},
     briefing:'You hold the Trust\'s public account. Confidence is slow to build, fast to lose, and everyone\'s business.',
     objectives:[
       {id:'gov_rep_end', key:'rep', type:'end', target:62, weight:3,
        label:'Rebuild reputation to 62 by year end',
        pass:'External confidence in the Trust has been restored.',
        fail:'The Trust closed the year with its standing still diminished.',
        note:'Your headline test: does the public account of the year read as recovery or drift?'},
       {id:'gov_rep_floor', key:'rep', type:'floor', target:50, weight:2,
        label:'Never let reputation enter the critical band (50+)',
        pass:'Public confidence never collapsed on your watch.',
        fail:'A quarter drove reputation into the critical band.',
        note:'Latches: a collapse below 50 defines the narrative even after it recovers.'},
       {id:'gov_budget_floor', key:'budget', type:'floor', target:-3.0, weight:1,
        label:'Hold the deficit within £3.0m (the Finance line)',
        pass:'Financial credibility underpinned the Trust\'s standing.',
        fail:'A financial breach undercut confidence in the board.',
        note:'Cross-cutting: budget is the CFO\'s metric - regulators read finance and reputation as one story.'}
     ]}
  ]
};

/* Startup assertion (Stats_Spec §5.2): objective ids must be globally unique,
   every key must be a real METRIC_DEFS key, and every role must carry exactly
   three objectives whose weights are 3/2/1. Loud console.error on broken
   authoring rather than a throw, so a data slip never leaves the game half
   loaded on file://. Silent when the data is well formed. */
function assertPregameData(){
  if(typeof console==='undefined' || !console.error) return;
  var seen={}, problems=[], i, j, role, obj, sum;
  var validKey={};
  if(typeof METRIC_DEFS!=='undefined'){
    for(i=0;i<METRIC_DEFS.length;i++) validKey[METRIC_DEFS[i].key]=true;
  }
  for(i=0;i<PREGAME.roles.length;i++){
    role=PREGAME.roles[i];
    if(!role.id) problems.push('role "'+role.name+'" has no id');
    if(!validKey[role.primaryKey]) problems.push('role "'+role.id+'" primaryKey "'+role.primaryKey+'" is not a metric');
    if(!role.objectives || role.objectives.length!==3){
      problems.push('role "'+role.id+'" must have exactly 3 objectives');
      continue;
    }
    sum=0;
    for(j=0;j<role.objectives.length;j++){
      obj=role.objectives[j];
      if(seen[obj.id]) problems.push('duplicate objective id "'+obj.id+'"');
      seen[obj.id]=true;
      if(!validKey[obj.key]) problems.push('objective "'+obj.id+'" key "'+obj.key+'" is not a metric');
      sum+=obj.weight;
    }
    if(sum!==6) problems.push('role "'+role.id+'" objective weights must sum to 6 (got '+sum+')');
  }
  if(problems.length) console.error('[pregame-data] objective authoring problems:\n  - '+problems.join('\n  - '));
}
assertPregameData();
