import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateProfile} from '../src/profile/schema.ts';
import {profileForLibrary,repairProfileShape,selectLibraryForDirection} from '../src/profile/libraryStore.ts';
import {resolveValue} from '../src/profile/profileResolver.ts';

const dir=path.dirname(fileURLToPath(import.meta.url));
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const write=(f,v)=>fs.writeFileSync(path.join(dir,f),typeof v==='string'?v:JSON.stringify(v,null,2),'utf8');
const numbered=a=>a.filter(Boolean).map((s,i)=>`${i+1}. ${s}`).join('\n');
const points=s=>s.split('\n').filter(Boolean).map(s=>s.replace(/^\d+[.、]\s*/,''));
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const before=read('读取当前资料库.json')['afa.profiles.v2'];
assert.equal(before.shared.basic.name,'张天腾');
const next=structuredClone(before);
const trackOf=l=>l.id.startsWith('lib_')?'default':l.id.split('_')[1];
const directions=['agent','aiApplication','aiProduct','aiOperation','aiSolution','aigcMarketing'];
const files={default:'default_通用完整资料.json',app:'app_岗位资料.json',aigc:'aigc_岗位资料.json',ops:'ops_岗位资料.json'};

// Responsibility, implementation and outcome remain separate semantic slots.
function revise(e,{name,role,background,work,results,focus=[]}){
  if(name)e.name=name;
  if(role)e.role=role;
  if(background!==undefined)e.background=numbered([background]);
  e.workContent=numbered(work);
  e.responsibilities=numbered(focus.length?focus:work);
  e.achievements=numbered(results);
  e.description=numbered([...work,...results.map(s=>`实际成果：${s}`)]);
  e.summary=numbered([`${e.name||e.company}：${focus[0]||work[0]}`,...results]);
  for(const k of ['descriptionShort','descriptionMedium','descriptionLong'])if(k in e)e[k]=e.description;
  e.variants=Object.fromEntries(directions.map(k=>[k,e.description]));
  return e;
}
const enterpriseResults=[
 '同口径的素材获取、匹配、标注、整理及送审任务，由单人纯人工约 500 条/日提升至自动化日均 6000+ 条，日处理产能约为原基线的 12 倍；峰值 1 万+ 条/日，累计处理 30 万+ 条。',
 '完整日常任务全流程约 1.5 小时完成，其中人工操作低于 5 分钟；批量送审环节单独由早期 RPA 的约 2–3 小时缩短至 API 方式约 5 分钟，两项时间分别对应全流程与单环节。',
 '通过人工已匹配样本对照、随机抽检及审核反馈持续迭代，抽检判断准确率由首版约 70% 提升并稳定在 90%+；工具投入 3–5 人小组日常使用，支撑 5+ 真实业务项目，并释放产能承接约 3 个新增项目。'
];
const enterpriseWork=[
 '业务诊断与价值排序：亲自参与达人广告素材处理，在约两天内将人工操作整理为 SOP 和需求清单；综合业务频率、人工耗时、技术可行性及实施成本，先解决高收益、可落地环节，再逐步扩展到全流程，避免先投入最难但收益不明确的问题。',
 '从业务经验到可执行规则：协同素材管理、达人运营及媒介明确客户 Brief、标签标准和交付要求，将常见素材配套关系、文件名与 Excel 字段映射、标签冲突及边界样本沉淀为 Prompt、可复用 Skill、规则文档与操作说明。',
 '系统自主构建：独立主导当前岗位所用自动化系统的需求、方案、开发验收及迭代，借助 Claude Code、Codex 等 Agent 完成软件实现，从 0→1 将素材下载、数据匹配、自动标注、结果整理与审核送审五个环节串联，覆盖四个业务平台。',
 '接口与执行方案选择：按业务环境组合 API、Python 脚本、Playwright 和 RPA；将双账号、多浏览器导出整合为一键桌面操作，核对工具与人工输出，大体量数据导出由约 1–2 小时缩短至约半小时；进一步将批量送审由 RPA 升级为接口化执行。',
 'Agent 编排与业务组件：将 36 个启用业务脚本整理为可调用工具，经 MCP 接入企业 Agent；结合自然语言、文件名及 Excel 字段识别 5+ 项目类型，实现任务识别、RAG 规则检索、Tool Routing、Agent Loop、结果校验与 Human-in-the-loop，兼顾单步骤调用和完整日常工作流。',
 'RAG 知识维护：借助 Agent 完成规则文档切分、Embedding 与 Vector Search，按项目隔离知识库并保留规则来源与检索依据；规则变化时更新对应知识库，无需重写主流程，减少重复调整 Prompt 或脚本。针对规则切分导致的漏读误判，调整 chunk 切分并回到实际任务验证。',
 '规则优先与质量控制：固定映射和标准操作由确定性程序执行，语义模糊样本再由模型结合检索规则判断；未命中规则、标签冲突及无法确认的数据转人工。用已有人工样本定位成类误判，再以新素材测试迭代，避免只凭模型自评认定质量。',
 '生产运行与交付保障：提供自动重试、断点续跑、运行状态提示、结果检查与问题回捞；对提交结果不明的任务核查状态后再处理，不盲目重复送审。将抽检反馈、异常样本及规则变化纳入持续迭代。',
 '团队应用与使用支持：收集小组成员反馈、维护功能优先级、内置规则与操作教程，逐步排查启动环境、依赖缺失、账号及 Cookie 差异，结合现场沟通推动同事独立使用，将个人工具转化为团队日常生产能力。'
];
const opsEnterpriseWork=[
 '一线需求发现：深入素材获取、数据匹配、标签处理和送审场景，在约两天内形成 SOP 与需求清单；根据使用频率、人工耗时、实施难度和小组反馈安排改造顺序，把业务效率问题转化为可落实的产品需求。',
 '跨业务协作与需求管理：对接素材管理、达人运营及媒介，明确客户 Brief、标签规则与交付标准；维护需求清单和功能优先级，将变更沉淀为规则文档、Prompt、Skill 与操作说明，减少分散口头经验对交付的影响。',
 '流程产品化与规模交付：借助 Agent 独立构建贯通四个平台、五个核心环节的自动化系统；将工具、规则与任务入口整合，业务人员可按项目调用固定工作流，结果能够回读、检查与追溯。',
 '知识库运营与质量迭代：按项目维护隔离的 RAG 规则库，保留规则来源和检索依据；依据人工样本、随机抽检、误判回溯与审核反馈优化 Prompt、规则及切分方式，规则更新不再依赖反复重写主流程。',
 '数据与任务状态管理：利用 Excel、飞书多维表格及脚本完成跨表匹配、查重、字段填写和状态追踪；将任务输出、异常处理和人工入口连接到日常交付，兼顾效率与可检查性。',
 '用户使用与产品迭代：通过小组反馈识别上手障碍，完善说明、运行提示和异常信息，排查环境及账号差异；推动同事独立使用，将需求识别、方案落地、上线使用、反馈回溯与持续迭代连接为产品闭环。',
 '模型与成本意识：根据任务复杂度、输出质量、响应速度及 Token 性价比选择模型与调用方式；固定规则和批处理优先使用程序，避免把确定性任务全部交给大模型，兼顾可控成本与交付稳定性。'
];
const aigcEnterpriseWork=[
 'AIGC 视频资产运营：面向大量 AIGC 视频与达人广告素材，根据客户 Brief、标签标准及交付要求整理素材、数据与送审任务，掌握生成式视频从素材资产进入广告业务交付的流程，重点承担资产处理、标准维护与流程建设。',
 '素材标准与业务协作：与素材管理、达人运营和媒介对齐分类、配套关系及边界条件，将文件名、字段及业务经验整理为规则文档、Prompt 和 Skill，支持不同项目的素材识别、数据匹配与交付。',
 '制作协作流程工具化：借助 Agent 独立构建桌面软件及自动化系统，将下载、匹配、标注、整理和送审五个环节串联，覆盖四个平台；将高频操作交由程序执行，把精力用于素材判断、异常处理与规则完善。',
 '资产质量与使用推广：对照人工已匹配样本、随机抽检和审核反馈定位误判，持续优化规则；提供结果校验、问题回捞及人工处理入口，并通过内置规则、教程和现场沟通推动小组日常使用。'
];
const tcodeWork=[
 '产品定位与系统整合：针对自研软件分散、调用入口不一致及重复操作问题，独立设计 Tcode 自然语言工作台，将电脑中已登记的个人项目统一接入任务入口；当前目录覆盖 14 个项目、24 个通用工具，能够根据需求调用项目接口，而非仅封装几个下载功能。',
 'Agent 执行与结果交付：实现多轮 Agent Loop、Tool Calling、同轮工具并行、步骤清单及执行结果回填；将自然语言请求转化为本机项目的实际操作，提供任务进度、取消和结果回读，让对话能够交付文件或任务结果。',
 '跨应用工具契约：结合 WorkflowHub 将软件、脚本及项目入口整理为可发现、可校验的能力，通过 REST / MCP 等统一调用；先搜索工具、读取参数与执行契约，再 dry-run 或调用，避免一次性将全部工具描述塞入模型上下文。',
 '工作流与权限边界：通过统一执行层串联顺序 DAG、节点输入输出、日志及产物记录；区分只读查询与写入操作，使用白名单、敏感信息过滤和执行记录约束本机访问，调用前确认项目服务状态。',
 '个人知识与证据检索：将个人资料、项目 README 和交接文档建立 BM25 索引，以中文二元切分和英文词处理查询，回答保留文件与行号来源；资料修改经过预览、确认再提交，保持事实与变更可追溯。',
 '上下文、记忆与成本控制：提供会话持久化、长期记忆和历史摘要，将旧工具原文折叠并限制单次结果长度，缓存重复调用及稳定提示前缀；记录 Token 用量、缓存命中与调用耗时，结合任务质量、模型价格及调用记录评估使用性价比。',
 '失败恢复与体验优化：模型超时、限流及服务错误时切换备用提供方继续当前轮次；结合任务进度、工具错误、调用记录和使用反馈定位模型、参数、工具或环境问题，持续调整任务说明、调用契约与交互提示。',
 '独立实现与交付：借助 Agent 与 Vibe Coding 完成需求、方案、开发测试和桌面交付，以 Node.js 服务及桌面入口承载知识、对话与工具执行；将持续使用中的需求反馈纳入迭代，而不止于演示型聊天界面。'
];
const tcodeResults=[
 '形成覆盖 14 个登记项目、24 个通用工具的个人 AI 任务工作台，打通知识检索、自然语言任务、跨项目执行与结果回读，将个人软件能力整合为统一任务入口。',
 '在实际项目调用中验证对话驱动工具执行；同时具备会话记忆、来源引用、Token 记录、缓存、进度与模型故障切换，能够围绕真实任务持续评估可用性与成本。'
];
const suiteWork=[
 '人机协同产品设计：围绕传统软件必须逐项手动操作、聊天 Agent 难以交付可编辑作品的问题，独立开发 AgentCut，并扩展 AgentCanvas、AgentVideo，形成面向视频、海报及音频处理的 Agent 可调用创作套件。',
 '共享工程与可编辑交付：AgentCut 界面、HTTP 接口与 MCP 共用权威工程状态，Agent 可执行编辑操作，创作者能够预览、人工调整并继续接手，避免生成结果与可编辑工程脱节。',
 '视频与音频编辑能力：AgentCut 支持多轨时间线、片段编辑、关键帧、字幕、基础调色、声音处理及渲染导出，将操作从仅有界面按钮转为 Agent 可执行、可检查的编辑能力。',
 '执行安全与可恢复性：在 AgentCut 中建立 dry-run、工程版本校验、幂等请求与历史快照恢复，降低重复调用、旧版本写入和错误修改风险；通过实际导出及结果检查验证关键编辑操作，而不是只验证接口返回成功。',
 '创作场景扩展：扩展 AgentCanvas、AgentVideo 的海报及音频处理能力，并完成 Agent 实际调用测试，使创作任务能够通过软件能力执行，形成跨媒体的工具协同基础。',
 '工具落地与迭代：借助 Agent 完成功能方案、软件实现、接口设计和测试，结合自身 Premiere Pro、After Effects 及剪辑经验检查工程、画面和音频结果，持续完善可用性与人工接管体验。'
];
const suiteResults=[
 '形成 AgentCut、AgentCanvas、AgentVideo 组成的跨媒体创作套件，已完成 Agent 调用及作品处理测试；AgentCut 同时交付可编辑工程、HTTP / MCP 接口与实际渲染导出。',
 '将 AI 辅助创作从单纯生成图片或视频推进到软件级操作与可编辑交付，能够兼顾自动执行、创作者预览调整和结果检查。'
];
const mediaWork=[
 '创作前期需求整合：围绕素材分散、链接获取、声音分离及后期重复操作，独立构建素材检索下载、清影下载器、声析音频分离及 FrameBoost 等工具，将小工具汇总为同一创作流程，不逐个堆砌为独立项目。',
 '素材与视听准备：聚合多个素材来源，提供搜索预览、链接解析、批量下载与落盘检查；结合音频分离和补帧等媒体处理，为后续剪辑与视觉制作准备可复用素材。',
 ...suiteWork,
 '制作方法与验收：根据需求选择 AIGC 生成、程序化动画或传统后期，结合人工审看、工程修订与实际导出检查控制交付质量。'
];
const videoWork=[
 '广告创意与制作策略：围绕产品信息、目标受众和传播目的拆解卖点，组织创意脚本、镜头节奏及声音表达；根据目标画面选择图像 / 视频模型、Agent 驱动程序化动画或传统后期，而不是先生成大量素材再拼接。',
 '产品卖点视觉化：《一颗主摄》将光圈结构、参数与夜景表现转化为连续的视觉解释；《瑞幸生椰拿铁》围绕产品特征、饮用场景、产品特写和品牌收束组织概念广告，形成从信息重点到成片表达的完整过程。',
 '程序化动效与方法选择：《只写代码》中本人负责创意、脚本与效果判断，借助 Agent 生成 JavaScript 动画并直接渲染，约 1 小时完成多物体差异化运动及 AE 风格转场；结合日常 After Effects 经验检查节奏、层级和细节，探索程序化生成与传统动效的替代路径。',
 '连续叙事与镜头组织：《最后一块饼干》围绕目标、冲突、转折与结局筛选、衔接生成素材，通过角色行动、镜头顺序及声音线索形成连续观看体验，关注人物、环境与动作的前后联系。',
 '多模态生成与后期控制：使用 Pavo AI、Midjourney、Suno、Fish Audio 等平台及工具，并在 Seedance、Veo、MiniMax、Nano Banana、GPT Image 等模型实践中选择适合的生成方式；结合剪辑、字幕、音效及画面调整控制成片表达。',
 '素材筛选与视觉验收：依据主体表现、画面构图、动作合理性、转场及音画关系筛选素材，避免只以单帧精美判断完整作品质量；将静态产品海报延展为动态视觉，并在作品集中保留完整展示。'
];
const videoResults=[
 '独立完成可公开展示的产品概念广告、动画叙事、程序化动效和音画作品，形成创意定义、制作方法选择、素材筛选、后期整合及成片检查的完整实践。',
 '《只写代码》以约 1 小时交付完整 AE 风格程序化动效，验证了通过创意脚本驱动 Agent 完成视觉制作的实践路径；品牌作品以个人独立概念创作呈现。'
];
const posterWork=[
 '系列创意与信息层级：从品牌语境、产品特征和场景出发确定主题、文案、主视觉与阅读顺序，将图像生成、版式和系列识别统一规划，而非仅展示单张 AI 生图。',
 '情绪与品牌视觉：泡泡玛特周年及产品系列通过角色、文案、留白和色彩表达情绪；MUJI 系列以器物、生活场景及克制版式呼应品牌语境，将产品信息转化为可连续阅读的视觉内容。',
 '差异化产品表达：B&C 开业系列以拼贴、色彩和烘焙产品建立识别；喜茶按单品口味、色彩及水果特征区分画面，并通过统一标题、构图和排版保持系列一致。',
 '生成、筛选与版式整合：围绕主题选择生成方式和素材，检查主体结构、文案可读性、产品重点与色彩关系，再完成系列整理与作品集展示；部分静态表达进一步延展为动态海报。',
 '作品组织与可验证交付：按系列整理创意、文案及图像，提供逐幅查看的作品与说明，使招聘方能够同时检视独立画面质量、系列一致性及品牌表达。'
];
const posterResults=[
 '当前网站已展示 9 组商业主题视觉系列、27 幅 AIGC 海报，覆盖品牌周年、产品推广、开业及生活方式等表达方向；数量排除非商业主题系列。',
 '系列作品为个人独立概念创作，形成可逐幅查看的图像、文案与设计呈现，体现主题策划、生成素材筛选、版式与系列化表达能力。'
];
const trendWork=[
 '运营问题与产品构建：针对多平台热点分散、人工追踪成本高及选题依据不统一的问题，独立开发 TrendScope，将热点收集、信息整理、候选选题与历史记录连接为内容决策工作台。',
 '信号整理与选题辅助：整合平台榜单及手动导入内容，开展去重、话题聚合和快照记录，结合增长趋势、发酵阶段及内容饱和度形成候选线索；保留来源以便回查，不把推荐分数当作播放量预测。',
 '人工核实与受众判断：发现“时代俊峰、重庆”等增长较快的热点后，进一步检索事件背景、观看相关内容并判断仍处于发酵阶段；围绕具体受众选择观点与表达切口，而非直接照搬热点榜单标题。',
 '制作、发布与真实验证：将工具线索转化为选题脚本及短视频，在约 1–2 小时内完成制作发布，并结合播放、点赞、评论与转发检视内容表现，建立工具辅助判断与实际内容结果之间的证据链。',
 '持续账号运营：独立运营 4 个个人短视频账号，覆盖 AI 视觉、动漫、个人兴趣及热点等方向，负责选题、制作、标题、发布与复盘；累计 5 条作品播放超过 1 万，以用户反馈持续调整内容方向。',
 '反馈与产品迭代：将热点来源、推荐信号、人工判断及发布表现留作后续复盘依据，持续优化采集整理和选题提示，使工具服务于运营判断而非替代内容事实核查。'
];
const trendResults=[
 '一次由工具线索与人工判断共同支持的选题，获得单条近 50 万播放、约 3 万点赞、近 1 万评论、约 1.6 万转发，将增长信号、内容判断和实际传播表现连接为可复盘案例。',
 '形成热点发现、来源核实、受众切入、创作发布及数据复盘的运营流程；个人账号累计 5 条作品播放超过 1 万。'
];
const geoWork=[
 '运营目标与问题诊断：针对原 IP 网站难以被抓取、作品分散及姓名检索难以触达的问题，以 zhangtianteng.xyz 为真实运营对象，分别检查爬虫可访问、搜索收录及 AI 引用三个环节，避免将买域名等同完成搜索优化。',
 '网站产品与内容结构：独立完成定位、信息架构、作品分类、案例说明及交互规划，借助 Agent 完成网站开发、服务器部署、独立域名配置与持续迭代；支持响应式、多语言和来源恢复，使经历、作品与项目形成清晰入口。',
 'SEO 与可抓取内容：完善公开可读页面、索引入口、Sitemap 及结构化信息，向搜索引擎提交站点并核查访问、收录与姓名检索；让静态事实和作品信息能够被检索，而不只存在于复杂前端交互中。',
 'GEO 与事实质量：将个人身份、经历、项目、技能和作品组织为统一事实源，保持页面表达、来源和公开引用一致；围绕机器可读取的内容检查更新，减少跨页面不一致对理解和引用的影响。',
 '内容运营工作台：独立开发 ZTT GEO，将事实源、主题 Brief、草稿、主张核验、版本记录与渠道适配串联；事实变化后回到内容核对，并保留内容依据、发布记录及观测信息，支持持续运营。',
 '渠道执行与结果回读：使用 Playwright 辅助已适配平台的内容发布与流程操作，保留状态、截图或回执，并对异常转人工；将生成、审核、发布与结果核验分开，不把草稿生成当成真实发布。',
 '站内知识问答：将公开个人资料与项目信息接入网页 AI Assistant，支持访客通过自然语言查询经历、项目与作品；围绕知识来源和工具访问边界设计查询，提升访客理解个人背景的效率。',
 '检索与引用验证：本人以“张天腾”直接在 Google 检索，个人网站出现在首位；在未预先给出域名或网址的情况下，ChatGPT 姓名查询可找到并引用该网站，回答中的引用网址和个人信息核对准确。'
];
const geoResults=[
 '姓名检索实测中，Google 搜索“张天腾”出现个人网站首位结果；ChatGPT 未预先获得域名即可检索、引用网站并回答准确信息，分别验证传统搜索可见性与生成式搜索引用。',
 '交付可公开访问的网站和内容运营工作台，形成事实整理、内容核验、渠道适配及结果观测实践；分别通过本人姓名检索与 AI 引用测试检查网站可发现性。'
];
const definitions={
 enterprise:{background:'达人广告素材规模化处理的一线生产场景；本人从 0→1 构建当前工作所用全流程自动化系统，公司入职前已有特定项目打标程序。',work:enterpriseWork,results:enterpriseResults,focus:['独立负责需求发现、流程方案、业务规则转化、Agent 与工具集成、验收及团队使用支持。','对齐达人运营、媒介和素材管理的交付要求，基于反馈与抽检持续迭代系统。']},
 tcode:{background:'将分散的自研软件、个人知识和项目接口整合为能够真实执行任务的自然语言工作台。',work:tcodeWork,results:tcodeResults,focus:['独立负责产品定位、交互与任务流程、工具契约、知识检索、软件构建、调用验证及持续迭代。','在任务可完成的基础上，兼顾 Token 成本、失败恢复、来源引用与本机访问边界。']},
 suite:{name:'Agent 创作套件｜AgentCut · AgentCanvas · AgentVideo',background:'将自研创作软件提供给 Agent 调用，同时保留人类创作者的可编辑工程、预览与验收能力。',role:'独立产品设计与开发',work:suiteWork,results:suiteResults,focus:['独立负责创作任务拆解、软件与接口设计、Agent 调用验证和可编辑成果交付。','结合传统后期经验检视画面、声音、工程与导出结果，完善人工接管体验。']},
 media:{name:'Agent 创作工具链｜素材准备 · 视频 · 海报 · 音频',background:'围绕实际创作中的素材准备、视听处理及后期编辑，整合自研媒体工具与 Agent 创作套件；综合工具实践始于 2026.05，套件扩展阶段为 2026.10。',role:'独立产品设计与开发',work:mediaWork,results:['交付实际使用的素材下载、视频提取、音频分离、补帧等媒体工具，并扩展为 AgentCut、AgentCanvas、AgentVideo 可调用创作套件。',...suiteResults],focus:['根据创作流程识别重复工作，自主定义工具需求并借助 Agent 完成软件、接口、实际调用和结果验收。','将零散媒体处理能力整合为可复用制作链路，兼顾素材准备、可编辑工程和输出质量。']},
 video:{background:'个人广告与视听创作实践，以完整成片展示创意、制作方法选择和质量判断，而非单个生成片段。',work:videoWork,results:videoResults,focus:['独立负责创意定义、脚本与镜头组织、制作方式选择、生成素材筛选和成片验收。','结合广告学与传统剪辑经验，将产品信息与传播目的转化为完整视听表达。']},
 poster:{background:'个人商业主题视觉概念创作，将广告创意与 AIGC 素材生成结合为系列海报。',work:posterWork,results:posterResults,focus:['独立负责系列主题、文案、主视觉方向、生成素材筛选、版式整合和作品呈现。','维护品牌语境、单品差异和系列一致性，不以图片数量替代设计判断。']},
 trend:{background:'基于真实账号内容工作建立热点决策工具，并以实际选题和发布数据检验应用价值。',work:trendWork,results:trendResults,focus:['独立负责热点工具需求、产品开发、候选选题判断、创作发布与数据复盘。','结合传播阶段、信息核实及受众反馈，将工具信号转化为内容运营决策。']},
 geo:{background:'围绕个人网站从难以抓取到可检索、可引用的问题，独立构建网站及 SEO / GEO 运营流程。',work:geoWork,results:geoResults,focus:['独立负责网站定位、信息架构、公开事实整理、搜索优化、内容工作台和验证流程。','借助 Agent 完成技术实现，自己明确运营问题、内容依据、检索目标与验收标准。']}
};
function kind(e){
 if(/广告素材|企业素材/.test(e.name))return 'enterprise';
 if(/^Tcode/.test(e.name))return 'tcode';
 if(/AgentCut|Agent 创作/.test(e.name))return /工具链/.test(e.name)?'media':'suite';
 if(/^TrendScope/.test(e.name))return 'trend';
 if(/SEO \/ GEO/.test(e.name))return 'geo';
 if(/^AIGC 视频/.test(e.name))return 'video';
 if(/^AIGC 系列海报/.test(e.name))return 'poster';
 if(/^品牌策略/.test(e.name))return 'brand';
 return null;
}
const compactSkills={
 ai:'AI 应用与 Agent：具备 Prompt / Skill、RAG、Tool Calling、Tool Routing、Agent Loop 与 MCP 项目实践；能将业务规则、边界条件及人工 SOP 转化为可检索、可执行的工具和流程。',
 dev:'Agent 辅助开发：使用 Claude Code、Codex、Cursor 等 Agent 开展 Vibe Coding，独立主导需求拆解、功能设计、开发测试及持续迭代；累计开发 20+ 款软件与自动化工具，有桌面、Web、插件和 AI 辅助部署实践。',
 auto:'技术与自动化：具备 Python 基础；有 REST API、Playwright、影刀 RPA、文件批处理实践，能根据任务选择确定性程序、网页自动化或 LLM；具备日志检查、异常回溯和结果验证经验。',
 cost:'模型与成本：能够比较模型输出质量、速度与 Token 性价比，按任务选择调用方式；有上下文摘要、工具结果折叠、重复调用缓存、用量记录及备用模型切换实践。',
 data:'Excel / 飞书多维表格：熟悉 Excel 函数、跨表匹配与批量处理，以及飞书多维表格的关联记录、自动化、视图、筛选、权限及图表配置；具备日均数千条业务数据处理与状态管理经验。',
 product:'产品与流程运营：具备 SOP 梳理、需求抽象、功能优先级、跨业务协作、使用教程、推广支持和反馈迭代经验；能连接业务问题、落地方案与可检查的交付结果。',
 visual:'视频与视觉：熟练使用 Premiere Pro、After Effects、剪映，熟悉 Lightroom；具备广告脚本、镜头组织、剪辑包装、活动摄影、系列海报及音画整合能力。',
 aigc:'AIGC：使用 Pavo AI、Midjourney、Suno、Fish Audio 等平台及工具，以及 Seedance、Veo、MiniMax、Nano Banana、GPT Image 等模型；能结合目标表达选择生成、程序化动效与传统后期，并检视成片。',
 marketing:'内容与品牌：具备受众洞察、热点核实、选题发布与数据复盘经验；能组织品牌主题、传播渠道、参与路径、预算和风险预案，已有独立概念作品及策划提案。',
 geo:'SEO / GEO：具备域名配置、公开事实整理、可抓取页面与索引优化、搜索提交、姓名检索及 AI 引用验证经验；有内容简报、主张核验、渠道适配和发布回执实践。'
};
const skillOrder={app:['ai','dev','auto','cost','data','product'],aigc:['aigc','visual','marketing','dev','product'],ops:['product','ai','cost','data','geo','marketing','dev'],default:['ai','dev','auto','cost','data','product','visual','aigc','geo']};
const advantages={
 app:[
 '业务判断而非工具堆叠：能在实际岗位中识别高频、耗时且可实施的流程，两天内形成 SOP 与需求清单，按投入产出逐步推进；将日常工作中的效率问题做成可用的软件。',
 '独立落地与规模验证：从 0→1 构建当前工作自动化系统，覆盖四个平台和五个环节；同口径产能由单人约 500 条/日提升至自动化 6000+ 条/日，投入 3–5 人团队日常生产。',
 '知识、模型与工具分层：既有企业项目隔离的向量 RAG 和规则迭代，也有个人 BM25 检索与来源引用；能组合确定性执行、模型判断、Tool Calling 与人工处理，避免将所有任务交给模型。',
 '产品交付与协作：具备桌面、Web 与插件产品实践，能明确输入输出、操作流程和验收条件，排查环境与账号差异，并通过文档、教程和使用反馈推动工具交给他人使用。',
 '可用性与成本意识：实际比较模型质量、速度及 Token 性价比，结合上下文折叠、缓存、调用记录和模型切换管理多轮任务；同时关注结果校验、重试、恢复与人工接管。',
 '广告学与创作复合优势：懂素材、内容和运营业务，也有传统剪辑与视觉判断能力，可将 AI 应用贴近具体用户任务，而非仅展示技术概念。'
 ],
 aigc:[
 '创意定义与表达判断：能将产品卖点、受众和传播目的转为脚本、镜头与声音设计，既有广告学训练，也熟练使用传统后期工具，不只会输入提示词生成素材。',
 '作品类型与完整交付：具有产品概念广告、连续叙事、AE 风格程序化动效及 9 组 27 幅商业主题 AIGC 海报，能展示成片、系列文案和视觉体系，而非零散效果片段。',
 '跨方法制作能力：可根据画面目标组合视频 / 图像模型、Agent 生成 JavaScript 动效及传统剪辑，负责创意、素材筛选和结果验收，理解自动生成与人工修订的边界。',
 '创作与软件双能力：能够围绕素材准备、音频处理和后期操作自研工具，已扩展 AgentCut、AgentCanvas、AgentVideo 创作套件，将创意制作与可调用、可编辑的工具交付结合。',
 '真实素材业务经验：在企业参与大批量 AIGC 视频资产处理与交付，理解素材标准、客户 Brief、异常处理和审核协作，能在追求画面表现的同时兼顾生产流程。',
 '内容反馈与品牌意识：具有账号运营、热点核实和数据复盘经验，能组织受众洞察、品牌主题及传播路径；明确自主概念作品与真实商业委托的区别。'
 ],
 ops:[
 '从业务问题到产品落地：能从一线流程发现需求，按频率、人工成本和实施难度确定优先级，再借助 Agent 实现功能；不是只提出运营建议，也能将改进真正做成工具。',
 '跨业务协同与用户采用：有达人运营、素材管理及媒介协同经验，能够对齐 Brief、标签和交付标准，维护需求与教程，解决环境差异并推动 3–5 人小组持续使用。',
 'AI 内容与知识库运营：具备 Prompt / Skill、项目隔离 RAG、规则维护、误判回溯和抽检实践；能够把规则更新、人工反馈和质量控制组织为迭代闭环。',
 '模型与成本判断：实际比较模型 Token 性价比并按任务选择方案，结合工具结果折叠、缓存、用量记录及故障切换，能够同时评估效果、成本与用户体验。',
 '搜索与内容效果验证：个人姓名检索实测中，网站在 Google 结果首位且可由 ChatGPT 不预给域名检索引用；具有热点线索核实、受众切入及近 50 万播放的单次创作案例。',
 '广告学复合背景：兼具内容策划、传统后期、品牌方案和业务数据处理能力，可连接产品功能、用户理解、传播表达及使用反馈，支持 AI 产品与数字化运营。'
 ]
};
const intros={
 app:[
 '重庆交通大学广告学 2027 届本科生，求职方向为 AI 应用、业务自动化及 AI 解决方案；擅长从真实工作任务识别需求，借助 Agent 将业务经验和规则转为实际可用的软件。',
 '在优矩互动独立构建当前工作所用全流程系统，覆盖四个平台和素材下载、匹配、标注、整理、送审五个环节；日均 6000+ 条、峰值 1 万+、累计 30 万+，投入 3–5 人团队使用。',
 '具备企业 Agent 的 36 个业务脚本工具、项目隔离 RAG、抽检与异常处理实践；同口径日处理产能约为单人纯人工基线的 12 倍，完整日常流程约 1.5 小时、人工操作低于 5 分钟。',
 '独立开发 Tcode 跨应用任务助手及人机共用创作软件，当前 Tcode 目录登记 14 个项目、24 个通用工具；具备工具契约、BM25 检索、Token 记录、上下文压缩和模型故障切换经验。',
 '累计开发 20+ 款软件及自动化工具，具备 Python 基础；通过 Claude Code、Codex、Cursor 等 Agent 与 Vibe Coding 主导需求、方案、软件交付、测试及迭代，并能跨业务对齐标准、支持同事使用。'
 ],
 aigc:[
 '重庆交通大学广告学 2027 届本科生，重点从事 AIGC 视频、视觉创意与内容制作；既有广告创意、脚本和品牌表达，也熟练使用 Premiere Pro、After Effects、剪映进行传统后期。',
 '作品集包含产品概念广告、连续动画叙事和程序化动效，并展示 9 组商业主题视觉系列、27 幅 AIGC 海报；能够从产品、受众与主题出发形成完整成片或系列表达。',
 '《只写代码》中负责创意、脚本及效果判断，借助 Agent 生成 JavaScript 动画并直接渲染，约 1 小时完成多物体差异化动效与 AE 风格转场，具备制作方法选择和结果验收能力。',
 '实际使用 Pavo AI、Midjourney、Suno、Fish Audio 等工具及 Seedance、Veo、MiniMax 等模型，结合素材筛选、音画整合和传统后期完成作品，不以单次生成代替完整制作。',
 '在企业参与大量 AIGC 视频资产处理与交付，并自主开发素材和媒体工具，扩展 AgentCut、AgentCanvas、AgentVideo 创作套件；能够同时理解创意表达、素材标准、可编辑工程与交付流程。'
 ],
 ops:[
 '重庆交通大学广告学 2027 届本科生，求职方向为 AI 产品运营、数字化运营及 AI 营销；核心优势是将业务流程、AI 应用和传播表达结合，既能发现需求，也能推动功能落地与使用。',
 '在企业对齐客户 Brief、标签规则和交付标准，独立推进四个平台、五个环节的业务自动化，投入 3–5 人小组并支撑 5+ 真实项目，形成需求、上线、反馈与迭代闭环。',
 '具备 Prompt / Skill、知识库维护、抽检、误判回溯和人工处理实践；能够以确定性程序和模型分工管理质量，并比较 Token 性价比、调用方式与多轮任务成本。',
 '独立开发 TrendScope，将热点发现、人工核实、受众切入、制作发布和复盘连接；运营 4 个个人账号，单条原创最高近 50 万播放，累计 5 条作品超过 1 万播放。',
 '完成个人网站及 ZTT GEO 运营实践，姓名检索实测中 Google 出现网站首位，ChatGPT 在未预先给域名时可检索引用；同时拥有 Tcode 跨应用助手、内容制作与品牌提案实践，可支持 AI 产品体验与内容运营。'
 ]
};
const defaultIntro=[
 '重庆交通大学广告学 2027 届本科生，具有 AI 应用、业务自动化、产品与数字化运营、AIGC 及广告创意的复合实践；能够独立推进需求、工具落地、真实使用、质量检查及反馈迭代。',
 ...intros.app.slice(1,4),
 '创作端具有产品概念广告、程序化动效、连续叙事及 9 组 27 幅商业主题 AIGC 海报；能够结合模型、Agent 与传统后期选择制作方法，并以可展示作品验收创意。',
 '运营端有 4 个个人账号、近 50 万播放的单次原创作品、完整品牌提案及个人 SEO / GEO 实践；姓名检索测试中，Google 网站首位、ChatGPT 未预先获知域名即可检索引用。'
];

