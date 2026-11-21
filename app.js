'use strict';
const config = window.FEEDBACK_CONFIG;
const DEFAULT_DEVICE = 'Windows 11 Home/ Versión 155.0.8059.39 (Build oficial) (64 bits)';
const $ = id => document.getElementById(id);
let image = null, widget = null, pending = null, attempt = null;
const message = text => { $('message').textContent = text; };
function showPanel(name) { for(const key of ['report','status','review']) { $(key+'Panel').hidden=key!==name; $(key==='report'?'newTab':key+'Tab').setAttribute('aria-pressed',key===name); } message(''); }
function tab(status) { showPanel(status?'status':'report'); }
$('newTab').onclick=()=>tab(false); $('statusTab').onclick=()=>tab(true);
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
  const input=document.createElement('input');input.name='payload';input.value=JSON.stringify({...payload,reviewPassword,nonce,origin:location.origin});form.append(input);document.body.append(form);form.submit();form.remove();
 });
}
window.addEventListener('message',e=>{
 if(!pending||!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(e.origin)||e.data?.channel!=='feedback-v1'||e.data.nonce!==pending.nonce)return;
 const p=pending;pending=null;clearTimeout(p.timer);e.data.ok?p.resolve(e.data):p.reject(new Error(e.data.error||'No se pudo completar la solicitud.'));
});
$('reportForm').onsubmit=async e=>{
 e.preventDefault();const button=$('submitButton');button.disabled=true;message('Enviando reporte…');
 try{
  const fields=Object.fromEntries(new FormData(e.target));fields.device=fields.device.trim()||DEFAULT_DEVICE;const token=window.turnstile?.getResponse(widget);
  if(config.turnstileSiteKey&&!token)throw new Error('Completa la verificación antes de enviar.');
  const fingerprint=JSON.stringify({...fields,image});
  if(!attempt||attempt.fingerprint!==fingerprint)attempt={fingerprint,requestId:crypto.randomUUID(),lookupToken:crypto.randomUUID()+crypto.randomUUID()};
  const result=await request({action:'submit',...fields,image,requestId:attempt.requestId,lookupToken:attempt.lookupToken,turnstileToken:token});
  message(`Reporte recibido: ${result.reportId}\nCódigo privado: ${attempt.lookupToken}\nGuarda estos datos para consultar el estado. El código no se puede recuperar.`);
  $('statusForm').elements.reportId.value=result.reportId;$('statusForm').elements.lookupToken.value=attempt.lookupToken;
  e.target.reset();$('section').onchange();$('device').value=DEFAULT_DEVICE;clearImage();attempt=null;
 }catch(error){message(error.message);}finally{button.disabled=false;if(widget!==null)window.turnstile?.reset(widget);}
};
$('statusForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;message('Consultando…');try{const r=await request({action:'status',...Object.fromEntries(new FormData(e.target))});message(`Referencia: ${r.reportId}\nEstado: ${r.status}\nActualizado: ${new Date(r.updatedAt).toLocaleString('es-ES')}`);}catch(error){message(error.message);}finally{b.disabled=false;}};
if(config.turnstileSiteKey){window.feedbackChallengeReady=()=>{widget=turnstile.render('#challenge',{sitekey:config.turnstileSiteKey,action:'feedback',language:'es'});};const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=feedbackChallengeReady&render=explicit';script.async=true;script.onerror=()=>message('No se pudo cargar la verificación. Recarga la página.');document.head.append(script);}else if(!config.endpoint) message('Vista previa: falta conectar el servicio de reportes.');

let reviewPassword='', nextOffset=null;
$('reviewTab').onclick=async()=>{showPanel('review');try{await loadReports(0);}catch(error){message(error.message);}};
function textElement(tag,text,className){const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;}
function renderReport(report){
 const details=document.createElement('details');details.className='reportCard';
 const summary=document.createElement('summary');summary.append(textElement('strong',`${report.section} · ${report.status}`),textElement('span',`${({error:'Error',change:'Mejora',query:'Consulta'})[report.type]||report.type} · Impacto ${({high:'alto',medium:'medio',low:'bajo'})[report.impact]||report.impact} · ${new Date(report.createdAt).toLocaleString('es-ES')}`,'muted'));
 details.append(summary);
 for(const [title,value] of [['Referencia',report.id],['Paso a paso',report.steps],['Resultado esperado',report.expected],['Resultado real',report.actual],['Dispositivo y navegador',report.device]])details.append(textElement('h3',title),textElement('p',value||'—','noteText'));
 if(report.hasScreenshot){const b=textElement('button','Ver captura');b.type='button';b.onclick=async()=>{b.disabled=true;message('Cargando captura…');try{const r=await request({action:'screenshot',reviewPassword,reportId:report.id});if(!['image/png','image/jpeg','image/webp'].includes(r.mime)||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.data))throw new Error('Captura no válida.');const img=document.createElement('img');img.src=`data:${r.mime};base64,${r.data}`;img.alt='Captura del reporte '+report.id;img.className='reviewScreenshot';details.append(img);b.remove();message('');}catch(e){message(e.message);b.disabled=false;}};details.append(b);}
 const changes=document.createElement('form');changes.className='programmerNotes';
 const reviewed=document.createElement('input');reviewed.type='checkbox';reviewed.checked=report.reviewed;
 const fixed=document.createElement('input');fixed.type='checkbox';fixed.checked=report.status==='Resuelto';
 const reviewedLabel=textElement('label','Revisado');reviewedLabel.prepend(reviewed);
 const fixedLabel=textElement('label','Solucionado');fixedLabel.prepend(fixed);
 const noteLabel=textElement('label','Añadir una nota del programador');const note=document.createElement('textarea');note.maxLength=2000;note.placeholder='Qué se ha revisado o solucionado…';noteLabel.append(note);
 const save=textElement('button','Guardar seguimiento','primary');save.type='submit';changes.append(reviewedLabel,fixedLabel,noteLabel,save);
 const history=document.createElement('div');history.className='noteHistory';
 function showNotes(notes){history.replaceChildren();for(const n of notes){history.append(textElement('p',new Date(n.createdAt).toLocaleString('es-ES')+' · '+n.text,'noteText'));}}
 showNotes(report.notes||[]);details.append(textElement('h3','Notas del programador'),history,changes);
 let updateAttempt=null;
 changes.onsubmit=async e=>{e.preventDefault();save.disabled=true;const change={reviewed:reviewed.checked,fixed:fixed.checked,note:note.value};const fingerprint=JSON.stringify(change);if(!updateAttempt||updateAttempt.fingerprint!==fingerprint)updateAttempt={fingerprint,requestId:crypto.randomUUID()};try{const result=await request({action:'followup',reportId:report.id,...change,requestId:updateAttempt.requestId});showNotes(result.notes);summary.querySelector('strong').textContent=report.section+' · '+result.status;note.value='';updateAttempt=null;message('Seguimiento guardado. El reporte original no se ha modificado.');}catch(error){message(error.message);}finally{save.disabled=false;}};
 $('reportList').append(details);
}
async function loadReports(offset){
 const r=await request({action:'review',reviewPassword,offset});
 if(offset===0)$('reportList').replaceChildren();
 r.reports.forEach(renderReport);nextOffset=r.nextOffset;$('moreReports').hidden=nextOffset===null;$('reportCount').textContent=`${r.total} reportes · más recientes primero`;
 $('accessPanel').hidden=true;$('appNav').hidden=false;$('reviewContent').hidden=false;message(r.total?'':'Todavía no hay reportes.');
}
$('reviewLogin').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;reviewPassword=e.target.elements.reviewPassword.value;message('Abriendo notas…');try{await loadReports(0);showPanel('report');e.target.reset();}catch(error){reviewPassword='';message(error.message);}finally{b.disabled=false;}};
$('moreReports').onclick=async()=>{const b=$('moreReports');b.disabled=true;try{await loadReports(nextOffset);}catch(error){message(error.message);}finally{b.disabled=false;}};
$('reviewLogout').onclick=()=>{reviewPassword='';nextOffset=null;$('reportList').replaceChildren();$('reviewLogin').reset();$('accessPanel').hidden=false;$('appNav').hidden=true;for(const key of ['report','status','review'])$(key+'Panel').hidden=true;$('reviewContent').hidden=true;message('Sesión cerrada.');};
