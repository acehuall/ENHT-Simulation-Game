'use strict';
/* Opening flow deliberately owns keyboard input only while its overlay is shown. */
var pregameScreen='intro', pregameComplete=null, pregameBriefingPage=0;

function pregameRoot(){ return document.getElementById('pregameRoot'); }
function pregameButton(label, className){
  return '<button type="button" class="pregame-button '+(className || '')+'">'+label+'</button>';
}
function pregameFrame(content, name){
  pregameRoot().innerHTML='<section class="pregame-screen pregame-'+name+'" role="dialog" aria-modal="true">'+content+'</section>';
}
function showPregameIntro(){
  pregameScreen='intro';
  pregameFrame(
    '<div class="pregame-brand"><span class="pregame-nsq">N</span><span>'+PREGAME.brand+'</span></div>'+
    '<div class="pregame-intro-copy"><p class="pregame-kicker">BOARD DECISION SIMULATION</p><h1>'+PREGAME.title+'</h1><p class="pregame-prompt">'+PREGAME.introPrompt+'</p></div>'+
    '<div class="pregame-action">'+pregameButton(PREGAME.beginLabel,'js-pregame-advance')+'<p>ENTER / SPACE</p></div>', 'intro');
  pregameRoot().querySelector('.js-pregame-advance').focus();
}
function showPregameTeam(){
  var cards=[], i, role;
  pregameScreen='team';
  for(i=0;i<PREGAME.roles.length;i++){
    role=PREGAME.roles[i];
    cards.push('<article class="pregame-role-card"><h2>'+role.name+'</h2><p>'+role.concern+'</p></article>');
  }
  pregameFrame(
    '<div class="pregame-content"><p class="pregame-kicker">NORTHBROOK GENERAL / BOARD ROOM</p><h1>'+PREGAME.teamHeading+'</h1><p class="pregame-lead">'+PREGAME.teamInstruction+'</p><div class="pregame-roles">'+cards.join('')+'</div></div>'+
    '<div class="pregame-action">'+pregameButton(PREGAME.continueLabel,'js-pregame-advance')+'<p>ENTER / SPACE</p></div>', 'team');
  pregameRoot().querySelector('.js-pregame-advance').focus();
}
function finishPregame(){
  pregameScreen='complete';
  pregameRoot().innerHTML='';
  pregameRoot().classList.add('pregame-root--hidden');
  pregameComplete();
}
function showPregameBriefing(page){
  var briefing=PREGAME.briefingPages[page], isFirst=page===0, isLast=page===PREGAME.briefingPages.length-1;
  pregameScreen='briefing';
  pregameBriefingPage=page;
  pregameFrame(
    '<div class="pregame-briefing-copy"><p class="pregame-kicker">'+briefing.tag+'</p><p class="pregame-briefing-statement">'+briefing.text+'</p></div>'+
    '<div class="pregame-page-indicator">PAGE '+(page+1)+' / '+PREGAME.briefingPages.length+'</div>'+
    '<div class="pregame-action pregame-briefing-actions">'+
      (isFirst ? '' : pregameButton(PREGAME.briefingPreviousLabel,'js-pregame-previous'))+
      pregameButton(isLast ? PREGAME.briefingStartLabel : PREGAME.briefingNextLabel, isLast ? 'js-pregame-start' : 'js-pregame-next')+
      '<p>'+(isLast ? 'ENTER / SPACE TO START' : 'ENTER / SPACE TO CONTINUE')+'</p></div>', 'briefing');
  pregameRoot().querySelector(isLast ? '.js-pregame-start' : '.js-pregame-next').focus();
}
function advancePregame(){
  if(pregameScreen==='intro') showPregameTeam();
  else if(pregameScreen==='team') showPregameBriefing(0);
  else if(pregameScreen==='briefing'){
    if(pregameBriefingPage>=PREGAME.briefingPages.length-1) finishPregame();
    else showPregameBriefing(pregameBriefingPage+1);
  }
}
function startPregameFlow(onComplete){
  pregameComplete=onComplete;
  pregameRoot().onclick=function(event){
    if(event.target.classList.contains('js-pregame-advance') || event.target.classList.contains('js-pregame-next') || event.target.classList.contains('js-pregame-start')) advancePregame();
    if(event.target.classList.contains('js-pregame-previous')) showPregameBriefing(pregameBriefingPage-1);
  };
  document.addEventListener('keydown',function(event){
    if(pregameScreen==='complete' || event.altKey || event.ctrlKey || event.metaKey) return;
    if(event.key==='Enter' || event.key===' '){ event.preventDefault(); advancePregame(); }
  });
  if(/(?:[?&])skipintro(?:=1|=true|&|$)/i.test(window.location.search)) finishPregame();
  else showPregameIntro();
}
