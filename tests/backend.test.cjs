const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const PASSWORD='test-only-password-123456';
function harness() {
 const tables={Reports:[['ID','CreatedAt','Type','Section','Steps','Expected','Actual','Impact','Device','Screenshot','Status','UpdatedAt','TokenHash','RequestId','Reviewed']],Followup:[['ReportId','CreatedAt','Note','RequestId','Reviewed','Fixed']],Notifications:[['ReportId','CreatedAt','SentAt','Attempts','Error']]};
 const props={ALLOWED_ORIGIN:'https://example.github.io',APP_URL:'https://example.github.io/app/',NOTIFY_EMAILS:'dev1@example.test,dev2@example.test',REVIEW_PASSWORD:PASSWORD,SPREADSHEET_ID:'sheet',FOLDER_ID:'folder',TURNSTILE_SECRET:'secret',TURNSTILE_HOSTNAME:'example.github.io'};
 let verification={success:true,hostname:'example.github.io',action:'feedback'},files=0,trashed=0,mailFailure=false,queueFailure=false;const emails=[];
 function sheet(name){const rows=tables[name];return {getLastColumn:()=>15,getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),appendRow:r=>{if(name==='Notifications'&&queueFailure)throw Error('queue failure');rows.push(r);},getRange:(row,col)=>({setValues(values){for(let i=0;i<values.length;i++){while(rows.length<row+i)rows.push([]);for(let j=0;j<values[i].length;j++)rows[row+i-1][col+j-1]=values[i][j];}},setDataValidation(){},insertCheckboxes(){for(const r of rows.slice(1))r[14]=false;},setValue:v=>{while(rows.length<row)rows.push([]);rows[row-1][col-1]=v;},getValue:()=>rows[row-1][col-1]})};}
 const context=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,s)=>[...crypto.createHash(a).update(s).digest()],base64Decode:s=>[...Buffer.from(s,'base64')],base64Encode:b=>Buffer.from(b).toString('base64'),getUuid:()=>crypto.randomUUID(),newBlob:(b,m,n)=>({b,m,n})},UrlFetchApp:{fetch:()=>({getContentText:()=>JSON.stringify(verification)})},ScriptApp:{getProjectTriggers:()=>['deliverNotifications','reportEdited'].map(name=>({getHandlerFunction:()=>name}))},SpreadsheetApp:{newDataValidation:()=>({requireCheckbox:()=>({build:()=>({})})}),openById:()=>({getSheetByName:sheet,getUrl:()=> 'https://example.test/sheet'}),flush(){}},DriveApp:{getFolderById:()=>({createFile:()=>{files++;return {getUrl:()=> 'https://drive.google.com/file/d/private/view',setTrashed:()=>trashed++};}})},MailApp:{getRemainingDailyQuota:()=>100,sendEmail:m=>{if(mailFailure)throw Error('mail failure');emails.push(m);}},HtmlService:{XFrameOptionsMode:{ALLOWALL:1},createHtmlOutput:html=>({html,setXFrameOptionsMode(){return this;}})}});
 vm.runInContext(fs.readFileSync('backend/Code.gs','utf8'),context);
 function post(payload){const html=context.doPost({parameter:{payload:JSON.stringify(payload)}}).html;const raw=html.match(/postMessage\((.*),"https:\/\/example.github.io"\);/);return raw?JSON.parse(raw[1]):{html};}
 return {context,rows:tables.Reports,tables,props,post,emails,setVerification:v=>verification=v,setMailFailure:v=>mailFailure=v,setQueueFailure:v=>queueFailure=v,get files(){return files;},get trashed(){return trashed;}};
}
function payload(){return {action:'submit',nonce:crypto.randomUUID(),origin:'https://example.github.io',requestId:crypto.randomUUID(),lookupToken:crypto.randomUUID()+crypto.randomUUID(),reviewPassword:PASSWORD,type:'error',section:'Tours',steps:'1. Abrir Tours',expected:'Guardar',actual:'No guarda',impact:'high',device:'Firefox',website:'',turnstileToken:'token'};}
test('submission, private lookup, status changes, and retry deduplication',()=>{
 const h=harness(),p=payload(),first=h.post(p);assert.equal(first.ok,true);assert.match(first.reportId,/^FB-/);assert.equal(h.rows.length,2);
 assert.equal(h.post(p).reportId,first.reportId);assert.equal(h.rows.length,2);assert.equal(h.tables.Notifications.length,2);assert.notEqual(h.rows[1][12],p.lookupToken);
 const lookup={...p,action:'status',reportId:first.reportId};assert.equal(h.post(lookup).status,'Nuevo');h.rows[1][10]='Resuelto';assert.equal(h.post(lookup).status,'Resuelto');
 assert.equal(h.post({...lookup,lookupToken:'wrong'}).ok,false);
});
test('every public action requires a strong configured password',()=>{for(const action of ['submit','status','review','screenshot','followup']){const h=harness();assert.equal(h.post({...payload(),action,reviewPassword:'wrong'}).ok,false);assert.equal(h.rows.length,1);}const h=harness();delete h.props.REVIEW_PASSWORD;assert.equal(h.post(payload()).ok,false);h.props.REVIEW_PASSWORD='short';assert.equal(h.post(payload()).ok,false);});
test('optional bot checks fail closed when configured',()=>{
 for(const v of [{success:false},{success:true,hostname:'evil.com',action:'feedback'},{success:true,hostname:'example.github.io',action:'other'}]){const h=harness();h.setVerification(v);assert.equal(h.post(payload()).ok,false);assert.equal(h.rows.length,1);}
 const h=harness();delete h.props.TURNSTILE_SECRET;assert.equal(h.post(payload()).ok,true);
});
test('reject malformed, oversized, honeypot and enum input',()=>{
 for(const patch of [{steps:''},{steps:'x'.repeat(6001)},{type:'admin'},{impact:'urgent'},{section:'Otra',otherSection:''},{website:'spam'},{lookupToken:'bad'},{image:{mime:'image/svg+xml',data:'abc'}}]){const h=harness();assert.equal(h.post({...payload(),...patch}).ok,false);assert.equal(h.rows.length,1);}
 const h=harness();for(const p of [null,[],42,'abc'])assert.doesNotThrow(()=>h.post(p));
});
test('private image storage validates signatures and rejects MIME spoofing',()=>{
 const h=harness(),p=payload();p.image={mime:'image/png',data:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')};assert.equal(h.post(p).ok,true);assert.equal(h.files,1);
 const h2=harness();p.image.mime='image/jpeg';assert.equal(h2.post(p).ok,false);assert.equal(h2.files,0);
});
test('queue failure cannot delete an already committed screenshot; retry repairs queue',()=>{const h=harness(),p=payload();p.image={mime:'image/png',data:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')};h.setQueueFailure(true);assert.equal(h.post(p).ok,false);assert.equal(h.rows.length,2);assert.equal(h.trashed,0);h.setQueueFailure(false);assert.equal(h.post(p).ok,true);assert.equal(h.files,1);assert.equal(h.tables.Notifications.length,2);});
test('review list excludes credentials and private Drive links',()=>{const h=harness();h.post(payload());const r=h.post({...payload(),action:'review'});assert.equal(r.reports.length,1);assert.equal(r.reports[0].actual,'No guarda');const s=JSON.stringify(r);assert.equal(s.includes(PASSWORD),false);assert.equal(s.includes('TokenHash'),false);assert.equal(s.includes('drive.google.com'),false);});
test('programmer checkboxes and append-only notes never modify original report',()=>{const h=harness(),p=payload(),id=h.post(p).reportId;const original=h.rows[1].slice(0,10);const follow={...p,action:'followup',reportId:id,requestId:crypto.randomUUID(),reviewed:true,fixed:true,note:'Corregido y probado'};const r=h.post(follow);assert.equal(r.ok,true);assert.equal(r.status,'Resuelto');assert.equal(r.notes.length,1);assert.equal(h.rows[1][14],true);assert.deepEqual(h.rows[1].slice(0,10),original);assert.equal(h.post(follow).notes.length,1);assert.equal(h.tables.Followup.length,2);
 const newer={...follow,requestId:crypto.randomUUID(),fixed:false,note:'Reabierto'};assert.equal(h.post(newer).status,'En revisión');assert.equal(h.post(follow).status,'En revisión');assert.equal(h.tables.Followup.length,3);
});
test('notification queue sends once to authorized recipients and never includes password or notes',()=>{const h=harness();h.post(payload());assert.equal(h.emails.length,0);h.context.deliverNotifications();assert.equal(h.emails.length,1);assert.equal(h.emails[0].to,'dev1@example.test,dev2@example.test');assert.equal(h.emails[0].body.includes(PASSWORD),false);assert.equal(h.emails[0].body.includes('No guarda'),false);h.context.deliverNotifications();assert.equal(h.emails.length,1);});
test('email failure retries without losing report',()=>{const h=harness();h.post(payload());h.setMailFailure(true);h.context.deliverNotifications();assert.equal(h.rows.length,2);assert.equal(h.tables.Notifications[1][3],1);h.setMailFailure(false);h.context.deliverNotifications();assert.equal(h.emails.length,1);assert.ok(h.tables.Notifications[1][2]);});
test('formula injection, quotas, wrong origin and script injection',()=>{const h=harness();assert.equal(h.post({...payload(),actual:'=IMPORTXML("https://evil.test")'}).ok,true);assert.equal(h.rows[1][6].startsWith("'="),true);assert.equal(h.post({...payload(),origin:'https://evil.test'}).ok,false);h.props['budget:requests']=JSON.stringify({day:new Date().toISOString().slice(0,10),count:1000});assert.equal(h.post(payload()).ok,false);});

test('repeating setup preserves previously checked review flags',()=>{const h=harness();h.post(payload());h.rows[1][14]=true;h.context.setup();assert.equal(h.rows[1][14],true);});

test('review ignores blank rows left by checkbox formatting',()=>{const h=harness();h.post(payload());for(let i=0;i<4;i++){const blank=Array(15).fill('');blank[14]=false;h.rows.push(blank);}const r=h.post({...payload(),action:'review'});assert.equal(r.total,1);assert.equal(r.reports.length,1);h.rows[1][14]=true;h.context.setup();assert.equal(h.rows[1][14],true);assert.equal(h.rows[2][14],'');});
