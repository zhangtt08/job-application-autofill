import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateProfile} from '../src/profile/schema.ts';
import {profileForLibrary,repairProfileShape} from '../src/profile/libraryStore.ts';
import {resolveValue} from '../src/profile/profileResolver.ts';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=file=>JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
const write=(file,data)=>fs.writeFileSync(path.join(dir,file),JSON.stringify(data,null,2),'utf8');
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const name='个人品牌网站与 SEO / GEO 运营实践';
const results=[
 'SEO 实际成果：经本人检索验证，Google 直接搜索“张天腾”，个人品牌网站 zhangtianteng.xyz 位列搜索结果首位，实现姓名检索到个人作品与项目入口的直接触达。',
 'GEO 实际成果：在未预先提供域名的条件下，以“张天腾”发起姓名查询，ChatGPT 能够检索并引用个人网站，依据网站公开内容准确回答个人经历与项目信息，验证网站在生成式搜索中的可发现性与引用效果。',
];
const numbered=lines=>lines.map((line,i)=>`${i+1}. ${line}`).join('\n');
const fields=['description','responsibilities','workContent','achievements','summary','variants'];
function updateText(text,full){
 const lines=text.split('\n').map(line=>line.replace(/^\d+\.\s*/,''));
 const validation=lines.findIndex(line=>line.startsWith('搜索与引用验证：'));
 assert(validation>=0,'缺少原验证方法段，拒绝错误覆盖');
 lines[validation]='搜索与引用验证：以本人姓名“张天腾”为测试词，分别在 Google 与 ChatGPT 验证检索表现；ChatGPT 测试不预先提供域名，核对回答引用的网址及个人信息是否准确。';
 if(full){
   const index=lines.findIndex(line=>line.startsWith('项目成果：'));
   assert(index>=0);
   lines.splice(index,lines.length-index,...results);
 }
 return numbered(lines);
}
if(process.argv.includes('--verify')){
 const receipt=read('SEO_GEO成果更新_导入回执.json');
 const before=read(receipt.originalBackupFile)['afa.profiles.v2'];
 const pack=read('SEO_GEO成果更新导入包.json');
 const expected=structuredClone(before);
 for(const change of pack.projectTextUpdates){
   const oldLib=expected.libraries.find(l=>l.id===change.libraryId);
   const lib=receipt.store.libraries.find(l=>l.id===change.libraryId);
   const e=lib.content.projects.find(p=>p.name===name);
   const prev=oldLib.content.projects.find(p=>p.name===name);
   for(const field of fields)prev[field]=e[field];
   oldLib.updatedAt=lib.updatedAt;
   const profile=profileForLibrary(receipt.store,lib.id);
   const valid=validateProfile(structuredClone(profile));assert(valid.ok);
   const repaired=repairProfileShape(profile);
   const index=lib.content.projects.indexOf(e);
   assert.equal(resolveValue('project.description',repaired,{entryIndex:index,profileType:'general'})?.value,e.description);
   for(const type of lib.directions)assert.equal(resolveValue('project.description',repaired,{entryIndex:index,profileType:type})?.value,e.variants[type]);
   assert(e.achievements.includes('位列搜索结果首位')&&e.achievements.includes('未预先提供域名'));
   assert(e.description.includes(results[0])&&e.description.includes(results[1]));
 }
 assert.equal(stable(expected),stable(receipt.store));
 assert.deepEqual(receipt.mirror,profileForLibrary(receipt.store,receipt.store.activeLibraryId));
 const report={ok:true,storageReadback:true,updatedLibraries:pack.libraries.map(l=>l.name),onlyNamedProjectTextChanged:true,otherLibrariesPreserved:true,googleAndChatGPTResultsRecorded:true,backup:receipt.originalBackupFile};
 write('SEO_GEO成果更新_校验报告.json',report);
 console.log(JSON.stringify(report));
 // Refresh exact current profiles; do not resurrect projects removed by the user.
 const files={'lib_muwnihzl_f2wjsle6':'default_通用完整资料.json','ztt_app_20261006':'app_岗位资料.json','ztt_aigc_20261006':'aigc_岗位资料.json','ztt_ops_20261006':'ops_岗位资料.json'};
 const backupDir=path.join(dir,`SEO_GEO成果更新前导出备份_${new Date().toISOString().replace(/[:.]/g,'-')}`);
 fs.mkdirSync(backupDir);
 for(const lib of receipt.store.libraries){
   const file=files[lib.id];assert(file);
   if(fs.existsSync(path.join(dir,file)))fs.copyFileSync(path.join(dir,file),path.join(backupDir,file));
   write(file,{kind:'application-form-assistant/profile',version:1,profile:profileForLibrary(receipt.store,lib.id)});
 }
 for(const file of ['三岗位资料库导入包.json','默认资料库导入包.json']){
   fs.copyFileSync(path.join(dir,file),path.join(backupDir,file));
   const oldPack=read(file);
   for(const l of oldPack.libraries)l.profile=profileForLibrary(receipt.store,l.id);
   write(file,oldPack);
 }
}else{
 const before=read('读取当前资料库.json')['afa.profiles.v2'];
 assert.equal(before.shared.basic.name,'张天腾');
 const next=structuredClone(before);
 const targets=next.libraries.filter(l=>l.content.projects.some(e=>e.name===name));
 assert.equal(targets.length,2);
 for(const lib of targets){
   const p=lib.content.projects.find(e=>e.name===name);
   p.description=updateText(p.description,true);
   p.responsibilities=updateText(p.responsibilities,false);
   p.workContent=updateText(p.workContent,false);
   p.achievements=numbered(results);
   p.summary=numbered([name,...results]);
   for(const key of Object.keys(p.variants))p.variants[key]=updateText(p.variants[key],true);
   const valid=validateProfile(structuredClone(profileForLibrary(next,lib.id)));assert(valid.ok,valid.errors?.join('; '));
 }
 const pack={preserveProfileShape:true,preserveShared:true,preserveExistingLibraries:true,activeLibraryId:before.activeLibraryId,expectedStoreSha256:createHash('sha256').update(stable(before)).digest('hex'),receiptFile:'SEO_GEO成果更新_导入回执.json',projectTextUpdates:targets.map(l=>({libraryId:l.id,projectName:name,fields})),libraries:targets.map(l=>({id:l.id,name:l.name,directions:l.directions,note:l.note,profile:profileForLibrary(next,l.id)}))};
 write('SEO_GEO成果更新导入包.json',pack);
 console.log(JSON.stringify({libraries:targets.map(l=>l.name),results}));
}
