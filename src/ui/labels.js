'use strict';
/* ---------- labels ---------- */
var labelsDiv=$('labels');
LABELS.forEach(function(l){
  var s=document.createElement('span');
  s.textContent=l[0];
  s.style.left=(l[1]/COLS*100)+'%';
  s.style.top=(l[2]/ROWS*100)+'%';
  labelsDiv.appendChild(s);
});
