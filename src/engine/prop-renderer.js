'use strict';
/* ---------- placeholder pixel props ---------- */
function drawProp(c,type,x,y){
  function P(col,a,b,w,h){ c.fillStyle=col; c.fillRect(x+a,y+b,w,h); }
  switch(type){
    case 'bed': case 'bedocc':
      P('#4a5266',3,1,26,60); P('#7c8494',4,2,24,58);
      P('#5d6578',4,2,24,8);
      P('#f2f4f7',7,11,18,10);
      P('#3f6fb5',4,24,24,34); P('#6f97d0',4,30,24,3);
      if(type==='bedocc'){ P('#e8b48c',11,10,10,9); P('#5a4632',11,10,10,3); }
      break;
    case 'cot':
      P('#c6ccd8',4,5,24,22); P('#f5f7fa',6,7,20,18); P('#e8a7bd',6,16,20,9); P('#ffffff',8,9,8,5);
      break;
    case 'chair':
      P('#2f3a52',8,24,4,5); P('#2f3a52',20,24,4,5);
      P('#3f66a0',7,4,18,8); P('#4f7fc0',7,11,18,14); P('#6a9ad6',7,11,18,3);
      break;
    case 'desk':
      for(var i=0;i<3;i++){ var o=i*32;
        P('#e2e6ec',o,6,32,12); P('#f4f6f9',o,6,32,3);
        P('#33415e',o,18,32,12); P('#16a3a3',o,24,32,3);
      }
      P('#20242f',41,-3,14,11); P('#3fd1c4',43,-1,10,7); P('#20242f',46,8,4,3);
      P('#ffffff',8,8,10,6); P('#c9505a',70,7,6,8);
      break;
    case 'odesk':
      P('#8f6a3a',2,8,60,20); P('#b58a4f',2,8,60,14);
      P('#ffffff',8,11,11,8); P('#20242f',40,10,10,8); P('#3fd1c4',42,12,6,4);
      break;
    case 'mri':
      P('#c9cfda',4,8,56,44); P('#eef1f5',4,6,56,42);
      c.fillStyle='#2e3650'; c.beginPath(); c.arc(x+32,y+27,20,0,7); c.fill();
      c.fillStyle='#10131c'; c.beginPath(); c.arc(x+32,y+27,11,0,7); c.fill();
      P('#c6ccd8',22,48,20,14); P('#9aa2b2',22,48,20,3);
      break;
    case 'surg':
      P('#ffd76a',18,0,14,9); P('#b3894a',24,9,3,4);
      P('#828a9a',9,50,14,6);
      P('#9aa2b2',6,7,20,46); P('#cfd6df',7,8,18,44); P('#f2f4f7',9,10,14,8);
      break;
    case 'boiler':
      P('#6d7788',14,-8,8,12); P('#6d7788',42,-8,8,12);
      P('#4a6552',7,7,50,46); P('#5f7f68',8,6,48,44);
      P('#4a6552',8,16,48,4); P('#4a6552',8,32,48,4);
      c.fillStyle='#f4f6f8'; c.beginPath(); c.arc(x+32,y+24,7,0,7); c.fill();
      P('#d64545',31,19,2,6);
      P('#d9b23a',8,44,48,6); P('#20242f',14,44,6,6); P('#20242f',30,44,6,6); P('#20242f',46,44,6,6);
      break;
    case 'crate':
      P('#8a6236',4,6,24,22); P('#a97c46',6,8,20,18);
      P('#8a6236',6,8,20,3); P('#8a6236',6,23,20,3); P('#8a6236',14,8,4,18);
      break;
    case 'table':
      P('#8f6a3a',3,8,26,20); P('#c89a5e',4,9,24,15); P('#dcb479',4,9,24,4);
      break;
    case 'vending':
      P('#8a3535',4,2,24,29); P('#c94f4f',5,3,22,27);
      P('#9fd3e8',8,6,12,15); P('#e9b44c',9,8,4,3); P('#5fbf72',14,8,4,3);
      P('#e05252',9,13,4,3); P('#f4f6f8',14,13,4,3); P('#20242f',8,24,12,4);
      break;
    case 'plant':
      P('#7a4328',10,21,12,9); P('#a5603c',10,21,12,4);
      c.fillStyle='#3d7c44'; c.beginPath(); c.arc(x+16,y+13,9,0,7); c.fill();
      c.fillStyle='#4e9a55'; c.beginPath(); c.arc(x+12,y+11,6,0,7); c.fill();
      c.fillStyle='#66b06c'; c.beginPath(); c.arc(x+19,y+9,5,0,7); c.fill();
      break;
    case 'cabinet':
      P('#c6ccd8',3,5,26,22); P('#f0f3f6',4,6,24,20);
      P('#d64545',13,9,6,14); P('#d64545',9,13,14,6);
      break;
  }
}
