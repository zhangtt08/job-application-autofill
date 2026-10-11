import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProfile} from './installed-profile-schema.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const app=read('app_岗位资料.json').profile;
const aigc=read('aigc_岗位资料.json').profile;
const ops=read('ops_岗位资料.json').profile;
const receipt=read('导入完成回执.json');
const previousDefault=receipt.store.libraries.find(l=>l.name==='默认资料库'&&l.directions.length===0);
if(!previousDefault)throw Error('未找到当前默认资料库，先核对目标，不能猜 ID');
const n=lines=>lines.filter(Boolean).map((line,i)=>`${i+1}. ${line}`).join('\n');
const lines=text=>text.split('\n').map(line=>line.replace(/^\d+\.\s*/,''));
const find=(p,title)=>{const entry=p.projects.find(e=>e.name===title);if(!entry)throw Error(`缺少项目 ${title}`);return structuredClone(entry);};
const points=e=>lines(e.workContent);
const outcomes=e=>lines(e.achievements);
const unify=e=>{
 e.descriptionShort=e.descriptionMedium=e.descriptionLong;
 for(const key of ['agent','aiApplication','aiProduct','aiOperation','aiSolution','aigcMarketing'])e.variants[key]=e.descriptionLong;
 return e;
};
function revise(e,work,results=outcomes(e)){
 e.responsibilities=e.workContent=n(work);
 e.achievements=n(results);
 e.descriptionLong=n([...work,...results.map(t=>`项目成果：${t}`)]);
 e.summary=n([e.name||`${e.company}｜${e.position}`,...results]);
 return unify(e);
}
const profile=structuredClone(app);
// 保留完整职业记录，整合相关角度，不重复粘贴三个岗位版本。
const enterprise=profile.internships[0];
const enterpriseWork=points(enterprise);
enterpriseWork[0]='业务场景与流程分析：参与包括 AIGC 视频在内的达人广告素材规模化处理与交付，上手一线工作后两天内梳理人工 SOP、跨平台操作、标签判断条件和关键耗时点，形成需求清单；根据使用频率、人工成本、实现难度和预期收益安排功能优先级。';
enterpriseWork.splice(4,0,'数据流程与状态管理：通过 Excel、飞书多维表格及脚本完成跨表匹配、查重、字段填写与任务状态管理，将业务规则、异常样本及审核反馈纳入持续迭代。');
revise(enterprise,enterpriseWork);
revise(profile.internships[1],[
 '行业与产品表达：围绕仪器仪表行业销售口播、科普及信息流内容整理产品信息，将产品、受众和表达目标转化为视频素材组织与内容结构。',
 '完整视频制作：完成素材整理、粗剪与精剪、字幕、音效、封面及基础视觉包装，检查剪辑节奏、画面信息和音画衔接，形成从原始素材到可发布成片的交付经验。',
 '账号协作与发布：参与选题策划、内容排期、发布及日常维护，根据不同内容形式衔接素材、制作和发布节奏。',
 '数据反馈与调整：结合播放量、完播率及互动数据辅助判断内容表现，持续调整选题方向、内容结构和剪辑节奏。'
]);
revise(profile.internships[2],[
 '企业图文传播：整理公众号选题、活动信息和原始素材，完成新闻内容编辑、图文排版及发布，兼顾文字、图片选择和阅读层级。',
 '会议活动影像：承担现场摄影，按新闻及品牌传播用途筛选照片、进行基础后期，将现场信息转化为可用于传播的内容素材。',
 '品牌资料归档：按使用场景整理图片、新闻稿及品牌资料，支持后续检索、复用和企业日常传播。'
]);

const enterpriseProject=find(app,'广告素材处理 Agent 与全链路业务自动化系统');
revise(enterpriseProject,[...points(enterpriseProject),
 '运营与数据协同：通过 Excel、飞书多维表格及脚本管理跨表匹配、查重、字段填写与任务状态；将客户规则变化、审核意见及小组反馈连接到规则维护和功能迭代。'
]);
const editing=find(app,'AgentCut｜人机共用剪辑软件');
const toolchain=find(aigc,'视频创作工具链与 AgentCut 人机共用剪辑台');
editing.name='AgentCut 与视频创作工具链｜人机共用剪辑与媒体处理';
editing.startDate=toolchain.startDate;
editing.endDate=toolchain.endDate;
editing.background='1. 围绕视频创作前期准备、媒体处理和后期编辑独立构建工具链；综合实践为 2026.05 - 2026.10，AgentCut 独立开发阶段为 2026.10 - 2026.10。';
revise(editing,[...points(toolchain).slice(0,3),...points(editing)],
 ['形成实际使用的素材搜索下载、链接解析、人声与音乐分离、补帧工具，以及可运行的 AgentCut 桌面程序。','AgentCut 的界面、HTTP 和 MCP 共用编辑规则，支持实际媒体处理、Agent 调用和成片导出验证。']);
