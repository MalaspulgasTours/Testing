'use strict';
const config = window.FEEDBACK_CONFIG;
const DEFAULT_DEVICE = 'Windows 11 Home/ Versión 155.0.8059.39 (Build oficial) (64 bits)';
const $ = id => document.getElementById(id);
let image = null, widget = null, pending = null, attempt = null;
const message = text => { $('message').textContent = text; };
function showPanel(name) { for(const key of ['report','review']) { $(key+'Panel').hidden=key!==name; $(key==='report'?'newTab':key+'Tab').setAttribute('aria-pressed',key===name); } message(''); }
$('newTab').onclick=()=>showPanel('report');
$('section').onchange=()=>{const other=$('section').value==='Otra';$('otherLabel').hidden=!other;$('otherLabel').querySelector('input').required=other;};
$('device').value=DEFAULT_DEVICE;
function clearImage(){image=null;$('previewBox').hidden=true;$('preview').removeAttribute('src');$('screenshot').value='';}
$('removeImage').onclick=clearImage;
async function setImage(file){
 if(!file)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024){message('Elige una imagen PNG, JPG o WebP de hasta 3 MB.');return;}
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
 image={mime:file.type,data:data.split(',')[1]};$('preview').src=data;$('previewBox').hidden=false;message('');
}
$('screenshot').onchange=e=>setImage(e.target.files[0]).catch(()=>message('No se pudo leer la captura.'));
document.addEventListener('paste',e=>{if($('reportPanel').hidden)return;const item=[...e.clipboardData.items].find(x=>x.kind==='file'&&x.type.startsWith('image/'));if(item){e.preventDefault();setImage(item.getAsFile()).catch(()=>message('No se pudo leer la captura.'));}});
function request(payload){
 if(pending) return Promise.reject(new Error('Espera a que termine el envío.'));
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.endpoint))return Promise.reject(new Error('Falta configurar la conexión con Google Apps Script.'));
 return new Promise((resolve,reject)=>{
  const nonce=crypto.randomUUID();const timer=setTimeout(()=>{pending=null;reject(new Error('No se pudo confirmar la respuesta. Conservamos el formulario; reintenta para recuperar el mismo reporte.'));},60000);
  pending={nonce,resolve,reject,timer};
  const form=document.createElement('form');form.method='POST';form.action=config.endpoint;form.target='transport';form.hidden=true;
  const input=document.createElement('input');input.name='payload';input.value=JSON.stringify({...payload,reviewPassword,sessionToken,nonce,origin:location.origin});form.append(input);document.body.append(form);form.submit();form.remove();
 });
}
window.addEventListener('message',e=>{
 if(!pending||!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(e.origin)||e.data?.channel!=='feedback-v1'||e.data.nonce!==pending.nonce)return;
 const p=pending;pending=null;clearTimeout(p.timer);if(!e.data.ok&&e.data.authRequired){forgetAccess();lockAccess();}e.data.ok?p.resolve(e.data):p.reject(new Error(e.data.error||'No se pudo completar la solicitud.'));
});
$('reportForm').onsubmit=async e=>{
 e.preventDefault();const button=$('submitButton');button.disabled=true;message('Enviando reporte…');
 try{
  const fields=Object.fromEntries(new FormData(e.target));fields.device=fields.device.trim()||DEFAULT_DEVICE;const token=window.turnstile?.getResponse(widget);
  if(config.turnstileSiteKey&&!token)throw new Error('Completa la verificación antes de enviar.');
  const fingerprint=JSON.stringify({...fields,image});
  if(!attempt||attempt.fingerprint!==fingerprint)attempt={fingerprint,requestId:crypto.randomUUID(),lookupToken:crypto.randomUUID()+crypto.randomUUID()};
  const result=await request({action:'submit',...fields,image,requestId:attempt.requestId,lookupToken:attempt.lookupToken,turnstileToken:token});
  message(`Reporte recibido: ${result.reportId}\nPuedes seguir su estado en «Revisión del equipo».`);
  e.target.reset();$('section').onchange();$('device').value=DEFAULT_DEVICE;clearImage();attempt=null;
 }catch(error){message(error.message);}finally{button.disabled=false;if(widget!==null)window.turnstile?.reset(widget);}
};
if(config.turnstileSiteKey){window.feedbackChallengeReady=()=>{widget=turnstile.render('#challenge',{sitekey:config.turnstileSiteKey,action:'feedback',language:'es'});};const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=feedbackChallengeReady&render=explicit';script.async=true;script.onerror=()=>message('No se pudo cargar la verificación. Recarga la página.');document.head.append(script);}else if(!config.endpoint) message('Vista previa: falta conectar el servicio de reportes.');

let reviewPassword='', sessionToken='', nextOffset=null, accessRole='team', viewingDeleted=false;
const ACCESS_KEY='feedback-access-v1';
function forgetAccess(){for(const storage of [localStorage,sessionStorage]){try{storage.removeItem(ACCESS_KEY);}catch(ignored){}}}
function storeAccess(result,remember){forgetAccess();const value=JSON.stringify({token:result.sessionToken,expiresAt:result.expiresAt});try{(remember?localStorage:sessionStorage).setItem(ACCESS_KEY,value);}catch(ignored){message('El navegador no permite guardar la sesión.');}}
function lockAccess(){viewingDeleted=false;accessRole='team';reviewPassword='';sessionToken='';nextOffset=null;reviewCards.clear();$('reportList').replaceChildren();$('reviewLogin').reset();$('accessPanel').hidden=false;$('appNav').hidden=true;for(const key of ['report','review'])$(key+'Panel').hidden=true;$('reviewContent').hidden=true;}
const reviewCards=new Map();
function resetReviewGroups(){reviewCards.clear();$('reportList').replaceChildren();if(viewingDeleted){$('reportList').append(textElement('h3','Reportes borrados'));return;}for(const impact of REVIEW_LAYOUT.groups){const group=document.createElement('div');group.className='impactGroup';group.id='impact-'+impact.key;const heading=textElement('h3',impact.label);const count=textElement('span','0 reportes','impactCount');heading.append(count);const cards=document.createElement('div');cards.className='impactCards';const empty=textElement('p',impact.key==='fixed'?'No hay reportes solucionados.':'No hay reportes pendientes con este impacto.','muted impactEmpty');group.append(heading,cards,empty);$('reportList').append(group);}}
function positionReviewCard(report,details){const state=REVIEW_LAYOUT.state(report);details.className='reportCard state-'+state.key;details.querySelector('.reviewState').textContent=state.label;const resolved=details.querySelector('.resolvedDate');resolved.hidden=report.status!=='Resuelto'||!report.resolvedAt;resolved.textContent=resolved.hidden?'':'Solucionado el '+new Date(report.resolvedAt).toLocaleString('es-ES');const group=$('impact-'+REVIEW_LAYOUT.group(report));const container=group.querySelector('.impactCards');const before=[...container.children].find(card=>card!==details&&REVIEW_LAYOUT.compare(report,reviewCards.get(card.dataset.reportId).report)<0);container.insertBefore(details,before||null);for(const impact of REVIEW_LAYOUT.groups){const g=$('impact-'+impact.key),count=g.querySelector('.impactCards').children.length;g.querySelector('.impactCount').textContent=count+' '+(count===1?'reporte':'reportes');g.querySelector('.impactEmpty').hidden=count>0;}}
$('reviewTab').onclick=async()=>{showPanel('review');try{await loadReports(0);}catch(error){message(error.message);}};
function textElement(tag,text,className){const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;}
function renderReport(report){
 if(reviewCards.has(report.id))return;if(viewingDeleted){const card=document.createElement('div');card.className='reportCard';card.append(textElement('strong',report.section+' · '+REVIEW_LAYOUT.excerpt(report)),textElement('p','Borrado el '+new Date(report.deletedAt).toLocaleString('es-ES'),'muted'));const restore=textElement('button','Recuperar reporte');restore.type='button';restore.onclick=()=>changeDeletion(report,false,restore);card.append(restore);$('reportList').append(card);reviewCards.set(report.id,{report,details:card});return;}
 const details=document.createElement('details');details.className='reportCard';details.dataset.reportId=report.id;
 const summary=document.createElement('summary');summary.append(textElement('strong',`${report.section} · ${report.status}`),textElement('span',REVIEW_LAYOUT.excerpt(report),'reportExcerpt'),textElement('span',`${({error:'Error',change:'Mejora',query:'Consulta'})[report.type]||report.type} · Impacto ${({high:'alto',medium:'medio',low:'bajo'})[report.impact]||report.impact} · ${new Date(report.createdAt).toLocaleString('es-ES')}`,'muted'));
 summary.querySelector('.reportExcerpt').title=REVIEW_LAYOUT.excerpt(report);
 summary.append(textElement('span','','reviewState'),textElement('span','','resolvedDate muted'));details.append(summary);
 const editReportButton=textElement('button','Editar reporte');editReportButton.type='button';editReportButton.onclick=()=>openReportEditor(report,details);editReportButton.hidden=accessRole!=='owner';details.append(editReportButton);if(accessRole==='owner'){const remove=textElement('button','Borrar reporte');remove.type='button';remove.onclick=()=>{if(window.confirm('¿Borrar este reporte? Desaparecerá del listado del equipo. Podrás recuperarlo en «Reportes borrados».'))return changeDeletion(report,true,remove);};details.append(remove);}
 const back=textElement('button','Volver al listado','reportBack');back.type='button';back.onclick=()=>{details.open=false;summary.focus({preventScroll:true});summary.scrollIntoView({behavior:'smooth',block:'center'});};details.append(back);
 const titleForm=document.createElement('form');titleForm.className='reportTitleForm';titleForm.hidden=true;
 const titleLabel=textElement('label','Título del reporte');const titleInput=document.createElement('input');titleInput.type='text';titleInput.maxLength=160;titleInput.placeholder='Resumen breve del reporte';titleLabel.append(titleInput);
 const saveTitle=textElement('button','Guardar título','primary');saveTitle.type='submit';const automaticTitle=textElement('button','Usar resumen automático');automaticTitle.type='button';const cancelTitle=textElement('button','Cancelar');cancelTitle.type='button';const titleActions=document.createElement('div');titleActions.className='titleActions';titleActions.append(saveTitle,automaticTitle,cancelTitle);titleForm.append(titleLabel,titleActions);details.append(titleForm);
 const editTitle=textElement('button','Editar título','editTitleButton');editTitle.type='button';editTitle.hidden=accessRole!=='owner';summary.append(editTitle);let wasOpen=false;
 editTitle.onclick=e=>{e.preventDefault();e.stopPropagation();wasOpen=details.open;details.open=true;titleForm.hidden=false;titleInput.value=report.title||REVIEW_LAYOUT.excerpt(report);titleInput.focus();titleInput.select();};
 cancelTitle.onclick=()=>{titleForm.hidden=true;details.open=wasOpen;};
 async function updateTitle(value){saveTitle.disabled=true;automaticTitle.disabled=true;cancelTitle.disabled=true;titleInput.disabled=true;try{const r=await request({action:'title',reportId:report.id,title:value,previousTitle:report.title||''});report.title=r.title;report.updatedAt=r.updatedAt;const preview=summary.querySelector('.reportExcerpt');preview.textContent=REVIEW_LAYOUT.excerpt(report);preview.title=preview.textContent;titleForm.hidden=true;details.open=wasOpen;message('Título guardado. Las notas originales no se han modificado.');}catch(error){message(error.message);}finally{saveTitle.disabled=false;automaticTitle.disabled=false;cancelTitle.disabled=false;titleInput.disabled=false;}}
 titleForm.onsubmit=e=>{e.preventDefault();return updateTitle(titleInput.value);};automaticTitle.onclick=()=>updateTitle('');
 for(const [title,value] of [['Referencia',report.id],['Paso a paso',report.steps],['Resultado esperado',report.expected],['Resultado real',report.actual],['Dispositivo y navegador',report.device]])details.append(textElement('h3',title),textElement('p',value||'—','noteText'));
 if(report.hasScreenshot){const b=textElement('button','Ver captura');b.type='button';b.onclick=async()=>{b.disabled=true;message('Cargando captura…');try{const r=await request({action:'screenshot',reviewPassword,reportId:report.id});if(!['image/png','image/jpeg','image/webp'].includes(r.mime)||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.data))throw new Error('Captura no válida.');const img=document.createElement('img');img.src=`data:${r.mime};base64,${r.data}`;img.alt='Captura del reporte '+report.id;img.className='reviewScreenshot';details.append(img);b.remove();message('');}catch(e){message(e.message);b.disabled=false;}};details.append(b);}
 const changes=document.createElement('form');changes.className='programmerNotes';
 const reviewed=document.createElement('input');reviewed.type='checkbox';reviewed.checked=report.reviewed||report.status==='Resuelto';
 const fixed=document.createElement('input');fixed.type='checkbox';fixed.checked=report.status==='Resuelto';
 const reviewedLabel=textElement('label','Revisado');reviewedLabel.prepend(reviewed);
 const fixedLabel=textElement('label','Solucionado');fixedLabel.prepend(fixed);
 const noteLabel=textElement('label',accessRole==='owner'?'Añadir un comentario de pruebas':'Añadir una nota del programador');const note=document.createElement('textarea');note.maxLength=2000;note.placeholder=accessRole==='owner'?'Explica qué sigue fallando o qué deben revisar de nuevo…':'Qué se ha revisado o solucionado…';noteLabel.append(note);noteLabel.append(textElement('span','Guardar un comentario o una captura devuelve el reporte a pendiente de revisión.','muted'));
 const save=textElement('button','Guardar seguimiento','primary');save.type='submit';changes.append(reviewedLabel,fixedLabel,noteLabel,save);
 const attachment=commentAttachment(changes,save);changes.insertBefore(attachment.box,save);
 const reopen=textElement('button','Solicitar nueva revisión');reopen.type='button';reopen.hidden=accessRole!=='owner';changes.append(reopen);reopen.onclick=()=>{if(save.disabled)return;if(attachment.reading){message('Espera a que termine de cargar la captura.');return;}if(!note.value.trim()){message('Añade un comentario explicando qué necesita otra revisión.');note.focus();return;}if(note.value.trim().length>1969){message('Acorta el comentario a 1969 caracteres para solicitar una nueva revisión.');return;}reviewed.checked=false;fixed.checked=false;return saveChanges(true,true);};
 const history=document.createElement('div');history.className='noteHistory';
 function showNotes(notes){history.replaceChildren();for(const n of notes){history.append(textElement('p',new Date(n.createdAt).toLocaleString('es-ES')+' · '+n.text,'noteText'));if(n.hasScreenshot){const view=textElement('button','Ver captura del comentario');view.type='button';view.onclick=async()=>{view.disabled=true;try{const r=await request({action:'screenshot',reportId:report.id,noteId:n.id});if(!['image/png','image/jpeg','image/webp'].includes(r.mime)||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.data))throw Error('Captura no válida.');const img=document.createElement('img');img.src='data:'+r.mime+';base64,'+r.data;img.alt='Captura del comentario';img.className='reviewScreenshot';view.replaceWith(img);}catch(error){message(error.message);view.disabled=false;}};history.append(view);}}}
 showNotes(report.notes||[]);details.append(textElement('h3','Comentarios y seguimiento'),history,changes);
 let updateAttempt=null;
 async function saveChanges(includeNote,reopening=false){
  if(save.disabled)return;if(includeNote&&attachment.reading){message('Espera a que termine de cargar la captura.');return;}
  save.disabled=true;reopen.disabled=true;reviewed.disabled=true;fixed.disabled=true;
  const change={reviewed:reviewed.checked,fixed:fixed.checked,note:includeNote?(reopening?'Solicitud de nueva revisión: '+note.value.trim():note.value):''};
  if(includeNote)change.image=attachment.image;
  const fingerprint=JSON.stringify(change);
  if(!updateAttempt||updateAttempt.fingerprint!==fingerprint)updateAttempt={fingerprint,requestId:crypto.randomUUID()};
  message('Guardando seguimiento…');
  try{
   const result=await request({action:'followup',reportId:report.id,...change,requestId:updateAttempt.requestId});
   showNotes(result.notes);report.updatedAt=result.updatedAt;report.resolvedAt=result.resolvedAt;report.status=result.status;report.reviewed=result.status==='Resuelto'||result.status==='En revisión';
   reviewed.checked=report.reviewed;fixed.checked=result.status==='Resuelto';
   summary.querySelector('strong').textContent=report.section+' · '+result.status;positionReviewCard(report,details);
   if(includeNote&&(reopening?'Solicitud de nueva revisión: '+note.value.trim():note.value)===change.note)note.value='';
   if(includeNote&&attachment.image===change.image)attachment.clear();
   updateAttempt=null;message(includeNote&&(change.note.trim()||change.image)?'Comentario guardado. El reporte vuelve a pendiente en rojo, en su impacto original.':reopening?'Nueva revisión solicitada: comentario guardado y reporte pendiente en rojo.':fixed.checked?'Reporte solucionado: aparece en verde en la sección «Solucionados», al final de la página.':'Seguimiento guardado. El reporte original no se ha modificado.');
  }catch(error){reviewed.checked=report.reviewed||report.status==='Resuelto';fixed.checked=report.status==='Resuelto';message(error.message);}
  finally{save.disabled=false;reopen.disabled=false;reviewed.disabled=false;fixed.disabled=false;}
 }
 fixed.onchange=()=>{if(fixed.checked)reviewed.checked=true;return saveChanges(false);};
 reviewed.onchange=()=>{if(!reviewed.checked)fixed.checked=false;return saveChanges(false);};
 changes.onsubmit=e=>{e.preventDefault();return saveChanges(true);};
 reviewCards.set(report.id,{report,details});positionReviewCard(report,details);
}
async function loadReports(offset){
 const sessionPassword=sessionToken||reviewPassword;
 let total=0;
 do {
  const r=await request({action:'review',reviewPassword,offset,deleted:viewingDeleted});
  if(!sessionPassword||(sessionToken||reviewPassword)!==sessionPassword)return;
  accessRole=r.role==='owner'?'owner':'team';$('trashToggle').hidden=accessRole!=='owner';$('trashToggle').textContent=viewingDeleted?'Volver a reportes activos':'Reportes borrados';$('accessRole').textContent=accessRole==='owner'?'Sesión de propietaria · puedes editar':'Sesión del equipo';if(offset===0)resetReviewGroups();
  r.reports.forEach(renderReport);total=r.total;nextOffset=r.nextOffset;
  $('moreReports').hidden=nextOffset===null;$('reportCount').textContent=viewingDeleted?`${reviewCards.size} de ${total} reportes borrados`:`${reviewCards.size} de ${total} reportes · pendientes por impacto y solucionados al final`;
  $('accessPanel').hidden=true;$('appNav').hidden=false;$('reviewContent').hidden=false;
  if(nextOffset!==null){message('Cargando el resto de los reportes…');offset=nextOffset;}
 } while(nextOffset!==null);
 message(total?'':'Todavía no hay reportes.');
}
$('reviewLogin').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;sessionToken='';reviewPassword=e.target.elements.reviewPassword.value;const remember=$('rememberAccess').checked;message('Entrando…');try{const result=await request({action:'login'});sessionToken=result.sessionToken;reviewPassword='';storeAccess(result,remember);e.target.reset();await loadReports(0);showPanel('report');}catch(error){reviewPassword='';message(error.message);}finally{b.disabled=false;}};
$('moreReports').onclick=async()=>{const b=$('moreReports');b.disabled=true;try{await loadReports(nextOffset);}catch(error){message(error.message);}finally{b.disabled=false;}};
$('reviewLogout').onclick=()=>{forgetAccess();lockAccess();message('Sesión cerrada y acceso guardado eliminado.');};
resetReviewGroups();

