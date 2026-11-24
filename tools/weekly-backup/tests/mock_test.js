// Mock Apps Script globals and run weeklyBackup against fake Supabase data.
const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync(process.argv[2],'utf8');
const DB={leads:Array.from({length:2503},(_,i)=>({id:i+1,name:'L'+i,remarks:i==5?'=HYPERLINK("x")':'ok'})),
  calls:[{id:1,lead_id:1}],profiles:[{id:'a',role:'admin'}],app_settings:[{k:'x',v:{a:1}}]};
const files=[],mails=[],trash=[];let props={SUPABASE_URL:'https://sfvpslsexobukgerkixi.supabase.co',SUPABASE_KEY:'eyJhbGc.eyJyb2xl.sig'};
let shared=false,sheetCells=0;
const blob=(d,mime,name)=>({d,name,getDataAsString:()=>d,setName(n){this.name=n;return this}});
const mkFile=(b,age=0)=>{const f={name:b.name,b,created:Date.now()-age,getName:()=>f.name,getBlob:()=>f.b,getDateCreated:()=>new Date(f.created),setTrashed:()=>{trash.push(f.name)}};files.push(f);return f};
mkFile(blob('{}','', 'EasyDeals_Backup_old.json'),70*86400000); mkFile(blob('{}','', 'Other_file.json'),70*86400000);
const folder={getEditors:()=>shared?[1]:[],getViewers:()=>[],getSharingAccess:()=>'PRIVATE',createFile:b=>mkFile(b),getFiles(){let i=0;const l=files.slice();return{hasNext:()=>i<l.length,next:()=>l[i++]}}};
const ctx={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},
 DriveApp:{Access:{PRIVATE:'PRIVATE'},getFoldersByName:()=>({hasNext:()=>true,next:()=>folder}),createFolder:()=>folder,getFileById:()=>({setTrashed:()=>trash.push('tmpSheet')})},
 Utilities:{newBlob:blob,formatDate:()=> '2026-11-29_0200'},
 SpreadsheetApp:{flush(){},create:()=>{const sh=()=>({setName(){return this},getRange:(r,c,nr,nc)=>({setValue(){},setNumberFormat(){return this},setValues(d){sheetCells+=d.length*d[0].length;if(d.some(r=>r.some(v=>/^=/.test(v))))throw Error('formula not escaped')}}),setFrozenRows(){}});return{getId:()=>'sid',getSheets:()=>[sh()],insertSheet:sh}}},
 ScriptApp:{getOAuthToken:()=>'t'},
 Session:{getEffectiveUser:()=>({getEmail:()=>'owner@x'})},
 MailApp:{sendEmail:(to,s,b)=>mails.push({to,s,b})},
 Logger:{log:m=>console.log('LOG:',m)},
 UrlFetchApp:{fetch(url,o){
   if(url.includes('docs.google.com'))return{getResponseCode:()=>200,getBlob:()=>blob('xlsx','', 'x')};
   const t=url.split('/rest/v1/')[1].split('?')[0];
   if(!DB[t])return{getResponseCode:()=>404,getContentText:()=>'{"code":"PGRST205","message":"Could not find the table"}',getHeaders:()=>({})};
   if(t==='app_settings'&&url.includes('order='))return{getResponseCode:()=>400,getContentText:()=>'column app_settings.id does not exist',getHeaders:()=>({})};
   const [a,b]=o.headers.Range.split('-').map(Number);const rows=DB[t].slice(a,b+1);
   return{getResponseCode:()=>200,getContentText:()=>JSON.stringify(rows),getHeaders:()=>({'Content-Range':a+'-'+(a+rows.length-1)+'/'+DB[t].length})};
 }}};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.weeklyBackup();
const j=JSON.parse(files.find(f=>/Backup_2026.*json/.test(f.name)).b.d);
console.log('json leads',j.leads.length,'missing',j._meta.missing.length,'xlsx',!!files.find(f=>/xlsx$/.test(f.name)),'trash',trash,'cells',sheetCells,'LAST_OK',!!props.LAST_OK);
console.assert(j.leads.length===2503&&trash.includes('EasyDeals_Backup_old.json')&&!trash.includes('Other_file.json'));
// failure path: shared folder → mail, key hidden
shared=true;try{ctx.weeklyBackup()}catch(e){}
console.log('fail mail',mails.length,mails[0]&&mails[0].s, /eyJ/.test(mails[0].b)?'KEY LEAKED':'key not in mail');
shared=false;props.SUPABASE_KEY='';try{ctx.weeklyBackup()}catch(e){console.log('no key ->',e.message,'mails',mails.length)}
