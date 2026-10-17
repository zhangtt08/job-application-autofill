import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { scanPage } from "../src/content/scanner";
import { runScanPipeline } from "../src/pipeline/scanPipeline";
import { fillFields } from "../src/content/filler";
import { defaultProfile } from "../src/profile/defaultProfile";
import { htmlForLabel } from "../src/content/domUtils";
import { setContentEditableText, setSelectValue } from "../src/content/eventDispatcher";

beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 160, height: 24, top: 0, left: 0, bottom: 24, right: 160, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
});
beforeEach(() => { document.body.innerHTML = ""; });

function profile() {
  const p = structuredClone(defaultProfile);
  p.basic.birthDate = "2002.09.08";
  p.internships = [0,1,2].map(i => ({ company: `公司${i}`, department: "", position: `岗位${i}`, startDate: `202${i}.06`, endDate: `202${i+1}.09`, description: `描述${i}`, responsibilities: `职责${i}\n第二行`, workContent: `内容${i}`, achievements: "", summary: `概述${i}`, variants: { agent: "", aiApplication: "", aiProduct: "", aiOperation: "", aiSolution: "", aigcMarketing: "" } }));
  return p;
}
function part(name: string, texts: string[], id: string) {
  return `<select id="${id}" aria-label="${name}"><option value="">请选择</option>${texts.map((text,i)=>`<option value="v${i}">${text}</option>`).join('')}</select>`;
}
const years = ['2019年','2020年','2021年','2022年','2023年'];
const months = ['01月','06月','09月','12月'];

