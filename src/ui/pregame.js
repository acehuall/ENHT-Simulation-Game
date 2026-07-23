'use strict';
/* Opening flow: title (attract mode) → assemble your board → your brief →
   briefing ×3 → onComplete(). Deliberately owns keyboard input only while its
   overlay is shown; the listener is removed when the game starts. */
var pregameScreen='intro', pregameComplete=null, pregameBriefingPage=0;
var pregameSceneObj=null, pregameEcgObj=null, pregameRafId=0, pregameKeydown=null;
var pregameTypeTimer=0, pregameTypeDone=true, pregameStatementText='';
/* Selection is keyed by role.id (not array index), so the ids handed to
   setBoardRoles() survive any reordering of PREGAME.roles. */
var pregameSelected={};

/* Selected role ids in canonical PREGAME.roles order (stable for display). */
function pregameSelectedIds(){
  var ids=[], i, role;
  for(i=0;i<PREGAME.roles.length;i++){
    role=PREGAME.roles[i];
    if(pregameSelected[role.id]) ids.push(role.id);
  }
  return ids;
}
function pregameSelectedRoles(){
  var out=[], i, role;
  for(i=0;i<PREGAME.roles.length;i++){
    role=PREGAME.roles[i];
    if(pregameSelected[role.id]) out.push(role);
  }
  return out;
}
var pregameReduceMotion=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function pregameRoot(){ return document.getElementById('pregameRoot'); }
function pregameEl(id){ return document.getElementById(id); }

function buildPregameShell(){
  pregameRoot().innerHTML=
    '<section class="pg" role="dialog" aria-modal="true" aria-label="'+PREGAME.title+' opening">'+
      '<div class="pg-hdr">'+
        '<span class="pg-nsq" aria-hidden="true">N</span>'+
        '<div><h1>'+PREGAME.headerTitle+'</h1><div class="pg-sub">'+PREGAME.headerSub+'</div></div>'+
        '<span class="pg-chip">'+PREGAME.chipLabel+'</span>'+
      '</div>'+
      '<div class="pg-stage"><div class="pg-frame">'+
        '<canvas class="pg-scene" id="pgScene" width="960" height="430" aria-hidden="true"></canvas>'+
        '<img class="pg-boardroom" id="pgBoardroom" src="src/Assets/BoardRoom Image.png" alt="" hidden>'+
        '<div class="pg-veil" id="pgVeil"></div>'+
        '<div class="pg-scan" aria-hidden="true"></div>'+
        '<div class="pg-vignette" aria-hidden="true"></div>'+
        '<div class="pg-sweep" aria-hidden="true"></div>'+
      '</div></div>'+
      '<div class="pg-ctrl"><div class="pg-actions" id="pgActions"></div><p class="pg-hint" id="pgHint"></p></div>'+
    '</section>';
  pregameSceneObj=createPregameScene(pregameEl('pgScene'));
  if(pregameReduceMotion) pregameSceneObj.drawFrame(0.35); /* single fixed frame */
}

function setPregameBackdrop(mode){
  if(pregameEl('pgScene')) pregameEl('pgScene').hidden=(mode!=='scene');
  if(pregameEl('pgBoardroom')) pregameEl('pgBoardroom').hidden=(mode!=='boardroom');
}
function setPregameActions(html,hint){
  pregameEl('pgActions').innerHTML=html;
  pregameEl('pgHint').textContent=hint;
  var primary=pregameEl('pgActions').querySelector('.js-pregame-advance, .js-pregame-next, .js-pregame-start');
  if(primary) primary.focus();
}
function pregameButton(label,className,ghost){
  return '<button type="button" class="pg-button '+(ghost?'pg-button--ghost ':'')+className+'">'+label+'</button>';
}

function showPregameIntro(){
  pregameScreen='intro';
  setPregameBackdrop('scene');
  var veil=pregameEl('pgVeil');
  veil.className='pg-veil pg-veil--title';
  veil.innerHTML=
    '<p class="pg-kicker">'+PREGAME.kickerIntro+'</p>'+
    '<h2 class="pg-title">'+PREGAME.titleLines[0]+'<br><span class="pg-title-accent">'+PREGAME.titleLines[1]+'</span></h2>'+
    '<canvas class="pg-ecg" id="pgEcg" width="360" height="44" aria-hidden="true"></canvas>'+
    '<p class="pg-press">'+PREGAME.introPrompt+'</p>';
  pregameEcgObj=createPregameEcg(pregameEl('pgEcg'));
  if(pregameReduceMotion) pregameEcgObj.drawStatic();
  setPregameActions(pregameButton(PREGAME.beginLabel,'js-pregame-advance'),PREGAME.hint);
}

