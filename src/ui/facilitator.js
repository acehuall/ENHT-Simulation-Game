'use strict';
/* ---------- facilitator notes overlay ----------
   Toggled with the `F` hotkey. Surfaces the briefing for the current scenario -
   the situation, the risk, and every board option with its pros, cons and
   headline metric effects - so a facilitator can talk to the room without
   leaving the simulation view.
------------------------------------------------------------------------ */

var _facilPrevPaused=false;
var _facilPrevFocus=null;

function _facilRoot(){ return $('facilRoot'); }

function isFacilitatorNotesOpen(){
  var root=_facilRoot();
  return !!(root && !root.hidden);
}

function _facilLine(parent, cls, text){
  var el=document.createElement('div');
  el.className=cls;
  el.textContent=text;
  parent.appendChild(el);
  return el;
}

/* Plain-text effect: money keeps the sign outside the £ and one decimal
   (e.g. -£1.8m, +£0.3m); everything else is a signed integer. */
function _facilFormatEffect(def, v){
  if(def.money){
    var s=v>0 ? '+' : (v<0 ? '-' : '');
    return s+'£'+Math.abs(v).toFixed(1)+'m';
  }
  return (v>0 ? '+' : '')+String(v);
}

function _facilEffectsSummary(effects){
  var defs=(typeof getMetricDefs==='function') ? getMetricDefs() : METRIC_DEFS;
  var parts=[], i, def, v;
  for(i=0;i<defs.length;i++){
    def=defs[i];
    v=effects && effects[def.key];
    if(!v) continue;
    parts.push(def.label+' '+_facilFormatEffect(def, v));
  }
  return parts.length ? parts.join('  ·  ') : 'No material change';
}

function _buildFacilitatorNotes(){
  var root=_facilRoot();
  var quarter=(typeof getCurrentQuarter==='function') ? getCurrentQuarter() : null;
  root.innerHTML='';

  var modal=document.createElement('div');
  modal.className='facil-modal';

  /* Clicking the backdrop (but not the modal itself) dismisses the dialog. */
  root.onclick=function(e){ if(e.target===root) closeFacilitatorNotes(); };

  var top=document.createElement('div');
  top.className='facil-top';
  var h2=document.createElement('h2');
  h2.id='facilTitle';
  h2.textContent='FACILITATOR NOTES';
  var sub=document.createElement('span');
  sub.className='facil-sub';
  sub.textContent=quarter ? (quarter.displayName || quarter.label) : '';
  var close=document.createElement('button');
  close.className='btn facil-close';
  close.type='button';
  close.textContent='Close (F)';
  close.onclick=closeFacilitatorNotes;
  top.appendChild(h2);
  top.appendChild(sub);
  top.appendChild(close);
  modal.appendChild(top);

  var body=document.createElement('div');
  body.className='facil-body';

  if(quarter){
    _facilLine(body, 'facil-h', 'SITUATION');
    _facilLine(body, 'facil-p', quarter.scenario || '');
    if(quarter.issue && quarter.issue.risk){
      _facilLine(body, 'facil-risk', 'RISK: '+quarter.issue.risk);
    }

    _facilLine(body, 'facil-h', 'BOARD OPTIONS');
    var options=quarter.options || [], i, opt, card, pc, col;
    for(i=0;i<options.length;i++){
      opt=options[i];
      card=document.createElement('div');
      card.className='facil-option';
      _facilLine(card, 'facil-opt-title', (opt.label ? opt.label+'  ' : '')+opt.title);
      _facilLine(card, 'facil-opt-desc', opt.description || '');

      pc=document.createElement('div');
      pc.className='facil-procon';
      col=document.createElement('div');
      _facilLine(col, 'facil-pc-head', 'PROS');
      (opt.pros || []).forEach(function(p){ _facilLine(col, 'facil-pc good', '+ '+p); });
      pc.appendChild(col);
      col=document.createElement('div');
      _facilLine(col, 'facil-pc-head', 'CONS');
      (opt.cons || []).forEach(function(c){ _facilLine(col, 'facil-pc bad', '- '+c); });
      pc.appendChild(col);
      card.appendChild(pc);

      _facilLine(card, 'facil-effects', 'Effects: '+_facilEffectsSummary(opt.effects));
      body.appendChild(card);
    }
  }else{
    _facilLine(body, 'facil-p', 'No scenario is currently active.');
  }

  modal.appendChild(body);
  root.appendChild(modal);
}

function openFacilitatorNotes(){
  var root=_facilRoot();
  if(!root || isFacilitatorNotesOpen()) return;
  /* Freeze the simulation while the briefing is up, remembering the prior run
     state so closing the dialog restores exactly what the facilitator had. */
  _facilPrevPaused=paused;
  paused=true;
  if(typeof syncPauseButton==='function') syncPauseButton();
  _facilPrevFocus=(document.activeElement && document.activeElement.blur) ? document.activeElement : null;
  _buildFacilitatorNotes();
  root.hidden=false;
  var closeBtn=root.querySelector('.facil-close');
  if(closeBtn) closeBtn.focus();
}

function closeFacilitatorNotes(){
  var root=_facilRoot();
  if(!root || root.hidden) return;
  root.hidden=true;
  paused=_facilPrevPaused;
  if(typeof syncPauseButton==='function') syncPauseButton();
  if(_facilPrevFocus && document.contains(_facilPrevFocus)){
    _facilPrevFocus.focus();
  }
  _facilPrevFocus=null;
}

function toggleFacilitatorNotes(){
  if(isFacilitatorNotesOpen()) closeFacilitatorNotes();
  else openFacilitatorNotes();
}
