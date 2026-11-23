const HEADERS = ['ID','CreatedAt','Type','Section','Steps','Expected','Actual','Impact','Device','Screenshot','Status','UpdatedAt','TokenHash','RequestId','Reviewed','Title'];
const STATUSES = ['Nuevo','En revisión','En curso','Resuelto','Descartado'];
const MAX_IMAGE = 3 * 1024 * 1024;
function setup() {
 const p=PropertiesService.getScriptProperties();
 if(!p.getProperty('SPREADSHEET_ID')){
  const ss=SpreadsheetApp.create('Feedback del sistema');const sheet=ss.getSheets()[0];sheet.setName('Reports');sheet.appendRow(HEADERS);sheet.setFrozenRows(1);
  sheet.getRange('K2:K').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES,true).setAllowInvalid(false).build());
  p.setProperty('SPREADSHEET_ID',ss.getId());
 }
 if(!p.getProperty('FOLDER_ID'))p.setProperty('FOLDER_ID',DriveApp.createFolder('Feedback - capturas privadas').getId());
 const ss=SpreadsheetApp.openById(p.getProperty('SPREADSHEET_ID'));
 if(!ss.getSheetByName('Followup'))ss.insertSheet('Followup').appendRow(['ReportId','CreatedAt','Note','RequestId','Reviewed','Fixed']);
 if(!ss.getSheetByName('Notifications'))ss.insertSheet('Notifications').appendRow(['ReportId','CreatedAt','SentAt','Attempts','Error']);
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='deliverNotifications'))ScriptApp.newTrigger('deliverNotifications').timeBased().everyMinutes(5).create();
 const reports=ss.getSheetByName('Reports');if(reports.getLastColumn()<15)reports.getRange(1,15).setValue('Reviewed');reports.getRange('O2:O').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
 const data=reports.getDataRange().getValues();if(data.length>1)reports.getRange(2,15,data.length-1,1).setValues(data.slice(1).map(r=>[r[0]?r[14]===true:'']));
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='reportEdited'))ScriptApp.newTrigger('reportEdited').forSpreadsheet(ss).onEdit().create();
 console.log('Sheet: '+ss.getUrl());console.log('Drive: https://drive.google.com/drive/folders/'+p.getProperty('FOLDER_ID'));
}
function reportEdited(e){if(e.range.getSheet().getName()!=='Reports'||e.range.getLastColumn()<11||e.range.getColumn()>11)return;const first=Math.max(2,e.range.getRow());if(first<=e.range.getLastRow())e.range.getSheet().getRange(first,12,e.range.getLastRow()-first+1,1).setValue(new Date().toISOString());}
function doGet(){return HtmlService.createHtmlOutput('Servicio de reportes preparado. Utiliza la aplicación de pruebas.');}
function doPost(e){
 const props=PropertiesService.getScriptProperties();const origin=props.getProperty('ALLOWED_ORIGIN');let p={},response;
 try{
  if(!origin||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(origin))throw new Error('Servicio sin configurar.');
  if(!e||!e.parameter||typeof e.parameter.payload!=='string'||e.parameter.payload.length>4300000)throw new Error('Solicitud demasiado grande.');
  p=JSON.parse(e.parameter.payload);
  if(!p||typeof p!=='object'||Array.isArray(p)) {p={};fail('Solicitud no válida.');}
  if(p.origin!==origin||!validUuid(p.nonce))throw new Error('Solicitud no válida.');
  budget('requests',1000);
  requireReviewer(p,props);
  response=p.action==='login'?issueSession(p,props):p.action==='submit'?submitReport(p,props):p.action==='status'?lookup(p,props):p.action==='review'?reviewReports(p,props):p.action==='screenshot'?reviewScreenshot(p,props):p.action==='followup'?followup(p,props):p.action==='title'?setReportTitle(p,props):p.action==='edit'?editReport(p,props):fail('Acción no válida.');
 }catch(error){response={ok:false,authRequired:!!error.authRequired,error:error.publicMessage||'No se pudo procesar la solicitud. Comprueba los datos y la configuración.'};}
 response.channel='feedback-v1';response.nonce=validUuid(p.nonce)?p.nonce:'';
 const json=JSON.stringify(response).replace(/</g,'\\u003c');
 return HtmlService.createHtmlOutput('<!doctype html><script>window.top.postMessage('+json+','+JSON.stringify(origin||'https://invalid.invalid')+');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function fail(message){const e=new Error(message);e.publicMessage=message;throw e;}
function validUuid(s){return typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);}
function textField(p,key,max,optional){const s=p[key];if(typeof s!=='string'||s.length>max||(!optional&&!s.trim()))fail('Revisa el campo '+key+'.');return s.trim();}
function enumField(p,key,values){if(!values.includes(p[key]))fail('Valor no válido: '+key);return p[key];}
function validateReport(p){
 if(!validUuid(p.requestId)||typeof p.lookupToken!=='string'||!validUuid(p.lookupToken.slice(0,36))||!validUuid(p.lookupToken.slice(36)))fail('Referencia no válida.');
 if(p.website)fail('No se pudo validar el envío.');
 return {type:enumField(p,'type',['error','change','query']),section:enumField(p,'section',['Tours','Liquidación','Guías','Otra'])==='Otra'?textField(p,'otherSection',100):p.section,steps:textField(p,'steps',6000),expected:textField(p,'expected',4000),actual:textField(p,'actual',4000),impact:enumField(p,'impact',['high','medium','low']),device:textField(p,'device',500,true)};
}
function validateImage(image){
 if(!image)return null;
 if(!['image/png','image/jpeg','image/webp'].includes(image.mime)||typeof image.data!=='string'||image.data.length>4194304||!image.data.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(image.data))fail('Captura no válida.');
 let bytes;try{bytes=Utilities.base64Decode(image.data);}catch(e){fail('Captura no válida.');}
 if(bytes.length>MAX_IMAGE||bytes.length<12)fail('Captura no válida.');
 const b=bytes.map(x=>(x+256)%256);const ascii=(a,z)=>String.fromCharCode.apply(null,b.slice(a,z));
 const valid=image.mime==='image/png'?b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':image.mime==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
 if(!valid)fail('El contenido de la captura no coincide con su formato.');return bytes;
}
function hash(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function sheetFor(props){return SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName('Reports');}
function safeCell(s){return /^[\s]*[=+\-@]/.test(s)?"'"+s:s;}
function budget(key,max){const lock=LockService.getScriptLock();if(!lock.tryLock(10000))fail('Servicio ocupado. Inténtalo de nuevo.');try{const props=PropertiesService.getScriptProperties();const name='budget:'+key;const today=new Date().toISOString().slice(0,10);const value=JSON.parse(props.getProperty(name)||'{}');const count=value.day===today?value.count:0;if(count>=max)fail('Se ha alcanzado el límite diario. Inténtalo mañana.');props.setProperty(name,JSON.stringify({day:today,count:count+1}));}finally{lock.releaseLock();}}
function verifyBot(p,props){
 const secret=props.getProperty('TURNSTILE_SECRET');const hostname=props.getProperty('TURNSTILE_HOSTNAME');
 if(!secret)return;
 if(!hostname)fail('La verificación del servicio no está configurada.');
 if(typeof p.turnstileToken!=='string'||p.turnstileToken.length>2048)fail('Completa la verificación.');
 const response=UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'post',payload:{secret:secret,response:p.turnstileToken},muteHttpExceptions:true});
 const result=JSON.parse(response.getContentText());if(!result.success||result.hostname!==hostname||result.action!=='feedback')fail('Verificación caducada o no válida. Vuelve a intentarlo.');
}
function submitReport(p,props){
 const v=validateReport(p),bytes=validateImage(p.image);const tokenHash=hash(p.lookupToken);
 verifyBot(p,props);
 const lock=LockService.getScriptLock();if(!lock.tryLock(20000))fail('Servicio ocupado. Inténtalo de nuevo.');
 let file=null,committed=false;
 try{
  const sheet=sheetFor(props);const rows=sheet.getDataRange().getValues();const existing=rows.slice(1).find(row=>row[13]===p.requestId);
  if(existing){if(existing[12]!==tokenHash)fail('Referencia no válida.');queueNotification(props,existing[0]);return {ok:true,reportId:existing[0]};}
  const today=new Date().toISOString().slice(0,10);if(rows.slice(1).filter(row=>String(row[1]).slice(0,10)===today).length>=200)fail('Se ha alcanzado el límite diario de reportes.');
  const id='FB-'+Utilities.getUuid();const now=new Date().toISOString();
  if(bytes){const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[p.image.mime];file=DriveApp.getFolderById(props.getProperty('FOLDER_ID')).createFile(Utilities.newBlob(bytes,p.image.mime,id+'.'+ext));}
  sheet.appendRow([id,now,v.type,v.section,v.steps,v.expected,v.actual,v.impact,v.device,file?file.getUrl():'','Nuevo',now,tokenHash,p.requestId,false].map(x=>typeof x==='string'?safeCell(x):x));
  SpreadsheetApp.flush();committed=true;queueNotification(props,id);return {ok:true,reportId:id};
 }catch(e){if(file&&!committed){try{file.setTrashed(true);}catch(ignored){}}throw e;}finally{lock.releaseLock();}
}
function lookup(p,props){
 const id=textField(p,'reportId',50);const token=textField(p,'lookupToken',100);
 const rows=sheetFor(props).getDataRange().getValues();const row=rows.slice(1).find(r=>r[0]===id&&r[12]===hash(token));
 if(!row)fail('No se encontró un reporte con esa referencia y código.');
 return {ok:true,reportId:row[0],status:STATUSES.includes(row[10])?row[10]:'En revisión',updatedAt:row[11]};
}

