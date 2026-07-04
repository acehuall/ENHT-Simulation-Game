'use strict';
/* ---------- static layer (drawn once, offscreen) ---------- */
var stat=document.createElement('canvas'); stat.width=960; stat.height=544;
var sc=stat.getContext('2d');

function drawStatic(){
  var c=sc;
  function F(col,x,y,w,h){ c.fillStyle=col; c.fillRect(x,y,w,h); }
  for(var ty=0;ty<ROWS;ty++)for(var tx=0;tx<COLS;tx++){
    var ch=at(tx,ty), x=tx*TILE, y=ty*TILE;
    if(ch==='#'){
      F(WALL.cap,x,y,32,32);
      if(isFloor(at(tx,ty+1))){
        F(WALL.face,x,y+14,32,18);
        F(WALL.hi,x,y+14,32,2);
        F(WALL.seam,x,y+30,32,2);
      }
      if(isFloor(at(tx,ty-1))) F(WALL.seam,x,y,32,2);
    }else{
      var f=FLOORS[ch]||FLOORS['.'];
      F(((tx+ty)&1)?f[0]:f[1],x,y,32,32);
      if(hash(tx,ty)%7===0) F('rgba(0,0,0,0.08)',x+8+(hash(tx,ty)%3)*6,y+8+(hash(ty,tx)%3)*6,3,3);
      if(at(tx,ty-1)==='#'){ F('rgba(0,0,0,0.16)',x,y,32,5); F('rgba(0,0,0,0.07)',x,y+5,32,3); }
      if(at(tx-1,ty)==='#') F('rgba(0,0,0,0.09)',x,y,4,32);
      if(at(tx+1,ty)==='#') F('rgba(0,0,0,0.09)',x+28,y,4,32);
      if((ty===6||ty===9)&&ch!=='.') F('rgba(0,0,0,0.10)',x+2,y+12,28,8);
      if(ch==='E'){
        F('#33415e',x+1,y+3,30,26); F('#8fd7dd',x+4,y+6,10,20); F('#8fd7dd',x+18,y+6,10,20);
        F('#d7f2f4',x+5,y+7,3,18); F('#33415e',x+15,y+3,2,26);
      }
    }
  }
  /* N sign on the front wall by the entrance */
  F('#0a4a44',408,518,26,22); F('#17a9a3',406,516,26,22);
  c.fillStyle='#eafffd'; c.font='bold 16px monospace'; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('N',419,528);
  for(var i=0;i<PROPS.length;i++) drawProp(c,PROPS[i][0],PROPS[i][1]*TILE,PROPS[i][2]*TILE);
}