for(const lib of next.libraries){
 const track=trackOf(lib),p=profileForLibrary(next,lib.id);
 assert(files[track],`未知资料库 ${lib.id}`);
 for(const e of p.internships){
   if(e.company==='优矩互动科技有限公司'){
     const work=track==='aigc'?aigcEnterpriseWork:track==='ops'?opsEnterpriseWork:enterpriseWork.filter((_,i)=>[0,1,2,6,8].includes(i));
     revise(e,{work,results:enterpriseResults,focus:['独立负责当前岗位自动化系统的需求梳理、业务规则转化、方案落地与测试迭代。','协同达人运营、素材管理及媒介明确交付标准，结合使用反馈和审核结果维护规则、数据流程与操作说明。']});
     e.department='达人运营部';e.startDate='2026.07';e.endDate='2026.10';
   }else if(e.company==='重庆青天特克科技有限公司'){
     revise(e,{work:[
       '内容制作与信息表达：围绕仪器仪表行业的销售口播、科普及信息流内容整理素材，完成剪辑、字幕、音效和基础视觉包装，将产品与知识信息组织为适合短视频观看的表达。',
       '选题与发布协作：参与账号选题策划、内容排期、日常发布与维护，结合选题目标和素材条件安排制作，配合团队持续交付。',
       '数据辅助调整：跟踪播放量、完播及互动数据，根据内容表现辅助调整选题方向、表达结构和剪辑节奏，将发布反馈用于后续制作。'
     ],results:['保持约 5 条/周、20 条/月的内容制作与交付节奏；积累垂直行业产品信息整理、短视频制作和账号协作经验。'],focus:['负责素材整理、短视频后期及基础视觉包装，参与选题、排期、发布和数据复盘。']});
     e.department='IP部';
   }else if(e.company==='重庆蔡同水务有限公司'){
     revise(e,{work:[
       '企业图文传播：整理微信公众号与新闻资料，完成文字编辑、图片筛选和图文排版，依据企业传播需要组织清晰、可发布的内容。',
       '现场影像与新闻整理：参与会议及活动摄影，根据新闻用途选择照片、完成基础后期并整理事件信息，支持现场内容转化为传播素材。',
       '资料归档与复用：整理图片、新闻稿和品牌资料，保持素材分类与检索入口，支持日常传播及后续内容复用。'
     ],results:['完成约 10 篇微信公众号及新闻内容编辑与排版，参与 10+ 场会议及活动摄影，支持企业日常品牌传播。'],focus:['负责企业图文编辑排版、活动摄影、素材筛选、基础后期与品牌资料归档。']});
     e.department='行政部';
   }else throw Error(`未知公司 ${e.company}`);
 }
 // An operations library needs actual AI-product use evidence, not only brand plans.
 if(track==='ops'&&!p.projects.some(e=>kind(e)==='tcode')){
   p.projects.splice(1,0,structuredClone(profileForLibrary(before,'ztt_app_20261006').projects.find(e=>kind(e)==='tcode')));
 }
 for(const e of p.projects){
   const k=kind(e);
   if(definitions[k]){
     const d=structuredClone(definitions[k]);
     if(k==='enterprise'&&track==='ops')d.work=opsEnterpriseWork.concat(enterpriseWork.slice(4,8));
     if(k==='tcode'&&track==='ops'){
       d.name='Tcode｜AI 任务助手与产品体验优化';
       d.role='独立产品构建与体验迭代';
       d.work=[tcodeWork[0],tcodeWork[1],tcodeWork[4],tcodeWork[5],tcodeWork[6],tcodeWork[2],tcodeWork[7]];
     }
     revise(e,d);
     if(k==='suite'){e.startDate='2026.10';e.endDate='2026.10';}
     e.keywords=[...new Set([...(e.keywords||[]),...(k==='suite'||k==='media'?['AgentCut','AgentCanvas','AgentVideo','人机协同','可编辑交付']:k==='tcode'?['BM25','Tool Calling','Token 成本','上下文管理']:[])])];
   }else if(k==='brand'){
     const work=points(e.workContent||e.description).filter(s=>!s.startsWith('项目成果：'));
     const results=['作品集已展示 8 份独立品牌策划提案，涵盖受众洞察、策略、创意、渠道及执行规划；均为个人方案实践，预算、周期和目标按计划口径表达。'];
     revise(e,{work,results,focus:['独立负责传播问题定义、受众与产品洞察、创意主题、渠道路径、执行节奏及风险评估。','根据方案需要组织文案与视觉呈现，将抽象策略落到可阅读、可讨论的提案。']});
   }else{
     // Preserve previously curated complete projects; correct the development attribution only.
     const work=points(e.workContent||e.description).filter(s=>!s.startsWith('项目成果：')).map(s=>s.replace('使用 Express、React 和 TypeScript 完成','借助 Agent，使用 Express、React 和 TypeScript 完成').replace('以 TypeScript、React 和 Vite 实现','借助 Agent，以 TypeScript、React 和 Vite 实现'));
     revise(e,{work,results:points(e.achievements),focus:points(e.responsibilities)});
   }
   for(const f of ['startDate','endDate'])e[f]=e[f].replace(/^(\d{4})\.(\d)$/,'$1.0$2');
 }
 // Resolver joins skill-array items with a delimiter. One numbered block keeps
 // multi-line copy/paste intact without changing the extension application code.
 p.skills.technical=[numbered([...skillOrder[track].map(k=>compactSkills[k]),'英语：大学英语六级（CET-6），可阅读英文行业与基础 AI 技术资料。'])];
 p.skills.tools=track==='aigc'?['Premiere Pro、After Effects、剪映、Lightroom','Pavo AI、Midjourney、Suno、Fish Audio','Seedance、Veo、MiniMax、Nano Banana、GPT Image','Claude Code、Codex、Cursor 等 Agent；自研 AgentCut、AgentCanvas、AgentVideo 及素材处理工具链']:track==='ops'?['Claude Code、Codex、Cursor 等 Agent；ChatGPT、Gemini','TrendScope、ZTT GEO、Tcode；Excel、飞书多维表格、Playwright、影刀 RPA','Premiere Pro、After Effects、剪映、Lightroom']:['Claude Code、Codex、Cursor 等 Agent；Tcode、WorkflowHub','Python（基础）、REST API、Playwright、影刀 RPA、MCP；Excel、飞书多维表格','在独立项目中借助 Agent 使用 Node.js、React、TypeScript、Electron / Tauri 等技术，不等同全部熟练掌握'];
 const a=track==='default'?[...advantages.app.slice(0,5),advantages.aigc[0],advantages.aigc[1],advantages.ops[4],advantages.ops[5]]:advantages[track];
 p.content.personalAdvantages=numbered(a);
 p.content.selfIntroduction=numbered(track==='default'?defaultIntro:intros[track]);
 p.content.selfEvaluation=numbered([
   '问题判断：习惯先实际走一遍流程，确认输入、判断条件、耗时和交付标准，再决定是否需要模型、工具或人工；优先推进收益明确且可验收的改进。',
   '独立推进：能够自行拆解需求、安排功能优先级，借助 Agent 将方案实现为软件或内容作品；遇到问题通过日志、样本和结果对照定位，不停留于提出想法。',
   '协作与反馈：能够把业务人员的经验转成规则和说明，通过使用反馈发现上手障碍，持续完善产品、文档和交付流程，重视工具是否真正被采用。',
   track==='aigc'?'创作判断：注重产品信息、镜头、画面和声音是否共同服务表达，愿意比较生成、程序化动画和传统后期的适用方式，以完整作品检视质量。':'质量与成本：将任务可完成、结果可核查、失败可定位作为交付标准；关注模型效果、Token 消耗与异常处理，不以演示成功代替真实业务可用。'
 ]);
 p.content.careerPlan=numbered(track==='aigc'?[
   '希望在 AIGC 内容、视频制作或视觉创意岗位结合广告学与后期基础，围绕受众、产品和传播目的承担从创意到完整作品的交付。',
   '进入团队后优先理解品牌标准、制作流程与验收要求，选择合适的生成和后期方法，并将高频素材准备及媒体处理沉淀为可复用工具。',
   '持续提高脚本、镜头、视觉系列化及成片质量判断能力，通过真实作品与协作反馈完善制作方法。'
 ]:track==='ops'?[
   '希望从事 AI 产品运营、数字化运营或 AI 营销，发挥业务需求、AI 落地、数据反馈及传播表达的复合优势。',
   '进入团队后先理解用户任务、现有流程与交付指标，建立需求优先级、功能上线、使用支持、质量与效果复盘的迭代闭环。',
   '进一步加强模型效果与成本分析、产品体验及知识库运营能力，将运营判断转化为可执行、可验证的产品改进。'
 ]:[
   '希望围绕 AI 应用、业务自动化与解决方案工作，持续把真实业务问题转化为可交付、可检查的软件与流程；结合广告学背景保留内容和用户表达优势。',
   '进入团队后先理解一线 SOP、质量要求及操作环境，从高频、高成本且可行的场景切入，将需求、实现、验收、使用反馈和迭代连接。',
   '持续加强 Python 与接口基础、工具契约、知识检索、异常处理和模型成本管理，逐步承担更完整的应用交付与跨业务协作。'
 ]);
 // Valuable interests and all campus entries stay intact. No invented identity/preferences.
 if(track==='ops'){
   p.jobPreferences.expectedPosition=['AI 产品运营','数字化运营','AI 应用运营','AI 营销','SEO / GEO 运营'];
   p.careerPreferences.targetDirections=[...p.jobPreferences.expectedPosition];
 }
 lib.content=Object.fromEntries(Object.entries(p).filter(([k])=>!['basic','education','sensitive'].includes(k)));
 lib.note='2026.10.10 更新：岗位精选完整项目、详细编号正文；保留三段实习与志愿者经历，职责/工作/成果分开，未知个人信息及承诺不代填。';
}