describe("通用 ATS 表单结构", () => {
  it.each(['el-form-item','ant-form-item','form-item','layui-form-item'])("%s 外层关联标签优先于计数和编辑工具栏", (cls) => {
    document.body.innerHTML = `<section><h2>工作经历</h2><div class="${cls}"><label for="duty-wrapper">工作职责</label><div id="duty-wrapper"><div role="toolbar"><button>加粗</button></div><span>0 / 1000</span><textarea id="duty">旧职责</textarea></div></div></section>`;
    expect(htmlForLabel(document.getElementById('duty')!)).toBe('工作职责');
    expect(runScanPipeline(scanPage(), profile())[0]!.match.fieldId).toBe('internship.responsibilities');
  });

  it("没有 for 关联时跳过字数提示，继续寻找本字段标签", () => {
    document.body.innerHTML = `<section><h2>工作经历</h2><div><div class="field-label">工作职责</div><div><span>0/1000字</span><textarea id="duty">旧职责</textarea></div></div></section>`;
    expect(htmlForLabel(document.getElementById('duty')!)).toBe('工作职责');
  });

  it("不把包含多个字段的外层标签借给某个子控件", () => {
    document.body.innerHTML = `<label for="whole">工作职责</label><div id="whole"><label>公司<input></label><label>岗位<input></label></div>`;
    expect(Array.from(document.querySelectorAll('input')).map(htmlForLabel)).toEqual(['公司','岗位']);
  });

  it("富文本职责参与同一经历分组，缺失一栏也不让后面的职责向前串位", () => {
    document.body.innerHTML = `<section><h2>工作经历</h2><div class="entry"><label>公司<input id="c0"></label><label>岗位<input></label></div><div class="entry"><label>公司<input id="c1"></label><label>岗位<input></label><label for="r1">工作职责</label><div contenteditable="true" id="r1">旧职责</div></div><div class="entry"><label>公司<input id="c2"></label><label>岗位<input></label><label for="r2">工作职责</label><div contenteditable="true" id="r2">旧职责</div></div></section>`;
    for (const el of document.querySelectorAll('[contenteditable]')) Object.defineProperty(el,'isContentEditable',{value:true});
    const candidates = runScanPipeline(scanPage(), profile());
    expect(candidates.find(c => c.raw.context.id==='r1')?.value?.value).toBe('职责1\n第二行');
    expect(candidates.find(c => c.raw.context.id==='r2')?.value?.value).toBe('职责2\n第二行');
  });
  it("卡片的公司标题不遮住经历板块标题；仅有公司的一段仍占据自己的顺序", () => {
    document.body.innerHTML='<section><h2>工作经历</h2><article class="work-item"><h3>旧公司一</h3><label>公司<input id="c0"></label></article><article class="work-item"><h3>旧公司二</h3><label>公司<input id="c1"></label><label>工作职责<textarea id="r1"></textarea></label></article></section>';
    const candidates=runScanPipeline(scanPage(),profile());
    expect(candidates.every(c=>c.raw.context.sectionTitle==='工作经历')).toBe(true);
    expect(candidates.find(c=>c.raw.context.id==='r1')?.value?.value).toBe('职责1\n第二行');
  });
  it("只打开第三张卡片编辑时仍取第三段资料，不把第一段填进第三张", () => {
    document.body.innerHTML='<section><h2>工作经历</h2><article class="work-item">只读第一段</article><article class="work-item">只读第二段</article><article class="work-item"><label>公司<input></label><label>工作职责<textarea></textarea></label></article></section>';
    expect(runScanPipeline(scanPage(),profile()).map(c=>c.value?.value)).toEqual(['公司2','职责2\n第二行']);
  });

  it("原生年月拆分框识别起止语义、同一条经历，按可见选项覆盖", async () => {
    document.body.innerHTML = `<section><h2>工作经历</h2>${[0,1].map(i=>`<div class="entry"><label>公司<input id="c${i}" value="旧公司"></label><div><span class="field-label">开始时间</span><div>${part('年份',years,`y${i}`)}${part('月份',months,`m${i}`)}</div></div><div><span class="field-label">结束时间</span><div>${part('年份',years,`ey${i}`)}${part('月份',months,`em${i}`)}</div></div></div>`).join('')}</section>`;
    const candidates = runScanPipeline(scanPage(), profile());
    for(let i=0;i<2;i++) {
      expect(candidates.find(c=>c.raw.context.id===`y${i}`)?.value?.value).toBe(`202${i}年`);
      expect(candidates.find(c=>c.raw.context.id===`m${i}`)?.value?.value).toBe('06月');
      expect(candidates.find(c=>c.raw.context.id===`ey${i}`)?.value?.value).toBe(`202${i+1}年`);
      expect(candidates.find(c=>c.raw.context.id===`em${i}`)?.value?.value).toBe('09月');
    }
    const result = await fillFields({confirmed:true,fields:candidates.filter(c=>c.value).map(c=>({reference:c.raw.reference,kind:c.raw.kind,value:c.value!.value}))});
    expect(result.outcomes.every(o=>o.status==='filled')).toBe(true);
    expect((document.getElementById('m1') as HTMLSelectElement).selectedOptions[0]!.textContent).toBe('06月');
  });

  it("没有经历容器的拆分日期也不把同一日期的年月分配给不同条目", () => {
    document.body.innerHTML = `<section><h2>工作经历</h2>${[0,1].map(i=>`<div><span class="field-label">开始时间</span><div>${part('年份',years,`y${i}`)}${part('月份',months,`m${i}`)}</div></div>`).join('')}</section>`;
    const candidates=runScanPipeline(scanPage(), profile());
    expect(candidates.filter(c=>c.raw.context.id.startsWith('y')).map(c=>c.value?.value)).toEqual(['2020年','2021年']);
    expect(candidates.filter(c=>c.raw.context.id.startsWith('m')).map(c=>c.entryIndex)).toEqual([0,1]);
  });

  it("生日年/月/日按完整资料拆分；资料缺日时整组保留原值", () => {
    document.body.innerHTML = `<div><span class="field-label">出生日期</span><div>${part('年份',['2002年'],'by')}${part('月份',['09月'],'bm')}${part('日期',['08日'],'bd')}</div></div>`;
    const p=profile();
    expect(runScanPipeline(scanPage(),p).map(c=>c.value?.value)).toEqual(['2002年','09月','08日']);
    p.basic.birthDate='2002.09';
    expect(runScanPipeline(scanPage(),p).every(c=>c.value===undefined)).toBe(true);
  });

  it("日期范围两端共享起止标签时分开识别开始和结束", () => {
    document.body.innerHTML = `<section><h2>工作经历</h2><label for="range">起止时间</label><div class="ant-picker ant-picker-range" id="range"><input readonly id="from"><span>至</span><input readonly id="to"></div></section>`;
    const candidates = runScanPipeline(scanPage(), profile());
    expect(candidates.map(c=>c.match.fieldId)).toEqual(['internship.startDate','internship.endDate']);
    expect(candidates.map(c=>c.value?.value)).toEqual(['2020.06','2021.09']);
  });

  it("英文月份下拉使用网站的可见月份文本", () => {
    document.body.innerHTML = `<section><h2>Work Experience</h2><div><span class="field-label">Start Date</span><div>${part('Year',years,'year')}${part('Month',['January','June','September'],'month')}</div></div></section>`;
    expect(runScanPipeline(scanPage(),profile()).map(c=>c.value?.value)).toEqual(['2020年','June']);
  });

  it("日期某个部分没有对应选项时不只改年份而留下旧月份", () => {
    document.body.innerHTML = `<section><h2>工作经历</h2><div><span class="field-label">开始时间</span><div>${part('年份',years,'year')}${part('月份',['01月','12月'],'month')}</div></div></section>`;
    expect(runScanPipeline(scanPage(),profile()).every(c=>c.value===undefined)).toBe(true);
  });

  it("编辑器拒绝原生替换时不破坏内部节点，也不伪造成功", () => {
    document.body.innerHTML = '<div contenteditable="true"><p>已有职责</p></div>';
    const editor=document.querySelector<HTMLElement>('[contenteditable]')!;
    Object.defineProperty(editor,'isContentEditable',{value:true});
    const original=editor.firstChild;
    Object.defineProperty(document,'execCommand',{configurable:true,value:vi.fn(()=>false)});
    try {
      expect(setContentEditableText(editor,'新职责').ok).toBe(false);
      expect(editor.firstChild).toBe(original);
    } finally { delete (document as unknown as Record<string,unknown>).execCommand; }
  });

  it("原生多选按资料库完整覆盖，撤销可还原原选项", async () => {
    document.body.innerHTML = '<select multiple><option selected>北京</option><option>杭州</option><option>上海</option></select>';
    const select=document.querySelector('select')!;
    expect((await setSelectValue(select,'上海、杭州')).ok).toBe(true);
    expect(Array.from(select.selectedOptions).map(o=>o.textContent)).toEqual(['杭州','上海']);
    expect((await setSelectValue(select,'北京')).ok).toBe(true);
    expect(Array.from(select.selectedOptions).map(o=>o.textContent)).toEqual(['北京']);
    expect((await setSelectValue(select,'杭州、广州')).ok).toBe(false);
    expect(Array.from(select.selectedOptions).map(o=>o.textContent)).toEqual(['北京']);
  });
  it("填写后一个字段触发联动回滚时，不把前一个已回滚字段继续报告为成功", async () => {
    document.body.innerHTML='<label>姓名<input id="name" value="旧姓名"></label><label>邮箱<input id="email" value="old@example.invalid"></label>';
    const input=document.getElementById('name') as HTMLInputElement;
    document.getElementById('email')!.addEventListener('input',()=>{input.value='旧姓名';});
    const fields=scanPage();
    const result=await fillFields({confirmed:true,fields:fields.map(field=>({reference:field.reference,kind:field.kind,value:field.context.id==='name'?'新姓名':'new@example.invalid'}))});
    expect(result.outcomes.map(o=>o.status)).toEqual(['failed','filled']);
    expect(result.outcomes[0]!.detail).toContain('联动');
  });
});
