import {test,expect} from '@playwright/test';
import {FIXTURE_BASE,PROFILE_FIXTURE,launchWithExtension,openSidePanel,seedProfileDeep,chooseLibraryAndFill} from './helpers';

for(const fail of [false,true])test(`动态控件：重建覆盖、隐藏选择、${fail?'日期联动失败恢复整组':'年月下拉'}及撤销`,async()=>{
  const {context,extensionId}=await launchWithExtension();
  try{
    const panel=await openSidePanel(context,extensionId);
    await seedProfileDeep(panel,structuredClone(PROFILE_FIXTURE));await panel.reload();
    const page=await context.newPage();await page.goto(`${FIXTURE_BASE}/ats-edge.html${fail?'?fail':''}`);await page.bringToFront();
    await panel.getByRole('button',{name:'开始识别',exact:true}).click();
    await expect(panel.getByRole('heading',{name:'选择资料库'})).toBeVisible();
    await expect(page.locator('#name')).toHaveValue('解析旧姓名');expect(await page.evaluate(()=>(window as any).remounts)).toBe(0);
    await chooseLibraryAndFill(panel);
    await expect(page.locator('#name')).toHaveValue(PROFILE_FIXTURE.basic.name);
    await expect(page.locator('#male')).toBeChecked();await expect(page.locator('#female')).not.toBeChecked();
    await expect(page.locator('#cet6')).toBeChecked();await expect(page.locator('#cet4')).not.toBeChecked();
    await expect(page.locator('#duties')).toHaveText(PROFILE_FIXTURE.internships[0]!.responsibilities);
    await expect(page.locator('#year')).toHaveValue(fail?'2019':'2026');await expect(page.locator('#month')).toHaveValue(fail?'01':'06月');
    if(fail){
      await panel.getByRole('button',{name:'展开这一项：开始时间'}).first().click();
      await expect(panel.getByText('日期的一部分未能填写，已恢复整组原值').first()).toBeVisible();
    }
    expect(await page.evaluate(()=>(window as any).submitClicks)).toBe(0);
    await panel.getByRole('button',{name:'撤销填写',exact:true}).click();
    await expect(page.locator('#name')).toHaveValue('解析旧姓名',{timeout:45000});
    await expect(page.locator('#female')).toBeChecked();await expect(page.locator('#cet4')).toBeChecked();await expect(page.locator('#cet6')).not.toBeChecked();
    await expect(page.locator('#year')).toHaveValue('2019');await expect(page.locator('#month')).toHaveValue(fail?'01':'01月');
    expect(await page.locator('#duties').innerText()).toBe('旧职责');
    await expect(page.locator('[data-afa-undo]')).toHaveCount(0);
  }finally{await context.close();}
});

test('网页拒绝单选和多选点击时，保留拒绝结果并报告未填写',async()=>{
  const {context,extensionId}=await launchWithExtension();
  try{
    const panel=await openSidePanel(context,extensionId);
    await seedProfileDeep(panel,structuredClone(PROFILE_FIXTURE));await panel.reload();
    const page=await context.newPage();await page.goto(`${FIXTURE_BASE}/ats-edge.html`);await page.bringToFront();
    await page.evaluate(()=>{for(const input of document.querySelectorAll('#male,#cet6'))input.addEventListener('click',event=>event.preventDefault());});
    await panel.getByRole('button',{name:'开始识别',exact:true}).click();await chooseLibraryAndFill(panel);
    await expect(page.locator('#name')).toHaveValue(PROFILE_FIXTURE.basic.name);
    await expect(page.locator('#male')).not.toBeChecked();await expect(page.locator('#female')).toBeChecked();
    await expect(page.locator('#cet6')).not.toBeChecked();
    await expect(page.locator('#cet4')).toBeChecked();
    await expect(panel.getByRole('button',{name:/未填写 2/})).toBeVisible();
    expect(await page.evaluate(()=>(window as any).submitClicks)).toBe(0);
    await panel.getByRole('button',{name:'撤销填写',exact:true}).click();
    await expect(page.locator('#cet4')).toBeChecked();
  }finally{await context.close();}
});
