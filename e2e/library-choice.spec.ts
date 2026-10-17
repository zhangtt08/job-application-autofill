import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { FIXTURE_BASE, PROFILE_FIXTURE, launchWithExtension, openSidePanel } from "./helpers";

let context: BrowserContext;
let sidePanel: Page;
mkdirSync("test-results/workflow", { recursive: true });

test.beforeEach(async () => {
  const launched = await launchWithExtension();
  context = launched.context;
  sidePanel = await openSidePanel(context, launched.extensionId);
  await sidePanel.setViewportSize({ width: 400, height: 820 });
  await sidePanel.evaluate((fixture) => {
    const shared = { basic: fixture.basic, education: fixture.education, sensitive: fixture.sensitive };
    const content = { internships: fixture.internships, projects: fixture.projects, campus: fixture.campus, skills: fixture.skills, jobPreferences: fixture.jobPreferences, content: fixture.content };
    const make = (id: string, name: string, marker: string) => ({ id, name, directions: ["aiProduct"], note: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { ...content, internships: [0,1,2].map((i) => ({ ...fixture.internships[0], company: `${marker}公司${i}`, position: `${marker}岗位${i}`, description: `${marker}原文${i}`, variants: { ...fixture.internships[0]!.variants, aiProduct: "不应选中的方向变体" } })) } });
    return chrome.storage.local.set({ "afa.profiles.v2": { schemaVersion: 2, shared, libraries: [make("a", "产品资料", "产品"), make("b", "运营资料", "运营")], activeLibraryId: "a" }, "afa.apply.prefs.v1": { autoFill: true, autoCaptureJob: true, showDev: false } });
  }, PROFILE_FIXTURE);
  await sidePanel.reload();
});

test.afterEach(async () => { await context.close(); });

async function openForm() {
  const page = await context.newPage();
  await page.goto(`${FIXTURE_BASE}/overwrite-form.html`);
  await page.bringToFront();
  return page;
}
async function recognize() {
  await sidePanel.getByRole("button", { name: /开始识别|重新识别/ }).click();
  await expect(sidePanel.getByRole("heading", { name: "选择资料库" })).toBeVisible();
}
async function choose(name = "运营资料") {
  await sidePanel.locator(".library-option", { hasText: name }).click();
  await expect(sidePanel.locator(".fill-overview h2")).toHaveText(/部分已填写|填写完成/, { timeout: 60_000 });
}

test("识别只读，点选资料库后覆盖；缺栏不串位，版本不切换，结果可撤销与删除", async () => {
  const page = await openForm();
  await sidePanel.screenshot({ path: "test-results/workflow/01-start.png" });
  await recognize();
  await expect(page.locator("#name")).toHaveValue("简历导入旧姓名");
  await expect(page.locator(".company").first()).toHaveValue("旧公司一");
  await sidePanel.screenshot({ path: "test-results/workflow/02-library.png" });
  await choose();
  await expect(page.locator("#name")).toHaveValue("张三");
  await expect(page.locator("#email")).toHaveValue("zhangsan@test.com");
  await expect(page.locator("#wechat")).toHaveValue("保留网站微信");
  await expect(page.locator(".position").nth(1)).toHaveValue("运营岗位2");
  await expect(page.locator(".description").nth(1)).toHaveValue("运营原文2");
  await expect(page.locator('[value="cet4"]')).not.toBeChecked();
  await expect(page.locator('[value="cet6"]')).toBeChecked();
  await expect(page.locator("#promise")).toHaveValue("保留声明");
  expect(await page.evaluate(() => (window as any).submitCount)).toBe(0);
  await expect(sidePanel.getByText("填写版本")).toHaveCount(0);
  await expect(sidePanel.locator(".count-filled strong")).toHaveText("10");
  await sidePanel.screenshot({ path: "test-results/workflow/03-result.png", fullPage: true });
  await sidePanel.getByRole("button", { name: "撤销填写", exact: true }).click();
  await expect(page.locator("#name")).toHaveValue("简历导入旧姓名");
  await expect(page.locator(".company").first()).toHaveValue("旧公司一");
  await expect(page.locator('[value="cet4"]')).toBeChecked();
  await expect(page.locator('[value="cet6"]')).not.toBeChecked();
  await sidePanel.getByRole("button", { name: "记录", exact: true }).click();
  await expect(sidePanel.locator(".record-open")).toHaveCount(1);
  await sidePanel.screenshot({ path: "test-results/workflow/04-records.png", fullPage: true });
  await sidePanel.getByRole("button", { name: /^删除 / }).click();
  await sidePanel.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(sidePanel.locator(".record-item")).toHaveCount(0);
  const deleted = await sidePanel.evaluate(() => chrome.storage.local.get(["afa.jobs.v2", "afa.sessions.v2", "afa.sessions.v1", "afa.events.v1"]));
  expect(deleted["afa.jobs.v2"].jobs).toEqual([]);
  expect(deleted["afa.sessions.v2"].sessions).toEqual([]);
  expect(deleted["afa.sessions.v1"]).toEqual([]);
  expect(deleted["afa.events.v1"]).toEqual([]);
});

