'use strict';
/* ---------- text event feed ----------
   A plain-language log beneath the canvas. It mirrors the resolved-outcome
   timeline beats (and key state changes) so a facilitator or player can follow
   what the simulation is doing without having to track individual sprites.
------------------------------------------------------------------------ */
var FEED_MAX_ENTRIES = 40;

var _feedQuarterId = null;
var _feedLastSimT = 0;
var _feedLogged = {};

function _feedListEl(){ return $('eventFeedList'); }

function feedReset(quarterId){
  _feedQuarterId = quarterId;
  _feedLastSimT = 0;
  _feedLogged = {};
  var list=_feedListEl();
  if(list) list.innerHTML='';
}

function feedAddEntry(timeLabel, text, kind){
  var list=_feedListEl();
  if(!list) return;
  var li=document.createElement('li');
  li.className='feed-entry'+(kind ? (' feed-'+kind) : '');
  var t=document.createElement('span');
  t.className='feed-time';
  t.textContent=timeLabel;
  var body=document.createElement('span');
  body.className='feed-text';
  body.textContent=text;
  li.appendChild(t);
  li.appendChild(body);
  list.appendChild(li);
  while(list.childElementCount>FEED_MAX_ENTRIES) list.removeChild(list.firstElementChild);
  list.scrollTop=list.scrollHeight;
}

/* the timeline slot doubles as the entry's visual kind (pressure/response/
   consequence); anything else falls back to a neutral "event" style */
function _feedKind(slot){
  return slot==='pressure' || slot==='response' || slot==='consequence' ? slot : 'event';
}

/* Called each render tick with the current simulation time. Detects quarter
   changes or a rewind (scrub back / restart) and rebuilds the log, then appends
   any timeline beats that have become due since the last update. */
function updateEventFeed(simT){
  var timeline=(typeof getTimeline==='function') && getTimeline();
  if(!timeline) return;
  var quarterId=timeline.quarterId;

  if(quarterId!==_feedQuarterId || simT < _feedLastSimT - 0.25){
    feedReset(quarterId);
    var banner=timeline.banner;
    if(banner){
      feedAddEntry('START', banner.quarterLine, 'quarter');
      feedAddEntry('BOARD', banner.decisionLine, 'decision');
    }
  }
  _feedLastSimT=simT;

  var events=timeline.statEvents || [];
  for(var i=0;i<events.length;i++){
    var ev=events[i];
    var key='e'+i;
    if(ev.t<=simT && !_feedLogged[key]){
      _feedLogged[key]=true;
      feedAddEntry(simMonthLabel(ev.t), ev.toast || ev.name, _feedKind(ev.slot));
    }
  }
}
