'use strict';
/* ---------- director timeline ---------- */
var TOASTS=[
  {t:8,  msg:'&#9888; 3 nurses off sick &mdash; norovirus'},
  {t:18, msg:'&#10010; Agency cover arrives'},
  {t:28, msg:'&#9888; Incident reported &mdash; Ward 4'}
];
var TICKS=[
  {s:0,  e:-1.8, money:true},
  {s:68, e:69},
  {s:63, e:65},
  {s:58, e:61},
  {s:66, e:68},
  {s:60, e:60}
];
function fmtMoney(v){ return (v<-0.05?'&#8722;':'')+'£'+Math.abs(v).toFixed(1)+'m'; }