function showPregameTeam(){
  var cards=[], i, role;
  pregameScreen='team';
  pregameEcgObj=null;
  setPregameBackdrop('scene');
  for(i=0;i<PREGAME.roles.length;i++){
    role=PREGAME.roles[i];
    cards.push(
      '<button type="button" class="pg-card js-pregame-role" data-role="'+role.id+'" aria-pressed="'+(!!pregameSelected[role.id])+'" style="border-left-color:'+role.accent+'">'+
        '<canvas class="pg-portrait" width="24" height="24" aria-hidden="true"></canvas>'+
        '<span class="pg-card-text"><span class="pg-card-name">'+role.name+'</span>'+
        '<span class="pg-card-desc">'+role.concern+'</span></span>'+
      '</button>');
  }
  var veil=pregameEl('pgVeil');
  veil.className='pg-veil pg-veil--team';
  veil.innerHTML=
    '<p class="pg-kicker">'+PREGAME.kickerTeam+'</p>'+
    '<h2 class="pg-heading">'+PREGAME.teamHeading+'</h2>'+
    '<p class="pg-lead">'+PREGAME.teamInstruction+'</p>'+
    '<div class="pg-roles">'+cards.join('')+'</div>';
  var portraits=veil.querySelectorAll('.pg-portrait');
  for(i=0;i<portraits.length;i++) drawPregamePortrait(portraits[i],PREGAME.roles[i].portrait);
  setPregameActions(pregameButton(PREGAME.continueLabel,'js-pregame-advance'),PREGAME.hint);
  updateTeamContinueState();
}

/* Gate CONTINUE on at least one selection, and steer group play toward the
   spec §8 soft default of 2-3 through hint copy only - all six stay pickable. */
function updateTeamContinueState(){
  if(pregameScreen!=='team') return;
  var btn=pregameRoot().querySelector('.js-pregame-advance');
  var hintEl=pregameEl('pgHint');
  var n=pregameSelectedIds().length;
  if(btn){
    btn.disabled=n<1;
    btn.classList.toggle('pg-button--disabled', n<1);
    btn.setAttribute('aria-disabled', String(n<1));
  }
  if(hintEl){
    if(n<1) hintEl.textContent='SELECT AT LEAST ONE ROLE TO CONTINUE';
    else if(n>3) hintEl.textContent=n+' SELECTED - 2-3 WORKS BEST FOR A SHARED SESSION';
    else hintEl.textContent=n+' SELECTED - '+PREGAME.hintContinue;
  }
}

/* Plain-text target descriptor for the confirm screen, e.g. "HOLD >= -£3.0m".
   Money metrics keep the sign outside the £; index metrics are bare integers.
   The comparator folds in goodUp so a lower-is-better `end` reads "REACH <=". */
