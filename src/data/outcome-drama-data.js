'use strict';
/* ---------- outcome dramatization profiles ----------
   The timeline compiler turns these beats into exact stat playback. Offsets
   are theatre only; the compiler balances them so playback lands on outcome
   endStats every time.
------------------------------------------------------------------------ */
var OUTCOME_DRAMA = {
  status_quo: {
    beats:[
      {
        slot:'pressure',
        name:'Norovirus pressure rises',
        toast:'&#9888; Ward pressure rises as sickness bites',
        weights:{waiting:.7, patsat:.4, morale:.4, safety:.4, rep:.5},
        offsets:{waiting:+5, patsat:-3, morale:-4, safety:-3, rep:-1}
      },
      {
        slot:'response',
        name:'Temporary cover stabilises flow',
        toast:'&#10010; Temporary cover stabilises the ward',
        weights:{budget:.8, waiting:.2, patsat:.5, morale:.5, safety:.5, rep:.5},
        offsets:{waiting:-5, patsat:+3, morale:+4, safety:+3, rep:+1}
      },
      {
        slot:'consequence',
        name:'Winter invoice lands',
        toast:'&#163; Winter cover costs hit the budget',
        weights:{budget:.2}
      }
    ],
    visuals:[
      {slot:'response', type:'extraStaff', role:'nurse', count:2, duration:18}
    ]
  },

  hire_temporary_staff: {
    beats:[
      {
        slot:'pressure',
        name:'Staff sickness bites',
        toast:'&#9888; Staff sickness bites into ward cover',
        weights:{waiting:.45, patsat:.25, morale:.25, safety:.2, rep:.2},
        offsets:{waiting:+5, patsat:-2, morale:-3, safety:-3}
      },
      {
        slot:'response',
        name:'Agency staff arrive',
        toast:'&#10010; Agency staff arrive on the ward',
        weights:{waiting:.55, patsat:.65, morale:.65, safety:.8, rep:.5},
        offsets:{waiting:-5, patsat:+2, morale:+3, safety:+3}
      },
      {
        slot:'consequence',
        name:'Agency invoice lands',
        toast:'&#163; Agency premium hits the budget',
        weights:{budget:1, rep:.3}
      }
    ],
    visuals:[
      {slot:'response', type:'extraStaff', role:'nurse', count:3, duration:20},
      {slot:'consequence', type:'signage', tile:[25,4], text:'GBP', duration:8}
    ]
  },

  slow_non_essential_care: {
    beats:[
      {
        slot:'pressure',
        name:'Urgent demand rises',
        toast:'&#9888; Urgent demand squeezes routine care',
        weights:{waiting:.35, patsat:.35, morale:.25, safety:.2, rep:.25},
        offsets:{waiting:+3, patsat:-1, safety:-2}
      },
      {
        slot:'response',
        name:'Routine clinics slowed',
        toast:'Clinic capacity is moved to urgent pressure',
        weights:{budget:.5, morale:.6, safety:.7},
        offsets:{safety:+2, morale:+1}
      },
      {
        slot:'consequence',
        name:'Waiting list letters build',
        toast:'&#9888; Waiting list pressure becomes visible',
        weights:{budget:.5, waiting:.65, patsat:.65, rep:.75}
      }
    ],
    visuals:[
      {slot:'response', type:'signage', tile:[23,10], text:'CLINIC CLOSED', duration:22},
      {slot:'response', type:'staffExit', role:'nurse', count:2, duration:12}
    ]
  },

  rapid_discharge: {
    beats:[
      {
        slot:'pressure',
        name:'Beds remain blocked',
        toast:'&#9888; Beds remain blocked on the wards',
        weights:{waiting:.4, patsat:.3, morale:.3, safety:.35},
        offsets:{waiting:+3, safety:-2}
      },
      {
        slot:'response',
        name:'Rapid discharge push begins',
        toast:'Discharge teams push medically fit patients home',
        weights:{waiting:.8, budget:.5, patsat:.4, morale:.4, safety:.4},
        offsets:{waiting:-4}
      },
      {
        slot:'consequence',
        name:'Discharge risk transfers',
        toast:'&#9888; Discharge pressure transfers risk to teams',
        weights:{budget:.5, patsat:.3, morale:.3, safety:.25, rep:1}
      }
    ],
    visuals:[
      {slot:'response', type:'dischargeStream', count:4, duration:16},
      {slot:'consequence', type:'wardIncidentFlash', tile:[20,12], duration:6}
    ]
  },

  divert_to_other_trusts: {
    beats:[
      {
        slot:'pressure',
        name:'Ambulance queue builds',
        toast:'&#9888; Ambulance queue builds at the entrance',
        weights:{waiting:.35, patsat:.35, safety:.35, morale:.25},
        offsets:{waiting:+3, safety:-2}
      },
      {
        slot:'response',
        name:'Ambulance divert begins',
        toast:'Ambulance divert reduces pressure on site',
        weights:{waiting:.8, morale:.65, safety:.65, budget:.5},
        offsets:{waiting:-4, safety:+2}
      },
      {
        slot:'consequence',
        name:'Regional reputation hit',
        toast:'&#9888; Regional partners question the divert',
        weights:{budget:.5, patsat:.65, rep:1}
      }
    ],
    visuals:[
      {slot:'response', type:'ambulanceDivert', duration:16},
      {slot:'consequence', type:'signage', tile:[13,15], text:'DIVERT', duration:10}
    ]
  },

  open_escalation_ward: {
    beats:[
      {slot:'pressure', name:'Occupancy rises', toast:'&#9888; Occupancy rises above plan', weights:{waiting:.4, safety:.4, morale:.3}, offsets:{waiting:+4, safety:-2}},
      {slot:'response', name:'Escalation ward opens', toast:'Escalation ward opens in the day unit', weights:{waiting:.75, patsat:.6, rep:.5}, offsets:{waiting:-4}},
      {slot:'consequence', name:'Staffing stretch appears', toast:'&#9888; Staffing stretch shows on the wards', weights:{budget:1, morale:.7, safety:.6, rep:.5}}
    ],
    visuals:[
      {slot:'response', type:'corridorTrolleys', duration:18},
      {slot:'consequence', type:'wardIncidentFlash', tile:[8,4], duration:6}
    ]
  },

  virtual_ward: {
    beats:[
      {slot:'pressure', name:'Beds remain tight', toast:'&#9888; Capacity remains tight', weights:{waiting:.35, safety:.25}, offsets:{waiting:+3}},
      {slot:'response', name:'Virtual ward expands', toast:'Virtual ward monitoring opens at pace', weights:{waiting:.7, patsat:.7, morale:.5, rep:.6}, offsets:{waiting:-3}},
      {slot:'consequence', name:'Home recovery steadies flow', toast:'Patients recover at home with support', weights:{budget:1, safety:.75, morale:.5, rep:.4}}
    ],
    visuals:[
      {slot:'response', type:'dischargeStream', count:3, duration:14},
      {slot:'response', type:'signage', tile:[18,8], text:'VIRTUAL WARD', duration:14}
    ]
  },

  cancel_electives: {
    beats:[
      {slot:'pressure', name:'Beds under pressure', toast:'&#9888; Bed pressure squeezes theatres', weights:{waiting:.25, patsat:.25, rep:.25}, offsets:{waiting:+2}},
      {slot:'response', name:'Electives cancelled', toast:'Routine elective work is cancelled', weights:{budget:.6, safety:.7, morale:.5}, offsets:{safety:+2}},
      {slot:'consequence', name:'Waiting list grows', toast:'&#9888; Waiting list impact becomes visible', weights:{budget:.4, waiting:.75, patsat:.75, rep:.75, morale:.5}}
    ],
    visuals:[
      {slot:'response', type:'signage', tile:[8,4], text:'THEATRE PAUSED', duration:20},
      {slot:'response', type:'staffExit', role:'doctor', count:2, duration:12}
    ]
  },

  discharge_partnership: {
    beats:[
      {slot:'pressure', name:'Discharge delays mount', toast:'&#9888; Discharge delays mount', weights:{waiting:.45, morale:.3, safety:.25}, offsets:{waiting:+4}},
      {slot:'response', name:'Partner discharge team arrives', toast:'Partner discharge team starts unblocking beds', weights:{waiting:.75, patsat:.65, morale:.65, safety:.65}, offsets:{waiting:-4}},
      {slot:'consequence', name:'Flow improves steadily', toast:'Flow improves as transport and brokerage land', weights:{budget:1, rep:1, waiting:.25, patsat:.35, morale:.35, safety:.35}}
    ],
    visuals:[
      {slot:'response', type:'extraStaff', role:'porter', count:2, duration:18},
      {slot:'response', type:'dischargeStream', count:3, duration:16}
    ]
  },

  hold_press_briefing: {
    beats:[
      {slot:'pressure', name:'Press attention peaks', toast:'&#9888; Cameras gather outside the entrance', weights:{rep:.25, morale:.25}, offsets:{rep:-3, morale:-1}},
      {slot:'response', name:'Trust briefing held', toast:'Trust statement published with clear actions', weights:{rep:.8, morale:.6, patsat:.6}, offsets:{rep:+3, morale:+1}},
      {slot:'consequence', name:'Scrutiny eases', toast:'Media scrutiny eases after the briefing', weights:{rep:.2, morale:.4, patsat:.4}}
    ],
    visuals:[
      {slot:'response', type:'pressBriefing', duration:13}
    ]
  },

  publish_recovery_plan: {
    beats:[
      {slot:'pressure', name:'Performance questioned', toast:'&#9888; Performance questions intensify', weights:{rep:.25, waiting:.25}, offsets:{rep:-2}},
      {slot:'response', name:'Recovery plan published', toast:'Recovery plan and weekly updates go live', weights:{rep:.7, waiting:.6, patsat:.5, morale:.5}, offsets:{rep:+2}},
      {slot:'consequence', name:'Commitments tracked', toast:'Board commitments are now visible weekly', weights:{budget:1, rep:.3, waiting:.4, patsat:.5, morale:.5, safety:1}}
    ],
    visuals:[
      {slot:'response', type:'signage', tile:[13,15], text:'RECOVERY PLAN', duration:16},
      {slot:'response', type:'pressBriefing', duration:10}
    ]
  },

  restrict_media_access: {
    beats:[
      {slot:'pressure', name:'Press scrum blocks the entrance', toast:'&#9888; Press scrum disrupts the entrance', weights:{rep:.35, patsat:.35, morale:.35}, offsets:{rep:-2}},
      {slot:'response', name:'Media access restricted', toast:'Security moves media away from the entrance', weights:{safety:.8, budget:1}, offsets:{safety:+1}},
      {slot:'consequence', name:'Restriction criticised', toast:'&#9888; Access restrictions are criticised online', weights:{rep:.65, patsat:.65, morale:.65, safety:.2}, offsets:{rep:-1}}
    ],
    visuals:[
      {slot:'response', type:'signage', tile:[14,15], text:'NO FILMING', duration:18},
      {slot:'response', type:'staffExit', role:'reception', count:1, duration:10}
    ]
  },

  no_comment: {
    beats:[
      {slot:'pressure', name:'Story builds without response', toast:'&#9888; Media story builds without the trust voice', weights:{rep:.5, morale:.5, patsat:.5}, offsets:{rep:-3, morale:-1}},
      {slot:'response', name:'No interview given', toast:'No interview is given before deadline', weights:{budget:1}, offsets:{}},
      {slot:'consequence', name:'Narrative runs away', toast:'&#9888; The public story runs without the trust', weights:{rep:.5, morale:.5, patsat:.5}, offsets:{rep:-1}}
    ],
    visuals:[
      {slot:'consequence', type:'pressScrum', count:5, flashLights:true, duration:14},
      {slot:'consequence', type:'signage', tile:[13,15], text:'NO COMMENT', duration:12}
    ]
  },

  staff_wellbeing_fund: {
    beats:[
      {slot:'pressure', name:'Cold snap strains rotas', toast:'&#9888; Sickness absence climbs in the cold snap', weights:{morale:.25, safety:.2}, offsets:{waiting:+3, morale:-3, safety:-2}},
      {slot:'response', name:'Wellbeing support opens', toast:'Rest hub, hot food and transport support open', weights:{budget:1, morale:.55, patsat:.6, safety:.5, rep:.6}, offsets:{waiting:-3, morale:+3, safety:+2}},
      {slot:'consequence', name:'Teams steady through the surge', toast:'Fatigue eases as staff support beds in'}
    ],
    visuals:[
      {slot:'response', type:'signage', tile:[18,8], text:'REST HUB', duration:16},
      {slot:'response', type:'extraStaff', role:'reception', count:1, duration:10}
    ]
  },

  expand_discharge_lounge: {
    beats:[
      {slot:'pressure', name:'Beds fill as the cold bites', toast:'&#9888; Winter admissions squeeze the wards', weights:{safety:.25, morale:.3}, offsets:{waiting:+4, patsat:-2}},
      {slot:'response', name:'Discharge lounge extended', toast:'Discharge lounge hours and transport extended', weights:{budget:1, waiting:.7, patsat:.7, rep:.6}, offsets:{waiting:-4, patsat:+2}},
      {slot:'consequence', name:'Flow steadies through winter', toast:'Bed pressure eases as discharges speed up'}
    ],
    visuals:[
      {slot:'response', type:'dischargeStream', count:4, duration:16},
      {slot:'response', type:'signage', tile:[18,8], text:'LOUNGE OPEN', duration:14}
    ]
  },

  mutual_aid_winter: {
    beats:[
      {slot:'pressure', name:'Ambulance queue grows', toast:'&#9888; Ambulance arrivals climb in the cold snap', weights:{safety:.2, morale:.2}, offsets:{waiting:+3, safety:-2, rep:-1}},
      {slot:'response', name:'Mutual aid arrives', toast:'Partner trusts send winter surge support', weights:{budget:1, waiting:1, patsat:1, morale:.6, safety:.6}, offsets:{waiting:-3, safety:+2, rep:+1}},
      {slot:'consequence', name:'Regional reliance noted', toast:'&#9888; Commentators note reliance on neighbours'}
    ],
    visuals:[
      {slot:'response', type:'extraStaff', role:'nurse', count:2, duration:14},
      {slot:'response', type:'signage', tile:[13,15], text:'MUTUAL AID', duration:12}
    ]
  },

  defer_capital: {
    beats:[
      {slot:'pressure', name:'Winter competes with works', toast:'&#9888; Winter pressure competes with capital plans', weights:{morale:.3}, offsets:{morale:-1, rep:-1}},
      {slot:'response', name:'Capital schemes paused', toast:'Non-urgent capital work deferred for winter cover', weights:{budget:1, waiting:.6, safety:.7}, offsets:{morale:+1, rep:+1}},
      {slot:'consequence', name:'Backlog risk logged', toast:'&#9888; Governors log the maintenance backlog risk'}
    ],
    visuals:[
      {slot:'response', type:'signage', tile:[8,4], text:'WORKS PAUSED', duration:18},
      {slot:'response', type:'staffExit', role:'porter', count:1, duration:10}
    ]
  },

  _default: {
    beats:[
      {slot:'pressure', name:'Quarter pressure rises', toast:'&#9888; Quarter pressure rises', weights:{waiting:.35, patsat:.35, morale:.35, safety:.35, rep:.35}, offsets:{waiting:+2, safety:-1}},
      {slot:'response', name:'Board decision lands', toast:'Board decision starts to take effect', weights:{waiting:.4, patsat:.4, morale:.4, safety:.4, rep:.4}, offsets:{waiting:-2, safety:+1}},
      {slot:'consequence', name:'Consequences become visible', toast:'Decision consequences become visible'}
    ],
    visuals:[
      {slot:'response', type:'signage', tile:[18,8], text:'BOARD ACTION', duration:12}
    ]
  }
};

var _dramaWarned={};
function getOutcomeDramaProfile(optionId){
  if(OUTCOME_DRAMA[optionId]) return OUTCOME_DRAMA[optionId];
  if(!_dramaWarned[optionId]){
    _dramaWarned[optionId]=true;
    if(typeof console!=='undefined' && console.warn){
      console.warn('[outcome-drama] no drama profile for option "'+optionId+'" - using _default beats');
    }
  }
  return OUTCOME_DRAMA._default;
}
