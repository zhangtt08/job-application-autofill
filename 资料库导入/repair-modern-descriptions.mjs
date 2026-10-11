import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateProfile} from '../src/profile/schema.ts';
import {repairProfileShape, profileForLibrary, selectLibraryForDirection} from '../src/profile/libraryStore.ts';
import {resolveValue} from '../src/profile/profileResolver.ts';

const dir=path.dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const write=(name,value)=>fs.writeFileSync(path.join(dir,name),typeof value==='string'?value:JSON.stringify(value,null,2),'utf8');
const legacyKeys=['descriptionLong','descriptionMedium','descriptionShort'];
const pick=(...values)=>values.find(v=>typeof v==='string'&&v.trim())||'';
const sourceText=e=>pick(e.description,...legacyKeys.map(k=>e[k]),...Object.values(e.variants||{}),e.workContent);
const files=new Map([
 ['lib_muwnihzl_f2wjsle6','default_通用完整资料.json'],
 ['ztt_app_20261006','app_岗位资料.json'],
 ['ztt_aigc_20261006','aigc_岗位资料.json'],
 ['ztt_ops_20261006','ops_岗位资料.json'],
]);
const original=read('读取当前资料库.json');
const before=original['afa.profiles.v2'];
assert.equal(before.shared.basic.name,'张天腾');
assert.equal(before.libraries.length,4);
for(const lib of before.libraries)assert(files.has(lib.id),`未识别的资料库 ${lib.name}`);

export function verifyRepair(store,baseline){
 assert.deepEqual(store.shared,baseline.shared);
 assert.equal(store.activeLibraryId,baseline.activeLibraryId);
 assert.equal(store.libraries.length,baseline.libraries.length);
 const details=[];
 for(const lib of store.libraries){
   const old=baseline.libraries.find(l=>l.id===lib.id);
   assert(old);
   const meta=l=>Object.fromEntries(Object.entries(l).filter(([k])=>!['content','updatedAt'].includes(k)));
   assert.deepEqual(meta(lib),meta(old));
   const p=profileForLibrary(store,lib.id);
   const checked=validateProfile(structuredClone(p));
   assert(checked.ok,checked.errors?.join('; '));
   const repaired=repairProfileShape(p);
   for(const [collection,field] of [['internships','internship.description'],['projects','project.description'],['campus','campus.description']]){
     assert.equal(p[collection].length,old.content[collection].length);
     for(const [index,e] of p[collection].entries()){
       const prev=old.content[collection][index];
       const expected=sourceText(prev);
       assert.equal(e.description,expected,`${lib.name} ${collection}[${index}] 内容遗漏`);
       assert(e.description.startsWith('1. '),'保留编号长版');
       assert(legacyKeys.every(k=>!(k in e)),'不残留旧版三描述字段');
       const omit=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['description',...legacyKeys].includes(k)));
       assert.deepEqual(omit(e),omit(prev),'经历信息与辅助文本不得改变');
       assert.equal(resolveValue(field,p,{entryIndex:index,profileType:'general'})?.value,e.description);
       assert.equal(resolveValue(field,repaired,{entryIndex:index,profileType:'general'})?.value,e.description,'新版读盘后描述仍存在');
       for(const direction of lib.directions)assert(resolveValue(field,p,{entryIndex:index,profileType:direction})?.value?.trim(),'岗位方向描述可读取');
     }
   }
   for(const [key,value] of Object.entries(p.content)){
     const prev=old.content.content[key];
     const expected=typeof prev==='string'?prev:pick(prev.long,prev.medium,prev.short);
     assert.equal(value,expected);
     assert.equal(typeof value,'string');
     assert(value.startsWith('1. '));
     assert.equal(resolveValue(`content.${key}`,repaired)?.value,value);
   }
   for(const key of Object.keys(lib.content).filter(k=>!['internships','projects','campus','content'].includes(k)))assert.deepEqual(lib.content[key],old.content[key]);
   const deps={'优矩互动科技有限公司':'达人运营部','重庆青天特克科技有限公司':'IP部','重庆蔡同水务有限公司':'行政部'};
   assert.equal(p.internships.length,3);
   for(const e of p.internships)assert.equal(e.department,deps[e.company]);
   assert.equal(p.campus[0].organization,'重庆交通大学青年志愿者协会');
   for(const direction of lib.directions)assert.equal(selectLibraryForDirection(store,direction).id,lib.id);
   details.push({name:lib.name,projects:p.projects.length,internships:p.internships.length,campus:p.campus.length,nonemptyDescriptions:p.projects.length+p.internships.length+p.campus.length,textFields:Object.keys(p.content).length});
 }
 return {libraries:details,sharedAndMetadataPreserved:true,numberedFullDescriptions:true,newSchemaValidated:true,resolverValidated:true};
}