function authFailure(message){const error=new Error(message);error.publicMessage=message;error.authRequired=true;throw error;}
function requirePassword(p,props){
 const team=props.getProperty('REVIEW_PASSWORD'),owner=props.getProperty('OWNER_PASSWORD');
 if(!team||team.length<16)authFailure('El acceso no está configurado.');
 if(typeof p.reviewPassword!=='string'||p.reviewPassword.length>200)authFailure('Contraseña incorrecta.');
 if(owner&&owner.length>=16&&owner!==team&&equalSignature(hash(p.reviewPassword),hash(owner)))return 'owner';
 if(equalSignature(hash(p.reviewPassword),hash(team)))return 'team';
 authFailure('Contraseña incorrecta.');
}
function sessionSignature(body,props){
 const secret=props.getProperty('SESSION_SECRET'),password=props.getProperty('REVIEW_PASSWORD');
 if(!secret||!password||password.length<16)authFailure('Vuelve a entrar para renovar tu sesión.');
 return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('feedback-session-v2.'+body,secret+':'+hash(password)+':'+hash(props.getProperty('OWNER_PASSWORD')||''))).replace(/=+$/,'');
}
function equalSignature(a,b){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
function requireReviewer(p,props){
 if(!p.sessionToken)return requirePassword(p,props);
 try{
  if(typeof p.sessionToken!=='string'||p.sessionToken.length>1000)throw new Error();
  const parts=p.sessionToken.split('.');if(parts.length!==2||!parts.every(s=>/^[A-Za-z0-9_-]+$/.test(s)))throw new Error();
  if(!equalSignature(parts[1],sessionSignature(parts[0],props)))throw new Error();
  const data=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if(!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()||!validUuid(data.nonce)||!['owner','team'].includes(data.role))throw new Error();
  return data.role;
 }catch(error){authFailure('Tu sesión ha caducado o ya no es válida. Vuelve a entrar.');}
}
function issueSession(p,props){
 const role=requirePassword(p,props);
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))fail('Servicio ocupado. Inténtalo de nuevo.');
 try{if(!props.getProperty('SESSION_SECRET'))props.setProperty('SESSION_SECRET',Utilities.getUuid()+Utilities.getUuid());}finally{lock.releaseLock();}
 const expiresAt=Date.now()+7*24*60*60*1000;
 const body=Utilities.base64EncodeWebSafe(JSON.stringify({expiresAt,nonce:Utilities.getUuid(),role})).replace(/=+$/,'');
 return {ok:true,sessionToken:body+'.'+sessionSignature(body,props),expiresAt,role};
}