editing.keywords=[...new Set([...editing.keywords,...toolchain.keywords])];
const brand=find(ops,'品牌策略与整合营销方案实践');
const brandWork=points(brand);
brandWork.splice(5,0,'视觉与内容整合：结合广告学及 AIGC 创作经验，将策略主线转化为文案、主视觉及内容形式，兼顾品牌语境、系列识别和方案呈现。');
revise(brand,brandWork);
profile.projects=[
 enterpriseProject,
 find(app,'Tcode｜个人 Agent 与本机工具编排平台'),
 editing,
 find(app,'ACB｜跨机器项目与 Agent 上下文交接系统'),
 find(app,'Application Form Assistant｜网申资料库与自动填写助手'),
 find(ops,'TrendScope｜热点决策与内容增长实践'),
 find(ops,'个人品牌网站与 SEO / GEO 运营实践'),
 find(aigc,'AIGC 视频与音画内容创作'),
 find(aigc,'AIGC 系列海报与品牌视觉表达'),
 brand
].map(unify);
const skillByCategory=new Map();
for(const p of [app,aigc,ops])for(const skill of p.skills.technical){
 const category=skill.split('：')[0];
 if(!skillByCategory.has(category)&&!['创意与品牌表达','创作流程效率'].includes(category))skillByCategory.set(category,skill);
}
profile.skills.technical=[...skillByCategory.values()];
profile.skills.tools=[
 'Claude Code、Codex、Cursor 等 Agent 工具，用于需求拆解、Vibe Coding、测试及迭代。',
 'Playwright、影刀 RPA、Git / GitHub、Excel、飞书多维表格；在独立项目中使用 Node.js、React、TypeScript、Electron / Tauri、Python、FFmpeg 及 MCP。',
 'Premiere Pro、After Effects、剪映、Lightroom。',
 'Pavo AI、Midjourney、Suno、Fish Audio，以及 Seedance、Veo、MiniMax、Nano Banana、GPT Image 等生成模型。',
 'ChatGPT、Gemini；自研 TrendScope、ZTT GEO 等内容决策与运营工具。'
];
profile.jobPreferences.expectedPosition=[...new Set([app,aigc,ops].flatMap(p=>p.jobPreferences.expectedPosition))];
profile.careerPreferences.targetDirections=profile.jobPreferences.expectedPosition;
const block=items=>{const long=n(items);return {short:long,medium:long,long};};
profile.content={
 selfIntroduction:block([
  '重庆交通大学广告学 2027 届本科生，具有 AI 应用与业务自动化、产品及数字化运营、AIGC 与视觉内容创作的复合实践。能够从实际业务和用户任务出发，拆解需求、组织规则并独立主导 Agent 辅助软件构建。',
  '在优矩互动达人运营部从一线素材工作切入，构建跨四个平台、覆盖五个核心环节的自动化系统，投入 3–5 人小组使用，支撑 5+ 真实业务项目，并释放产能进一步承接约三个新增项目。',
  '同范围任务处理由单人纯人工约 500 条/日提升至自动化日均 6000+ 条，约 12 倍；完整日常流程约 1.5 小时、人工操作低于五分钟，保留抽检、结果校验、异常回溯及人工处理。',
  '独立构建 Tcode、本机工具编排、人机共用 AgentCut 剪辑软件、跨环境上下文交接及网申插件等完整产品，关注知识来源、工具契约、实际执行、部署与持续迭代。',
  '具有产品概念短片、程序化动效、系列海报和品牌提案产出；熟练使用 Premiere Pro、After Effects、剪映，使用生成式图像、视频和音频工具进行创作。',
  '独立运营四个个人短视频账号，单条原创内容最高近 50 万播放；建设个人网站和 SEO / GEO，完成本人姓名检索及生成式搜索引用验证，能够把内容、工具和业务反馈连接为实际成果。'
 ]),
 selfEvaluation:block([
  '问题导向：习惯亲自体验用户工作流程，从重复操作和关键耗时点发现需求，结合使用频率、人工成本、可行性与难度安排改造优先级。',
  '独立落地：能够主导需求拆解、方案规划、Agent 辅助实现、测试、部署及反馈迭代，将创意或业务规则转化为实际可用的工具和内容。',
  '协作与质量：具有跨业务沟通、小组使用推广和操作说明经验，重视规则来源、抽检、异常处理及人工兜底，关注交付能否真正被他人使用。',
  '复合表达：广告学、视频和品牌实践帮助理解受众与传播；AI 应用和数据处理实践使内容与运营方案能够进一步工具化。'
 ]),
 personalAdvantages:block([
  '业务到软件的转化：既能梳理 SOP、标签条件及边界样本，也能把规则沉淀为 Prompt、Skill、RAG 知识与 Agent 可调用工具。',
  '端到端交付：具有企业生产系统、桌面软件、浏览器插件和公开网站实践，覆盖用户入口、工具执行、数据管理、结果检查及反馈迭代。',
  '内容与增长结合：能够开展创意脚本、视频和海报制作、热点核实、账号发布及数据复盘，并有实际内容传播与搜索引用案例。',
  '产品化与协同：能够对齐客户 Brief、标签与交付要求，维护需求清单和操作说明，依据反馈规划功能，推动系统进入团队日常工作。'
 ]),
 careerPlan:block([
  '希望在 AI 应用、业务自动化、AI 产品及数字化运营，或 AIGC 内容相关工作中发挥业务理解、工具落地和传播表达的复合优势。',
  '进入团队后优先理解用户任务、现有流程、指标和交付约束，从高频、高成本且可行的问题切入，建立需求、实现、使用反馈和迭代闭环。',
  '持续加强 Python 与接口基础、Agent 工具质量、数据反馈分析和内容制作能力，逐步承担更完整的业务需求落地与产品改进。'
 ]),
 hobbies:block([
  '个人工具与自动化探索：喜欢从日常重复操作中发现值得改进的问题，借助 Agent 开发实用工具，并将个人项目接入统一调用入口，关注软件能否真正完成任务。',
  '影像与生成式创作：持续进行摄影、视频剪辑、动效及 AIGC 视觉与音画实验，关注脚本、构图、节奏、转场和不同实现方法的能力边界。',
  '传播与品牌观察：关注互联网话题、用户反馈和品牌如何表达产品，结合个人账号创作及自主品牌方案，将观察转化为选题、文案和视觉表达。',
  '个人网站与数字产品体验：维护个人网站，探索搜索可见性、AI 引用和自然语言工具交互，将实际体验发现的问题用于产品与运营迭代。'
 ])
};
const checked=validateProfile(profile);
if(!checked.ok)throw Error(checked.errors.join('; '));
const library={id:previousDefault.id,name:'默认资料库',directions:[],note:'通用完整资料，用于手动复制粘贴；整合已确认的高价值内容，按完整业务或创作目标归并，使用编号长版。',profile:checked.profile};
const pack={kind:'ztt/application-form-assistant/role-library-pack',version:1,generatedAt:new Date().toISOString(),activeLibraryId:library.id,preserveExistingLibraries:true,libraries:[library]};
fs.writeFileSync(path.join(dir,'default_通用完整资料.json'),JSON.stringify({kind:'application-form-assistant/profile',version:1,profile:checked.profile},null,2),'utf8');
fs.writeFileSync(path.join(dir,'默认资料库导入包.json'),JSON.stringify(pack,null,2),'utf8');
const basic=profile.basic;
const text=[
 '# 张天腾｜默认资料库（通用完整版）',
 '用途：按申请岗位手动选择并复制。以下正文保留详细编号长版；项目按完整业务或创作目标归并，同一体系中的作品与工具为案例或组件。',
 '## 基础信息',
 `姓名：${basic.name}\n英文名：${basic.englishName}\n性别：${basic.gender}\n年龄：${basic.age}\n手机：${basic.phone}\n邮箱：${basic.email}\n所在地：${basic.city}\n个人网站：${basic.portfolio}\nGitHub：${basic.github}`,
 '## 教育背景',...profile.education.map(e=>`${e.school}｜${e.college}｜${e.major}｜${e.degree}｜2027届\n${e.startDate} - ${e.endDate}\nGPA：${e.gpa}\n排名：${e.rank}`),
 '## 自我介绍',profile.content.selfIntroduction.long,
 '## 实习经历',...profile.internships.flatMap(e=>[`### ${e.company}｜${e.department}｜${e.position}`,`${e.startDate} - ${e.endDate}`,e.descriptionLong]),
 '## 项目经历',...profile.projects.flatMap(e=>[`### ${e.name}`,`时间：${e.startDate||'未确认'} - ${e.endDate||'未确认'}\n角色：${e.role}`,`项目背景\n${e.background}`,e.descriptionLong]),
 '## 校园经历',...profile.campus.flatMap(e=>[`### ${e.organization}｜${e.department}｜${e.position}`,`${e.startDate} - ${e.endDate}`,e.descriptionLong]),
 '## 专业技能',n(profile.skills.technical),'## 工具与软件',n(profile.skills.tools),'## 外语及证书',n(profile.skills.languages),
 '## 个人优势',profile.content.personalAdvantages.long,'## 自我评价',profile.content.selfEvaluation.long,'## 职业规划',profile.content.careerPlan.long,'## 兴趣爱好',profile.content.hobbies.long
].join('\n\n');
fs.writeFileSync(path.join(dir,'默认资料库_完整内容.md'),text,'utf8');
fs.writeFileSync(path.join(dir,'默认资料库_复制粘贴.txt'),text.replace(/^#{1,3}\s+/gm,''),'utf8');
console.log(JSON.stringify({id:library.id,projects:profile.projects.length,internships:profile.internships.length,campus:profile.campus.length,skillCategories:profile.skills.technical.length,copyTextChars:text.length},null,2));
