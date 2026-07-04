'use strict';
/* ---------- helpers ---------- */
var cv=document.getElementById('cv'), ctx=cv.getContext('2d');
function at(x,y){ return (x<0||y<0||x>=COLS||y>=ROWS)?'#':MAP[y].charAt(x); }
function isFloor(ch){ return ch!=='#'; }
function R(c,x,y,w,h){ ctx.fillStyle=c; ctx.fillRect(x|0,y|0,w|0,h|0); }
function hash(x,y){ var n=x*374761393+y*668265263; n=((n^(n>>13))*1274126177)|0; return (n^(n>>16))>>>0; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function ease(p){ return p<.5 ? 4*p*p*p : 1-Math.pow(-2*p+2,3)/2; }
