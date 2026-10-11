import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProfile} from './installed-profile-schema.mjs';
import {resolveValue} from './installed-profile-resolver.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const pack=read('默认资料库导入包.json');
const candidate=process.argv.includes('--candidate');
const library=pack.libraries[0];
const receipt=candidate?null:read('默认资料库_导入回执.json');
const saved=candidate?null:receipt.store.libraries.find(l=>l.id===library.id);
if(!candidate&&!saved)throw Error('未从插件读回默认资料库');
const profile=candidate?library.profile:{...receipt.store.shared,...saved.content};
const valid=validateProfile(structuredClone(profile));if(!valid.ok)throw Error(valid.errors.join('; '));
if(profile.projects.length!==10||profile.internships.length!==3||profile.campus.length!==1)throw Error('完整经历数量不一致');
if(new Set(profile.projects.map(e=>e.name)).size!==10)throw Error('重复项目');
for(const [company,department] of Object.entries({'优矩互动科技有限公司':'达人运营部','重庆青天特克科技有限公司':'IP部','重庆蔡同水务有限公司':'行政部'}))if(profile.internships.find(e=>e.company===company)?.department!==department)throw Error('实习部门错误');
if(profile.campus[0].organization!=='重庆交通大学青年志愿者协会')throw Error('志愿者经历遗漏');
for(const [collection,field] of [['projects','project.description'],['internships','internship.description'],['campus','campus.description']]){
 for(const [entryIndex,e] of profile[collection].entries()){
  if(e.descriptionShort!==e.descriptionLong||e.descriptionMedium!==e.descriptionLong)throw Error('存在缩短描述');
  for(const text of Object.values(e.variants))if(text!==e.descriptionLong)throw Error('岗位变体不是长版');
  for(const key of ['descriptionLong','responsibilities','workContent','achievements','summary'])if(!e[key].startsWith('1. '))throw Error('未使用编号长版');
  for(const maxLength of [null,120,350,2000])if(resolveValue(field,profile,{entryIndex,maxLength,profileType:'general'})?.value!==e.descriptionLong)throw Error('默认描述无法正确读取');
 }
}
for(const [key,block] of Object.entries(profile.content)){
 if(block.short!==block.long||block.medium!==block.long||!block.long.startsWith('1. '))throw Error(`内容栏 ${key} 非完整长版`);
 if(resolveValue(`content.${key}`,profile)?.value!==block.long)throw Error(`内容栏 ${key} 读取失败`);
}
if(/玩游戏|游戏体验|原神|鸣潮|明日方舟|赛博朋克|不冒充|不编造|不自称|不以模糊|学习委员/.test(JSON.stringify(profile)))throw Error('无关内容进入默认库');
if(!candidate){
 const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 if(!receipt.originalBackupFile||path.basename(receipt.originalBackupFile)!==receipt.originalBackupFile)throw Error('缺少导入前原数据备份');
 const old=read(receipt.originalBackupFile)['afa.profiles.v2'];
 for(const before of old.libraries.filter(l=>l.id.startsWith('ztt_'))){
  const after=receipt.store.libraries.find(l=>l.id===before.id);
  if(stable(before)!==stable(after))throw Error(`岗位库改变：${before.name}`);
 }
 if(receipt.store.activeLibraryId!==library.id)throw Error('默认资料库没有切换为当前库');
}
const report={verifiedAt:new Date().toISOString(),extensionStorageReadback:!candidate,projects:10,internships:3,campus:1,skillCategories:profile.skills.technical.length,numberedLongDescriptions:true,roleLibrariesUnchanged:candidate?'待保存后校验':true};
fs.writeFileSync(path.join(dir,candidate?'默认资料库_导入前校验.json':'默认资料库_校验报告.json'),JSON.stringify(report,null,2),'utf8');
console.log(JSON.stringify(report,null,2));
