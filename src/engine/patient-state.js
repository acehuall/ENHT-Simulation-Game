'use strict';
/* ---------- patient state and quarter-driven visual condition ----------
   Patients can carry both movement states (waiting/walking/inWard) and
   condition states (ill/treated). Future pressure stats can plug into
   isTreatmentAvailableForPatient() and the quarter config tint values.
------------------------------------------------------------------------ */
var PATIENT_STATES = {
  waiting: 'waiting',
  walking: 'walking',
  inWard: 'inWard',
  treated: 'treated',
  discharged: 'discharged',
  ill: 'ill'
};

function getPatientTreatmentPauseIndex(agent){
  var n, e;
  if(!agent || !agent.L || agent.treatmentIdx == null) return -1;
  if(agent._treatmentPauseIndex != null) return agent._treatmentPauseIndex;
  for(n=0;n<agent.L.ev.length;n++){
    e=agent.L.ev[n];
    if(e.kind==='pause' && e.idx===agent.treatmentIdx){
      agent._treatmentPauseIndex=n;
      return n;
    }
  }
  agent._treatmentPauseIndex=-1;
  return -1;
}

function isTreatmentAvailableForPatient(agent, quarterEvent){
  var illness=quarterEvent && quarterEvent.patientIllness;
  /* Later, bed occupancy, infection rate, staff pressure, or waiting time can
     decide this. For this first visible layer, treatment capacity is available
     unless the active quarter explicitly says otherwise. */
  return !illness || illness.treatmentCapacityAvailable !== false;
}

function isTreatmentTile(x,y, quarterEvent){
  var illness=quarterEvent && quarterEvent.patientIllness;
  var zones=illness && illness.treatmentZoneTiles ? illness.treatmentZoneTiles : ['v','w','i','g'];
  return zones.indexOf(at(Math.round(x), Math.round(y))) !== -1;
}

function getPatientVisualState(agent, pathSample, simT, agentTime){
  var quarterEvent=getCurrentQuarterEvent();
  var illness=quarterEvent.patientIllness || {};
  var movementState=pathSample.moving ? PATIENT_STATES.walking : PATIENT_STATES.waiting;
  var treatmentEventIndex=getPatientTreatmentPauseIndex(agent);
  var inTreatmentArea=isTreatmentTile(pathSample.x,pathSample.y,quarterEvent) ||
                      (agent.treatmentIdx != null && pathSample.idx===agent.treatmentIdx);
  var treatmentAvailable=isTreatmentAvailableForPatient(agent, quarterEvent);
  var reachedTreatment=treatmentAvailable && treatmentEventIndex>=0 &&
                       pathSample.eventIndex!=null && pathSample.eventIndex>=treatmentEventIndex;
  var conditionStates=[];
  var illnessTint=0;

  if(inTreatmentArea && treatmentAvailable) movementState=PATIENT_STATES.inWard;
  if(reachedTreatment && !inTreatmentArea) movementState=PATIENT_STATES.treated;

  if(quarterEvent.patientIllnessTint && !reachedTreatment){
    conditionStates.push(PATIENT_STATES.ill);
    illnessTint=illness.untreatedTint;
  }

  return {
    movementState: movementState,
    conditionStates: conditionStates,
    illnessTint: clamp(illnessTint || 0, 0, 1)
  };
}