function reviewReports(p,props){
 requireReviewer(p,props);const offset=Number(p.offset||0);if(!Number.isInteger(offset)||offset<0||offset>100000)fail('Página no válida.');
 const rows=sheetFor(props).getDataRange().getValues().slice(1).filter(r=>r[0]).reverse(),notes=followupRows(props);
 const reports=rows.slice(offset,offset+20).map(r=>({id:r[0],createdAt:r[1],type:r[2],section:r[3],steps:r[4],expected:r[5],actual:r[6],impact:r[7],device:r[8],hasScreenshot:!!r[9],status:STATUSES.includes(r[10])?r[10]:'En revisión',updatedAt:r[11],reviewed:r[14]===true,title:String(r[15]||''),editVersion:hash(JSON.stringify(r.slice(2,10))),notes:followupNotes(notes,r[0])}));
 return {ok:true,role:requireReviewer(p,props),reports:reports,total:rows.length,nextOffset:offset+reports.length<rows.length?offset+reports.length:null};
}
function reviewScreenshot(p,props){
 requireReviewer(p,props);const id=textField(p,'reportId',50);const row=sheetFor(props).getDataRange().getValues().slice(1).find(r=>r[0]===id);if(!row||(!p.noteId&&!row[9]))fail('Captura no disponible.');
 const source=p.noteId?followupRows(props).find(n=>n[0]===id&&n[3]===textField(p,'noteId',36)):null;
 const screenshot=p.noteId?(source&&source[6]):row[9];if(!screenshot)fail('Captura no disponible.');
 const match=String(screenshot).match(/\/d\/([a-zA-Z0-9_-]+)/);if(!match)fail('Captura no disponible.');
 const file=DriveApp.getFileById(match[1]),parents=file.getParents();let allowed=false;while(parents.hasNext()){if(parents.next().getId()===props.getProperty('FOLDER_ID'))allowed=true;}
 if(!allowed||file.isTrashed()||file.getSize()>MAX_IMAGE)fail('Captura no disponible.');const blob=file.getBlob();if(!['image/png','image/jpeg','image/webp'].includes(blob.getContentType()))fail('Captura no disponible.');return {ok:true,mime:blob.getContentType(),data:Utilities.base64Encode(blob.getBytes())};
}
function followupRows(props){return SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName('Followup').getDataRange().getValues().slice(1);}
function followup(p,props){
 requireReviewer(p,props);const id=textField(p,'reportId',50),note=textField(p,'note',2000,true);if(typeof p.reviewed!=='boolean'||typeof p.fixed!=='boolean'||!validUuid(p.requestId))fail('Seguimiento no válido.');
 const bytes=validateImage(p.image);
 const lock=LockService.getScriptLock();if(!lock.tryLock(20000))fail('Servicio ocupado. Inténtalo de nuevo.');
 let file=null,committed=false;
 try{
 const ss=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')),sheet=ss.getSheetByName('Reports');const rows=sheet.getDataRange().getValues(),index=rows.findIndex((r,i)=>i>0&&r[0]===id);if(index<1)fail('Reporte no encontrado.');
 const follow=ss.getSheetByName('Followup'),entries=follow.getDataRange().getValues().slice(1),old=entries.find(r=>r[3]===p.requestId);if(old&&old[0]!==id)fail('Solicitud no válida.');
 if(!old){if(entries.filter(r=>r[0]===id).length>=200)fail('Este reporte ha alcanzado el límite de seguimientos.');if(bytes)file=DriveApp.getFolderById(props.getProperty('FOLDER_ID')).createFile(Utilities.newBlob(bytes,p.image.mime,id+'-'+p.requestId+'.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[p.image.mime])));
 follow.getRange(1,7).setValue('Screenshot');follow.appendRow([id,new Date().toISOString(),safeCell(note),p.requestId,p.reviewed,p.fixed,file?file.getUrl():'']);committed=true;SpreadsheetApp.flush();}
 const selected=old||[id,new Date().toISOString(),note,p.requestId,p.reviewed,p.fixed],newer=old&&entries.slice(entries.indexOf(old)+1).some(r=>r[0]===id);
 if(!newer){sheet.getRange(index+1,11).setValue(selected[5]?'Resuelto':selected[4]?'En revisión':'Nuevo');sheet.getRange(index+1,12).setValue(selected[1]);sheet.getRange(index+1,15).setValue(selected[4]);SpreadsheetApp.flush();}
 return {ok:true,status:sheet.getRange(index+1,11).getValue(),notes:followupNotes(followupRows(props),id)};
 }catch(error){if(file&&!committed){try{file.setTrashed(true);}catch(ignored){}}throw error;}finally{lock.releaseLock();}
}
function queueNotification(props,id){const sheet=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName('Notifications');if(!sheet.getDataRange().getValues().slice(1).some(r=>r[0]===id))sheet.appendRow([id,new Date().toISOString(),'',0,'']);}
function deliverNotifications(){
 const props=PropertiesService.getScriptProperties(),url=props.getProperty('APP_URL'),recipients=props.getProperty('NOTIFY_EMAILS');if(!recipients)return;if(!url||!/^https:\/\/[a-z0-9.-]+\//.test(url))return;
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
 try{
 const ss=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')),queue=ss.getSheetByName('Notifications'),entries=queue.getDataRange().getValues(),reports=ss.getSheetByName('Reports').getDataRange().getValues();let sent=0;
 for(let i=1;i<entries.length&&sent<10;i++){const entry=entries[i];if(entry[2]||Number(entry[3])>=3)continue;if(MailApp.getRemainingDailyQuota()<2)break;const report=reports.find(r=>r[0]===entry[0]);if(!report)continue;
 queue.getRange(i+1,4).setValue(Number(entry[3])+1);SpreadsheetApp.flush();
 try{MailApp.sendEmail({to:recipients,subject:'Nuevo reporte de pruebas · '+String(report[3]).replace(/[\r\n]/g,' '),body:'Hay una nueva prueba pendiente de revisión.\n\nReferencia: '+report[0]+'\nSección: '+report[3]+'\nTipo: '+({error:'Error',change:'Cambio / mejora',query:'Consulta'}[report[2]]||report[2])+'\nImpacto: '+({high:'Alto',medium:'Medio',low:'Bajo'}[report[7]]||report[7])+'\n\nRevisar el reporte: '+url+'\nEntra con la contraseña del equipo y abre «Revisión del equipo».\n\nPuedes marcar «Revisado» y «Solucionado» y añadir notas. El reporte original se conserva sin cambios.\nLa contraseña no se incluye en este correo.',name:'Pruebas del sistema'});queue.getRange(i+1,3).setValue(new Date().toISOString());queue.getRange(i+1,5).setValue('');sent++;}catch(error){queue.getRange(i+1,5).setValue('Error de envío; comprobar permisos y cuota.');}
 }
 }finally{lock.releaseLock();}
}

function setReportTitle(p,props){
 requireOwner(p,props);const id=textField(p,'reportId',50),title=textField(p,'title',160,true).replace(/\s+/g,' '),previous=textField(p,'previousTitle',160,true);
 const lock=LockService.getScriptLock();if(!lock.tryLock(20000))fail('Servicio ocupado. Inténtalo de nuevo.');
 try{
  const sheet=sheetFor(props),rows=sheet.getDataRange().getValues(),index=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(index<1)fail('Reporte no encontrado.');
  const current=String(rows[index][15]||'');
  if(current!==previous&&current!==title)fail('El título ha cambiado desde que lo abriste. Vuelve a abrir la revisión antes de editarlo.');
  const updatedAt=new Date().toISOString();
  sheet.getRange(1,16).setValue('Title');sheet.getRange(index+1,16).setValue(safeCell(title));sheet.getRange(index+1,12).setValue(updatedAt);SpreadsheetApp.flush();
  return {ok:true,title,updatedAt};
 }finally{lock.releaseLock();}
}

function requireOwner(p,props){
 if(!p.sessionToken||requireReviewer(p,props)!=='owner')fail('Solo la propietaria puede editar. Cierra sesión y entra con tu contraseña privada.');
}
function editReport(p,props){
 requireOwner(p,props);
 const id=textField(p,'reportId',50),previous=textField(p,'editVersion',64);
 const v=validateReport({...p,lookupToken:p.requestId+p.requestId});
 if(!['keep','replace','remove'].includes(p.screenshotAction))fail('Cambio de captura no válido.');
 const bytes=p.screenshotAction==='replace'?validateImage(p.image):null;
 if(p.screenshotAction==='replace'&&!bytes)fail('Selecciona una captura.');
 const fingerprint=hash(JSON.stringify([v,p.screenshotAction,p.image||null]));
 const lock=LockService.getScriptLock();if(!lock.tryLock(20000))fail('Servicio ocupado. Inténtalo de nuevo.');
 let file=null,committed=false;
 try{
  const sheet=sheetFor(props),rows=sheet.getDataRange().getValues(),index=rows.findIndex((r,i)=>i>0&&r[0]===id);
  if(index<1)fail('Reporte no encontrado.');
  const row=rows[index];let last={};try{last=JSON.parse(row[16]||'{}');}catch(ignored){}
  if(last.requestId===p.requestId){if(last.fingerprint!==fingerprint)fail('Solicitud no válida.');return {ok:true,reportId:id};}
  if(hash(JSON.stringify(row.slice(2,10)))!==previous)fail('El reporte ha cambiado. Actualiza el listado antes de editarlo.');
  if(bytes)file=DriveApp.getFolderById(props.getProperty('FOLDER_ID')).createFile(Utilities.newBlob(bytes,p.image.mime,id+'-edit.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[p.image.mime])));
  const screenshot=p.screenshotAction==='keep'?row[9]:file?file.getUrl():'';
  const values=[v.type,v.section,v.steps,v.expected,v.actual,v.impact,v.device,screenshot].map(safeCell);
  const updated=[...row];while(updated.length<17)updated.push('');updated.splice(2,8,...values);updated[11]=new Date().toISOString();updated[16]=JSON.stringify({requestId:p.requestId,fingerprint});
  sheet.getRange(1,17).setValue('LastOwnerEdit');sheet.getRange(index+1,1,1,17).setValues([updated]);SpreadsheetApp.flush();committed=true;
  return {ok:true,reportId:id};
 }catch(error){if(file&&!committed){try{file.setTrashed(true);}catch(ignored){}}throw error;}finally{lock.releaseLock();}
}

function followupNotes(rows,id){return rows.filter(n=>n[0]===id&&(n[2]||n[6])).map(n=>({id:n[3],createdAt:n[1],text:n[2]||'',hasScreenshot:!!n[6]}));}
