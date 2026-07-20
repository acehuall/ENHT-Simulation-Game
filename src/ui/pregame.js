'use strict';
/* Opening flow: title (attract mode) → assemble your board → briefing ×3 →
   onComplete(). Deliberately owns keyboard input only while its overlay is
   shown; the listener is removed when the game starts. */
var pregameScreen='intro', pregameComplete=null, pregameBriefingPage=0;
var pregameSceneObj=null, pregameEcgObj=null, pregameRafId=0, pregameKeydown=null;
var pregameTypeTimer=0, pregameTypeDone=true, pregameStatementText='';
var pregameSelected={};
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
      '<button type="button" class="pg-card js-pregame-role" data-role="'+i+'" aria-pressed="'+(!!pregameSelected[i])+'" style="border-left-color:'+role.accent+'">'+
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
  var isFirst=page===0, isLast=page===PREGAME.briefingPages.length-1;
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
  setPregameActions(
    (isFirst?'':pregameButton(PREGAME.briefingPreviousLabel,'js-pregame-previous',true))+
    pregameButton(isLast?PREGAME.briefingStartLabel:PREGAME.briefingNextLabel,isLast?'js-pregame-start':'js-pregame-next'),
    isLast?PREGAME.hintStart:PREGAME.hintContinue);
}

function finishPregame(){
  pregameScreen='complete';
  if(pregameRafId){ cancelAnimationFrame(pregameRafId); pregameRafId=0; }
  clearInterval(pregameTypeTimer);
  if(pregameKeydown){ document.removeEventListener('keydown',pregameKeydown); pregameKeydown=null; }
  pregameRoot().innerHTML='';
  pregameRoot().classList.add('pregame-root--hidden');
  pregameComplete();
}

function advancePregame(){
  if(pregameScreen==='intro') showPregameTeam();
  else if(pregameScreen==='team') showPregameBriefing(0);
  else if(pregameScreen==='briefing'){
    if(!pregameTypeDone){ pregameCompleteTypeOn(); return; } /* first press skips the type-on */
    if(pregameBriefingPage>=PREGAME.briefingPages.length-1) finishPregame();
    else showPregameBriefing(pregameBriefingPage+1);
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
      var idx=card.getAttribute('data-role');
      pregameSelected[idx]=!pregameSelected[idx];
      card.setAttribute('aria-pressed',String(!!pregameSelected[idx]));
      return;
    }
    if(event.target.closest && event.target.closest('.js-pregame-advance, .js-pregame-next, .js-pregame-start')) advancePregame();
    else if(event.target.closest && event.target.closest('.js-pregame-previous')) showPregameBriefing(pregameBriefingPage-1);
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
