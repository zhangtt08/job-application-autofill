import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateProfile} from '../src/profile/schema.ts';
import {profileForLibrary,repairProfileShape} from '../src/profile/libraryStore.ts';
import {resolveValue} from '../src/profile/profileResolver.ts';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const write=(f,v)=>fs.writeFileSync(path.join(dir,f),typeof v==='string'?v:JSON.stringify(v,null,2),'utf8');
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const before=read('读取当前资料库.json')['afa.profiles.v2'],next=structuredClone(before);
const supplement='Gemini 实测亦可检索到个人信息。';
// Do not transfer ChatGPT's name-only / citation conditions to Gemini.
const update=s=>s.split('\n').map(line=>/Google/.test(line)&&/ChatGPT/.test(line)&&!line.includes(supplement)?line.replace(/[。；;\s]+$/,'')+'；'+supplement:line).join('\n');
const changes=[];
for(const lib of next.libraries){
 const c=lib.content,fields=[];
 for(const e of c.projects.filter(p=>/SEO\s*\/\s*GEO/.test(p.name))){
  for(const k of ['description','responsibilities','workContent','achievements','summary'])if(typeof e[k]==='string'){
   const value=update(e[k]);if(value!==e[k]){e[k]=value;fields.push(`${e.name}.${k}`);}
  }
  for(const [k,s]of Object.entries(e.variants||{}))e.variants[k]=update(s);
  for(const k of ['descriptionShort','descriptionMedium','descriptionLong'])if(typeof e[k]==='string')e[k]=update(e[k]);
 }
 for(const [k,s]of Object.entries(c.content))if(typeof s==='string'){
  const value=update(s);if(value!==s){c.content[k]=value;fields.push(`content.${k}`);}
 }
 if(fields.length)changes.push({id:lib.id,name:lib.name,fields});
}
assert(changes.length>0);
for(const l of next.libraries){
 const p=profileForLibrary(next,l.id),prior=profileForLibrary(before,l.id),v=validateProfile(structuredClone(p));assert(v.ok,v.errors?.join(';'));
 assert.deepEqual(p.internships,prior.internships);assert.deepEqual(p.campus,prior.campus);assert.deepEqual(p.skills,prior.skills);
 assert.equal(p.projects.length,prior.projects.length);assert(p.skills.technical.join('\n').length<=1000);
 const repaired=repairProfileShape(p);
 for(const [i,e]of p.projects.entries()){
  assert.equal(resolveValue('project.description',repaired,{entryIndex:i,profileType:'general'})?.value,e.description);
  for(const key of ['description','workContent','achievements','summary'])assert(!/\*\*|\n\s*\n/.test(e[key]));
 }
}
const receiptFile='GEO_Gemini更新_20261012_导入回执.json';
const pack={kind:'ztt/application-form-assistant/role-library-pack',version:1,generatedAt:new Date().toISOString(),preserveProfileShape:true,preserveShared:true,preserveExistingLibraries:true,activeLibraryId:before.activeLibraryId,expectedStoreSha256:createHash('sha256').update(stable(before)).digest('hex'),receiptFile,libraries:next.libraries.filter(l=>changes.some(c=>c.id===l.id)).map(l=>({id:l.id,name:l.name,note:l.note,directions:l.directions,profile:profileForLibrary(next,l.id)}))};
if(process.argv.includes('--verify-receipt')){
 const r=read(receiptFile),expected=structuredClone(next);assert(r.ok);
 for(const l of expected.libraries)l.updatedAt=r.store.libraries.find(x=>x.id===l.id).updatedAt;
 assert.deepEqual(r.store,expected);assert.deepEqual(r.mirror,profileForLibrary(r.store,r.store.activeLibraryId));
 write('GEO_Gemini更新_20261012_校验报告.json',{ok:true,storageReadback:true,changes,backup:r.originalBackupFile});console.log(JSON.stringify({ok:true,storageReadback:true,updated:changes.map(c=>c.name)}));
}else{
 write('GEO_Gemini更新_20261012_导入包.json',pack);
 const full={...pack,libraries:next.libraries.map(l=>({id:l.id,name:l.name,note:l.note,directions:l.directions,profile:profileForLibrary(next,l.id)}))};
 write('三岗位资料库导入包.json',{...full,libraries:full.libraries.filter(l=>!l.id.startsWith('lib_'))});write('默认资料库导入包.json',{...full,libraries:full.libraries.filter(l=>l.id.startsWith('lib_'))});
 for(const l of pack.libraries){
  const t=l.id.startsWith('lib_')?'default':l.id.split('_')[1],p=l.profile;
  write(t==='default'?'default_通用完整资料.json':`${t}_岗位资料.json`,{kind:'application-form-assistant/profile',version:1,profile:p});
  // Refresh only corresponding snippets in existing full-copy exports.
  for(const file of t==='default'?['默认资料库_复制粘贴.txt','默认资料库_完整内容.md','默认资料库_新版描述预览.md']:[`${t}_资料库_复制粘贴.txt`,`${t}_新版描述预览.md`,`${t}_资料库内容预览.md`]){
   const target=path.join(dir,file);if(fs.existsSync(target))write(file,update(fs.readFileSync(target,'utf8')));
  }
 }
 write('GEO_Gemini更新_20261012_导入前校验.json',{ok:true,changes});console.log(JSON.stringify({ok:true,updated:changes.map(c=>c.name)}));
}
