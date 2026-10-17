import { test, expect } from "@playwright/test";
import { FIXTURE_BASE, PROFILE_FIXTURE, launchWithExtension, openSidePanel, seedProfileDeep, chooseLibraryAndFill } from "./helpers";

for (const family of ['native','ant','element','custom']) {
  test(`${family} 布局：解析卡片自动编辑、职责覆盖、年月对齐、多选和撤销`, async () => {
    const {context,extensionId}=await launchWithExtension();
    try {
      const panel=await openSidePanel(context,extensionId);
      const profile=structuredClone(PROFILE_FIXTURE);
      profile.internships=[0,1,2].map(i=>({...profile.internships[0]!,company:`合成公司${i}`,position:`合成岗位${i}`,responsibilities:`职责${i}\n第二行`,summary:`概述${i}`,startDate:`202${i}.06`,endDate:`202${i+1}.09`}));
      profile.jobPreferences.expectedCity=['上海','杭州'];
      await seedProfileDeep(panel,profile);await panel.reload();
      const page=await context.newPage();await page.goto(`${FIXTURE_BASE}/ats-structures.html?family=${family}`);await page.bringToFront();
      await panel.getByRole('button',{name:'开始识别',exact:true}).click();
      await expect(panel.getByRole('heading',{name:'选择资料库'})).toBeVisible();
      expect(await page.evaluate(()=>(window as any).editClicks)).toBe(0);
      await expect(page.locator('#name')).toHaveCount(0);
      await chooseLibraryAndFill(panel);
      await expect(page.locator('#name')).toHaveValue(profile.basic.name);
      await expect(page.locator('#email')).toHaveValue(profile.basic.email);
      for(let i=0;i<3;i++){
        await expect(page.locator(`#company${i}`)).toHaveValue(`合成公司${i}`);
        await expect(page.locator(`#position${i}`)).toHaveValue(`合成岗位${i}`);
        await expect(page.locator(`#starty${i}`)).toHaveValue(`year-202${i}`);
        await expect(page.locator(`#startm${i}`)).toHaveValue('month-6');
        await expect(page.locator(`#endy${i}`)).toHaveValue(`year-202${i+1}`);
        await expect(page.locator(`#endm${i}`)).toHaveValue('month-9');
        if(i>0){
          if(family==='native')await expect(page.locator(`#duties${i}`)).toHaveValue(`职责${i}\n第二行`);
          else expect(await page.locator(`#duties${i}`).innerText()).toBe(`职责${i}\n第二行`);
        }
      }
      expect(await page.locator('#cities').evaluate((select:HTMLSelectElement)=>Array.from(select.selectedOptions).map(o=>o.text))).toEqual(['杭州','上海']);
      expect(await page.evaluate(()=>(window as any).editClicks)).toBe(4);
      expect(await page.evaluate(()=>(window as any).submitClicks)).toBe(0);
      if(family!=='native')expect(await page.evaluate(()=>(window as any).nativeEditorInputs)).toBeGreaterThanOrEqual(2);
      await panel.getByRole('button',{name:'撤销填写',exact:true}).click();
      await expect(page.locator('#name')).toHaveValue('解析旧姓名',{timeout:45000});
      await expect(page.locator('#starty1')).toHaveValue('year-2019');
      expect(await page.locator('#cities').evaluate((select:HTMLSelectElement)=>Array.from(select.selectedOptions).map(o=>o.text))).toEqual(['北京']);
      if(family==='native')await expect(page.locator('#duties1')).toHaveValue('旧职责');
      else expect(await page.locator('#duties1').innerText()).toBe('旧职责\n\n原第二段');
    } finally { await context.close(); }
  });
}

test('单段编辑网站保持原卡片序号，不把第一段资料写进第二段',async()=>{
  const {context,extensionId}=await launchWithExtension();
  try {
    const panel=await openSidePanel(context,extensionId);
    const profile=structuredClone(PROFILE_FIXTURE);
    profile.internships=[0,1,2].map(i=>({...profile.internships[0]!,company:`合成公司${i}`,responsibilities:`职责${i}`}));
    await seedProfileDeep(panel,profile);await panel.reload();
    const page=await context.newPage();await page.goto(`${FIXTURE_BASE}/ats-structures.html?family=exclusive`);await page.bringToFront();
    await panel.getByRole('button',{name:'开始识别',exact:true}).click();await chooseLibraryAndFill(panel);
    await expect(page.locator('#company1')).toHaveValue('合成公司1');
    await expect(page.locator('#duties1')).toHaveText('职责1');
    await expect(page.locator('#company0')).toHaveCount(0);
    await expect(page.locator('#company2')).toHaveCount(0);
    expect(await page.evaluate(()=>(window as any).editClicks)).toBe(3);
    expect(await page.evaluate(()=>(window as any).submitClicks)).toBe(0);
    await expect(panel.getByText(/本次仅处理当前可编辑/)).toBeVisible();
  } finally {await context.close();}
});
