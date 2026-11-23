(function(root){
 const impacts=[{key:'high',label:'Alta'},{key:'medium',label:'Media'},{key:'low',label:'Baja'}];
 function state(report){return report.status==='Resuelto'?{rank:2,key:'fixed',label:'Revisado y solucionado'}:report.reviewed?{rank:1,key:'reviewed',label:'Revisado · pendiente de solución'}:{rank:0,key:'pending',label:'Pendiente de revisión y solución'};}
 function group(report){return report.status==='Resuelto'?'fixed':impacts.some(i=>i.key===report.impact)?report.impact:'medium';}
 const groups=[...impacts,{key:'fixed',label:'Solucionados'}];
 function compare(a,b){const fixed=a.status==='Resuelto'&&b.status==='Resuelto';const date=r=>Date.parse(fixed?(r.updatedAt||r.createdAt):r.createdAt)||0;return state(a).rank-state(b).rank||date(b)-date(a)||String(a.id).localeCompare(String(b.id));}
 function excerpt(report){const text=[report.title,report.actual,report.steps,report.expected].map(value=>String(value||'').replace(/\s+/g,' ').trim()).find(Boolean)||'Sin resumen disponible';return text.length>160?text.slice(0,157).replace(/\s+\S*$/,'').trimEnd()+'…':text;}
 const api={impacts,groups,group,state,compare,excerpt};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.REVIEW_LAYOUT=api;
})(typeof window!=='undefined'?window:globalThis);
