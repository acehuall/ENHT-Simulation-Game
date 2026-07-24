'use strict';
/* Pregame pixel visuals: the attract-mode hospital exterior, the title ECG
   strip and the role portraits. Everything is drawn with plain fillRect
   blocks — no image assets — so the front door shares the in-game sprite
   grammar (1px dark outlines, skin #e8b48c, hard-offset shadows). */

function createPregameScene(canvas){
  var ctx=canvas.getContext('2d');
  var W=canvas.width, H=canvas.height;
  var SKY=['#05070f','#070a16','#0a0e1f','#0d1228','#101633'];
  var GROUND_Y=300, ROAD_Y=345;
  var stars=[], winMain=[], winL=[], winR=[], walkers, i;

  for(i=0;i<70;i++){
    stars.push({x:Math.floor(Math.random()*W), y:Math.floor(Math.random()*250),
      phase:Math.random()*6.28, speed:0.4+Math.random()*1.2});
  }

  /* Window states are rolled once at startup; ward lights toggle on a slow
     per-window cycle, office lights stay amber, the rest stay dark. */
  function makeWindows(list,bx,by,cols,rows,ox,oy,sx,sy,skip){
    var c,r,wx,wy,roll,state;
    for(r=0;r<rows;r++) for(c=0;c<cols;c++){
      wx=bx+ox+c*sx; wy=by+oy+r*sy;
      if(skip && wx+16>skip.x && wx<skip.x+skip.w && wy+11>skip.y && wy<skip.y+skip.h) continue;
      roll=Math.random();
      state=roll<0.30?'amber':(roll<0.55?'ward':'dark');
      list.push({x:wx,y:wy,state:state,period:4+Math.random()*5,off:Math.random()*9});
    }
  }
  makeWindows(winMain,340,120,8,5,22,18,30,26,{x:390,y:210,w:180,h:100});
  makeWindows(winL,210,170,4,4,13,14,30,28,null);
  makeWindows(winR,620,170,4,4,13,14,30,28,null);

  walkers=[
    {seed:0.05, speed:16, dir:1,  footY:338, top:'#3b6ea5', leg:'#2a3145', hair:'#5a3a24'}, /* nurse blues */
    {seed:0.45, speed:13, dir:-1, footY:330, top:'#e8ecf5', leg:'#8b94ab', hair:'#2e2a26'}, /* doctor whites */
    {seed:0.80, speed:19, dir:1,  footY:334, top:'#1f8a7e', leg:'#243138', hair:'#141210'}  /* porter teal */
  ];

  function R(col,x,y,w,h){ ctx.fillStyle=col; ctx.fillRect(x,y,w,h); }
  function O(x,y,w,h,col){ R('#20242f',x-1,y-1,w+2,h+2); R(col,x,y,w,h); }

  function drawSky(t){
    var b,y,x,a,s;
    for(b=0;b<SKY.length;b++) R(SKY[b],0,b*60,W,60);
    for(b=1;b<SKY.length;b++){         /* dithered seam between bands */
      y=b*60;
      for(x=(b%2)*4;x<W;x+=8){ R(SKY[b],x,y-2,4,2); R(SKY[b-1],(x+4)%W,y,4,2); }
    }
    for(b=0;b<stars.length;b++){
      s=stars[b];
      a=0.2+0.8*Math.max(0,Math.sin(t*s.speed+s.phase));
      ctx.globalAlpha=a; R('#dfe6f2',s.x,s.y,2,2); ctx.globalAlpha=1;
    }
    /* blocky moon with notched corners (no square halo - a hard-edged glow box
       reads as an out-of-place shadow against the pixel sky) */
    R('#e6e9df',768,50,28,44); R('#e6e9df',760,58,44,28); R('#e6e9df',764,54,36,36);
    R('#c9cdc0',772,62,6,6); R('#c9cdc0',786,74,8,5); R('#c9cdc0',778,84,5,4);
  }

  function drawBuildings(){
    /* hard-offset drop shadows against the sky, then wings, then main block */
    R('#03050a',220,180,140,130); R('#03050a',630,180,140,130); R('#03050a',350,130,290,180);
    R('#161b2b',210,170,130,135); R('#242b40',210,170,130,4);
    R('#161b2b',620,170,130,135); R('#242b40',620,170,130,4);
    R('#1a2033',340,120,280,185); R('#2a3350',340,120,280,4);
    R('#232b40',362,110,16,10); R('#232b40',560,108,22,12); /* rooftop vents */
  }

  function drawWindowList(list,t){
    var i,w,lit,col;
    for(i=0;i<list.length;i++){
      w=list[i];
      lit=w.state==='amber' || (w.state==='ward' && ((t+w.off)%w.period)<w.period*0.6);
      if(!lit){ R('#0b0f1c',w.x,w.y,16,11); continue; }
      col=w.state==='amber'?'#e9b44c':'#cfe8e4';
      ctx.fillStyle=w.state==='amber'?'rgba(233,180,76,.16)':'rgba(159,232,224,.14)';
      ctx.fillRect(w.x-3,w.y-3,22,17);   /* glow spill */
      R(col,w.x,w.y,16,11);
      R('#232b40',w.x+7,w.y,2,11); R('#232b40',w.x,w.y+5,16,1); /* mullions */
    }
  }

  function drawEntrance(t){
    var on;
    /* recess + glowing double doors */
    R('#0d1220',448,252,64,53);
    R('#f2dc9e',454,262,22,41); R('#f2dc9e',484,262,22,41);
    R('#20242f',476,262,8,41);
    R('#3a3325',454,282,22,2); R('#3a3325',484,282,22,2);
    /* teal canopy with posts */
    R('#0a4a44',438,252,84,4);
    R('#23c4b4',436,244,88,8);
    R('#2a3145',440,256,3,49); R('#2a3145',517,256,3,49);
    /* teal N sign, hard shadow */
    R('#04060c',403,231,22,22);
    R('#23c4b4',400,228,22,22);
    R('#062b28',404,232,4,14); R('#062b28',414,232,4,14);
    R('#062b28',408,234,3,4); R('#062b28',410,238,3,4); R('#062b28',412,242,2,4);
    /* red pixel cross, hard shadow */
    R('#04060c',541,231,22,22);
    R('#e8ecf5',538,228,22,22);
    R('#e05252',546,231,6,16); R('#e05252',541,236,16,6);
    /* rooftop beacon, slow red blink */
    R('#2a3145',476,110,6,10);
    on=(t%1.2)<0.55;
    if(on){ ctx.fillStyle='rgba(224,82,82,.25)'; ctx.fillRect(465,94,28,20); R('#e05252',472,100,14,8); }
    else R('#5a2a2a',472,100,14,8);
  }

  function drawGround(t){
    var gx,dx,shift;
    R('#242938',0,GROUND_Y,W,ROAD_Y-GROUND_Y);
    R('#2e3547',0,GROUND_Y,W,2);
    for(gx=0;gx<W;gx+=32) R('#1c2130',gx,GROUND_Y+2,1,ROAD_Y-GROUND_Y-2);
    R('#161a26',0,ROAD_Y-3,W,3);
    R('#12151f',0,ROAD_Y,W,H-ROAD_Y);
    shift=(t*40)%52;
    for(dx=-shift-52;dx<W;dx+=52) R('#3a415a',dx,386,26,4); /* scrolling lane dashes */
  }

  function drawEntranceSpill(){
    var i;
    for(i=0;i<5;i++){
      ctx.fillStyle='rgba(242,220,158,0.14)';
      ctx.fillRect(452-i*6,GROUND_Y+5+i*7,56+i*12,7);
    }
  }

  function drawLamp(x){
    var i;
    for(i=0;i<5;i++){ ctx.fillStyle='rgba(233,180,76,0.05)'; ctx.fillRect(x-4-i*5,262+i*8,14+i*10,8); }
    R('#04060c',x+3,259,3,44);
    R('#2a3145',x,258,4,45);
    R('#2a3145',x-4,254,12,4);
    R('#e9b44c',x-4,258,8,5);
    ctx.fillStyle='rgba(233,180,76,.3)'; ctx.fillRect(x-7,255,14,11);
  }

  /* The ambulance drives along the road below the pavement, faster than the
     walkers so it visibly overtakes them, then wraps. Scaled to read as a
     compact van against the pedestrian sprites (~78x26) rather than the
     oversized block it used to be. */
  function drawAmbulance(t){
    var range=W+180;
    var x=Math.round((((0.15*range+t*38)%range)+range)%range-120);
    var y=356, on=((t*2.4)%1)<0.5;
    ctx.fillStyle='rgba(0,0,0,0.30)'; ctx.fillRect(x+2,y+28,76,4); /* soft ground shadow */
    R('#20242f',x,y,64,26); R('#e8ecf5',x+2,y+2,60,22);            /* box body */
    R('#20242f',x+62,y+8,16,18); R('#e8ecf5',x+64,y+10,12,14);     /* cab (front, right) */
    R('#9fc4d8',x+66,y+12,8,7);                                    /* windscreen */
    R('#9fc4d8',x+6,y+5,12,8); R('#9fc4d8',x+22,y+5,10,8);         /* rear windows */
    R('#23c4b4',x+2,y+18,60,4);                                    /* trust stripe */
    R('#e05252',x+40,y+4,5,12); R('#e05252',x+36,y+7,13,5);        /* red cross */
    R('#10131c',x+12,y+24,11,7); R('#3a415a',x+15,y+26,5,4);       /* rear wheel */
    R('#10131c',x+46,y+24,11,7); R('#3a415a',x+49,y+26,5,4);       /* front wheel */
    R('#2a3145',x+64,y+5,12,4);                                    /* light-bar base */
    if(on){ ctx.fillStyle='rgba(106,176,255,.3)'; ctx.fillRect(x+62,y-3,18,11); R('#6ab0ff',x+66,y+1,10,5); }
    else R('#31517a',x+66,y+1,10,5);
  }

  function drawWalker(w,t){
    var range=W+60;
    var x=(((w.seed*range+t*w.speed*w.dir)%range)+range)%range-30;
    var fy=w.footY;
    var fr=Math.floor(t*6+w.seed*10)%2;
    var bob=fr, ly=fy-8-bob, s=w.dir<0?-3:3;
    ctx.fillStyle='rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x,fy+1,8,3,0,0,7); ctx.fill();
    O(x-6,ly,5,8,w.leg); O(x+1,ly,5,8,w.leg);
    R('#20242f',x-6,(fr?ly+6:ly-1),5,2); R('#20242f',x+1,(fr?ly-1:ly+6),5,2);
    O(x-8,fy-19-bob,16,12,w.top);
    O(x-7,fy-30-bob,14,12,'#e8b48c');
    R(w.hair,x-7,fy-30-bob,14,4);
    R('#20242f',x-4+s,fy-25-bob,2,3); R('#20242f',x+2+s,fy-25-bob,2,3);
  }

  function drawFrame(t){
    var i;
    drawSky(t);
    drawBuildings();
    drawWindowList(winMain,t); drawWindowList(winL,t); drawWindowList(winR,t);
    drawEntrance(t);
    drawGround(t);
    drawEntranceSpill();
    drawLamp(130); drawLamp(610);
    drawAmbulance(t);
    for(i=0;i<walkers.length;i++) drawWalker(walkers[i],t);
  }

  return {drawFrame:drawFrame};
}

