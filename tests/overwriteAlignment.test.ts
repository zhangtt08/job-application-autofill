import { beforeAll, describe, expect, it, vi } from "vitest";
import { scanPage } from "../src/content/scanner";
import { fillFields, undoFill } from "../src/content/filler";
import { fingerprintOf, htmlForLabel, findElementByFingerprint, readDisplayValue } from "../src/content/domUtils";
import { runScanPipeline } from "../src/pipeline/scanPipeline";
import { buildFillPlan } from "../src/pipeline/fillPlan";
import { defaultProfile } from "../src/profile/defaultProfile";

beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 24, top: 0, left: 0, bottom: 24, right: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
});

function profile() {
  const p = structuredClone(defaultProfile);
  p.basic.name = "合成姓名";
  p.basic.email = "syn@example.invalid";
  p.internships = [0, 1, 2].map((i) => ({ company: `公司${i}`, department: "", position: `岗位${i}`, startDate: "", endDate: "", description: `原文${i}`, responsibilities: "", workContent: "", achievements: "", summary: "", variants: { agent: `变体${i}`, aiApplication: "", aiProduct: "", aiOperation: "", aiSolution: "", aigcMarketing: "" } }));
  return p;
}

describe("覆盖与字段对齐回归", () => {
  it("扫描不改旧值；填写覆盖姓名和邮箱；空资料保留网站值；撤销恢复导入结果", async () => {
    document.body.innerHTML = `<form><h2>个人信息</h2><label>姓名<input id="n" value="旧姓名"></label><label>邮箱<input id="e" type="email" value="old@example.invalid"></label><label>微信<input id="w" value="原微信"></label></form>`;
    const before = document.body.innerHTML;
    const candidates = runScanPipeline(scanPage(), profile(), { profileType: "general" });
    expect(document.body.innerHTML).toBe(before);
    const plan = buildFillPlan(candidates.map((c) => ({ ...c, confirmed: true })), null, "general");
    const result = await fillFields(plan);
    expect(result.outcomes.every((o) => o.status === "filled")).toBe(true);
    expect((document.getElementById("n") as HTMLInputElement).value).toBe("合成姓名");
    expect((document.getElementById("e") as HTMLInputElement).value).toBe("syn@example.invalid");
    expect((document.getElementById("w") as HTMLInputElement).value).toBe("原微信");
    expect(await undoFill(result.originals)).toEqual({ restored: 2, failed: 0 });
    expect((document.getElementById("n") as HTMLInputElement).value).toBe("旧姓名");
    expect((document.getElementById("e") as HTMLInputElement).value).toBe("old@example.invalid");
  });

  it("第二条经历少一个岗位栏，第三条岗位仍取第三条资料，描述使用原文", () => {
    document.body.innerHTML = `<section><h2>实习经历</h2>
      <div class="entry"><label>公司<input id="c0"></label><label>岗位<input id="p0"></label><label>实习描述<textarea id="d0"></textarea></label></div>
      <div class="entry"><label>公司<input id="c1"></label></div>
      <div class="entry"><label>公司<input id="c2"></label><label>岗位<input id="p2"></label><label>实习描述<textarea id="d2"></textarea></label></div>
    </section>`;
    const candidates = runScanPipeline(scanPage(), profile(), { profileType: "general" });
    const byId = (id: string) => candidates.find((c) => c.raw.context.id === id);
    expect(byId("p2")?.value?.value).toBe("岗位2");
    expect(byId("c1")?.value?.value).toBe("公司1");
    expect(byId("d2")?.value?.value).toBe("原文2");
  });

  it("未知字段不会越过上一行控件去借用姓名标签，aria 标签优先", () => {
    document.body.innerHTML = `<div><div><span>姓名</span><input></div><div><input id="unknown"></div><div><span>姓名</span><input id="email" aria-label="电子邮箱"></div></div>`;
    expect(htmlForLabel(document.getElementById("unknown")!)).toBe("");
    expect(htmlForLabel(document.getElementById("email")!)).toBe("电子邮箱");
  });

  it("多选按资料覆盖旧勾选，撤销恢复原勾选；缺失选项不做部分写入", async () => {
    document.body.innerHTML = `<fieldset><legend>语言能力</legend><label><input type="checkbox" name="lang" value="cet4" checked>CET4</label><label><input type="checkbox" name="lang" value="cet6">CET6</label></fieldset>`;
    const field = scanPage()[0]!;
    const result = await fillFields({ confirmed: true, fields: [{ reference: field.reference, kind: "checkbox", value: "CET6" }] });
    expect(result.outcomes[0]?.status).toBe("filled");
    expect(readDisplayValue(document.querySelector("input")!)).toBe("CET6");
    expect(await undoFill(result.originals)).toEqual({ restored: 1, failed: 0 });
    expect(readDisplayValue(document.querySelector("input")!)).toBe("CET4");
    const miss = await fillFields({ confirmed: true, fields: [{ reference: field.reference, kind: "checkbox", value: "CET6、托福" }] });
    expect(miss.outcomes[0]?.status).toBe("failed");
    expect(readDisplayValue(document.querySelector("input")!)).toBe("CET4");
  });

  it("多选资料与网页选项顺序不同也正确覆盖", async () => {
    document.body.innerHTML = `<fieldset><legend>语言能力</legend><label><input type="checkbox" name="lang" value="cet4">CET4</label><label><input type="checkbox" name="lang" value="cet6">CET6</label></fieldset>`;
    const field = scanPage()[0]!;
    const result = await fillFields({ confirmed: true, fields: [{ reference: field.reference, kind: "checkbox", value: "CET6、CET4" }] });
    expect(result.outcomes[0]?.status).toBe("filled");
    expect(document.querySelectorAll("input:checked")).toHaveLength(2);
  });

  it("同名 radio 在不同 form 内分别扫描填写，不覆盖另一个 form", async () => {
    document.body.innerHTML = `<form><fieldset><legend>性别</legend><label><input type="radio" name="gender" value="男" checked>男</label><label><input type="radio" name="gender" value="女">女</label></fieldset></form><form><fieldset><legend>性别</legend><label><input type="radio" name="gender" value="男" checked>男</label><label><input type="radio" name="gender" value="女">女</label></fieldset></form>`;
    const fields = scanPage();
    expect(fields.length).toBe(2);
    await fillFields({ confirmed: true, fields: [{ reference: fields[1]!.reference, kind: "radio", value: "女" }] });
    const forms = document.querySelectorAll("form");
    expect(readDisplayValue(forms[0]!.querySelector("input")!)).toBe("男");
    expect(readDisplayValue(forms[1]!.querySelector("input")!)).toBe("女");
  });

  it("扫描过的元素被移除后，不把其余同名字段当成原字段", () => {
    document.body.innerHTML = `<div><input placeholder="公司"></div><div><input placeholder="公司"></div>`;
    const ref = fingerprintOf(document.querySelectorAll("input")[1]!);
    document.querySelectorAll("div")[1]!.remove();
    expect(findElementByFingerprint(ref)).toBeNull();
  });

  it("空字符串不清空网页已有内容，超长富文本撤销不截断", async () => {
    document.body.innerHTML = `<label>姓名<input value="已有值"></label><div contenteditable="true"></div>`;
    const input = document.querySelector("input")!;
    const empty = await fillFields({ confirmed: true, fields: [{ reference: fingerprintOf(input), kind: "text", value: "" }] });
    expect(empty.outcomes[0]?.status).toBe("failed");
    expect(input.value).toBe("已有值");
    const rich = document.querySelector("[contenteditable]") as HTMLElement;
    Object.defineProperty(rich, "isContentEditable", { value: true });
    const original = " 原始履历\n".repeat(600);
    rich.textContent = original;
    const result = await fillFields({ confirmed: true, fields: [{ reference: fingerprintOf(rich), kind: "contenteditable", value: "新履历" }] });
    expect(result.originals[0]?.previousValue).toBe(original);
    await undoFill(result.originals);
    expect(rich.textContent).toBe(original);
  });
});
