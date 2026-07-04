'use strict';
/* ---------- telemetry blip ---------- */
var ek=$('ekg'), ekc=ek.getContext('2d'), ekBuf=[];
function ekgVal(t){
  var u=t%1.25;
  if(u<0.5) return 30+Math.sin(t*8)*1.5;
  if(u<0.56) return 35;
  if(u<0.62) return 9;
  if(u<0.68) return 40;
  if(u<0.8) return 28;
  return 30;
}
function drawEkg(t){
  ekBuf.push(ekgVal(t)); if(ekBuf.length>220) ekBuf.shift();
  ekc.fillStyle='#0a0c13'; ekc.fillRect(0,0,220,46);
  ekc.fillStyle='rgba(35,196,180,0.08)';
  for(var gx=0;gx<220;gx+=20) ekc.fillRect(gx,0,1,46);
  ekc.strokeStyle='#3fe08c'; ekc.lineWidth=2; ekc.beginPath();
  for(var i=0;i<ekBuf.length;i++){ i?ekc.lineTo(i,ekBuf[i]):ekc.moveTo(i,ekBuf[i]); }
  ekc.stroke();
}
