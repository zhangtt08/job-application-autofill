import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { FIXTURE_BASE, PROFILE_FIXTURE, launchWithExtension, openSidePanel, seedProfileDeep, chooseLibraryAndFill, revealPreview } from "./helpers";

test("正文独立取值、覆盖、缺失保留、多行编辑与窄屏布局", async () => {
  const { context, extensionId } = await launchWithExtension();
  try {
    const panel = await openSidePanel(context, extensionId);
    await panel.setViewportSize({ width: 400, height: 820 });
    const profile = structuredClone(PROFILE_FIXTURE);
    Object.assign(profile.projects[0]!, { name: "测试项目", description: "描述原文\n第二行描述", summary: "概述原文", responsibilities: "职责原文", workContent: "内容原文", achievements: "成果原文", background: "背景原文" });
    await seedProfileDeep(panel, profile);
    await panel.reload();
    mkdirSync("test-results/semantic-ui", { recursive: true });
    await panel.screenshot({ path: "test-results/semantic-ui/01-start.png" });
    const page = await context.newPage();
    await page.goto(`${FIXTURE_BASE}/semantic-content.html`);
    await page.bringToFront();
    await panel.getByRole("button", { name: "开始识别", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "选择资料库" })).toBeVisible();
    await expect(page.locator("#description")).toHaveValue("旧概述：负责登录验证的工作职责");
    await panel.screenshot({ path: "test-results/semantic-ui/02-library.png" });
    await chooseLibraryAndFill(panel);
    const expected = { description: "描述原文\n第二行描述", summary: "概述原文", duties: "职责原文", tasks: "内容原文", results: "成果原文", background: "背景原文", combined: "组合问题保留原文" };
    for (const [id, value] of Object.entries(expected)) await expect(page.locator(`#${id}`)).toHaveValue(value);
    await panel.screenshot({ path: "test-results/semantic-ui/03-result.png", fullPage: true });
    await revealPreview(panel);
    const card = panel.locator('.field-card[data-field-id="project.responsibilities"]');
    await card.click();
    const editor = panel.getByRole("textbox", { name: "写入内容：职责描述", exact: true });
    await expect(editor).toHaveValue("职责原文");
    await editor.press("Control+A");
    await editor.pressSequentially("调整后的职责");
    await editor.press("Enter");
    await editor.pressSequentially("保留换行");
    await expect(editor).toHaveValue("调整后的职责\n保留换行");
    await panel.locator(".fill-overview h2").click();
    await panel.screenshot({ path: "test-results/semantic-ui/04-details.png", fullPage: true });
    await panel.getByRole("button", { name: /^填写 1 项$/ }).click();
    await panel.getByRole("button", { name: "确认填写", exact: true }).click();
    await expect(page.locator("#duties")).toHaveValue("调整后的职责\n保留换行");
    // 库中缺描述但有概述，网站已有描述必须保持。
    profile.projects[0]!.description = "";
    await seedProfileDeep(panel, profile);
    await panel.getByRole("button", { name: "重新识别", exact: true }).click();
    await chooseLibraryAndFill(panel);
    await expect(page.locator("#description")).toHaveValue("描述原文\n第二行描述");
    for (const width of [320, 400]) {
      await panel.setViewportSize({ width, height: 820 });
      const overflow = await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, `${width}px 不横向溢出`).toBe(false);
    }
  } finally { await context.close(); }
});
