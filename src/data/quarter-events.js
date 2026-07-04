'use strict';
/* ---------- quarter-specific simulation theatre configuration ----------
   Text, options, stat impacts and report content live in quarters-data.js.
   Keep this file for optional visual layers only: illness tinting, NPCs,
   pressure-event ids, and future scene props.
------------------------------------------------------------------------ */
var QUARTER_EVENT_IDS = QUARTER_IDS.slice();

var QUARTER_VISUALS = {
  Q1: {
    patientIllnessTint:true,
    patientIllness:{
      spawnState:'ill',
      untreatedTint:0.68,
      inTreatmentTint:0.32,
      treatedTint:0.12,
      treatmentCapacityAvailable:true,
      treatmentZoneTiles:['v','w','i','g']
    },
    visualNPCs:[],
    pressureEvents:['flu_surge','corridor_care_warning']
  },
  Q2: {
    patientIllnessTint:false,
    visualNPCs:[],
    pressureEvents:['savings_gap']
  },
  Q3: {
    patientIllnessTint:false,
    visualNPCs:[
      {type:'reporter', x:12.6, y:15.15, prop:'microphone', facing:1},
      {type:'reporter', x:17.4, y:15.15, prop:'camera', facing:-1}
    ],
    pressureEvents:['maternity_safety_concern']
  },
  Q4: {
    patientIllnessTint:false,
    visualNPCs:[],
    pressureEvents:['waiting_list_funding']
  }
};

function getQuarterEventConfig(quarterId){
  var quarter=getQuarterById(quarterId);
  var visual=QUARTER_VISUALS[quarter.id] || {};
  return {
    id:quarter.id,
    label:quarter.label,
    eventName:quarter.title,
    displayName:quarter.displayName,
    bannerLine:quarter.title.toUpperCase(),
    patientIllnessTint:!!visual.patientIllnessTint,
    patientIllness:visual.patientIllness || null,
    visualNPCs:visual.visualNPCs || [],
    pressureEvents:visual.pressureEvents || [],
    reportContentKey:quarter.page2GraphType
  };
}
