(function(root){
 const impacts=[{key:'high',label:'Alta'},{key:'medium',label:'Media'},{key:'low',label:'Baja'}];
 function state(report){return report.status==='Resuelto'?{rank:2,key:'fixed',label:'Revisado y solucionado'}:report.reviewed?{rank:1,key:'reviewed',label:'Revisado · pendiente de solución'}:{rank:0,key:'pending',label:'Pendiente de revisión y solución'};}
 function compare(a,b){return state(a).rank-state(b).rank||(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||String(a.id).localeCompare(String(b.id));}
 const api={impacts,state,compare};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.REVIEW_LAYOUT=api;
})(typeof window!=='undefined'?window:globalThis);
