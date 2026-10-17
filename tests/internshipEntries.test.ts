import { beforeAll, describe, expect, it, vi } from "vitest";
import { canAddInternships, ensureInternshipEntries } from "../src/content/internshipEntries";

beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 24, top: 0, left: 0, bottom: 24, right: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
});
const entry = `<div class="entry"><label>公司<input></label><label>岗位<input></label></div>`;
function setup(existing = 1, maximum = 3) {
  document.body.innerHTML = `<form><section id="education"><h2>教育经历</h2><button type="button">添加</button></section><section id="internships"><h2>实习经历</h2><div id="entries">${entry.repeat(existing)}</div><button type="button" id="add">＋ 添加（最多${maximum}段）</button></section><button id="submit">提交申请</button></form>`;
  const clicked = vi.fn(() => {
    setTimeout(() => document.getElementById("entries")!.insertAdjacentHTML("beforeend", entry), 20);
  });
  document.getElementById("add")!.addEventListener("click", clicked);
  return clicked;
}

describe("按资料库条数添加实习栏", () => {
  it("基本信息只打开编辑，不点击头像/附件的添加入口", async () => {
    document.body.innerHTML='<section><h2>基本信息</h2><button type="button" id="edit">编辑</button><button type="button" id="add">添加</button></section>';
    const add=vi.fn(); document.getElementById('add')!.addEventListener('click',add);
    document.getElementById('edit')!.addEventListener('click',()=>document.querySelector('section')!.insertAdjacentHTML('beforeend','<label>姓名<input value="旧姓名"></label>'));
    await ensureInternshipEntries(1,'basic');
    expect(document.querySelector('input')!.value).toBe('旧姓名');
    expect(add).not.toHaveBeenCalled();
  });
  it("解析卡片只有编辑入口时先只读识别，选库后打开编辑并扫描职责", async () => {
    document.body.innerHTML = `<section><h2>工作经历</h2><div class="entry"><h3>已有公司名称</h3><p>已有解析内容</p><button type="button">编辑</button></div></section>`;
    const clicked=vi.fn(() => { document.querySelector('.entry')!.innerHTML='<label>公司<input value="旧公司"></label><label>工作职责<textarea>旧职责</textarea></label>'; });
    document.querySelector('button')!.addEventListener('click',clicked);
    const before=document.body.innerHTML;
    expect(canAddInternships()).toBe(true);
    expect(document.body.innerHTML).toBe(before);
    expect(await ensureInternshipEntries(1)).toEqual({ok:true,added:0});
    expect(clicked).toHaveBeenCalledOnce();
    expect(document.querySelector('textarea')!.value).toBe('旧职责');
  });
  it("多张只读卡片分别打开；已可编辑的卡片不再点编辑", async () => {
    document.body.innerHTML=`<section><h2>工作经历</h2>${[0,1].map(i=>`<div class="entry" id="card${i}"><p>解析卡片</p><button type="button">编辑</button></div>`).join('')}</section>`;
    const clicked=vi.fn();
    for(const button of document.querySelectorAll('button')) button.addEventListener('click',()=>{clicked();button.parentElement!.insertAdjacentHTML('afterbegin','<label>公司<input value="旧公司"></label><label>岗位<input value="旧岗位"></label>');});
    await ensureInternshipEntries(2);
    await ensureInternshipEntries(2);
    expect(clicked).toHaveBeenCalledTimes(2);
  });
  it("网站打开下一段会关闭上一段时停止切换，不继续盲点或新增", async () => {
    document.body.innerHTML=`<section><h2>工作经历</h2>${[0,1,2].map(i=>`<div class="entry" id="card${i}"><p>解析卡片</p><button type="button">编辑</button></div>`).join('')}</section>`;
    const clicked=vi.fn();
    const mount = (index: number) => {
      for(let i=0;i<3;i++) {
        const card=document.getElementById(`card${i}`)!;
        card.innerHTML=i===index?'<label>公司<input value="旧公司"></label><label>工作职责<textarea>旧职责</textarea></label>':'<p>解析卡片</p><button type="button">编辑</button>';
        card.querySelector('button')?.addEventListener('click',()=>{clicked();mount(i);});
      }
    };
    mount(-1);
    const result=await ensureInternshipEntries(3);
    expect(clicked).toHaveBeenCalledTimes(2);
    expect(result.detail).toContain('当前可编辑');
    expect(document.querySelectorAll('textarea')).toHaveLength(1);
  });
  it("不点保存/提交/删除/跳转编辑链接；已有弹窗时不点击背后的编辑卡片", async () => {
    document.body.innerHTML='<form><section><h2>工作经历</h2><button>编辑</button><button type="button">保存</button><button type="button">删除</button><a href="/edit">编辑</a><button type="button">编辑</button></section><div role="dialog">已有弹窗</div></form>';
    const clicked=vi.fn(); document.body.addEventListener('click',clicked,{once:true});
    await ensureInternshipEntries(2);
    expect(clicked).not.toHaveBeenCalled();
  });
  it("编辑按钮无效时只试一次，不循环点击", async () => {
    document.body.innerHTML='<section><h2>工作经历</h2><button type="button">编辑</button></section>';
    const clicked=vi.fn();document.querySelector('button')!.addEventListener('click',clicked);
    await ensureInternshipEntries(3);
    expect(clicked).toHaveBeenCalledOnce();
  });
  it("新增后整个板块被框架重建，也能继续补齐", async () => {
    setup();
    let clicks = 0;
    const mount = (count: number) => {
      document.getElementById("internships")!.outerHTML = `<section id="internships"><h2>实习经历</h2><div id="entries">${entry.repeat(count)}</div><button type="button" id="add">添加</button></section>`;
      document.getElementById("add")!.addEventListener("click", () => { clicks++; setTimeout(() => mount(count + 1), 20); });
    };
    mount(1);
    expect(await ensureInternshipEntries(3)).toEqual({ ok: true, added: 2 });
    expect(clicks).toBe(2);
  });
  it("最后一次新增重建板块并移除添加按钮时，仍记录新增结果", async () => {
    setup();
    const button = document.getElementById("add")!.cloneNode(true) as HTMLElement;
    document.getElementById("add")!.replaceWith(button);
    button.addEventListener("click", () => {
      document.getElementById("internships")!.outerHTML = `<section id="internships"><h2>实习经历</h2>${entry.repeat(2)}</section>`;
    }, { once: true });
    expect(await ensureInternshipEntries(2)).toEqual({ ok: true, added: 1 });
  });
  it("英文 Add Education 和尾部加号也能补齐教育经历", async () => {
    document.body.innerHTML = `<section><h2>Education</h2><div id="entries"><label>学校<input></label></div><button type="button">Add Education +</button></section>`;
    const clicked = vi.fn(() => document.getElementById("entries")!.insertAdjacentHTML("beforeend", '<label>学校<input></label>'));
    document.querySelector("button")!.addEventListener("click", clicked);
    expect(await ensureInternshipEntries(2, "education")).toEqual({ ok: true, added: 1 });
    expect(clicked).toHaveBeenCalledOnce();
  });
  it("识别添加入口只读；选库后按差额添加，等待新控件出现", async () => {
    const clicked = setup();
    const original = document.body.innerHTML;
    expect(canAddInternships()).toBe(true);
    expect(document.body.innerHTML).toBe(original);
    const result = await ensureInternshipEntries(3);
    expect(result).toEqual({ ok: true, added: 2 });
    expect(clicked).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("#entries .entry")).toHaveLength(3);
  });
  it("网站最多3段时不再点击，给出未补齐提示", async () => {
    const clicked = setup();
    const result = await ensureInternshipEntries(5);
    expect(clicked).toHaveBeenCalledTimes(2);
    expect(result.added).toBe(2);
    expect(result.detail).toContain("资料库有 5 段");
  });
  it("已有栏位够用或资料库没有实习时不添加、不删除", async () => {
    const clicked = setup(3);
    await ensureInternshipEntries(2);
    await ensureInternshipEntries(0);
    expect(clicked).not.toHaveBeenCalled();
    expect(document.querySelectorAll("#entries .entry")).toHaveLength(3);
  });
  it("初始零段也能识别实习添加入口并补齐", async () => {
    const clicked = setup(0);
    expect(canAddInternships()).toBe(true);
    expect((await ensureInternshipEntries(2)).added).toBe(2);
    expect(clicked).toHaveBeenCalledTimes(2);
  });
  it("点击没有新增控件时只试一次，绝不连续盲点", async () => {
    setup();
    const original = document.getElementById("add")!;
    const replacement = original.cloneNode(true) as HTMLElement;
    original.replaceWith(replacement);
    const clicked = vi.fn(); replacement.addEventListener("click", clicked);
    const result = await ensureInternshipEntries(3);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(result.added).toBe(0);
    expect(result.detail).toBeTruthy();
  });
  it("不点击教育添加、提交按钮、附件添加或页面跳转链接", async () => {
    setup();
    document.getElementById("internships")!.innerHTML = `<h2>实习经历</h2>${entry}<button>添加</button><button type="button">添加附件</button><a href="/submit">添加</a>`;
    const clicked = vi.fn(); document.body.addEventListener("click", clicked, { once: true });
    expect(canAddInternships()).toBe(false);
    await ensureInternshipEntries(3);
    expect(clicked).not.toHaveBeenCalled();
  });
  it("禁用按钮不点击；多个实习添加入口不猜测", async () => {
    const clicked = setup();
    (document.getElementById("add") as HTMLButtonElement).disabled = true;
    expect((await ensureInternshipEntries(3)).detail).toBeTruthy();
    expect(clicked).not.toHaveBeenCalled();
    (document.getElementById("add") as HTMLButtonElement).disabled = false;
    document.getElementById("internships")!.insertAdjacentHTML("beforeend", '<button type="button">新增实习</button>');
    expect(canAddInternships()).toBe(false);
    await ensureInternshipEntries(3);
    expect(clicked).not.toHaveBeenCalled();
  });
  it("嵌套的自定义添加文字只算一个入口", async () => {
    setup();
    document.getElementById("add")!.outerHTML = `<div class="add"><span class="add-text">添加（最多3段）</span></div>`;
    expect(canAddInternships()).toBe(true);
  });
  it("无效条数在点击前拒绝", async () => {
    const clicked = setup();
    await expect(ensureInternshipEntries(-1)).rejects.toThrow("实习条数无效");
    await expect(ensureInternshipEntries(2.5)).rejects.toThrow("实习条数无效");
    expect(clicked).not.toHaveBeenCalled();
  });
});