/* Heart-monitor strip under the title: flatline → P bump → QRS spike →
   T recovery, drawn with a bright head pixel and a fading tail. */
function createPregameEcg(canvas){
  var ctx=canvas.getContext('2d');
  var W=canvas.width, H=canvas.height, CYCLE=170, SPEED=110;
  var lastHead=-1, prevY=0;
  ctx.fillStyle='#0a0c13'; ctx.fillRect(0,0,W,H);

  function trace(px){
    var p=(px%CYCLE)/CYCLE, base=H*0.62;
    if(p<0.40) return base+Math.sin(p*46)*1.6;
    if(p<0.46) return base-4;
    if(p<0.52) return base;
    if(p<0.555) return base+6;
    if(p<0.615) return H*0.14;
    if(p<0.66) return base+9;
    if(p<0.80) return base-5;
    return base;
  }
  function plot(x,y0,y1,col){
    var a=Math.min(y0,y1), b=Math.max(y0,y1);
    ctx.fillStyle=col; ctx.fillRect(x,Math.floor(a),2,Math.max(2,Math.floor(b-a)+2));
  }
  function draw(t){
    var head=Math.floor(t*SPEED), px, x, y=prevY, j;
    if(lastHead<0){ lastHead=head-1; prevY=trace(head-1); }
    if(head-lastHead>W) lastHead=head-W;
    ctx.fillStyle='rgba(10,12,19,0.018)'; ctx.fillRect(0,0,W,H); /* fading tail */
    for(px=lastHead+1;px<=head;px++){
      x=px%W;
      ctx.fillStyle='#0a0c13';
      for(j=3;j<14;j++) ctx.fillRect((x+j)%W,0,1,H); /* wipe ahead of head */
      y=trace(px);
      plot(x,prevY,y,'#23c4b4');
      prevY=y;
    }
    ctx.fillStyle='#b8fff4'; ctx.fillRect((head%W)-1,Math.floor(y)-1,4,4);
    lastHead=head;
  }
  function drawStatic(){
    var px,y,p0=trace(0);
    ctx.fillStyle='#0a0c13'; ctx.fillRect(0,0,W,H);
    for(px=0;px<W;px++){ y=trace(px); plot(px,p0,y,'#23c4b4'); p0=y; }
  }
  return {draw:draw, drawStatic:drawStatic};
}

