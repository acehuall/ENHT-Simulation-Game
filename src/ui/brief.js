'use strict';
/* ---------- board brief overlay (phase 4) ----------
   Toggled with the `B` hotkey. Surfaces the roles chosen in the pregame with
   their objectives and a LIVE status for each, so a facilitator can remind the
   room what every seat is playing for. Mirrors facilitator.js exactly: same
   overlay markup/CSS idiom, same pause-on-open, focus and Escape handling.

   Status is derived only from committed decisions (getStatsHistory + the
   committed running stats GAME.stats) - never from METRIC_CUR or playback beats,
   matching the recordDecisionAlerts precedent.
------------------------------------------------------------------------ */

var _briefPrevPaused=false;
var _briefPrevFocus=null;

function _briefRoot(){ return $('briefRoot'); }

function isBriefOpen(){
  var root=_briefRoot();
  return !!(root && !root.hidden);
}

function _briefLine(parent, cls, text){
  var el=document.createElement('div');
  el.className=cls;
  el.textContent=text;
  parent.appendChild(el);
  return el;
}

/* Live status -> phase-1 band tone class. Reuses the shared tone variables
   (no parallel palette): BREACHED=critical, AT RISK=warn, ON TRACK=neutral,
   MET=good. */
function _briefStatusTone(status){
  switch(status){
    case 'BREACHED': return 'critical';
    case 'AT RISK':  return 'warn';
    case 'MET':      return 'good';
    default:         return 'neutral'; /* ON TRACK */
  }
}

/* Plain-text target descriptor, e.g. "HOLD >= -£3.0m". Money keeps the sign
   outside the £; index metrics are bare integers; the comparator folds in
   goodUp so a lower-is-better `end` reads "REACH <=". */
function _briefTargetText(obj){
  var def=(typeof getMetricDef==='function') ? getMetricDef(obj.key) : null;
  var val=(def && def.money)
    ? ((obj.target<0?'-£':'£')+Math.abs(obj.target).toFixed(1)+'m')
    : String(obj.target);
  var op;
  switch(obj.type){
    case 'floor':   op='HOLD ≥ '; break;
    case 'ceiling': op='KEEP ≤ '; break;
    case 'delta':   op='GAIN ≥ '+(obj.target>=0?'+':''); break;
    case 'end':     op=(def && def.goodUp===false) ? 'REACH ≤ ' : 'REACH ≥ '; break;
    default:        op='';
  }
  return op+val;
}

function _buildBrief(){
  var root=_briefRoot();
  root.innerHTML='';

  var modal=document.createElement('div');
  modal.className='brief-modal';

  /* Clicking the backdrop (but not the modal itself) dismisses the dialog. */
  root.onclick=function(e){ if(e.target===root) closeBrief(); };

  var top=document.createElement('div');
  top.className='brief-top';
  var h2=document.createElement('h2');
  h2.id='briefTitle';
  h2.textContent='BOARD BRIEF';
  var sub=document.createElement('span');
  sub.className='brief-sub';
  var roles=(typeof getBoardRoles==='function') ? getBoardRoles() : [];
  sub.textContent=roles.length ? (roles.length+(roles.length>1?' ROLES':' ROLE')) : '';
  var close=document.createElement('button');
  close.className='btn brief-close';
  close.type='button';
  close.textContent='Close (B)';
  close.onclick=closeBrief;
  top.appendChild(h2);
  top.appendChild(sub);
  top.appendChild(close);
  modal.appendChild(top);

  var body=document.createElement('div');
  body.className='brief-body';

  if(!roles.length){
    _briefLine(body, 'brief-p', 'No roles were selected in the pregame. Restart to assemble a board and see its objectives here.');
  }else{
    var history=(typeof getStatsHistory==='function') ? getStatsHistory() : [];
    var startStats=history.length ? history[0].startStats : (typeof GAME!=='undefined' ? GAME.stats : null);
    var currentStats=(typeof GAME!=='undefined') ? GAME.stats : null;
    var i, j, role, obj, card, status, tone, objRow, meta;
    for(i=0;i<roles.length;i++){
      role=roles[i];
      card=document.createElement('div');
      card.className='brief-role';
      card.style.borderLeftColor=role.accent;
      _briefLine(card, 'brief-role-name', role.name);
      if(role.briefing) _briefLine(card, 'brief-role-text', role.briefing);
      for(j=0;j<role.objectives.length;j++){
        obj=role.objectives[j];
        status=(typeof getObjectiveLiveStatus==='function')
          ? getObjectiveLiveStatus(obj, history, startStats, currentStats) : 'ON TRACK';
        tone=_briefStatusTone(status);
        objRow=document.createElement('div');
        objRow.className='brief-obj';
        meta=document.createElement('div');
        meta.className='brief-obj-meta';
        _briefLine(meta, 'brief-obj-target', _briefTargetText(obj));
        var pill=document.createElement('span');
        pill.className='brief-status band-'+tone;
        pill.textContent=status;
        meta.appendChild(pill);
        objRow.appendChild(meta);
        _briefLine(objRow, 'brief-obj-label', obj.label);
        card.appendChild(objRow);
      }
      body.appendChild(card);
    }
  }

  modal.appendChild(body);
  root.appendChild(modal);
}

function openBrief(){
  var root=_briefRoot();
  if(!root || isBriefOpen()) return;
  /* Freeze the simulation while the brief is up, remembering the prior run
     state so closing restores exactly what the facilitator had. */
  _briefPrevPaused=paused;
  paused=true;
  if(typeof syncPauseButton==='function') syncPauseButton();
  _briefPrevFocus=(document.activeElement && document.activeElement.blur) ? document.activeElement : null;
  _buildBrief();
  root.hidden=false;
  var closeBtn=root.querySelector('.brief-close');
  if(closeBtn) closeBtn.focus();
}

function closeBrief(){
  var root=_briefRoot();
  if(!root || root.hidden) return;
  root.hidden=true;
  paused=_briefPrevPaused;
  if(typeof syncPauseButton==='function') syncPauseButton();
  if(_briefPrevFocus && document.contains(_briefPrevFocus)){
    _briefPrevFocus.focus();
  }
  _briefPrevFocus=null;
}

function toggleBrief(){
  if(isBriefOpen()) closeBrief();
  else openBrief();
}

/* Recompute in place when a decision commits while the panel is open. Opening
   always rebuilds, so this only matters if the panel is already up. */
function refreshBrief(){
  if(isBriefOpen()) _buildBrief();
}
