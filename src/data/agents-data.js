'use strict';
var AGENTS=[
 {role:'porter',   L:buildLoop([[2,8],[12,8],[12,7],[27,7]], {0:2.2,3:2.2}, SPEED)},
 {role:'nurse',    L:buildLoop([[23,4],[23,7],[7,7],[7,13]], {0:2.6,3:3.2}, SPEED), heartIdx:3, heartAt:[7,14]},
 {role:'doctor',   L:buildLoop([[23,10],[23,7],[8,7],[8,4]], {0:2.4,3:2.6}, SPEED)},
 {role:'patient',  L:buildLoop([[14,15],[14,9],[16,9],[16,8],[19,8],[19,12],[19,8],[7,8],[7,13]], {0:2.0,1:1.6,5:4.0,8:4.0}, SPEED), treatmentIdx:8},
 {role:'agency',   L:buildLoop([[14,15],[14,9],[16,9],[16,7],[23,7],[23,4]], {}, 2.4, true), startAt:18, oneWay:true},
 {role:'reception',fixed:[14,7]},
 {role:'sitter',   fixed:[20,12], seated:true}
];

var ROLE={
  porter:   {top:'#7a8a6d', leg:'#4c5844', hair:'#5a4632'},
  nurse:    {top:'#2f63c7', leg:'#274f9e', hair:'#2e2620'},
  doctor:   {top:'#f4f6f8', leg:'#6b7688', hair:'#6f6a63'},
  patient:  {top:'#bfe3d3', leg:'#9cc4b2', hair:'#3c332a'},
  agency:   {top:'#17a9a3', leg:'#0f7f7a', hair:'#20242f'},
  reception:{top:'#8a5fc0', leg:'#5f4287', hair:'#402f22'},
  sitter:   {top:'#d9c78f', leg:'#b3a273', hair:'#57432f'}
};