test("取消选库不填写、不记录岗位；旧自动填写和岗位识别设置不再生效", async () => {
  const page = await openForm();
  await recognize();
  await sidePanel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator("#name")).toHaveValue("简历导入旧姓名");
  await sidePanel.getByRole("button", { name: "记录", exact: true }).click();
  await expect(sidePanel.getByText("暂无申请记录")).toBeVisible();
  await sidePanel.getByRole("button", { name: "设置", exact: true }).click();
  await expect(sidePanel.getByText(/识别完成后直接填写|识别时自动读取/)).toHaveCount(0);
});

test("选择资料期间切到同地址的另一标签页，拒绝写入并要求重识别", async () => {
  const first = await openForm();
  await recognize();
  const second = await openForm();
  await sidePanel.locator(".library-option", { hasText: "产品资料" }).click();
  await expect(sidePanel.getByRole("alert")).toContainText("页面已切换");
  await expect(first.locator("#name")).toHaveValue("简历导入旧姓名");
  await expect(second.locator("#name")).toHaveValue("简历导入旧姓名");
});

test("现代 ATS：跨域 iframe、日期、自定义下拉仍可填写", async () => {
  const page = await context.newPage();
  await page.goto(`${FIXTURE_BASE}/modern-ats.html`);
  await page.bringToFront();
  await recognize();
  await choose("产品资料");
  await expect(page.locator("#f-name")).toHaveValue("张三");
  await expect(page.locator("#f-email")).toHaveValue("zhangsan@test.com");
  await expect(page.locator("#f-degree")).toHaveValue("本科");
  await expect(page.locator("#city-select .ant-select-selection-item")).toHaveText("杭州");
  await expect(page.locator("#f-grad")).toHaveValue("2027-06");
  await expect(page.frameLocator('iframe').locator("#q-f-portfolio")).toHaveValue(PROFILE_FIXTURE.basic.portfolio);
});


test("主页面与 iframe 字段指纹相同时，只修改选中的那个字段", async () => {
  const form = '<meta charset="utf-8"><form><label for="description">项目描述</label><textarea id="description"></textarea></form>';
  await context.route("**/identical-frame.html", (route) => route.fulfill({ contentType: "text/html", body: form }));
  await context.route("**/identical-main.html", (route) => route.fulfill({ contentType: "text/html", body: form + '<iframe src="http://localhost:4198/identical-frame.html"></iframe>' }));
  const page = await context.newPage();
  await page.goto(`${FIXTURE_BASE}/identical-main.html`);
  await page.bringToFront();
  await recognize();
  await choose("产品资料");
  await sidePanel.locator(".fold-head", { hasText: "已填写" }).click();
  const cards = sidePanel.locator('.field-card[data-field-id="project.description"]');
  await expect(cards).toHaveCount(2);
  await cards.nth(1).click();
  await cards.nth(1).locator(".value-input").fill("仅 iframe 修订");
  await sidePanel.getByRole("button", { name: /^填写 1 项/ }).click();
  await sidePanel.locator(".dialog .primary").click();
  await expect(page.frameLocator("iframe").locator("#description")).toHaveValue("仅 iframe 修订");
  await expect(page.locator("#description")).toHaveValue(PROFILE_FIXTURE.projects[0]!.description);
});