/* 24×24 role portrait for the Assemble Your Board cards.
   spec = {uniform, hair, accessory} from PREGAME.roles[n].portrait. */
function drawPregamePortrait(canvas,spec){
  var c=canvas.getContext('2d');
  var OUT='#0a0d16', SKIN='#e8b48c';
  function P(col,x,y,w,h){ c.fillStyle=col; c.fillRect(x,y,w,h); }
  P('#0d1120',0,0,24,24);
  P(OUT,3,14,18,10); P(spec.uniform,4,15,16,9);   /* shoulders/torso */
  P(OUT,7,2,10,12); P(SKIN,8,3,8,10);             /* head */
  P(spec.hair,8,3,8,3);                           /* hair band */
  P('#141821',10,8,2,2); P('#141821',14,8,2,2);   /* eyes */
  P(SKIN,10,13,4,2);                              /* neck */
  switch(spec.accessory){
    case 'tie':
      P('#e8ecf5',10,15,4,3);
      P('#c9963a',10,15,4,2); P('#e9b44c',11,17,2,7);
      break;
    case 'glasses':
      P('#111624',9,7,4,4); P('#111624',13,7,4,4);
      P('#8fd6e8',10,8,2,2); P('#8fd6e8',14,8,2,2);
      break;
    case 'watch':
      P('#f4f6f8',10,15,4,2);
      P('#f4f6f8',7,17,4,4); P('#20242f',8,18,2,2);
      break;
    case 'lanyard':
      P('#23c4b4',9,15,1,4); P('#23c4b4',14,15,1,4);
      P(OUT,9,18,6,6); P('#e8ecf5',10,19,4,4); P('#3b6ea5',11,20,2,2);
      break;
    case 'stethoscope':
      P('#8aa8d8',11,15,2,9);
      P('#17a9a3',9,14,2,5); P('#17a9a3',13,14,2,3);
      P('#17a9a3',8,20,3,3); P('#0a4a44',9,21,1,1);
      break;
    case 'clipboard':
      P(OUT,15,14,7,9); P('#c9a06a',16,15,5,7);
      P('#e8ecf5',17,16,3,5); P('#8b94ab',17,15,3,1);
      break;
  }
}
