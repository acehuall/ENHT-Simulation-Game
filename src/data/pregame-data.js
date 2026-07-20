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
  roles:[
    {name:'CHIEF EXECUTIVE',
     concern:'Keeps the whole Trust in balance: patient satisfaction, morale and reputation.',
     accent:'#e9b44c', portrait:{uniform:'#262b3a', hair:'#5a5348', accessory:'tie'}},
    {name:'CHIEF FINANCE OFFICER',
     concern:'Protects the budget while making sure resources can sustain safe care.',
     accent:'#23c4b4', portrait:{uniform:'#0f6e64', hair:'#2e2a26', accessory:'glasses'}},
    {name:'CHIEF NURSE',
     concern:'Champions patient safety, care quality and the morale of clinical teams.',
     accent:'#e8b9c4', portrait:{uniform:'#3b6ea5', hair:'#7a4a2e', accessory:'watch'}},
    {name:'CHIEF OPERATING OFFICER',
     concern:'Focuses on waiting times, flow and the capacity to deliver care.',
     accent:'#9fd0a6', portrait:{uniform:'#2e5c3a', hair:'#1d1a17', accessory:'lanyard'}},
    {name:'MEDICAL DIRECTOR',
     concern:'Safeguards clinical quality, patient safety and professional standards.',
     accent:'#8aa8d8', portrait:{uniform:'#e8ecf5', hair:'#b9bfcc', accessory:'stethoscope'}},
    {name:'DIRECTOR OF GOVERNANCE',
     concern:'Protects reputation, accountability and confidence in the Trust.',
     accent:'#9a93c9', portrait:{uniform:'#43315c', hair:'#4a3c55', accessory:'clipboard'}}
  ]
};
