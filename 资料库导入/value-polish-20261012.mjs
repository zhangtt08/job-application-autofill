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
const snapshot=read('读取当前资料库.json');
const before=snapshot['afa.profiles.v2'];
assert(before?.libraries?.length===4);
const next=structuredClone(before);
const track=l=>l.id.startsWith('lib_')?'default':l.id.split('_')[1];
const bodyFields=['description','responsibilities','workContent','achievements','summary','background'];
const changes=[];
const rules=[
 ['自研能力标准化与复用：将 17 个自研项目、100+ 个工具接口接入统一 MCP／HTTP 中枢，集中提供工具发现、参数与调用路由、结果回传及服务按需启动；各应用保留独立 API／UI，既可单独使用，也可由 Agent 根据任务组合调用，减少跨软件切换和重复接入。',
  '工具标准化与能力复用：将 17 个自研项目、100+ 个工具接口整合为可复用工具体系，通过 MCP／HTTP 中枢统一工具发现、参数契约、调用路由与结果回传，按任务需要启动服务；各应用保留独立 API／UI，可独立使用或由 Agent 组合调用，将单个软件能力复用于不同任务，减少跨软件切换和重复接入。'],
 ['从业务经验到可执行规则：协同素材管理、达人运营及媒介明确客户 Brief、标签标准和交付要求，将常见素材配套关系、文件名与 Excel 字段映射、标签冲突及边界样本沉淀为 Prompt、可复用 Skill、规则文档与操作说明。',
  '业务经验沉淀与规则资产化：协同素材管理、达人运营及媒介明确客户 Brief、标签标准和交付要求，将分散在人员经验中的素材配套关系、标签判断与边界案例沉淀为 Prompt、可复用 Skill、规则文档及操作说明；结合文件名与 Excel 字段建立可执行映射，支持规则维护、复用与问题追溯，减少重复解释和逐项人工判断。'],
 ['跨业务协作与需求管理：对接素材管理、达人运营及媒介，明确客户 Brief、标签规则与交付标准；维护需求清单和功能优先级，将变更沉淀为规则文档、Prompt、Skill 与操作说明，减少分散口头经验对交付的影响。',
  '跨业务需求对齐与规则资产运营：对接素材管理、达人运营及媒介，明确客户 Brief、标签规则与交付标准，维护需求清单和功能优先级；将分散的判断经验、边界条件与业务变更沉淀为可维护的规则文档、Prompt、Skill 及操作说明，支持按项目更新、复用与问题追溯，减少重复沟通及口径差异。'],
 ['知识库运营与质量迭代：按项目维护隔离的 RAG 规则库，保留规则来源和检索依据；依据人工样本、随机抽检、误判回溯与审核反馈优化 Prompt、规则及切分方式，规则更新不再依赖反复重写主流程。',
  '规则知识运营与质量闭环：按项目维护相互隔离的 RAG 规则库，保留规则来源与检索依据；将人工样本、随机抽检、误判回溯及审核反馈转为规则、Prompt 与切分方式的改进，业务规则变化时更新对应知识库而非重写主流程，使经验能够被持续维护并用于后续任务。'],
 ['素材标准与业务协作：与素材管理、达人运营和媒介对齐分类、配套关系及边界条件，将文件名、字段及业务经验整理为规则文档、Prompt 和 Skill，支持不同项目的素材识别、数据匹配与交付。',
  '素材标准沉淀与协同交付：与素材管理、达人运营和媒介对齐分类、配套关系及边界条件，将人员经验和文件字段中的判断依据沉淀为可维护的规则文档、Prompt 与 Skill；按项目组织素材识别、数据匹配和交付标准，使分类方法能够复用、更新与追溯。'],
 ['广告创意与制作策略：围绕产品信息、目标受众和传播目的拆解卖点，组织创意脚本、镜头节奏及声音表达；根据目标画面选择图像 / 视频模型、Agent 驱动程序化动画或传统后期，而不是先生成大量素材再拼接。',
  '创意策划与成片交付：围绕产品卖点、目标受众和传播目的确定脚本、镜头、视觉及声音标准，主导创意定义、制作方法选择与成片验收；按镜头任务组合图像 / 视频模型、Agent 驱动程序化动画和传统后期，完成素材筛选、镜头衔接、节奏组织及音画整合，形成从创意到完整成片的制作流程。'],
 ['独立完成可公开展示的产品概念广告、动画叙事、程序化动效和音画作品，形成创意定义、制作方法选择、素材筛选、后期整合及成片检查的完整实践。',
  '独立交付可公开展示的产品概念广告、动画叙事、程序化动效和音画作品，覆盖创意定义、脚本与镜头组织、生成方法选择、素材筛选、后期整合及成片验收；能够依据传播目的判断生成素材是否可用，而不只展示单次模型生成效果。'],
 ['创意定义与表达判断：能将产品卖点、受众和传播目的转为脚本、镜头与声音设计，既有广告学训练，也熟练使用传统后期工具，不只会输入提示词生成素材。',
  '创意主导与交付判断：能将产品卖点、受众场景与传播目的转为脚本、镜头及视听标准，组合生成模型与传统后期完成素材筛选、节奏组织和成片验收；兼具广告学训练与后期经验，能够判断生成结果是否满足表达目的。'],
];
const gemini='Gemini 实测亦可检索到个人信息。';
function enhance(text){
 let result=text;
 for(const [old,value] of rules)result=result.split(old).join(value);
 return result;
}
function geo(text){
 return text.split('\n').map(line=>/Google/.test(line)&&/ChatGPT/.test(line)&&!line.includes('Gemini')?line.replace(/[。；;\s]+$/,'')+'；'+gemini:line).join('\n');
}
function changeStrings(obj,fn,where,lib){
 for(const [key,value]of Object.entries(obj)){
  if(typeof value!=='string')continue;
  const updated=fn(value);
  if(updated!==value){obj[key]=updated;changes.push({library:lib.name,field:`${where}.${key}`});}
 }
}
for(const lib of next.libraries){
 const c=lib.content;
 changeStrings(c.content,s=>geo(enhance(s)),'content',lib);
 for(const group of ['internships','projects'])for(const [i,e]of c[group].entries()){
  const relevant=group==='internships'?e.company==='优矩互动科技有限公司':/Tcode|AIGC 视频|广告素材|企业素材|SEO\s*\/\s*GEO/.test(e.name);
  if(!relevant)continue;
  const fn=s=>/SEO\s*\/\s*GEO/.test(e.name||'')?geo(enhance(s)):enhance(s);
  const selected=Object.fromEntries(bodyFields.filter(k=>typeof e[k]==='string').map(k=>[k,e[k]]));
  changeStrings(selected,fn,`${group}[${i}]`,lib);Object.assign(e,selected);
  if(e.variants)changeStrings(e.variants,fn,`${group}[${i}].variants`,lib);
  for(const key of ['descriptionShort','descriptionMedium','descriptionLong'])if(typeof e[key]==='string'){
   const value=fn(e[key]);if(value!==e[key]){e[key]=value;changes.push({library:lib.name,field:`${group}[${i}].${key}`});}
  }
 }
}
assert(changes.length>0);
const numericTokens=s=>s.match(/\d+(?:\.\d+)?/g)||[];
const reports=[];
for(const lib of next.libraries){
 const old=before.libraries.find(l=>l.id===lib.id),p=profileForLibrary(next,lib.id),prior=profileForLibrary(before,lib.id);
 const checked=validateProfile(structuredClone(p));assert(checked.ok,checked.errors?.join(';'));
 assert.deepEqual(p.basic,prior.basic);assert.deepEqual(p.education,prior.education);assert.deepEqual(p.sensitive,prior.sensitive);
 assert.deepEqual(p.campus,prior.campus);assert.deepEqual(p.skills,prior.skills);assert.deepEqual(p.jobPreferences,prior.jobPreferences);
 assert.deepEqual(p.careerPreferences,prior.careerPreferences);assert.equal(p.content.hobbies,prior.content.hobbies);
 assert.equal(p.internships.length,3);assert.equal(p.projects.length,prior.projects.length);
 assert(p.skills.technical.join('\n').length<=1000);
 const repaired=repairProfileShape(p);
 for(const group of ['internships','projects'])for(const [i,e]of p[group].entries()){
  const prev=prior[group][i];
  for(const key of Object.keys(prev).filter(k=>!bodyFields.includes(k)&&k!=='variants'&&!/^description(?:Short|Medium|Long)$/.test(k)))assert.deepEqual(e[key],prev[key],`${lib.id}.${group}.${i}.${key}`);
  for(const k of [...bodyFields,'descriptionShort','descriptionMedium','descriptionLong'])if(typeof e[k]==='string'){
   assert(!/\*\*|\n\s*\n/.test(e[k]));
   assert.deepEqual(numericTokens(e[k]),numericTokens(prev[k]),'Metric or numbering changed');
   if(prev[k]?.length)assert(e[k].length>=prev[k].length*.95,'Detailed text unexpectedly shortened');
   if(/^1\. /.test(e[k]))e[k].split('\n').forEach((line,n)=>assert(line.startsWith(`${n+1}. `),'Numbering inconsistent'));
  }
  const field=group==='internships'?'internship.description':'project.description';
  assert.equal(resolveValue(field,repaired,{entryIndex:i,profileType:'general'})?.value,e.description);
  for(const direction of lib.directions)assert.equal(resolveValue(field,repaired,{entryIndex:i,profileType:direction})?.value,e.variants[direction]);
 }
 assert.deepEqual(old.directions,lib.directions);
 reports.push({id:lib.id,name:lib.name,projects:p.projects.length,internships:p.internships.length,campus:p.campus.length,skillsCharacters:p.skills.technical.join('\n').length,changedFields:changes.filter(c=>c.library===lib.name).length});
}
assert.deepEqual(next.shared,before.shared);assert.equal(next.activeLibraryId,before.activeLibraryId);
assert(reports.every(r=>r.changedFields>0));
const receiptFile='价值表达更新_20261012_导入回执.json';
const pack={kind:'ztt/application-form-assistant/role-library-pack',version:1,generatedAt:new Date().toISOString(),preserveProfileShape:true,preserveShared:true,preserveExistingLibraries:true,activeLibraryId:before.activeLibraryId,expectedStoreSha256:createHash('sha256').update(stable(before)).digest('hex'),receiptFile,libraries:next.libraries.map(l=>({id:l.id,name:l.name,note:l.note,directions:l.directions,profile:profileForLibrary(next,l.id)}))};
if(process.argv.includes('--verify-receipt')){
 const r=read(receiptFile),expected=structuredClone(next);assert(r.ok);
 for(const l of expected.libraries)l.updatedAt=r.store.libraries.find(x=>x.id===l.id).updatedAt;
 assert.deepEqual(r.store,expected);assert.deepEqual(r.mirror,profileForLibrary(r.store,r.store.activeLibraryId));
 write('价值表达更新_20261012_校验报告.json',{ok:true,storageReadback:true,sharedPreserved:true,activeLibraryPreserved:true,backup:r.originalBackupFile,libraries:reports,changes});
 console.log(JSON.stringify({ok:true,storageReadback:true,libraries:reports}));
}else{
 write('价值表达更新_20261012_导入包.json',pack);
 write('三岗位资料库导入包.json',{...pack,libraries:pack.libraries.filter(l=>track(l)!=='default')});
 write('默认资料库导入包.json',{...pack,libraries:pack.libraries.filter(l=>track(l)==='default')});
 for(const l of pack.libraries){
  const t=track(l),p=l.profile;
  write(t==='default'?'default_通用完整资料.json':`${t}_岗位资料.json`,{kind:'application-form-assistant/profile',version:1,profile:p});
  const parts=[l.name,'个人介绍',p.content.selfIntroduction,'个人优势',p.content.personalAdvantages,'专业技能（1000字以内）',p.skills.technical.join('\n'),'实习经历'];
  for(const e of p.internships)parts.push(`${e.startDate} - ${e.endDate} ${e.company}｜${e.department}｜${e.position}`,'经历描述',e.description,'工作职责',e.responsibilities,'工作内容',e.workContent,'工作业绩',e.achievements,'实习总结',e.summary);
  parts.push('项目经历');
  for(const e of p.projects)parts.push(`${e.startDate} - ${e.endDate} ${e.name}｜${e.role}`,'项目背景',e.background,'项目描述',e.description,'项目职责',e.responsibilities,'项目内容',e.workContent,'项目成果',e.achievements,'项目概述',e.summary);
  parts.push('校园经历');for(const e of p.campus)parts.push(`${e.startDate} - ${e.endDate} ${e.organization}｜${e.department}｜${e.position}`,e.description);
  parts.push('自我评价',p.content.selfEvaluation,'职业规划',p.content.careerPlan,'兴趣爱好',p.content.hobbies);
  const text=parts.filter(v=>v!==undefined&&v!==null&&v!=='').join('\n');assert(!/\*\*|\n\s*\n/.test(text));
  for(const file of t==='default'?['默认资料库_复制粘贴.txt','默认资料库_完整内容.md','默认资料库_新版描述预览.md']:[`${t}_资料库_复制粘贴.txt`,`${t}_新版描述预览.md`,`${t}_资料库内容预览.md`])write(file,text);
 }
 write('价值表达更新_20261012_导入前校验.json',{ok:true,sharedPreserved:true,activeLibraryPreserved:true,libraries:reports,changes});
 console.log(JSON.stringify({ok:true,libraries:reports}));
}
