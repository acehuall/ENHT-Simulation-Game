'use strict';
/* =========================================================
   NORTHBROOK GENERAL — 30x17 tile map
   # wall · . corridor · E entrance doors
   floors by zone: v/w ward · m maternity · a/b store
   u utilities · s staff · c canteen · o office
   t waiting · i imaging · g surgery
   (a door = a zone letter sitting in a wall row)
========================================================= */
var MAP = [
"##############################",
"#aaaa#wwww#mmmm#uu#bb#sss#ccc#",
"#aaaa#wwww#mmmm#uu#bb#sss#ccc#",
"#aaaa#wwww#mmmm#uu#bb#sss#ccc#",
"#aaaa#wwww#mmmm#uu#bb#sss#ccc#",
"#aaaa#wwww#mmmm#uu#bb#sss#ccc#",
"##a#####w###m###u##b###s###c##",
"#............................#",
"#............................#",
"##v#v##v##o##....##t###i###g##",
"#vv#vv#vv#oo#....#ttt#iii#ggg#",
"#vv#vv#vv#oo#....#ttt#iii#ggg#",
"#vv#vv#vv####....#ttt#iii#ggg#",
"#vv#vv#vv#vvv....#ttt#iii#ggg#",
"#vv#vv#vv#vv#....#ttt#iii#ggg#",
"#vv#vv#vv#vv#....#ttt#iii#ggg#",
"##############EE##############"
];
var TILE=32, COLS=30, ROWS=17, QLEN=45, SIM_MONTHS=3;

function simMonthLength(){ return QLEN/SIM_MONTHS; }
function simMonthNumber(sec){
  return Math.min(SIM_MONTHS, Math.floor(Math.min(sec,QLEN-0.001)/simMonthLength())+1);
}
function simMonthLabel(sec){ return 'Month '+simMonthNumber(sec); }

var FLOORS = {
  '.':['#b9c0c9','#b0b7c1'], 'E':['#b9c0c9','#b0b7c1'],
  'v':['#b7d4bd','#adcab3'], 'w':['#b7d4bd','#adcab3'],
  'm':['#dcc6d2','#d2bcc8'],
  'a':['#c9b691','#bfac87'], 'b':['#c9b691','#bfac87'],
  'u':['#a8a49c','#9e9a92'],
  's':['#d9c8a4','#cfbe9a'], 'c':['#e0d6b8','#d6ccae'],
  'o':['#c3cade','#b9c0d4'], 't':['#c7d6e4','#bdccda'],
  'i':['#a9ccd4','#9fc2ca'], 'g':['#bfe0d2','#b5d6c8']
};
var WALL={cap:'#262b3d', face:'#454f76', hi:'#5a6591', seam:'#161a28'};

/* props: [type, tileX, tileY] — bed/surg 1x2 tall, mri/boiler 2x2, desk 3 wide, odesk 2 wide */
var PROPS=[
 ['crate',1,1],['crate',2,1],['crate',4,2],
 ['bed',6,1],['bed',8,1],
 ['bed',11,1],['bed',13,1],['cot',14,1],['plant',9,4],['plant',11,4],
 ['boiler',16,1],
 ['crate',19,1],['crate',20,1],['crate',20,2],
 ['vending',22,1],['table',23,3],
 ['table',27,2],['table',27,4],
 ['plant',1,7],['plant',28,7],
 ['desk',13,8],
 ['odesk',10,11],
 ['bed',1,14],['bed',2,14],['bed',4,14],['bed',5,14],
 ['bedocc',7,14],['bed',8,14],
 ['bed',10,14],['bed',11,14],
 ['plant',18,10],
 ['chair',18,11],['chair',18,12],['chair',18,13],['chair',18,14],
 ['chair',20,11],['chair',20,12],['chair',20,13],['chair',20,14],
 ['cabinet',24,10],['mri',22,11],['bed',24,14],
 ['cabinet',26,10],['surg',27,12],['bed',28,14]
];

var LABELS=[
 ['STORE',3,3.2],['WARD 1',8,3.2],['MATERNITY',13,3.2],['UTILITIES',17,4.1],
 ['STORE',20,3.2],['STAFF ROOM',23.5,4.4],['CANTEEN',27.5,3.2],
 ['RECEPTION',14.5,8.05],
 ['WARD 2',2,11.4],['WARD 3',5,11.4],['WARD 4',8,11.4],
 ['OFFICE',11,10.35],['WARD 5',11.4,13.35],
 ['WAITING ROOM',19.5,12.5],['IMAGING',23.5,10.45],['SURGERY',27.5,11.15],
 ['ENTRANCE',15,15.15]
];