test("旧后台缺少标签页编号时提示重新加载扩展，不误报网申页未打开", async () => {
  const page = await openForm();
  await sidePanel.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((message: { type: string }) => {
      const result = send(message);
      return message.type === "ENSURE_CONTENT_SCRIPT" ? result.then((response: Record<string, unknown>) => {
        const { tabId: _tabId, ...legacy } = response;
        return legacy;
      }) : result;
    }) as typeof chrome.runtime.sendMessage;
  });
  await sidePanel.getByRole("button", { name: "开始识别", exact: true }).click();
  await expect(sidePanel.getByRole("alert")).toContainText("扩展后台尚未更新");
  await expect(page.locator("#name")).toHaveValue("简历导入旧姓名");
});


test("开始识别顺便记录公司和岗位，重复识别不重复建档，也不自动选库", async () => {
  const page = await openForm();
  await page.evaluate(() => {
    document.querySelector("h1")!.textContent = "数据分析实习生";
    const meta = document.createElement("meta");
    meta.name = "company";
    meta.content = "合成健康科技有限公司";
    document.head.append(meta);
  });
  await recognize();
  await expect(page.locator("#name")).toHaveValue("简历导入旧姓名");
  const readJobs = () => sidePanel.evaluate(async () => (await chrome.storage.local.get("afa.jobs.v2"))["afa.jobs.v2"].jobs);
  let jobs = await readJobs();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ company: "合成健康科技有限公司", position: "数据分析实习生", jobType: "general" });
  await recognize();
  expect(await readJobs()).toHaveLength(1);
  await choose("运营资料");
  await expect(page.locator(".position").first()).toHaveValue("运营岗位0");
  await sidePanel.getByRole("button", { name: "记录", exact: true }).click();
  await expect(sidePanel.locator(".record-open")).toContainText("合成健康科技有限公司 · 数据分析实习生");
});

test("只识别到公司就只记录公司；再次识别失败不清空已有公司", async () => {
  const page = await openForm();
  await page.evaluate(() => {
    document.title = "简历填写";
    document.querySelector("h1")!.textContent = "简历填写";
    const meta = document.createElement("meta"); meta.name = "company"; meta.content = "合成健康科技有限公司"; document.head.append(meta);
  });
  await recognize();
  let jobs = await sidePanel.evaluate(async () => (await chrome.storage.local.get("afa.jobs.v2"))["afa.jobs.v2"].jobs);
  expect(jobs[0]).toMatchObject({ company: "合成健康科技有限公司", position: "" });
  await page.evaluate(() => {
    document.querySelector('meta[name="company"]')!.remove();
    document.querySelector("h1")!.textContent = "数据分析实习生";
  });
  await recognize();
  jobs = await sidePanel.evaluate(async () => (await chrome.storage.local.get("afa.jobs.v2"))["afa.jobs.v2"].jobs);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ company: "合成健康科技有限公司", position: "数据分析实习生" });
});

test("公司岗位采集失败不会阻断选库和填写", async () => {
  const page = await openForm();
  await sidePanel.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((message: { type: string }) => message.type === "CAPTURE_TARGET"
      ? Promise.reject(new Error("capture unavailable")) : send(message)) as typeof chrome.runtime.sendMessage;
  });
  await recognize();
  await choose();
  await expect(page.locator("#name")).toHaveValue("张三");
  await expect(sidePanel.getByRole("alert")).toHaveCount(0);
});

test("没有表单的岗位详情页也可以顺便记录公司岗位", async () => {
  const page = await context.newPage();
  await page.goto(`${FIXTURE_BASE}/job-agent.html`);
  await page.bringToFront();
  await sidePanel.getByRole("button", { name: "开始识别", exact: true }).click();
  await expect(sidePanel.getByText("未找到表单，请进入网申填写页后重试。")).toBeVisible();
  await sidePanel.getByRole("button", { name: "记录", exact: true }).click();
  await expect(sidePanel.locator(".record-open")).toContainText("智元智能科技有限公司 · Agent开发工程师");
});

