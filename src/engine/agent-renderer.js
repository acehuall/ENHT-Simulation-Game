'use strict';
function drawAgent(role,tx,ty,dx,dy,moving,clock,seated){
  var r=ROLE[role];
  var fx=tx*TILE+16, fy=ty*TILE+29;
  var fr=moving?(Math.floor(clock*7)%2):0;
  var bob=moving?fr:0;
  ctx.fillStyle='rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(fx,fy+1,9,3,0,0,7); ctx.fill();
  function O(x,y,w,h,col){ R('#20242f',x-1,y-1,w+2,h+2); R(col,x,y,w,h); }
  if(seated){
    O(fx-8,fy-16,16,12,r.top);
    O(fx-7,fy-27,14,11,'#e8b48c'); R(r.hair,fx-7,fy-27,14,4);
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
  O(fx-7,fy-30-bob,14,12,'#e8b48c');
  R(r.hair,fx-7,fy-30-bob,14,(dy<0?9:4));
  if(dy>=0){
    var s=dx<0?-3:(dx>0?3:0);
    R('#20242f',fx-4+s,fy-25-bob,2,3); R('#20242f',fx+2+s,fy-25-bob,2,3);
  }
}