async function restoreAccess(){let saved=null;try{saved=JSON.parse(sessionStorage.getItem(ACCESS_KEY)||localStorage.getItem(ACCESS_KEY)||'null');}catch(ignored){}if(!saved)return;if(typeof saved.token!=='string'||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=Date.now()){forgetAccess();return;}sessionToken=saved.token;message('Restaurando tu sesión…');try{await loadReports(0);if(sessionToken)showPanel('report');}catch(error){message(error.message+' Puedes volver a entrar si es necesario.');}}
restoreAccess();

function openReportEditor(report,details){
 if(accessRole!=='owner')return;
 if(details.querySelector('.ownerReportEditor'))return;
 const form=document.createElement('form');form.className='ownerReportEditor';form.append(textElement('h3','Editar reporte · solo propietaria'));
 const fields={};
 function add(name,label,value,kind='input',options=null){const l=textElement('label',label),input=document.createElement(kind);input.name=name;if(options)for(const [v,t] of options){const option=document.createElement('option');option.value=v;option.textContent=t;input.append(option);}input.value=value||'';input.required=true;l.append(input);form.append(l);fields[name]=input;return input;}
 add('type','Tipo',report.type,'select',[['error','Error'],['change','Cambio / mejora'],['query','Consulta']]);
 add('section','Pantalla / sección',report.section).maxLength=100;
 add('steps','Qué estabas haciendo, paso a paso',report.steps,'textarea').maxLength=6000;
 add('expected','Qué esperabas que pasara',report.expected,'textarea').maxLength=4000;
 add('actual','Qué pasó en realidad',report.actual,'textarea').maxLength=4000;
 add('impact','Cuánto te afecta',report.impact,'select',[['high','Alto'],['medium','Medio'],['low','Bajo']]);
 add('device','Dispositivo y navegador',report.device||DEFAULT_DEVICE).maxLength=500;
 const imageLabel=textElement('label','Sustituir captura (opcional; si no eliges otra, se conserva la actual)');const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';imageLabel.append(file);form.append(imageLabel);
 const removeLabel=textElement('label','Quitar la captura actual');const remove=document.createElement('input');remove.type='checkbox';removeLabel.prepend(remove);form.append(removeLabel);
 let replacement=null;
 file.onchange=async()=>{replacement=null;const selected=file.files[0];if(!selected)return;if(!['image/png','image/jpeg','image/webp'].includes(selected.type)||selected.size>3*1024*1024){file.value='';message('Elige una captura PNG, JPG o WebP de hasta 3 MB.');return;}try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(selected);});replacement={mime:selected.type,data:data.split(',')[1]};remove.checked=false;}catch(error){file.value='';message('No se pudo leer la captura.');}};
 remove.onchange=()=>{if(remove.checked){replacement=null;file.value='';}};
 const save=textElement('button','Guardar cambios','primary');save.type='submit';const cancel=textElement('button','Cancelar edición');cancel.type='button';cancel.onclick=()=>form.remove();form.append(save,cancel);
 let attempt=null;
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;cancel.disabled=true;try{
 const data=Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()]));
 if(!['Tours','Liquidación','Guías'].includes(data.section)){data.otherSection=data.section;data.section='Otra';}
 const screenshotAction=replacement?'replace':remove.checked?'remove':'keep';const fingerprint=JSON.stringify([data,screenshotAction,replacement]);if(!attempt||attempt.fingerprint!==fingerprint)attempt={fingerprint,requestId:crypto.randomUUID()};
 await request({action:'edit',...data,reportId:report.id,editVersion:report.editVersion,screenshotAction,image:replacement,requestId:attempt.requestId,website:''});
 form.remove();await loadReports(0);message('Cambios guardados. El seguimiento y las notas del equipo se conservan.');
 }catch(error){message(error.message);}finally{save.disabled=false;cancel.disabled=false;}};
 details.open=true;details.insertBefore(form,details.querySelector('.programmerNotes'));form.scrollIntoView({behavior:'smooth',block:'start'});
}

