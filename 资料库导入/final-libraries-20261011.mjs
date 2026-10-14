import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateProfile} from '../src/profile/schema.ts';
import {profileForLibrary,repairProfileShape} from '../src/profile/libraryStore.ts';
import {resolveValue} from '../src/profile/profileResolver.ts';

const dir=path.dirname(fileURLToPath(import.meta.url));
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const write=(f,v)=>fs.writeFileSync(path.join(dir,f),typeof v==='string'?v:JSON.stringify(v,null,2),'utf8');
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const numbered=a=>a.filter(Boolean).map((s,i)=>`${i+1}. ${s}`).join('\n');
const points=s=>(s||'').split('\n').filter(Boolean).map(s=>s.replace(/^\d+[.、]\s*/,''));
const before=read('读取当前资料库.json')['afa.profiles.v2'];
assert.equal(before.shared.basic.name,'张天腾');
const next=structuredClone(before);
const directions=['agent','aiApplication','aiProduct','aiOperation','aiSolution','aigcMarketing'];
const track=l=>l.id.startsWith('lib_')?'default':l.id.split('_')[1];
const fileNames={default:'default_通用完整资料.json',app:'app_岗位资料.json',aigc:'aigc_岗位资料.json',ops:'ops_岗位资料.json'};
const revise=(e,work,results=points(e.achievements))=>{
 e.workContent=numbered(work);e.responsibilities=numbered(work);
 e.achievements=numbered(results);e.description=numbered([...work,...results.map(s=>'实际成果：'+s)]);
 e.summary=numbered([work[0],...results]);
 for(const k of ['descriptionShort','descriptionMedium','descriptionLong'])if(k in e)e[k]=e.description;
 e.variants=Object.fromEntries(directions.map(k=>[k,e.description]));
};
const native='AI Native 应用方法：从真实任务识别低效流程，独立主导需求拆解、方案选型、优先级与结果验收，借助 Agent 与 Vibe Coding 开发并迭代 20+ 款软件及自动化工具；将个人操作经验沉淀为规则、Skill 和可复用应用，而非只停留于使用聊天工具。';
const hub='自研能力标准化与复用：将 17 个自研项目、100+ 个工具接口接入统一 MCP／HTTP 中枢，集中提供工具发现、参数与调用路由、结果回传及服务按需启动；各应用保留独立 API／UI，既可单独使用，也可由 Agent 根据任务组合调用，减少跨软件切换和重复接入。';
const hubResult='形成 Tcode 自然语言入口与统一 MCP／HTTP 调用中枢，当前纳管 17 个自研项目、100+ 个工具接口；把分散的软件能力组织为可发现、可组合调用的工具体系，避免全部子服务同时常驻。';
const cloud='模型部署与工作流实践：在云服务器完成 MiniMax H3 部署并用于视频生成，实践节点式 AIGC 工作流与画布操作；根据不同题材组织生成、筛选与后期整合，完成 Vlog、人物广告、静物产品广告等完整短片。';
const qWork={
 app:[
 'AI 辅助内容生产：面向仪器仪表口播、科普及信息流视频，将资料整理、AI 生图和配音融入素材准备、剪辑、字幕、音效与视觉包装，实际用于视频制作和发布；本人负责信息选择、画面适配及输出检查。',
 'Prompt 与素材方法沉淀：整理日常可复用 Prompt，按内容主题和用途分类归档生成素材与剪辑资料，将实际使用中的制作方法沉淀为后续同类内容的参考。',
 '内容反馈与持续交付：参与选题、排期和账号发布，结合播放、完播及互动数据调整信息结构、表达重点与剪辑节奏，保持约 5 条/周、20 条/月的内容产出。'],
 aigc:[
 'AI 素材与声音制作：围绕仪器仪表口播、科普及信息流内容，使用 AI 整理产品资料、生成辅助图片和配音，将生成结果融入视频而非停留于试用；检查信息表达、画面用途及配音与内容的匹配。',
 '传统后期与成片交付：完成素材整理、剪辑、字幕、音效及基础视觉包装，把生成素材与真实素材整合为可发布视频，保持约 5 条/周、20 条/月的制作节奏。',
 '创作方法复用与复盘：整理常用 Prompt 并按主题、用途分类管理素材，参与选题与发布；根据播放、完播与互动反馈优化选题表达、剪辑节奏及生成素材的使用方式。'],
 ops:[
 'AI 内容应用与发布：围绕仪器仪表行业选题和传播需求，将 AI 资料整理、生图与配音接入口播、科普及信息流制作流程，参与内容排期、账号发布和维护，保持约 5 条/周、20 条/月产出。',
 '内容资产与方法管理：整理常用 Prompt，按主题与用途分类归档生成图片、配音及剪辑素材，将内容制作中积累的方法用于后续相似主题，支持素材检索与复用。',
 '内容数据与表达迭代：跟踪播放、完播及互动反馈，结合主题、信息结构与素材条件辅助调整选题方向、标题表达及剪辑节奏，将发布反馈用于后续制作。']
};
const cWork=[
 'AI 辅助资料与图文制作：围绕企业微信公众号和新闻传播，使用 AI 整理资料并生成辅助配图，结合人工编辑、图片筛选与排版形成可发布内容，相关结果已用于公众号传播。',
 '活动影像与新闻支持：参与会议及活动摄影，根据新闻用途筛选照片、完成基础后期并整理事件信息，为公众号、新闻及品牌资料提供现场影像。',
 'Prompt 与宣传资产复用：整理常用 Prompt，分类归档宣传图片、稿件及品牌资料，为后续图文制作提供素材参考，支持企业日常传播与历史资料复用。'
];
for(const lib of next.libraries){
 const t=track(lib),p=profileForLibrary(next,lib.id);
 const q=p.internships.find(e=>e.company==='重庆青天特克科技有限公司');
 const c=p.internships.find(e=>e.company==='重庆蔡同水务有限公司');
 revise(q,qWork[t==='default'?'ops':t],['保持约 5 条/周、20 条/月的短视频交付，AI 生图、配音与资料整理已实际用于视频制作及发布；形成常用 Prompt 与分类素材积累。']);
 revise(c,cWork,['完成约 10 篇公众号图文及新闻内容编辑发布，参与 10+ 场会议和活动摄影；AI 资料整理与辅助配图已用于工作，常用 Prompt 与宣传素材可供后续复用。']);
 for(const e of p.projects){
  if(e.name.includes('Tcode')){
   e.name=t==='ops'?'Tcode 与 MCP 中枢｜AI 任务助手与产品体验优化':'Tcode 与 MCP 中枢｜跨应用 AI 任务系统';
   const work=points(e.workContent).map(s=>s.startsWith('产品定位与系统整合：')?'产品定位与系统整合：针对自研软件分散、操作切换和重复接入问题，独立设计 Tcode 自然语言任务入口，连接已登记的本机自研项目；通过统一中枢发现与调用工具，使对话能够执行任务并返回实际结果，而非仅提供操作建议。':s);
   work.push(hub);
   const results=points(e.achievements).filter(s=>!/14 个|24 个/.test(s));results.unshift(hubResult);
   revise(e,work,results);
  }
  if(/Agent 创作/.test(e.name)){
   const work=points(e.workContent);work.push('创作工具统一接入：将素材准备、视频处理、海报与音频能力纳入统一 MCP／HTTP 中枢，供 Agent 按任务检索和组合调用；各软件继续保留独立使用界面，结合预览、人工接管及实际导出核验交付结果。');
   revise(e,work);
  }
  if(e.name==='AIGC 视频与音画内容创作'){
   const work=points(e.workContent).map(s=>s.startsWith('程序化动效与方法选择：')?'创意定义与生成验收：《只写代码》中将日常 After Effects 经验转为多主体动画、转场和节奏要求，主导创意脚本及成片验收；借助 Agent 生成 JavaScript 动画并直接渲染，约 1 小时完成 AE 风格视频，检查衔接、运动及细节，验证代码生成与传统动效的适用边界。':s);
   work.push(cloud);revise(e,work);
  }
 }
 const adv=points(p.content.personalAdvantages);
 if(t==='aigc')adv.unshift('AI Native 创作方法：本人主导创意、脚本、制作方法选择与成片验收，按镜头任务组织 Prompt、生成、筛选与后期整合；将广告学、After Effects 经验和 Agent 工具结合，兼顾创意表达与可编辑、可检查的交付。');
 else adv[0]=native;
 if(t==='app'||t==='ops'||t==='default')adv.push(hub);
 p.content.personalAdvantages=numbered(adv);
 const intro=points(p.content.selfIntroduction).map(s=>/14 个项目、24 个通用工具/.test(s)?'独立开发 Tcode 跨应用任务入口及 MCP／HTTP 中枢，当前纳管 17 个自研项目、100+ 个工具接口；具有工具契约、资料检索、Token 记录、上下文压缩及模型故障切换实践。':s);
 if(t==='aigc')intro.push('具备云服务器 MiniMax H3 部署及视频生成、节点式工作流和画布实践；完成 Vlog、人物广告、静物产品广告等成片，按作品需要组合生成与传统后期。');
 p.content.selfIntroduction=numbered(intro);
 const skill=points(p.skills.technical.join('\n')).map(s=>{
  if(s.startsWith('Agent 辅助开发：'))return 'AI Native 应用交付：使用 Claude Code、Codex、Cursor 等 Agent 开展 Vibe Coding；主导需求拆解、方案选型与验收，累计开发 20+ 款软件工具；17 个自研项目、100+ 接口接入统一 MCP／HTTP 中枢。';
  if(s.startsWith('AIGC：'))return 'AIGC 创作：使用 Pavo AI、Midjourney、Suno、Fish Audio 等工具及 Seedance、Veo、MiniMax、Nano Banana、GPT Image 等模型；具备 MiniMax H3 云服务器部署、视频生成与节点式工作流实践，主导创意脚本及成片验收。';
  return s;
 });
 p.skills.technical=[numbered(skill)];
 lib.content=Object.fromEntries(Object.entries(p).filter(([k])=>!['basic','education','sensitive'].includes(k)));
 lib.note='2026.10.11 最终更新：AI Native 业务主导、统一 MCP 中枢、AI 内容实习、创意验收与部署实践；长描述按岗位分点，保留三段实习与志愿者经历。';
}
// Keep comprehensive default text and refresh its role-specific variants.
const defaultLib=next.libraries.find(l=>track(l)==='default');
const kind=e=>e.name?.includes('Tcode')?'tcode':/Agent 创作/.test(e.name||'')?'suite':/AIGC 视频/.test(e.name||'')?'video':e.name;
for(const group of ['internships','projects'])for(const e of defaultLib.content[group]){
 for(const [t,keys]of [['app',['agent','aiApplication','aiSolution']],['ops',['aiProduct','aiOperation']],['aigc',['aigcMarketing']]]){
  const match=next.libraries.find(l=>track(l)===t).content[group].find(v=>group==='internships'?v.company===e.company:kind(v)===kind(e));
  if(match)for(const k of keys)e.variants[k]=match.description;
 }
}
function verify(store){
 assert.deepEqual(store.shared,before.shared);assert.equal(store.activeLibraryId,before.activeLibraryId);assert.equal(store.libraries.length,before.libraries.length);
 const reports=[];
 for(const l of store.libraries){
  const p=profileForLibrary(store,l.id),old=profileForLibrary(before,l.id),v=validateProfile(structuredClone(p));assert(v.ok,v.errors?.join(';'));
  assert.deepEqual(p.campus,old.campus);assert.deepEqual(p.jobPreferences,old.jobPreferences);assert.equal(p.content.hobbies,old.content.hobbies);
  assert.equal(p.projects.length,old.projects.length);assert.equal(p.internships.length,3);
  const repaired=repairProfileShape(p);
  for(const group of ['internships','projects'])for(const [i,e] of p[group].entries()){
   const prior=old[group][i];for(const k of ['startDate','endDate','department','position','role'])assert.equal(e[k],prior[k]);
   for(const k of ['description','responsibilities','workContent','achievements','summary']){assert(e[k]?.startsWith('1. '));assert(!/\*\*|\n\s*\n/.test(e[k]));}
   const field=group==='internships'?'internship.description':'project.description';
   assert.equal(resolveValue(field,repaired,{entryIndex:i,profileType:'general'})?.value,e.description);
   for(const d of l.directions)assert.equal(resolveValue(field,repaired,{entryIndex:i,profileType:d})?.value,e.variants[d]);
  }
  const skill=p.skills.technical.join('\n');assert(skill.length<=1000,`${l.name} 技能 ${skill.length} 字`);
  assert.equal(resolveValue('skills.technical',repaired)?.value,skill);
  assert(!/14 个项目|24 个通用工具|14 个登记项目/.test(JSON.stringify(p)),'旧工具数量未清除');
  assert(p.internships[1].description.includes('配音'));assert(p.internships[2].description.includes('Prompt'));
  reports.push({id:l.id,name:l.name,projects:p.projects.length,internships:3,campus:p.campus.length,skillsCharacters:skill.length});
 }
 return reports;
}
const reports=verify(next);
const receiptFile='最终资料库更新_20261011_导入回执.json';
const expectedStore=process.argv.includes('--rebase-receipt')?read(receiptFile).store:before;
const pack={kind:'ztt/application-form-assistant/role-library-pack',version:1,generatedAt:new Date().toISOString(),preserveProfileShape:true,preserveShared:true,preserveExistingLibraries:true,activeLibraryId:before.activeLibraryId,expectedStoreSha256:createHash('sha256').update(stable(expectedStore)).digest('hex'),receiptFile,libraries:next.libraries.map(l=>({id:l.id,name:l.name,directions:l.directions,note:l.note,profile:profileForLibrary(next,l.id)}))};
if(process.argv.includes('--verify-receipt')){
 const receipt=read(receiptFile),expected=structuredClone(next);assert.equal(receipt.ok,true);
 for(const l of expected.libraries)l.updatedAt=receipt.store.libraries.find(v=>v.id===l.id).updatedAt;
 assert.deepEqual(receipt.store,expected);assert.deepEqual(receipt.mirror,profileForLibrary(receipt.store,receipt.store.activeLibraryId));verify(receipt.store);
 write('最终资料库更新_20261011_校验报告.json',{ok:true,storageReadback:true,sharedPreserved:true,activeLibraryPreserved:true,libraries:reports,backup:receipt.originalBackupFile});console.log(JSON.stringify({ok:true,storageReadback:true,libraries:reports}));
}else{
 write('最终资料库更新_20261011_导入包.json',pack);
 write('三岗位资料库导入包.json',{...pack,libraries:pack.libraries.filter(l=>track(l)!=='default')});write('默认资料库导入包.json',{...pack,libraries:pack.libraries.filter(l=>track(l)==='default')});
 for(const l of pack.libraries){
  const t=track(l),p=l.profile;write(fileNames[t],{kind:'application-form-assistant/profile',version:1,profile:p});
  const parts=[l.name,'个人介绍',p.content.selfIntroduction,'个人优势',p.content.personalAdvantages,'专业技能（1000字以内）',p.skills.technical.join('\n'),'实习经历'];
  for(const e of p.internships)parts.push(`${e.startDate} - ${e.endDate} ${e.company}｜${e.department}｜${e.position}`,'经历描述',e.description,'工作职责',e.responsibilities,'工作内容',e.workContent,'工作业绩',e.achievements,'实习总结',e.summary);
  parts.push('项目经历');for(const e of p.projects)parts.push(`${e.startDate} - ${e.endDate} ${e.name}｜${e.role}`,'项目背景',e.background,'项目描述',e.description,'项目职责',e.responsibilities,'项目内容',e.workContent,'项目成果',e.achievements,'项目概述',e.summary);
  parts.push('校园经历');for(const e of p.campus)parts.push(`${e.startDate} - ${e.endDate} ${e.organization}｜${e.department}｜${e.position}`,e.description);
  parts.push('自我评价',p.content.selfEvaluation,'职业规划',p.content.careerPlan,'兴趣爱好',p.content.hobbies);
  const text=parts.join('\n');write(t==='default'?'默认资料库_复制粘贴.txt':`${t}_资料库_复制粘贴.txt`,text);
  write(t==='default'?'默认资料库_完整内容.md':`${t}_新版描述预览.md`,text);write(t==='default'?'默认资料库_新版描述预览.md':`${t}_资料库内容预览.md`,text);
 }
 write('最终资料库更新_20261011_导入前校验.json',{ok:true,libraries:reports,sharedPreserved:true});console.log(JSON.stringify({ok:true,libraries:reports}));
}
