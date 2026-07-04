'use strict';
/* ---------- agents on waypoint loops (deterministic: position = f(time)) ---------- */
var SPEED=2.2;
function buildLoop(pts,pauses,speed,oneWay){
  var order=[], k;
  for(k=0;k<pts.length;k++) order.push(k);
  if(!oneWay) for(k=pts.length-2;k>=0;k--) order.push(k);
  var ev=[], t=0;
  if(pauses[0]){ ev.push({kind:'pause',t0:t,t1:t+pauses[0],at:pts[0],idx:0}); t+=pauses[0]; }
  for(k=1;k<order.length;k++){
    var i=order[k-1], j=order[k];
    var d=Math.abs(pts[i][0]-pts[j][0])+Math.abs(pts[i][1]-pts[j][1]);
    ev.push({kind:'move',t0:t,t1:t+d/speed,from:pts[i],to:pts[j]}); t+=d/speed;
    if(pauses[j]&&k<order.length-1){ ev.push({kind:'pause',t0:t,t1:t+pauses[j],at:pts[j],idx:j}); t+=pauses[j]; }
  }
  return {ev:ev,cycle:t,end:pts[order[order.length-1]]};
}
function samplePath(L,time,oneWay){
  var t=oneWay?Math.min(time,L.cycle-0.001):(((time%L.cycle)+L.cycle)%L.cycle);
  for(var n=0;n<L.ev.length;n++){
    var e=L.ev[n];
    if(t>=e.t0&&t<e.t1){
      if(e.kind==='pause') return {x:e.at[0],y:e.at[1],dx:0,dy:1,moving:false,idx:e.idx,eventIndex:n,cycleTime:t};
      var p=(t-e.t0)/(e.t1-e.t0);
      return {x:e.from[0]+(e.to[0]-e.from[0])*p, y:e.from[1]+(e.to[1]-e.from[1])*p,
              dx:Math.sign(e.to[0]-e.from[0]), dy:Math.sign(e.to[1]-e.from[1]), moving:true, idx:-1,eventIndex:n,cycleTime:t};
    }
  }
  return {x:L.end[0],y:L.end[1],dx:0,dy:1,moving:false,idx:-1,eventIndex:L.ev.length-1,cycleTime:t};
}