test("按选中资料库补齐实习栏，重复填写不重复添加；撤销保留新空栏", async () => {
  const page = await context.newPage();
  await page.goto(`${FIXTURE_BASE}/dynamic-internships.html`);
  await page.bringToFront();
  await recognize();
  await expect(page.locator(".entry")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).addClicks)).toBe(0);
  await choose();
  await expect(page.locator(".entry")).toHaveCount(3);
  await expect(page.locator(".company").nth(2)).toHaveValue("运营公司2");
  await expect(page.locator(".position").nth(2)).toHaveValue("运营岗位2");
  await expect(page.locator(".description").nth(2)).toHaveValue("运营原文2");
  expect(await page.evaluate(() => [(window as any).addClicks, (window as any).educationClicks, (window as any).submitClicks])).toEqual([2,1,0]);
  await recognize(); await choose();
  expect(await page.evaluate(() => (window as any).addClicks)).toBe(2);
  await sidePanel.getByRole("button", { name: "撤销填写", exact: true }).click();
  await expect(page.locator(".company").first()).toHaveValue("导入公司0");
  await expect(page.locator(".company").nth(2)).toHaveValue("");
  await expect(page.locator(".entry")).toHaveCount(3);
});

test("资料库5段、网站最多3段，补到上限后填写并提示", async () => {
  await sidePanel.evaluate(async () => {
    const values = await chrome.storage.local.get("afa.profiles.v2");
    const store = values["afa.profiles.v2"];
    const library = store.libraries.find((item: {id: string}) => item.id === "b");
    library.content.internships.push(...[3,4].map(i => ({ ...library.content.internships[0], company: `运营公司${i}`, position: `运营岗位${i}` })));
    await chrome.storage.local.set(values);
  });
  const page = await context.newPage(); await page.goto(`${FIXTURE_BASE}/dynamic-internships.html`); await page.bringToFront();
  await recognize(); await choose();
  await expect(page.locator(".entry")).toHaveCount(3);
  expect(await page.evaluate(() => (window as any).addClicks)).toBe(2);
  await expect(sidePanel.getByText(/资料库有 5 段/)).toBeVisible();
  await expect(page.locator(".company").nth(2)).toHaveValue("运营公司2");
});

test("初次没有实习输入栏也能选库，再添加并填写", async () => {
  const page = await context.newPage(); await page.goto(`${FIXTURE_BASE}/dynamic-internships.html?existing=0`); await page.bringToFront();
  await recognize();
  await expect(page.locator("input,textarea")).toHaveCount(0);
  await choose();
  await expect(page.locator(".entry")).toHaveCount(3);
  await expect(page.locator(".company").nth(2)).toHaveValue("运营公司2");
});

test("跨域iframe里的实习添加按钮只在对应frame点击", async () => {
  const page = await context.newPage(); await page.goto(`${FIXTURE_BASE}/internship-host.html`); await page.bringToFront();
  await recognize(); await choose();
  await expect(page.frameLocator("iframe").locator(".entry")).toHaveCount(3);
  await expect(page.frameLocator("iframe").locator(".company").nth(2)).toHaveValue("运营公司2");
});

test("添加按钮点击无效时停止，仍填写已有栏位并提示", async () => {
  const page = await context.newPage(); await page.goto(`${FIXTURE_BASE}/dynamic-internships.html`); await page.bringToFront();
  await page.evaluate(() => { const original=document.getElementById("add")!;const replacement=original.cloneNode(true);original.replaceWith(replacement);replacement.addEventListener("click",()=>{(window as any).addClicks++;}); });
  await recognize(); await choose();
  await expect(page.locator(".entry")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).addClicks)).toBe(1);
  await expect(page.locator(".company").first()).toHaveValue("运营公司0");
  await expect(sidePanel.getByText(/未能继续添加/)).toBeVisible();
});
