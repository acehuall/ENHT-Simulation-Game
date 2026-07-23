'use strict';
function $(id){ return document.getElementById(id); }

function escapeHTML(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}
