'use strict';
function mixHexColor(a,b,p){
  var ar=parseInt(a.substr(1,2),16), ag=parseInt(a.substr(3,2),16), ab=parseInt(a.substr(5,2),16);
  var br=parseInt(b.substr(1,2),16), bg=parseInt(b.substr(3,2),16), bb=parseInt(b.substr(5,2),16);
  function h(v){ var s=Math.round(v).toString(16); return s.length<2?'0'+s:s; }
  return '#'+h(ar+(br-ar)*p)+h(ag+(bg-ag)*p)+h(ab+(bb-ab)*p);
}

function getRolePalette(role,visualState){
  var base=ROLE[role], tint=visualState && visualState.illnessTint ? visualState.illnessTint : 0;
  var skin='#e8b48c';
  if(role==='patient' && tint>0){
    return {
      top: mixHexColor(base.top,'#6fcc70',0.45*tint),
      leg: mixHexColor(base.leg,'#5fbf72',0.38*tint),
      hair: base.hair,
      skin: mixHexColor(skin,'#8fd477',0.34*tint)
    };
  }
  return {top:base.top, leg:base.leg, hair:base.hair, skin:skin};
}

function drawIllnessPixels(fx,fy,bob,intensity){
  if(!intensity) return;
  ctx.globalAlpha=0.22+0.18*intensity;
  R('#66d56e',fx-10,fy-31-bob,3,3);
  R('#9ee985',fx+8,fy-23-bob,2,2);
  R('#58bd5e',fx-9,fy-15-bob,2,2);
  ctx.globalAlpha=1;
}

function drawAgent(role,tx,ty,dx,dy,moving,clock,seated,visualState){
  var r=getRolePalette(role,visualState);
  var fx=tx*TILE+16, fy=ty*TILE+29;
  var fr=moving?(Math.floor(clock*7)%2):0;
  var bob=moving?fr:0;
  ctx.fillStyle='rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(fx,fy+1,9,3,0,0,7); ctx.fill();
  function O(x,y,w,h,col){ R('#20242f',x-1,y-1,w+2,h+2); R(col,x,y,w,h); }
  if(seated){
    O(fx-8,fy-16,16,12,r.top);
    O(fx-7,fy-27,14,11,r.skin); R(r.hair,fx-7,fy-27,14,4);
    R('#20242f',fx-4,fy-22,2,3); R('#20242f',fx+2,fy-22,2,3);
    return;
  }
  var ly=fy-8-bob;
  O(fx-6,ly,5,8,r.leg); O(fx+1,ly,5,8,r.leg);
  if(moving){ R('#20242f',fx-6,(fr?ly+6:ly-1),5,2); R('#20242f',fx+1,(fr?ly-1:ly+6),5,2); }
  O(fx-8,fy-19-bob,16,12,r.top);
  if(role==='doctor'){ R('#c6ccd8',fx-1,fy-19-bob,2,12); R('#17a9a3',fx-5,fy-17-bob,3,3); }
  if(role==='nurse'||role==='agency'){ R('#f4f6f8',fx-1,fy-16-bob,4,2); R('#f4f6f8',fx,fy-17-bob,2,4); }
  if(role==='agency'){ R('#e9b44c',fx+4,fy-17-bob,3,4); }
  O(fx-7,fy-30-bob,14,12,r.skin);
  R(r.hair,fx-7,fy-30-bob,14,(dy<0?9:4));
  if(dy>=0){
    var s=dx<0?-3:(dx>0?3:0);
    R('#20242f',fx-4+s,fy-25-bob,2,3); R('#20242f',fx+2+s,fy-25-bob,2,3);
  }
  if(role==='patient') drawIllnessPixels(fx,fy,bob,visualState && visualState.illnessTint);
}

function drawReporterNpc(npc,clock){
  var fx=npc.x*TILE+16, fy=npc.y*TILE+29;
  var bob=Math.floor(clock*2)%2;
  var facing=npc.facing || 1;
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(fx,fy+1,9,3,0,0,7); ctx.fill();
  function O(x,y,w,h,col){ R('#20242f',x-1,y-1,w+2,h+2); R(col,x,y,w,h); }
  O(fx-6,fy-8,5,8,'#273044'); O(fx+1,fy-8,5,8,'#273044');
  O(fx-8,fy-19-bob,16,12,'#d6ad42');
  R('#f4f6f8',fx-2,fy-18-bob,5,7);
  R('#20242f',fx-7,fy-16-bob,4,2);
  O(fx-7,fy-30-bob,14,12,'#d99b73');
  R('#29221c',fx-7,fy-30-bob,14,4);
  R('#20242f',fx-4+facing,fy-25-bob,2,3);
  R('#20242f',fx+2+facing,fy-25-bob,2,3);
  if(npc.prop==='camera'){
    O(fx+facing*8,fy-22-bob,8,6,'#1d2433');
    R('#8fd6e8',fx+facing*8+(facing>0?5:1),fy-20-bob,2,2);
  }else{
    R('#20242f',fx+facing*8,fy-20-bob,6*facing,2);
    R('#303747',fx+facing*13,fy-23-bob,4,4);
  }
}

function drawQuarterVisualNpcs(clock){
  var quarterEvent=getCurrentQuarterEvent();
  var npcs=quarterEvent.visualNPCs || [];
  for(var i=0;i<npcs.length;i++){
    if(npcs[i].type==='reporter') drawReporterNpc(npcs[i],clock);
  }
}
