'use strict';
/* ---------- quarter-specific simulation event configuration ----------
   This is the extension point for Q1-Q4 visual layers, NPCs, pressure
   events, and future report-page content. Rendering/simulation code should
   read from this object instead of hard-coding behaviour for a single quarter.
------------------------------------------------------------------------ */
var QUARTER_EVENT_IDS = ['Q1', 'Q2', 'Q3', 'Q4'];

var QUARTER_EVENTS = {
  /* Q1 is the opening baseline: an ordinary, functioning hospital shown before
     the board takes its first decision. It deliberately carries no illness
     tint, no ill-tinted surge and no incident flash - the infection-pressure
     scenario is what the board decides on, and its consequences are dramatized
     from Q2 once a decision resolves. */
  Q1: {
    id: 'Q1',
    label: 'Q1',
    eventName: 'Infection Pressure',
    displayName: 'Q1 - INFECTION PRESSURE',
    bannerLine: 'INFECTION PRESSURE',
    patientSpawnMult: 1.0,
    patientIllnessTint: false,
    patientIllness: {
      treatmentCapacityAvailable: true,
      treatmentZoneTiles: ['v', 'w', 'i', 'g']
    },
    visualNPCs: [],
    ambientVisuals: [
      {type:'patientSurge', t0:0, t1:45, mult:1.2}
    ],
    pressureEvents: [],
    reportContentKey: 'infectionPressure'
  },
  Q2: {
    id: 'Q2',
    label: 'Q2',
    eventName: 'Capacity Strain',
    displayName: 'Q2 - CAPACITY STRAIN',
    bannerLine: 'CAPACITY STRAIN',
    patientSpawnMult: 1.3,
    patientIllnessTint: false,
    visualNPCs: [],
    ambientVisuals: [
      {type:'patientSurge', t0:0, t1:45, mult:1.3},
      {type:'corridorTrolleys', t0:0, t1:45}
    ],
    pressureEvents: [],
    reportContentKey: 'capacityStrain'
  },
  Q3: {
    id: 'Q3',
    label: 'Q3',
    eventName: 'Media Pressure',
    displayName: 'Q3 - MEDIA PRESSURE',
    bannerLine: 'MEDIA PRESSURE',
    patientSpawnMult: 1.0,
    patientIllnessTint: false,
    visualNPCs: [],
    ambientVisuals: [
      {type:'pressScrum', t0:0, t1:45, count:4, flashLights:true}
    ],
    pressureEvents: ['media_attention'],
    reportContentKey: 'mediaPressure'
  },
  Q4: {
    id: 'Q4',
    label: 'Q4',
    eventName: 'Winter Surge',
    displayName: 'Q4 - WINTER SURGE',
    bannerLine: 'WINTER SURGE',
    patientSpawnMult: 1.6,
    patientIllnessTint: false,
    visualNPCs: [],
    ambientVisuals: [
      {type:'patientSurge', t0:0, t1:45, mult:1.6},
      {type:'snowfall', t0:0, t1:45},
      {type:'ambulanceDivert', t0:9, t1:22}
    ],
    pressureEvents: [],
    reportContentKey: 'winterSurge'
  }
};

var _quarterEventWarned={};
function getQuarterEventConfig(quarterId){
  if(QUARTER_EVENTS[quarterId]) return QUARTER_EVENTS[quarterId];
  if(!_quarterEventWarned[quarterId]){
    _quarterEventWarned[quarterId]=true;
    if(typeof console!=='undefined' && console.warn){
      console.warn('[quarter-events] unknown quarter id "'+quarterId+'" - falling back to Q1 visuals');
    }
  }
  return QUARTER_EVENTS.Q1;
}
