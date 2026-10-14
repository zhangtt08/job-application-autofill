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
const before=read('读取当前资料库.json')['afa.profiles.v2'];
assert.equal(before.libraries.length,4);
const next=structuredClone(before);
const track=l=>l.id.startsWith('lib_')?'default':l.id.split('_')[1];
const bodyFields=['description','responsibilities','workContent','achievements','summary','background'];
const changedIds=new Set();
function append(text,items){
 assert(typeof text==='string'&&text.trim().length>0);
 assert(!text.includes('AI 短剧'),'Already updated; read a fresh snapshot before another update');
 const lines=text.split('\n');
 assert(lines.every((line,i)=>line.startsWith(`${i+1}. `)),'Unexpected non-numbered source');
 return [...lines,...items.map((s,i)=>`${lines.length+i+1}. ${s}`)].join('\n');
}
const toolPractice='创作流程落地与成片验证：将独立开发的音频处理和视频剪辑工具投入 AI 短剧制作，串联音频处理、剪辑及后期自动化，完成完整成片；以真实创作任务检验软件是否能从输入素材推进至实际输出，形成创作需求、工具开发、自动执行和作品验收的应用闭环。';
const boundary='人机协作边界：视频生成、IndexTTS 配音和音乐生成由人工发起并筛选素材；自研工具承担已实现的音频处理、剪辑与后期自动流程，通过人工审看完成音画整合及成片验收，不将生成环节描述为已自动化。';
const creation='AI 短剧与多模态制作：独立完成 AI 短剧，将视频生成、IndexTTS 配音、音乐生成与音画整合组织为完整制作流程；根据成片需要生成和筛选视听素材，再通过自研音频处理及视频剪辑工具自动执行后期，交付完整作品。';
const toolResult='成片应用成果：自研音频处理与剪辑工具已用于 AI 短剧制作并产出完整成片，验证了工具在实际创作中的可用性，实践由功能开发、自动执行到作品交付的落地闭环。';
const videoResult='完整音画作品：完成 AI 短剧，将视频、IndexTTS 配音与生成音乐整合为完整作品；音频处理、剪辑及后期采用自研工具自动执行，配音与音乐生成保留人工操作和筛选。';
const toolRole='创作需求转化与验收：兼任创作者与工具开发者，将音频处理和视频剪辑中的实际需求转化为可执行功能，负责生成素材的组织、自动流程执行及完整成片审看，依据实际输出判断软件能力是否满足创作任务。';
const videoRole='多模态制作统筹：负责 AI 短剧的视频、配音、音乐与后期组织，人工发起 IndexTTS 配音及音乐生成并选择可用素材，使用自研音频和剪辑工具完成自动化处理及音画整合，对最终成片负责。';
const reports=[];
for(const l of next.libraries){
 const t=track(l);if(t==='ops')continue;
 const c=l.content;
 const tools=c.projects.filter(p=>/Agent 创作/.test(p.name));
 assert.equal(tools.length,1);
 const videos=c.projects.filter(p=>p.name==='AIGC 视频与音画内容创作');
 assert.equal(videos.length,t==='app'?0:1);
 for(const p of [...tools,...videos]){
  const isTool=tools.includes(p);
  const practice=isTool?toolPractice:creation;
  for(const k of ['description','workContent'])p[k]=append(p[k],[practice,boundary]);
  p.responsibilities=append(p.responsibilities,[isTool?toolRole:videoRole]);
  p.achievements=append(p.achievements,[isTool?toolResult:videoResult]);
  p.summary=append(p.summary,[practice,boundary]);
  for(const k of Object.keys(p.variants||{}))p.variants[k]=append(p.variants[k],[practice,boundary]);
 }
 c.content.personalAdvantages=append(c.content.personalAdvantages,[t==='app'?
  '工具开发与作品验证：自研音频处理、视频剪辑工具已投入 AI 短剧制作，通过自动化后期交付完整成片；能将创作中的具体问题转化为应用，并以实际输出检查工具价值，而非停留于接口或功能演示。':
  '创作与工具双向验证：已独立完成 AI 短剧，统筹视频生成、IndexTTS 配音、音乐生成与音画整合；使用自研工具自动完成音频处理、剪辑及后期，将创作判断与工具开发结合，以完整成片验证实际可用性。']);
 if(t!=='app'){
  c.content.selfIntroduction=append(c.content.selfIntroduction,[
   '具备 AI 短剧完整制作实践，结合视频生成、IndexTTS 配音与音乐生成组织视听素材，通过自研音频处理及剪辑工具自动完成后期，形成多模态创作与工具落地相互验证的实践。']);
  c.skills.technical=c.skills.technical.map(s=>s.replace('Suno、Fish Audio 等工具及','Suno、Fish Audio 等工具、IndexTTS 配音及'));
  if(t==='aigc')c.skills.technical=c.skills.technical.map(s=>s.replace('主导创意脚本及成片验收。','主导创意脚本及成片验收；以自研工具自动处理音频与剪辑后期，已交付 AI 短剧。'));
 }
 changedIds.add(l.id);
}
assert.equal(changedIds.size,3);
assert.deepEqual(next.shared,before.shared);assert.equal(next.activeLibraryId,before.activeLibraryId);
for(const l of next.libraries){
 const old=before.libraries.find(x=>x.id===l.id),t=track(l);
 if(t==='ops'){assert.deepEqual(l,old);continue;}
 const p=profileForLibrary(next,l.id),prior=profileForLibrary(before,l.id);
 const check=validateProfile(structuredClone(p));assert(check.ok,check.errors?.join(';'));
 assert.deepEqual(p.basic,prior.basic);assert.deepEqual(p.education,prior.education);assert.deepEqual(p.sensitive,prior.sensitive);
 assert.deepEqual(p.internships,prior.internships);assert.deepEqual(p.campus,prior.campus);
 assert.equal(p.internships.length,3);assert.equal(p.projects.length,prior.projects.length);
 assert(p.skills.technical.join('\n').length<=1000,'Skill character limit');
 const restored=structuredClone(l);
 for(const [i,e]of restored.content.projects.entries()){
  if(!/Agent 创作|^AIGC 视频与音画内容创作$/.test(e.name))continue;
  for(const k of [...bodyFields,'variants'])e[k]=structuredClone(old.content.projects[i][k]);
 }
 for(const k of ['personalAdvantages','selfIntroduction'])restored.content.content[k]=old.content.content[k];
 restored.content.skills.technical=structuredClone(old.content.skills.technical);
 assert.deepEqual(restored,old,'Unapproved change outside selected project and personal/skill text');
 const repaired=repairProfileShape(p);
 for(const [i,e]of p.projects.entries()){
  for(const k of bodyFields){
   assert(typeof e[k]==='string'&&e[k].length>=prior.projects[i][k].length);
   assert(!/\*\*|\n\s*\n/.test(e[k]));
   if(/^1\. /.test(e[k]))e[k].split('\n').forEach((line,n)=>assert(line.startsWith(`${n+1}. `)));
  }
  assert.equal(resolveValue('project.description',repaired,{entryIndex:i,profileType:'general'})?.value,e.description);
  for(const d of l.directions)assert.equal(resolveValue('project.description',repaired,{entryIndex:i,profileType:d})?.value,e.variants[d]);
 }
 reports.push({id:l.id,name:l.name,projects:p.projects.length,internships:p.internships.length,campus:p.campus.length,skillsCharacters:p.skills.technical.join('\n').length});
}
const receiptFile='AI短剧更新_20261012_导入回执.json';
const full={kind:'ztt/application-form-assistant/role-library-pack',version:1,generatedAt:new Date().toISOString(),preserveProfileShape:true,preserveShared:true,preserveExistingLibraries:true,activeLibraryId:before.activeLibraryId,expectedStoreSha256:createHash('sha256').update(stable(before)).digest('hex'),receiptFile,libraries:next.libraries.map(l=>({id:l.id,name:l.name,note:l.note,directions:l.directions,profile:profileForLibrary(next,l.id)}))};
if(process.argv.includes('--verify-receipt')){
 const r=read(receiptFile),expected=structuredClone(next);assert(r.ok);
 for(const l of expected.libraries)if(changedIds.has(l.id))l.updatedAt=r.store.libraries.find(x=>x.id===l.id).updatedAt;
 assert.deepEqual(r.store,expected);assert.deepEqual(r.mirror,profileForLibrary(r.store,r.store.activeLibraryId));
 write('AI短剧更新_20261012_校验报告.json',{ok:true,storageReadback:true,unchangedOps:true,sharedPreserved:true,activeLibraryPreserved:true,backup:r.originalBackupFile,libraries:reports});
 console.log(JSON.stringify({ok:true,storageReadback:true,unchangedOps:true,libraries:reports}));
}else{
 write('AI短剧更新_20261012_导入包.json',{...full,libraries:full.libraries.filter(l=>changedIds.has(l.id))});
 write('三岗位资料库导入包.json',{...full,libraries:full.libraries.filter(l=>track(l)!=='default')});
 write('默认资料库导入包.json',{...full,libraries:full.libraries.filter(l=>track(l)==='default')});
 for(const l of full.libraries){
  if(!changedIds.has(l.id))continue;
  const t=track(l),p=l.profile;
  write(t==='default'?'default_通用完整资料.json':`${t}_岗位资料.json`,{kind:'application-form-assistant/profile',version:1,profile:p});
  const parts=[l.name,'个人介绍',p.content.selfIntroduction,'个人优势',p.content.personalAdvantages,'专业技能（1000字以内）',p.skills.technical.join('\n'),'实习经历'];
  for(const e of p.internships)parts.push(`${e.startDate} - ${e.endDate} ${e.company}｜${e.department}｜${e.position}`,'经历描述',e.description,'工作职责',e.responsibilities,'工作内容',e.workContent,'工作业绩',e.achievements,'实习总结',e.summary);
  parts.push('项目经历');for(const e of p.projects)parts.push(`${e.startDate} - ${e.endDate} ${e.name}｜${e.role}`,'项目背景',e.background,'项目描述',e.description,'项目职责',e.responsibilities,'项目内容',e.workContent,'项目成果',e.achievements,'项目概述',e.summary);
  parts.push('校园经历');for(const e of p.campus)parts.push(`${e.startDate} - ${e.endDate} ${e.organization}｜${e.department}｜${e.position}`,e.description);
  parts.push('自我评价',p.content.selfEvaluation,'职业规划',p.content.careerPlan,'兴趣爱好',p.content.hobbies);
  const text=parts.filter(v=>v!==undefined&&v!==null&&v!=='').join('\n');assert(!/\*\*|\n\s*\n/.test(text));
  for(const f of t==='default'?['默认资料库_复制粘贴.txt','默认资料库_完整内容.md','默认资料库_新版描述预览.md']:[`${t}_资料库_复制粘贴.txt`,`${t}_新版描述预览.md`,`${t}_资料库内容预览.md`])write(f,text);
 }
 write('AI短剧更新_20261012_导入前校验.json',{ok:true,unchangedOps:true,sharedPreserved:true,activeLibraryPreserved:true,libraries:reports});
 console.log(JSON.stringify({ok:true,libraries:reports}));
}
