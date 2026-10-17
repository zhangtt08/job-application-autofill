import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { scanPage, scanPageSettled } from "../src/content/scanner";
import { collectSameKindElements, fingerprintOf, htmlForLabel, readDisplayValue } from "../src/content/domUtils";
import { fillWithVerification } from "../src/compatibility/writeVerifier";
import { setCustomSelectValue } from "../src/content/eventDispatcher";
import { classifyApplicationContext } from "../src/context/applicationContext";

beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 24, top: 0, left: 0, bottom: 24, right: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
});
beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => { vi.useRealTimers(); });

describe("跨网站组件兼容回归", () => {
  it("三层 Shadow DOM 中同名字段分别扫描、定位，aria 标签留在本组件内", () => {
    const inputs: HTMLInputElement[] = [];
    for (let i = 0; i < 2; i++) {
      let host = document.body.appendChild(document.createElement("div"));
      for (let depth = 0; depth < 3; depth++) {
        const root = host.attachShadow({ mode: "open" });
        host = root.appendChild(document.createElement("div"));
      }
      host.innerHTML = `<span id="caption">公司名称</span><input aria-labelledby="caption">`;
      inputs.push(host.querySelector("input")!);
    }
    expect(scanPage()).toHaveLength(2);
    expect(collectSameKindElements("input")).toEqual(inputs);
    expect(inputs.map(htmlForLabel)).toEqual(["公司名称", "公司名称"]);
    expect(fingerprintOf(inputs[0]!)).not.toBe(fingerprintOf(inputs[1]!));
  });

  it("Shadow 控件的输入事件传到组件外，页面 state 随覆盖更新", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<input value="旧姓名">`;
    const input = root.querySelector("input")!;
    let state = "旧姓名";
    host.addEventListener("input", () => { state = input.value; });
    expect((await fillWithVerification(input, "新姓名", "旧姓名")).status).toBe("success");
    expect(state).toBe("新姓名");
  });

  it("Shadow 字段能读取外部板块标题，登录框仍被排除", () => {
    document.body.innerHTML = `<section><h2>教育经历</h2><div id="education-host"></div></section><div class="login-panel"><h2>手机号登录</h2><div id="login-host"></div><button>获取验证码</button></div>`;
    document.getElementById("education-host")!.attachShadow({ mode: "open" }).innerHTML = '<label>学校<input></label>';
    document.getElementById("login-host")!.attachShadow({ mode: "open" }).innerHTML = '<label>手机号<input></label>';
    const fields = scanPage();
    expect(fields[0]!.context.sectionTitle).toBe("教育经历");
    expect(classifyApplicationContext(fields[1]!.context).eligible).toBe(false);
  });

  it("原生月/日期按 HTML 格式覆盖；不把仅有年月的资料编造成生日", async () => {
    document.body.innerHTML = `<input type="month" value="2019-01"><input type="date" value="2000-01-01">`;
    const [month, date] = Array.from(document.querySelectorAll("input"));
    expect((await fillWithVerification(month!, "2026.06", month!.value)).status).toBe("success");
    expect(month!.value).toBe("2026-06");
    expect((await fillWithVerification(date!, "2002年9月8日", date!.value)).status).toBe("success");
    expect(date!.value).toBe("2002-09-08");
    expect((await fillWithVerification(date!, "2002.09", date!.value)).status).not.toBe("success");
    expect(date!.value).toBe("2002-09-08");
  });

  it("扫描排除隐藏祖先、inert、禁用 fieldset 和 aria 禁用组件", () => {
    document.body.innerHTML = `<fieldset disabled><input aria-label="姓名"></fieldset><div aria-hidden="true"><input aria-label="邮箱"></div><div inert><input aria-label="电话"></div><div aria-disabled="true"><div role="combobox" aria-label="学历"></div></div><input aria-label="微信">`;
    expect(scanPage().map(f => f.context.ariaLabel)).toEqual(["微信"]);
  });

  it("控件数持续变化时也遵守扫描等待上限", async () => {
    vi.useFakeTimers();
    const timer = setInterval(() => document.body.appendChild(document.createElement("input")), 100);
    const scan = scanPageSettled({ settleMs: 350, maxWait: 500 });
    let done = false; scan.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(650);
    clearInterval(timer);
    expect(done).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    await scan;
  });

  it("关联弹层暂未加载时等待自己的选项，不点击其他已打开下拉", async () => {
    document.body.innerHTML = `<div role="listbox"><div role="option" id="other">本科</div></div><div role="combobox" aria-controls="degree-list" id="degree">博士</div>`;
    const wrong = vi.fn(); document.getElementById("other")!.addEventListener("click", wrong);
    const combo = document.getElementById("degree")!;
    combo.addEventListener("click", () => setTimeout(() => {
      if (document.getElementById("degree-list")) return;
      const panel = document.body.appendChild(document.createElement("div")); panel.id = "degree-list";
      panel.innerHTML = `<div role="option" aria-disabled="true">本科</div><div role="option" id="valid">本科</div>`;
      panel.querySelector("#valid")!.addEventListener("click", () => { combo.textContent = "本科"; panel.remove(); });
    }, 80));
    expect((await setCustomSelectValue(combo, "本科")).ok).toBe(true);
    expect(readDisplayValue(combo)).toBe("本科");
    expect(wrong).not.toHaveBeenCalled();
  });

  it("容器式可搜索下拉向内部搜索框输入，并读取选中项而非搜索词", async () => {
    document.body.innerHTML = `<div class="ant-select" role="combobox" aria-controls="school-list"><span class="ant-select-selection-item">旧大学</span><input></div><div id="school-list" role="listbox"></div>`;
    const combo = document.querySelector<HTMLElement>(".ant-select")!;
    const input = combo.querySelector("input")!;
    input.addEventListener("input", () => {
      const panel = document.getElementById("school-list")!;
      panel.innerHTML = `<div role="option">示例大学</div>`;
      panel.firstElementChild!.addEventListener("click", () => { combo.querySelector("span")!.textContent = "示例大学"; input.value = ""; panel.innerHTML = ""; });
    });
    expect((await setCustomSelectValue(combo, "示例大学")).ok).toBe(true);
    expect(readDisplayValue(combo)).toBe("示例大学");
  });

  it("Ant 虚拟下拉的关联 ID 指向隐藏无障碍列表时选择可见选项", async () => {
    document.body.innerHTML = `<input id="degree" role="combobox" aria-controls="accessible-list" readonly>`;
    const input = document.querySelector('input')!;
    input.addEventListener('click', () => {
      const panel = document.body.appendChild(document.createElement('div')); panel.className = 'ant-select-dropdown';
      panel.innerHTML = '<div id="accessible-list" role="listbox" style="height:0;overflow:hidden" aria-hidden="true"><div role="option">本科</div></div><div class="rc-virtual-list"><div class="ant-select-item-option">本科</div></div>';
      panel.querySelector('.ant-select-item-option')!.addEventListener('click', () => { input.value = '本科'; panel.remove(); });
    });
    expect((await setCustomSelectValue(input, '本科')).ok).toBe(true);
  });

  it("可搜索下拉内部普通 input 也走选择策略，不把搜索词当作已选值", async () => {
    document.body.innerHTML = `<div class="ant-select"><label for="school-field">学校</label><span class="ant-select-selection-item">旧大学</span><input id="school-field"></div>`;
    const fields = scanPage();
    expect(fields).toHaveLength(1);
    expect(fields[0]!.kind).toBe("custom-select");
    const input = document.querySelector("input")!;
    input.value = "搜索词";
    expect(readDisplayValue(input)).toBe("旧大学");
  });

  it("react-select 的 combobox 输入清空后仍从选中项读回", () => {
    document.body.innerHTML = `<div class="control"><div><span class="css-test-singleValue">示例大学</span><div><input role="combobox" value="搜索词"></div></div></div>`;
    const input = document.querySelector("input")!;
    expect(readDisplayValue(input)).toBe("示例大学");
    input.value = "";
    expect(readDisplayValue(input)).toBe("示例大学");
  });

  it("只有搜索词改变、没有选项选中时不能虚报填写成功", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input role="combobox" aria-controls="missing" value="旧大学">`;
    const input = document.querySelector("input")!;
    const result = fillWithVerification(input, "示例大学", "旧大学");
    await vi.runAllTimersAsync();
    expect((await result).status).not.toBe("success");
  });

  it("没有关联 ID 且两个新弹层同名选项冲突时不猜着点", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div role="combobox" id="degree">博士</div>';
    const clicked = vi.fn();
    const combo = document.getElementById('degree')!;
    combo.addEventListener('click', () => {
      for (let i=0;i<2;i++) {
        const panel = document.body.appendChild(document.createElement('div'));
        panel.innerHTML = '<div role="option">本科</div>';
        panel.firstElementChild!.addEventListener('click', clicked);
      }
    });
    const result = setCustomSelectValue(combo, '本科');
    await vi.runAllTimersAsync();
    expect((await result).ok).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("控件数量相同但节点被替换时重新等待稳定窗口", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input aria-label="旧字段">`;
    const scan = scanPageSettled({ settleMs: 350, maxWait: 1200 });
    await vi.advanceTimersByTimeAsync(300);
    document.body.innerHTML = `<input aria-label="新字段">`;
    let done = false; scan.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect((await scan)[0]!.context.ariaLabel).toBe("新字段");
  });
});
