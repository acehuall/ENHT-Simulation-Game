'use strict';
/* ---------- quarter-specific simulation event configuration ----------
   This is the extension point for Q1-Q4 visual layers, NPCs, pressure
   events, and future report-page content. Rendering/simulation code should
   read from this object instead of hard-coding behaviour for a single quarter.
------------------------------------------------------------------------ */
var QUARTER_EVENT_IDS = ['Q1', 'Q2', 'Q3', 'Q4'];

var QUARTER_EVENTS = {
  Q1: {
    id: 'Q1',
    label: 'Q1',
    eventName: 'Infection Pressure',
    displayName: 'Q1 - INFECTION PRESSURE',
    bannerLine: 'INFECTION PRESSURE',
    patientIllnessTint: true,
    patientIllness: {
      spawnState: 'ill',
      untreatedTint: 0.68,
      inTreatmentTint: 0.32,
      treatedTint: 0.12,
      treatmentCapacityAvailable: true,
      treatmentZoneTiles: ['v', 'w', 'i', 'g']
    },
    visualNPCs: [],
    pressureEvents: ['norovirus_outbreak', 'ward_4_incident'],
    reportContentKey: 'infectionPressure'
  },
  Q2: {
    id: 'Q2',
    label: 'Q2',
    eventName: 'Capacity Strain',
    displayName: 'Q2 - CAPACITY STRAIN',
    bannerLine: 'CAPACITY STRAIN',
    patientIllnessTint: false,
    visualNPCs: [],
    pressureEvents: [],
    reportContentKey: 'capacityStrain'
  },
  Q3: {
    id: 'Q3',
    label: 'Q3',
    eventName: 'Media Pressure',
    displayName: 'Q3 - MEDIA PRESSURE',
    bannerLine: 'MEDIA PRESSURE',
    patientIllnessTint: false,
    visualNPCs: [
      {type: 'reporter', x: 12.6, y: 15.15, prop: 'microphone', facing: 1},
      {type: 'reporter', x: 17.4, y: 15.15, prop: 'camera', facing: -1}
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
    patientIllnessTint: false,
    visualNPCs: [],
    pressureEvents: [],
    reportContentKey: 'winterSurge'
  }
};

function getQuarterEventConfig(quarterId){
  return QUARTER_EVENTS[quarterId] || QUARTER_EVENTS.Q1;
}