function commentAttachment(form,save){
 const box=document.createElement('div');box.className='commentAttachment';
 const label=textElement('label','Captura para este comentario (opcional)');const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';label.append(file);
 const hint=textElement('p','Pega con Ctrl+V dentro del comentario o selecciona un archivo. PNG, JPG o WebP · hasta 3 MB.','muted');
 const preview=document.createElement('img');preview.alt='Captura adjunta al comentario';preview.className='reviewScreenshot';preview.hidden=true;
 const remove=textElement('button','Quitar captura del comentario');remove.type='button';remove.hidden=true;box.append(label,hint,preview,remove);
 let version=0;const state={box,image:null,reading:false,clear(){version++;state.image=null;state.reading=false;file.value='';preview.removeAttribute('src');preview.hidden=true;remove.hidden=true;}};
 async function select(selected){if(!selected)return;if(save.disabled){message('Espera a que termine el guardado.');return;}if(!['image/png','image/jpeg','image/webp'].includes(selected.type)||selected.size>3*1024*1024){message('Elige una imagen PNG, JPG o WebP de hasta 3 MB.');file.value='';return;}const current=++version;state.reading=true;try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(selected);});if(current!==version)return;state.image={mime:selected.type,data:data.split(',')[1]};preview.src=data;preview.hidden=false;remove.hidden=false;message('Captura preparada. Se adjuntará al guardar el comentario o solicitar nueva revisión.');}catch(error){if(current===version)message('No se pudo leer la captura.');}finally{if(current===version)state.reading=false;}}
 file.onchange=()=>select(file.files[0]);remove.onclick=()=>{if(!save.disabled)state.clear();};
 form.addEventListener('paste',event=>{const item=[...event.clipboardData.items].find(i=>i.kind==='file'&&i.type.startsWith('image/'));if(item){event.preventDefault();event.stopPropagation();select(item.getAsFile());}});
 return state;
}

async function changeDeletion(report,deleted,button){button.disabled=true;try{await request({action:'delete',reportId:report.id,deleted});await loadReports(0);message(deleted?'Reporte borrado. Puedes recuperarlo en «Reportes borrados».':'Reporte recuperado con sus comentarios y capturas.');}catch(error){message(error.message);}finally{button.disabled=false;}}
$('trashToggle').onclick=async()=>{if(accessRole!=='owner')return;viewingDeleted=!viewingDeleted;try{await loadReports(0);}catch(error){message(error.message);}};
