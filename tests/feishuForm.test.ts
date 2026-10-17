import { beforeAll, describe, expect, it, vi } from "vitest";
import { setDatePickerValue } from "../src/content/eventDispatcher";
import { scanPage } from "../src/content/scanner";
import { closestHeadingText, readDisplayValue } from "../src/content/domUtils";
import { runScanPipeline } from "../src/pipeline/scanPipeline";
import { defaultProfile } from "../src/profile/defaultProfile";
import { expandableExperienceGroups, ensureInternshipEntries } from "../src/content/internshipEntries";

beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return { width: (this as Element).classList.contains("hidden-search") ? 0 : 100, height: 24, top: 0, left: 0, bottom: 24, right: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
function row(id: string, label: string, textarea = false) {
  return `<div class="atsx-col"><div class="atsx-row atsx-form-item"><div class="atsx-form-item-label"><label for="${id}">${label}</label></div><div class="atsx-form-item-control-wrapper"><div class="atsx-form-item-control"><span class="atsx-form-item-children">${textarea ? `<textarea id="${id}">旧概述</textarea>` : `<input id="${id}" value="旧值">`}</span></div></div></div></div>`;
}
function section(group: string, title: string, entries: string) {
  return `<div class="createFormSection-container"><div class="createFormSection-${group}"><div class="createFormSection-left"><div class="createFormSection-title"><p>${title}</p></div></div><div class="createFormSection-right"><div class="createFormSection-formList">${entries}</div><div class="formOperate-addBtn-container"><div class="formOperate-addBtn"><span class="addMore-add">添加</span></div></div></div></div></div>`;
}

describe("飞书招聘实际结构回归（数据为合成履历）", () => {
  it("九层包装和段落标题正确归属；作品描述不借用项目描述", () => {
    document.body.innerHTML = `<form>${section("internship", "实习经历", `<div class="resumeEditForm-item">${row("internship[0].company", "公司名称")}${row("internship[0].desc", "描述", true)}</div>`)}${section("project", "项目经历", `<div class="resumeEditForm-item">${row("project[0].name", "项目名称")}${row("project[0].desc", "描述", true)}</div>`)}${section("works", "作品", row("works[0].desc", "描述", true))}</form>`;
    expect(closestHeadingText(document.getElementById("internship[0].desc")!)).toBe("实习经历");
    const p = structuredClone(defaultProfile);
    p.internships = [{ ...p.internships[0]!, company: "合成公司", description: "实习原文" }];
    p.projects = [{ ...p.projects[0]!, name: "合成项目", description: "项目原文" }];
    const candidates = runScanPipeline(scanPage(), p);
    expect(candidates.find(c => c.raw.context.id === "internship[0].desc")?.value?.value).toBe("实习原文");
    expect(candidates.find(c => c.raw.context.id === "project[0].desc")?.value?.value).toBe("项目原文");
    expect(candidates.find(c => c.raw.context.id === "works[0].desc")?.value).toBeUndefined();
  });

  it("项目链接按项目条目填；合并起止年月拆为两端且扫描不写网页", () => {
    const date = `<div class="atsx-date-picker atsx-date-picker-period-month" data-cy="project[0].periodInput">${['Begin','End'].map((end,i)=>`<div class="atsx-date-picker-period-month-label" data-cy="project[0].periodInput${end}"><span data-cy="year">${i?2026:2023}</span>-<span data-cy="month">09</span></div>`).join('')}<input class="atsx-date-picker-period-hidden-input"></div>`;
    document.body.innerHTML = `<form>${section("project", "项目经历", `<div class="resumeEditForm-item">${row("project[0].link", "项目链接")}${row("project[0].period", "起止时间").replace('<input id="project[0].period" value="旧值">',date)}</div>`)}</form>`;
    const before = document.body.innerHTML;
    const p = structuredClone(defaultProfile);
    p.projects[0] = {...p.projects[0]!, link:"https://zhangtianteng.xyz/",startDate:"2024-08",endDate:"2025-10"};
    const fields = scanPage();
    expect(fields).toHaveLength(3);
    const candidates = runScanPipeline(fields,p);
    expect(candidates.map(c=>[c.match.fieldId,c.value?.value])).toEqual([
      ["project.link","https://zhangtianteng.xyz/"], ["project.startDate","2024-08"], ["project.endDate","2025-10"],
    ]);
    expect(document.body.innerHTML).toBe(before);
  });

  it.each([
    ["education", "教育经历", "学校名称", "school"],
    ["internship", "工作经历", "公司名称", "company"],
    ["campus", "校园经历", "组织名称", "organization"],
    ["project", "项目经历", "项目名称", "name"],
  ] as const)("%s 独立补齐，不点击作品添加或提交", async (group, title, label, key) => {
    const entry = () => `<div class="resumeEditForm-item">${row(`${group}[${document.querySelectorAll('.resumeEditForm-item').length}].${key}`, label)}</div>`;
    document.body.innerHTML = `<form>${section(group, title, entry())}${section("works", "作品", "")}<button>提交简历</button></form>`;
    const add = document.querySelector(`.createFormSection-${group} .addMore-add`)!;
    const click = vi.fn(() => document.querySelector(`.createFormSection-${group} .createFormSection-formList`)!.insertAdjacentHTML("beforeend", entry()));
    add.addEventListener("click", click);
    const submit = vi.fn(); document.querySelector("button")!.addEventListener("click", submit);
    expect(expandableExperienceGroups()).toEqual([group]);
    expect(await ensureInternshipEntries(3, group)).toEqual({ ok: true, added: 2 });
    expect(click).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
  });

  it("隐藏搜索输入框不让可见学历下拉一起消失，且只采集一次", () => {
    document.body.innerHTML = `<form>${section("education", "教育经历", row("degree", "学历").replace('<input id="degree" value="旧值">', `<div id="degree" class="atsx-select"><div class="atsx-select-selection" role="combobox"><div class="atsx-select-selection__rendered"><span class="atsx-select-selection-selected-value">本科</span><input class="atsx-select-search__field hidden-search"></div></div></div>`))}</form>`;
    const fields = scanPage();
    expect(fields).toHaveLength(1);
    expect(fields[0]?.kind).toBe("custom-select");
    expect(fields[0]?.context.labelText).toBe("学历");
    const trigger = document.querySelector<HTMLElement>('[role="combobox"]')!;
    expect(readDisplayValue(trigger)).toBe("本科");
  });

  it("Ant类下拉只有外层标记时，保留可见只读输入框", () => {
    document.body.innerHTML = `<form><div><span class="label">期望工作城市</span><div class="ant-select"><div class="ant-select-selector"><input id="city" readonly><span class="ant-select-selection-item hidden-search"></span></div></div></div></form>`;
    const fields = scanPage();
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({kind:"custom-select",context:{id:"city",labelText:"期望工作城市"}});
  });

  it("教育及实习共用一个添加入口时不猜测板块", () => {
    document.body.innerHTML = `<form>${section("mixed", "教育及实习经历", "")}</form>`;
    expect(expandableExperienceGroups()).toEqual([]);
  });
});


describe("飞书年月写入回读",()=>{
  function setup(month="08",disabled=false){
    document.body.innerHTML='<div class="atsx-date-picker atsx-date-picker-period-month"><div class="atsx-date-picker-period-month-label" data-cy="project[0].periodInputBegin"><span data-cy="year">2020</span>-<span data-cy="month">01</span></div></div>';
    const el=document.querySelector<HTMLElement>('.atsx-date-picker-period-month-label')!;
    const clicks:string[]=[];
    el.addEventListener('click',()=>{
      document.querySelectorAll('.atsx-date-picker-period-month-panel').forEach(p=>p.remove());
      const panel=document.createElement('div');panel.className='atsx-date-picker-period-month-panel';panel.dataset.cy='project[0].periodInputBeginDropdown';
      for(const part of ['2024',month]){
        const option=document.createElement('div');option.className='atsx-date-picker-period-month-panel-list-item';option.dataset.cy=part;option.textContent=part;
        if(disabled&&part===month)option.setAttribute('aria-disabled','true');
        option.addEventListener('click',()=>{clicks.push(part);el.querySelector(`[data-cy=${part.length===4?'year':'month'}]`)!.textContent=part;panel.remove()});panel.append(option);
      }document.body.append(panel);
    });
    return {el,clicks};
  }
  it("年月来自对应弹层，选年后重开面板选月，按月比较完整日期",async()=>{
    const {el,clicks}=setup();
    expect(await setDatePickerValue(el,'2024-08-15')).toMatchObject({ok:true,actual:'2024-08'});
    expect(clicks).toEqual(['2024','08']);
    expect(readDisplayValue(el)).toBe('2024-08');
  });
  it.each([['07',false],['08',true]] as const)("缺失或禁用月份不先写年份 %s",async(month,disabled)=>{
    const {el,clicks}=setup(month,disabled);
    expect((await setDatePickerValue(el,'2024-08')).ok).toBe(false);
    expect(clicks).toEqual([]);expect(readDisplayValue(el)).toBe('2020-01');
  });
  it("无清空入口时撤销空值报失败，保留显示日期",async()=>{
    const {el,clicks}=setup();
    expect((await setDatePickerValue(el,'')).ok).toBe(false);
    expect(clicks).toEqual([]);expect(readDisplayValue(el)).toBe('2020-01');
  });
});
