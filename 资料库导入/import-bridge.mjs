import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createRequire,stripTypeScriptTypes} from 'node:module';
const useInstalledSchema=process.argv.includes('--installed-schema');
const {validateProfile}=await import(useInstalledSchema?'./installed-profile-schema.mjs':'../src/profile/schema.ts');
const require=createRequire(import.meta.url);
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(dir);
let esbuild;
try{esbuild=require('esbuild');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
if(esbuild){
 await esbuild.build({entryPoints:[path.join(dir,'import-client.js')],outfile:path.join(root,'dist/ztt-profile-import.js'),bundle:true,platform:'browser',format:'iife',target:'chrome114',plugins:useInstalledSchema?[{name:'installed-schema',setup(b){b.onResolve({filter:/profile\/schema\.ts$/},()=>({path:path.join(dir,'installed-profile-schema.mjs')}));}}]:[]});
}else{
 if(useInstalledSchema)throw Error('旧字段导入需 esbuild；当前新版字段无需额外依赖');
 const js=p=>stripTypeScriptTypes(fs.readFileSync(path.join(root,p),'utf8'),{mode:'strip'}).replace(/^export\s+/gm,'');
 const types=js('src/types/profile.ts');
 const schema=js('src/profile/schema.ts').replace(/import\s*\{\s*YES_NO_PREFERENCE_KEYS\s*\}\s*from\s*["']\.\.\/types\/profile["'];?/,'');
 if(/^import\s/m.test(types+schema))throw Error('新 schema 含额外依赖，拒绝不完整转换');
 const client=fs.readFileSync(path.join(dir,'import-client.js'),'utf8').replace(/^import\s*\{validateProfile\}\s*from\s*[^;]+;\s*/,'');
 fs.writeFileSync(path.join(root,'dist/ztt-profile-import.js'),`(()=>{\n${types}\n${schema}\n${client}\n})();`,'utf8');
}
const token=randomBytes(24).toString('hex');
const extensionId='idgekmcllilglnccdhcnnmokdaphibne';
const allowed=new Set([`chrome-extension://${extensionId}`,`extension://${extensionId}`]);
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const differences=(a,b,p='')=>{
 if(stable(a)===stable(b))return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],`${p}.${k}`)).slice(0,15);
 return [p];
};
const packName=process.argv.find(a=>a.startsWith('--pack='))?.slice(7)||'三岗位资料库导入包.json';
if(path.basename(packName)!==packName)throw Error('导入包必须在资料库导入目录内');
const inspectOnly=process.argv.includes('--inspect');
const pack=inspectOnly?{inspectOnly:true,libraries:[]}:JSON.parse(fs.readFileSync(path.join(dir,packName),'utf8'));
const isDefaultPack=packName==='默认资料库导入包.json';
let originalStore;
let originalBackupFile;
let completed=false;
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&& !allowed.has(origin)){res.writeHead(403);res.end();return;}
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.searchParams.get('token')!==token){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type','application/json; charset=utf-8');
 try{
 if(req.method==='GET'&&u.pathname==='/package'){res.end(JSON.stringify(pack));return;}
 if(req.method==='GET'&&u.pathname==='/status'){res.end(JSON.stringify({completed}));return;}
 const chunks=[];let bytes=0;for await(const part of req){chunks.push(part);bytes+=part.length;if(bytes>15000000)throw Error('请求过大');}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(u.pathname==='/snapshot'&&inspectOnly){
   if(data.extensionId!==extensionId)throw Error('插件身份不匹配');
   fs.writeFileSync(path.join(dir,'读取当前资料库.json'),JSON.stringify(data.original,null,2),'utf8');
   const store=data.original['afa.profiles.v2'];
   console.log(JSON.stringify({readOnly:true,libraries:store?.libraries?.map(l=>({id:l.id,name:l.name,internships:l.content.internships.length,projects:l.content.projects.length,campus:l.content.campus.length,emptyDescriptions:[...l.content.internships,...l.content.projects,...l.content.campus].filter(e=>!e.description?.trim()).length}))}));
   res.end('{"ok":true}');setTimeout(()=>server.close(),800);return;
 }
 if(u.pathname==='/backup'){
   if(data.extensionId!==extensionId)throw Error('插件身份不匹配');
   const dest=path.join(dir,`导入前原资料库_${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
   fs.writeFileSync(dest,JSON.stringify(data.original,null,2),'utf8');
   originalStore=data.original['afa.profiles.v2'];
   originalBackupFile=path.basename(dest);
   console.log('Original profile backup saved.');res.end('{"ok":true}');return;
 }
 if(u.pathname==='/receipt'){
   if(data.extensionId!==extensionId||data.ok!==true)throw Error('回执无效');
   for(const l of pack.libraries){
     const saved=data.store.libraries.find(x=>x.id===l.id);if(!saved)throw Error('缺少岗位库');
     const result=validateProfile(structuredClone({...data.store.shared,...saved.content}));if(!result.ok)throw Error(result.errors.join(';'));
     const expected={...l.profile};delete expected.basic;delete expected.education;delete expected.sensitive;
     if(stable(saved.content)!==stable(expected)){console.log('Different paths: '+differences(saved.content,expected).join(', '));throw Error('岗位内容读回不一致');}
   }
   if(pack.preserveExistingLibraries){
     if(!originalStore)throw Error('缺少更新前资料快照');
     const targetIds=new Set(pack.libraries.map(l=>l.id));
     for(const before of originalStore.libraries){
       if(targetIds.has(before.id))continue;
       const after=data.store.libraries.find(l=>l.id===before.id);
       if(stable(before)!==stable(after)){console.log('Preserved library differences: '+differences(before,after).join(', '));throw Error(`原资料库被意外改变：${before.name}`);}
     }
     if(stable(originalStore.shared)!==stable(data.store.shared))throw Error('公共信息被意外改变');
     data.preservedLibraryIds=originalStore.libraries.filter(l=>!targetIds.has(l.id)).map(l=>l.id);
     data.originalBackupFile=originalBackupFile;
   }
   if(pack.descriptionOnly){
     if(data.store.activeLibraryId!==originalStore.activeLibraryId)throw Error('当前选库被意外改变');
     if(data.store.libraries.length!==originalStore.libraries.length)throw Error('资料库数量被改变');
     const project=l=>{
       const x=structuredClone(l);delete x.updatedAt;
       for(const key of ['internships','projects','campus'])for(const e of x.content[key])for(const field of ['description','descriptionLong','descriptionMedium','descriptionShort'])delete e[field];
       for(const [key,value] of Object.entries(x.content.content))if(typeof value==='object')x.content.content[key]=value.long||value.medium||value.short||'';
       return x;
     };
     for(const before of originalStore.libraries){
       const after=data.store.libraries.find(l=>l.id===before.id);
       if(stable(project(before))!==stable(project(after)))throw Error(`描述之外的资料被改变：${before.name}`);
     }
   }
   if(pack.projectTextUpdates){
     const expected=structuredClone(originalStore);
     for(const change of pack.projectTextUpdates){
       const oldLib=expected.libraries.find(l=>l.id===change.libraryId);
       const after=data.store.libraries.find(l=>l.id===change.libraryId);
       const oldProject=oldLib?.content.projects.find(e=>e.name===change.projectName);
       const newProject=after?.content.projects.find(e=>e.name===change.projectName);
       if(!oldProject||!newProject)throw Error('缺少指定更新项目');
       for(const key of change.fields){
         if(!['description','responsibilities','workContent','achievements','summary','variants'].includes(key))throw Error('项目更新字段超出范围');
         oldProject[key]=newProject[key];
       }
       oldLib.updatedAt=after.updatedAt;
     }
     if(stable(expected)!==stable(data.store))throw Error('指定项目文本之外的内容被改变');
   }
   const receiptName=pack.receiptFile||(pack.descriptionOnly?'描述修复_导入回执.json':isDefaultPack?'默认资料库_导入回执.json':'导入完成回执.json');
   if(path.basename(receiptName)!==receiptName)throw Error('回执路径无效');
   fs.writeFileSync(path.join(dir,receiptName),JSON.stringify(data,null,2),'utf8');completed=true;
   console.log(JSON.stringify({ok:true,verified:true,totalLibraries:data.store.libraries.length,imported:pack.libraries.map(l=>({name:l.name,projects:l.profile.projects.length})),backupKey:data.backupKey}));
   res.end('{"ok":true}');setTimeout(()=>server.close(),800);return;
 }
 if(u.pathname==='/error'){console.log(JSON.stringify(data));res.end('{"ok":true}');return;}
 res.writeHead(404);res.end('{"ok":false}');
 }catch(e){res.writeHead(400);res.end(JSON.stringify({ok:false,message:String(e)}));console.log('Bridge error: '+String(e));}
});
server.listen(0,'127.0.0.1',()=>{const port=server.address().port;const url=`chrome-extension://${extensionId}/ztt-profile-import.html#bridge=${encodeURIComponent(`http://127.0.0.1:${port}`)}&token=${token}`;fs.writeFileSync(path.join(dir,'本次导入地址.txt'),url,'utf8');console.log(JSON.stringify({port,url}));});