function pregameTargetText(obj){
  var def=getMetricDef(obj.key);
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

/* "Your Brief" confirm screen: for each chosen role, its briefing and the three
   weighted objectives. Sits between team select and the board briefing pages;
   BACK returns to team select, CONFIRM advances into the briefing. */
function showPregameBrief(){
  pregameScreen='brief';
  if(pregameRafId){ cancelAnimationFrame(pregameRafId); pregameRafId=0; }
  setPregameBackdrop('boardroom');
  var roles=pregameSelectedRoles(), i, j, role, obj, objHtml, cards=[];
  for(i=0;i<roles.length;i++){
    role=roles[i];
    objHtml='';
    for(j=0;j<role.objectives.length;j++){
      obj=role.objectives[j];
      objHtml+='<li class="pg-brief-obj">'+
        '<span class="pg-brief-target">'+escapeHTML(pregameTargetText(obj))+'</span>'+
        '<span class="pg-brief-label">'+escapeHTML(obj.label)+'</span></li>';
    }
    cards.push('<div class="pg-brief-card" style="border-left-color:'+role.accent+'">'+
      '<h3 class="pg-brief-name">'+escapeHTML(role.name)+'</h3>'+
      '<p class="pg-brief-text">'+escapeHTML(role.briefing || '')+'</p>'+
      '<ul class="pg-brief-objs">'+objHtml+'</ul></div>');
  }
  var veil=pregameEl('pgVeil');
  veil.className='pg-veil pg-veil--brief';
  veil.innerHTML=
    '<p class="pg-kicker">YOUR BRIEF</p>'+
    '<h2 class="pg-heading">'+(roles.length>1?'YOUR BOARD':'YOUR ROLE')+'</h2>'+
    '<div class="pg-brief-grid">'+cards.join('')+'</div>';
  setPregameActions(
    pregameButton(PREGAME.briefingPreviousLabel,'js-pregame-previous',true)+
    pregameButton(PREGAME.continueLabel,'js-pregame-advance'),
    PREGAME.hintContinue);
}

function pregameTypeOn(text){
  var el=pregameEl('pgType'), n=0, total=text.length, stepMs;
  pregameStatementText=text;
  if(pregameReduceMotion){ el.textContent=text; pregameTypeDone=true; return; }
  stepMs=Math.max(16,Math.floor(800/total));
  pregameTypeDone=false;
  pregameTypeTimer=setInterval(function(){
    n++; el.textContent=text.slice(0,n);
    if(n>=total){ clearInterval(pregameTypeTimer); pregameTypeDone=true; }
  },stepMs);
}
function pregameCompleteTypeOn(){
  clearInterval(pregameTypeTimer);
  if(pregameEl('pgType')) pregameEl('pgType').textContent=pregameStatementText;
  pregameTypeDone=true;
}

function showPregameBriefing(page){
  var briefing=PREGAME.briefingPages[page];
  var isLast=page===PREGAME.briefingPages.length-1;
  pregameScreen='briefing';
  pregameBriefingPage=page;
  if(pregameRafId){ cancelAnimationFrame(pregameRafId); pregameRafId=0; } /* scene stops behind the boardroom */
  setPregameBackdrop('boardroom');
  var veil=pregameEl('pgVeil');
  veil.className='pg-veil pg-veil--briefing';
  veil.innerHTML=
    '<p class="pg-page">PAGE '+(page+1)+' / '+PREGAME.briefingPages.length+'</p>'+
    '<p class="pg-kicker pg-tag">'+briefing.tag+'</p>'+
    '<p class="pg-statement"><span class="pg-vh">'+briefing.text+'</span><span id="pgType" aria-hidden="true"></span></p>';
  pregameTypeOn(briefing.text);
  /* Back is always offered now: page 0 steps back to the Your Brief screen
     (pregamePrevious routes it), later pages step to the previous page. */
  setPregameActions(
    pregameButton(PREGAME.briefingPreviousLabel,'js-pregame-previous',true)+
    pregameButton(isLast?PREGAME.briefingStartLabel:PREGAME.briefingNextLabel,isLast?'js-pregame-start':'js-pregame-next'),
    isLast?PREGAME.hintStart:PREGAME.hintContinue);
}

function finishPregame(){
  pregameScreen='complete';
  if(pregameRafId){ cancelAnimationFrame(pregameRafId); pregameRafId=0; }
  clearInterval(pregameTypeTimer);
  if(pregameKeydown){ document.removeEventListener('keydown',pregameKeydown); pregameKeydown=null; }
  /* Persist the chosen ids before the game reads them (brief panel, pips). */
  if(typeof setBoardRoles==='function') setBoardRoles(pregameSelectedIds());
  pregameRoot().innerHTML='';
  pregameRoot().classList.add('pregame-root--hidden');
  pregameComplete();
}

function advancePregame(){
  if(pregameScreen==='intro') showPregameTeam();
  else if(pregameScreen==='team'){
    if(pregameSelectedIds().length<1) return; /* CONTINUE is blocked at zero selections */
    showPregameBrief();
  }
  else if(pregameScreen==='brief') showPregameBriefing(0);
  else if(pregameScreen==='briefing'){
    if(!pregameTypeDone){ pregameCompleteTypeOn(); return; } /* first press skips the type-on */
    if(pregameBriefingPage>=PREGAME.briefingPages.length-1) finishPregame();
    else showPregameBriefing(pregameBriefingPage+1);
  }
}

/* BACK routing, mirroring the forward flow: brief -> team, briefing page 0 ->
   brief, later briefing pages -> previous page. */
function pregamePrevious(){
  if(pregameScreen==='brief') showPregameTeam();
  else if(pregameScreen==='briefing'){
    if(pregameBriefingPage<=0) showPregameBrief();
    else showPregameBriefing(pregameBriefingPage-1);
  }
}

function pregameLoop(now){
  var t=now/1000;
  if(pregameScreen==='intro' || pregameScreen==='team'){
    pregameSceneObj.drawFrame(t);
    if(pregameScreen==='intro' && pregameEcgObj) pregameEcgObj.draw(t);
  }
  pregameRafId=requestAnimationFrame(pregameLoop);
}

function startPregameFlow(onComplete){
  pregameComplete=onComplete;
  if(/(?:[?&])skipintro(?:=1|=true|&|$)/i.test(window.location.search)){
    pregameScreen='complete';
    pregameRoot().classList.add('pregame-root--hidden');
    pregameComplete();
    return;
  }
  buildPregameShell();
  pregameRoot().onclick=function(event){
    var card=event.target.closest ? event.target.closest('.js-pregame-role') : null;
    if(card){
      var id=card.getAttribute('data-role');
      pregameSelected[id]=!pregameSelected[id];
      card.setAttribute('aria-pressed',String(!!pregameSelected[id]));
      updateTeamContinueState();
      return;
    }
    if(event.target.closest && event.target.closest('.js-pregame-advance, .js-pregame-next, .js-pregame-start')) advancePregame();
    else if(event.target.closest && event.target.closest('.js-pregame-previous')) pregamePrevious();
  };
  pregameKeydown=function(event){
    if(pregameScreen==='complete' || event.altKey || event.ctrlKey || event.metaKey) return;
    if(event.key!=='Enter' && event.key!==' ') return;
    /* let focused role cards and Back activate natively instead of advancing */
    if(event.target && event.target.tagName==='BUTTON' &&
       !/js-pregame-(advance|next|start)/.test(event.target.className)) return;
    event.preventDefault();
    advancePregame();
  };
  document.addEventListener('keydown',pregameKeydown);
  if(!pregameReduceMotion) pregameRafId=requestAnimationFrame(pregameLoop);
  showPregameIntro();
}