// The default library can answer role-specific forms without losing its comprehensive text.
const defaultLib=next.libraries.find(l=>trackOf(l)==='default');
for(const group of ['projects','internships'])for(const e of defaultLib.content[group]){
 for(const [track,keys]of [['app',['agent','aiApplication','aiSolution']],['ops',['aiProduct','aiOperation']],['aigc',['aigcMarketing']]]){
   const candidates=next.libraries.find(l=>trackOf(l)===track).content[group];
   const match=candidates.find(v=>group==='internships'?v.company===e.company:kind(v)&&kind(v)===kind(e));
   if(match)for(const key of keys)e.variants[key]=match.description;
 }
}
function verify(store){
 assert.deepEqual(store.shared,before.shared,'不得改动公共基本信息、教育或敏感字段');
 assert.equal(store.activeLibraryId,before.activeLibraryId);
 assert.equal(store.libraries.length,before.libraries.length);
 const details=[];
 for(const l of store.libraries){
   const p=profileForLibrary(store,l.id),t=trackOf(l);
   const v=validateProfile(structuredClone(p));assert(v.ok,v.errors?.join('; '));
   const repaired=repairProfileShape(p);
   assert.deepEqual(p.campus,profileForLibrary(before,l.id).campus,'志愿者经历必须完整保留');
   assert.equal(p.internships.length,3);
   for(const e of p.internships)assert.equal(e.department,{'优矩互动科技有限公司':'达人运营部','重庆青天特克科技有限公司':'IP部','重庆蔡同水务有限公司':'行政部'}[e.company]);
   for(const [collection,field]of [['internships','internship.description'],['projects','project.description'],['campus','campus.description']]){
     for(const [i,e]of p[collection].entries()){
       assert(e.description?.startsWith('1. '));
       for(const key of ['description','responsibilities','workContent','achievements','summary',...(collection==='projects'?['background']:[])]){
         assert(e[key]?.trim(),`${l.name} ${e.name||e.company} ${key} 为空`);
         assert(!/\*\*|\n\s*\n/.test(e[key]),'正文不含 Markdown 粗体及空行');
       }
       assert.equal(resolveValue(field,repaired,{entryIndex:i,profileType:'general'})?.value,e.description);
       for(const d of l.directions)assert.equal(resolveValue(field,repaired,{entryIndex:i,profileType:d})?.value,e.variants[d]);
       if(collection==='projects')assert(!e.startDate.includes('至今')&&!e.endDate.includes('至今'));
     }
   }
   for(const [k,s]of Object.entries(p.content)){assert.equal(typeof s,'string');assert(s.startsWith('1. '));assert(!/\*\*|\n\s*\n/.test(s));assert.equal(resolveValue(`content.${k}`,repaired)?.value,s);}
   const skillText=p.skills.technical.join('\n');
   assert.equal(resolveValue('skills.technical',repaired)?.value,skillText);
   assert(skillText.length<=1000,`${t} 专业技能 ${skillText.length} 字超过 1000`);
   assert(!JSON.stringify(p.content).includes('游戏'));
   for(const d of l.directions)assert.equal(selectLibraryForDirection(store,d).id,l.id);
   const all=p.projects.map(e=>e.description).join('\n');
   assert(all.includes('AgentCanvas')||t==='ops');
   if(t==='ops'||t==='default')assert(all.includes('未预先给出域名')&&all.includes('Google'));
   details.push({name:l.name,projects:p.projects.length,internships:3,campus:p.campus.length,professionalSkillsCharacters:skillText.length,projectDescriptionCharacters:p.projects.map(e=>({name:e.name,chars:e.description.length}))});
 }
 return details;
}
const details=verify(next);
const pack={kind:'ztt/application-form-assistant/role-library-pack',version:1,generatedAt:new Date().toISOString(),preserveProfileShape:true,preserveShared:true,preserveExistingLibraries:true,activeLibraryId:before.activeLibraryId,expectedStoreSha256:createHash('sha256').update(stable(before)).digest('hex'),receiptFile:'四资料库升级_20261010_导入回执.json',libraries:next.libraries.map(l=>({id:l.id,name:l.name,directions:l.directions,note:l.note,profile:profileForLibrary(next,l.id)}))};
if(process.argv.includes('--verify-receipt')){
 const receipt=read(pack.receiptFile),expected=structuredClone(next);
 assert.equal(receipt.ok,true);
 for(const l of expected.libraries)l.updatedAt=receipt.store.libraries.find(v=>v.id===l.id).updatedAt;
 assert.deepEqual(receipt.store,expected,'实际保存内容必须与预期完全一致');
 assert.deepEqual(receipt.mirror,profileForLibrary(receipt.store,receipt.store.activeLibraryId));
 verify(receipt.store);
 write('四资料库升级_20261010_校验报告.json',{ok:true,storageReadback:true,sharedPreserved:true,activeLibraryPreserved:true,allDescriptionsNumbered:true,semanticFieldsVerified:true,libraries:details,backup:receipt.originalBackupFile});
 console.log(JSON.stringify({ok:true,storageReadback:true,libraries:details.map(({name,projects,professionalSkillsCharacters})=>({name,projects,professionalSkillsCharacters}))}));
}else{
 write('四资料库升级_20261010_导入包.json',pack);
 write('三岗位资料库导入包.json',{...pack,libraries:pack.libraries.filter(l=>!l.id.startsWith('lib_'))});
 write('默认资料库导入包.json',{...pack,libraries:pack.libraries.filter(l=>l.id.startsWith('lib_'))});
 for(const l of pack.libraries){
   const p=l.profile,t=trackOf(l);
   write(files[t],{kind:'application-form-assistant/profile',version:1,profile:p});
   const parts=[l.name,'个人介绍',p.content.selfIntroduction,'个人优势',p.content.personalAdvantages,'专业技能（1000字以内）',p.skills.technical.join('\n'),'实习经历'];
   for(const e of p.internships)parts.push(`${e.startDate} - ${e.endDate} ${e.company}｜${e.department}｜${e.position}`,'经历描述',e.description,'工作职责',e.responsibilities,'工作内容',e.workContent,'工作业绩',e.achievements,'实习总结',e.summary);
   parts.push('项目经历');
   for(const e of p.projects)parts.push(`${e.startDate||'时间未单独确认'}${e.endDate?' - '+e.endDate:''} ${e.name}｜${e.role}`,'项目背景',e.background,'项目描述',e.description,'项目职责',e.responsibilities,'项目内容',e.workContent,'项目成果',e.achievements,'项目概述',e.summary);
   parts.push('校园经历');for(const e of p.campus)parts.push(`${e.startDate} - ${e.endDate} ${e.organization}｜${e.department}｜${e.position}`,e.description);
   parts.push('自我评价',p.content.selfEvaluation,'职业规划',p.content.careerPlan,'兴趣爱好',p.content.hobbies);
   const text=parts.join('\n');
   write(t==='default'?'默认资料库_复制粘贴.txt':`${t}_资料库_复制粘贴.txt`,text);
   write(t==='default'?'默认资料库_完整内容.md':`${t}_新版描述预览.md`,text);
   if(t!=='default')write(`${t}_资料库内容预览.md`,text);
   else write('默认资料库_新版描述预览.md',text);
 }
 write('四资料库升级_20261010_导入前校验.json',{ok:true,storageReadback:false,sharedPreserved:true,activeLibraryPreserved:true,libraries:details});
 console.log(JSON.stringify({ok:true,libraries:details.map(({name,projects,professionalSkillsCharacters})=>({name,projects,professionalSkillsCharacters}))}));
}
