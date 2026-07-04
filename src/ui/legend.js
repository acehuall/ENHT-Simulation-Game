'use strict';
(function buildLegend(){
  var zones=[['corridor','.'],['ward','v'],['maternity','m'],['store','a'],['utilities','u'],
             ['staff room','s'],['canteen','c'],['office','o'],['waiting','t'],['imaging','i'],['surgery','g']];
  var h='<b>Floor zones:</b> ';
  zones.forEach(function(z){ h+='<span class="sw" style="background:'+FLOORS[z[1]][0]+'"></span>'+z[0]+' ('+z[1]+') &nbsp; '; });
  h+='<br><b>#</b> wall &middot; <b>E</b> entrance (sliding doors) &middot; a door is a zone letter sitting in a wall row.';
  h+='<br><b>Props (placed on top of the tile layer):</b> bed 1&times;2 &middot; cot &middot; waiting chair &middot; reception counter 3w &middot; office desk 2w &middot; MRI 2&times;2 &middot; surgery table 1&times;2 &middot; boiler 2&times;2 &middot; vending &middot; canteen table &middot; crate &middot; plant &middot; med cabinet.';
  h+='<br><b>Scale:</b> 30&times;17 @ 32px = 960&times;544. &times;2 = 1920&times;1088, so fullscreen on a 1080p TV is a clean integer scale (8px vertical crop). In the sim screen it sits 1&times; beside the ticker column.';
  h+='<pre>'+MAP.join('\n')+'</pre>';
  $('legend').innerHTML=h;
})();
