import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { FIXTURE_BASE, PROFILE_FIXTURE, launchWithExtension, openSidePanel, seedProfileDeep, chooseLibraryAndFill } from "./helpers";

test("飞书同结构表单：覆盖解析旧值，补齐教育/实习/项目，重复填写和撤销", async () => {
  const { context, extensionId } = await launchWithExtension();
  try {
    const panel = await openSidePanel(context, extensionId);
    await panel.setViewportSize({ width: 400, height: 820 });
    const profile = structuredClone(PROFILE_FIXTURE);
    profile.education = [0,1].map(i=>({...profile.education[0]!, school:`合成大学${i}`, degree:i===0?'本科':'硕士',major:`专业${i}`}));
    profile.internships = [0,1,2].map(i=>({...profile.internships[0]!, company:`合成公司${i}`,position:`岗位${i}`,description:`实习原文${i}\n第二行`}));
    profile.projects = [0,1,2].map(i=>({...profile.projects[0]!,name:`合成项目${i}`,role:`项目角色${i}`,description:`项目原文${i}`}));
    for(const entries of [profile.education,profile.internships,profile.projects])for(const entry of entries){entry.startDate='2023-08';entry.endDate='2026-10';}
    for(const entry of profile.projects)entry.link='https://zhangtianteng.xyz/';
    await seedProfileDeep(panel, profile);await panel.reload();
    const page = await context.newPage();await page.goto(`${FIXTURE_BASE}/feishu-form.html`);await page.bringToFront();
    await panel.getByRole('button',{name:'开始识别',exact:true}).click();
    await expect(panel.getByRole('heading',{name:'选择资料库'})).toBeVisible();
    expect(await page.evaluate(()=>(window as any).addClicks)).toEqual({education:0,internship:0,project:0,works:0});
    await expect(page.locator('textarea[id="internship[0].desc"]')).toHaveValue('旧概述：登录验证和职责');
    await chooseLibraryAndFill(panel);
    for(const group of ['education','internship','project']) await expect(page.locator(`.resumeEditForm-${group}`)).toHaveCount(group==='education'?2:3);
    for(let i=0;i<3;i++){
      await expect(page.locator(`textarea[id="internship[${i}].desc"]`)).toHaveValue(`实习原文${i}\n第二行`);
      await expect(page.locator(`input[id="internship[${i}].title"]`)).toHaveValue(`岗位${i}`);
      await expect(page.locator(`textarea[id="project[${i}].desc"]`)).toHaveValue(`项目原文${i}`);
      await expect(page.locator(`input[id="project[${i}].name"]`)).toHaveValue(`合成项目${i}`);
    }
    for(const group of ['education','internship','project'])for(let i=0;i<(group==='education'?2:3);i++){
      await expect(page.locator(`[data-cy="${group}[${i}].periodInputBegin"]`)).toHaveText('2023-08');
      await expect(page.locator(`[data-cy="${group}[${i}].periodInputEnd"]`)).toHaveText('2026-10');
    }
    for(let i=0;i<3;i++)await expect(page.locator(`input[id="project[${i}].link"]`)).toHaveValue('https://zhangtianteng.xyz/');
    await expect(page.locator('.createFormSection-education [role=combobox]').nth(0)).toHaveText('本科');
    await expect(page.locator('.createFormSection-education [role=combobox]').nth(1)).toHaveText('硕士');
    await expect(page.locator('textarea[id="works[0].desc"]')).toHaveValue('保留作品说明');
    expect(await page.evaluate(()=>(window as any).addClicks)).toEqual({education:1,internship:2,project:2,works:0});
    mkdirSync('test-results/feishu',{recursive:true});
    await panel.screenshot({path:'test-results/feishu/filled-panel.png'});
    await page.screenshot({path:'test-results/feishu/filled-form.png',fullPage:true});
    await panel.getByRole('button',{name:'重新识别',exact:true}).click();await chooseLibraryAndFill(panel);
    expect(await page.evaluate(()=>(window as any).addClicks)).toEqual({education:1,internship:2,project:2,works:0});
    await panel.getByRole('button',{name:'撤销填写',exact:true}).click();
    await expect(page.locator('textarea[id="internship[0].desc"]')).toHaveValue('旧概述：登录验证和职责',{timeout:45000});
    await expect(page.locator('.createFormSection-education [role=combobox]').first()).toHaveText('博士');
    await expect(page.locator('[data-cy="project[0].periodInputBegin"]')).toHaveText('2019-09');
    await expect(page.locator('[data-cy="project[0].periodInputEnd"]')).toHaveText('2027-09');
    await expect(page.locator('input[id="project[0].link"]')).toHaveValue('https://old.example/');
    expect(await page.evaluate(()=>(window as any).submitClicks)).toBe(0);
  } finally { await context.close(); }
});
