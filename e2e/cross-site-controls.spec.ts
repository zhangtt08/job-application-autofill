import { test, expect } from "@playwright/test";
import { FIXTURE_BASE, PROFILE_FIXTURE, launchWithExtension, openSidePanel, seedProfileDeep, chooseLibraryAndFill } from "./helpers";

test("混合组件：深层扫描、搜索/关联下拉、原生年月、重建补齐、覆盖与撤销", async () => {
  const { context, extensionId } = await launchWithExtension();
  try {
    const panel = await openSidePanel(context, extensionId);
    const profile = structuredClone(PROFILE_FIXTURE);
    profile.internships = [0,1,2].map(i => ({ ...profile.internships[0]!, company: `合成公司${i}`, position: `合成岗位${i}`, description: `实习原文${i}`, startDate: "2025.06", endDate: "2026.09" }));
    await seedProfileDeep(panel, profile); await panel.reload();
    const page = await context.newPage(); await page.goto(`${FIXTURE_BASE}/cross-site-controls.html`); await page.bringToFront();
    const name = page.locator('#shadow-host input');
    await panel.getByRole('button', { name: '开始识别', exact: true }).click();
    await expect(panel.getByRole('heading', { name: '选择资料库' })).toBeVisible();
    await expect(name).toHaveValue('旧姓名');
    expect(await page.evaluate(() => (window as any).addClicks)).toBe(0);
    await chooseLibraryAndFill(panel);
    await expect(name).toHaveValue(profile.basic.name);
    expect(await page.evaluate(() => (window as any).nameState)).toBe(profile.basic.name);
    await expect(page.locator('#email')).toHaveValue(profile.basic.email);
    await expect(page.locator('.ant-select-selection-item')).toHaveText(profile.education[0]!.school);
    await expect(page.locator('#degree')).toHaveText('本科');
    await expect(page.locator('#education-start')).toHaveValue('2023-09');
    await expect(page.locator('#education-end')).toHaveValue('2027-06');
    await expect(page.locator('#internships .entry')).toHaveCount(3);
    for (let i=0;i<3;i++) {
      await expect(page.locator(`#company-${i}`)).toHaveValue(`合成公司${i}`);
      await expect(page.locator(`#position-${i}`)).toHaveValue(`合成岗位${i}`);
      await expect(page.locator(`#description-${i}`)).toHaveValue(`实习原文${i}`);
      await expect(page.locator(`#start-${i}`)).toHaveValue('2025-06');
      await expect(page.locator(`#end-${i}`)).toHaveValue('2026-09');
    }
    expect(await page.evaluate(() => ({ add: (window as any).addClicks, wrong: (window as any).wrongClicks, submit: (window as any).submitClicks }))).toEqual({ add: 2, wrong: 0, submit: 0 });
    await expect(page.locator('#locked')).toHaveValue('保留锁定值');
    await expect(page.locator('#hidden')).toHaveValue('保留隐藏值');
    await panel.getByRole('button', { name: '撤销填写', exact: true }).click();
    await expect(name).toHaveValue('旧姓名', { timeout: 45000 });
    await expect(page.locator('#company-0')).toHaveValue('旧公司0');
    await expect(page.locator('#degree')).toHaveText('博士');
    await expect(page.locator('.ant-select-selection-item')).toHaveText('旧大学');
    await expect(page.locator('#education-start')).toHaveValue('2019-09');
  } finally { await context.close(); }
});

test("同源和跨源 iframe 经各自 frame 扫描填写，不重复或串写", async () => {
  const { context, extensionId } = await launchWithExtension();
  try {
    const panel = await openSidePanel(context, extensionId);
    await seedProfileDeep(panel, structuredClone(PROFILE_FIXTURE)); await panel.reload();
    const page = await context.newPage(); await page.goto(`${FIXTURE_BASE}/compatibility/iframe-host.html`); await page.bringToFront();
    await page.locator('#cross-origin').evaluate(frame => { (frame as HTMLIFrameElement).src = 'http://localhost:4198/compatibility/iframe-child.html'; });
    await expect(page.frameLocator('#same-origin').locator('#if-name')).toBeVisible();
    await expect(page.frameLocator('#cross-origin').locator('#if-name')).toBeVisible();
    await panel.getByRole('button', { name: '开始识别', exact: true }).click();
    await chooseLibraryAndFill(panel);
    for (const frame of ['#same-origin', '#cross-origin']) {
      await expect(page.frameLocator(frame).locator('#if-name')).toHaveValue(PROFILE_FIXTURE.basic.name);
      await expect(page.frameLocator(frame).locator('#if-email')).toHaveValue(PROFILE_FIXTURE.basic.email);
    }
    expect(await page.evaluate(() => (document.querySelector('#cross-origin') as HTMLIFrameElement).contentDocument)).toBeNull();
  } finally { await context.close(); }
});