if(process.argv.includes('--verify-receipt')){
 const receipt=read('描述修复_导入回执.json');
 const backup=read(receipt.originalBackupFile);
 const report=verifyRepair(receipt.store,backup['afa.profiles.v2']);
 assert.deepEqual(receipt.mirror,profileForLibrary(receipt.store,receipt.store.activeLibraryId));
 write('描述修复_校验报告.json',{...report,storageReadback:true,verifiedAt:new Date().toISOString(),originalBackupFile:receipt.originalBackupFile});
 console.log(JSON.stringify({...report,storageReadback:true}));
}else{
 const next=structuredClone(before);
 for(const lib of next.libraries){
   for(const collection of ['internships','projects','campus'])for(const e of lib.content[collection]){
     e.description=sourceText(e);
     assert(e.description,`缺少可恢复正文 ${lib.name} ${e.name||e.company||e.organization}`);
     for(const key of legacyKeys)delete e[key];
   }
   for(const [key,value] of Object.entries(lib.content.content))lib.content.content[key]=typeof value==='string'?value:pick(value.long,value.medium,value.short);
 }
 const report=verifyRepair(next,before);
 const pack={descriptionOnly:true,preserveShared:true,preserveExistingLibraries:true,activeLibraryId:next.activeLibraryId,expectedStoreSha256:createHash('sha256').update(stable(before)).digest('hex'),libraries:next.libraries.map(l=>({id:l.id,name:l.name,directions:l.directions,note:l.note,profile:profileForLibrary(next,l.id)}))};
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backupDir=path.join(dir,`单描述字段修复前备份_${stamp}`);
 fs.mkdirSync(backupDir);
 for(const file of [...files.values(),'三岗位资料库导入包.json','默认资料库导入包.json','读取当前资料库.json'])if(fs.existsSync(path.join(dir,file)))fs.copyFileSync(path.join(dir,file),path.join(backupDir,file));
 write('四资料库_描述修复导入包.json',pack);
 for(const l of pack.libraries){
   write(files.get(l.id),{kind:'application-form-assistant/profile',version:1,profile:l.profile});
   const text=[`# ${l.name}`,'','## 实习经历',...l.profile.internships.flatMap(e=>[`\n### ${e.company}｜${e.department}｜${e.position||e.role}`,`${e.startDate} - ${e.endDate}`,e.description]),'','## 项目经历',...l.profile.projects.flatMap(e=>[`\n### ${e.name}｜${e.role}`,`${e.startDate} - ${e.endDate}`,e.description]),'','## 校园经历',...l.profile.campus.flatMap(e=>[`\n### ${e.organization}｜${e.department}｜${e.position}`,`${e.startDate} - ${e.endDate}`,e.description]),...Object.entries(l.profile.content).flatMap(([k,v])=>[`\n## ${k}`,v])].join('\n\n');
   write(l.id.startsWith('lib_')?'默认资料库_新版描述预览.md':`${files.get(l.id).split('_')[0]}_新版描述预览.md`,text);
 }
 const rolePack=read('三岗位资料库导入包.json');
 for(const l of rolePack.libraries){const modern=pack.libraries.find(x=>x.id===l.id);assert(modern);l.profile=modern.profile;}
 write('三岗位资料库导入包.json',rolePack);
 const defaultPack=read('默认资料库导入包.json');
 const modernDefault=pack.libraries.find(l=>l.id.startsWith('lib_'));
 assert.equal(defaultPack.libraries[0].id,modernDefault.id);
 defaultPack.libraries[0].profile=modernDefault.profile;
 write('默认资料库导入包.json',defaultPack);
 write('描述修复_导入前校验.json',{...report,storageReadback:false,backupDirectory:path.basename(backupDir),verifiedAt:new Date().toISOString()});
 console.log(JSON.stringify(report));
}
