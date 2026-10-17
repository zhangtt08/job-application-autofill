import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { scanPage } from "../src/content/scanner";
import { fillFields, undoFill } from "../src/content/filler";
import { fingerprintOf, findElementByFingerprint, readDisplayValue, queryAllOpenRoots } from "../src/content/domUtils";
import { setCustomSelectValue, setSelectValue } from "../src/content/eventDispatcher";
import { ensureInternshipEntries } from "../src/content/internshipEntries";
import { datePartFromHint } from '../src/utils/dateChoice';
import { runScanPipeline } from '../src/pipeline/scanPipeline';
import { defaultProfile } from '../src/profile/defaultProfile';

beforeAll(()=>vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue({width:100,height:24,top:0,left:0,right:100,bottom:24,x:0,y:0,toJSON:()=>({})} as DOMRect));
beforeEach(()=>{document.body.innerHTML='';});

describe('ATS 边界与动态控件',()=>{
  it('日期的可见标签优先于冲突 ID，组合年月提示不强判为年份',()=>{
    expect(datePartFromHint('月份','','','generatedYear')).toBe('month');
    expect(datePartFromHint('年月日','MM')).toBe('month');
  });
  it('日期容器内的年份月份自定义下拉仍是拆分下拉，不写入完整日期',()=>{
    document.body.innerHTML='<section><h2>工作经历</h2><div><span class="field-label">开始时间</span><div class="date-parts"><label>年份<input readonly role="combobox" aria-label="年份"></label><label>月份<input readonly role="combobox" aria-label="月份"></label></div></div></section>';
    const fields=scanPage();expect(fields.map(f=>f.kind)).toEqual(['custom-select','custom-select']);
    const p=structuredClone(defaultProfile);p.internships[0]!.startDate='2026.06';
    expect(runScanPipeline(fields,p).map(c=>c.value?.value)).toEqual(['2026','6']);
  });
  it('计划中有非法值时在任何写入之前拒绝整批',async()=>{
    document.body.innerHTML='<input id="name" value="旧姓名">';
    const input=document.querySelector('input')!;
    await expect(fillFields({confirmed:true,fields:[{reference:fingerprintOf(input),kind:'text',value:'新姓名'},{reference:'bad',kind:'text',value:{} as string}]})).rejects.toThrow('格式无效');
    expect(input.value).toBe('旧姓名');
  });
  it('自定义月份下拉按日期数字语义选中 06月，仍读回真实选中项',async()=>{
    document.body.innerHTML='<div><label>月份<input readonly role="combobox" aria-controls="months" id="month" value="01月"></label></div>';
    const input=document.querySelector('input')!;
    input.addEventListener('click',()=>{const panel=document.body.appendChild(document.createElement('div'));panel.id='months';panel.innerHTML='<div role="option">06月</div>';panel.firstElementChild!.addEventListener('click',()=>{input.value='06月';panel.remove();});});
    expect((await setCustomSelectValue(input,'6')).ok).toBe(true);
    expect(readDisplayValue(input)).toBe('06月');
  });
  it('多个资料词映射到同一个多选项时保留原勾选',async()=>{
    document.body.innerHTML='<select multiple><option selected>北京</option><option>杭州市</option></select>';
    const select=document.querySelector('select')!;
    expect((await setSelectValue(select,'杭州、杭州市')).ok).toBe(false);
    expect(Array.from(select.selectedOptions).map(o=>o.text)).toEqual(['北京']);
  });
  it('年改动后月份选项消失，日期组恢复原值，不留半个新日期',async()=>{
    document.body.innerHTML='<label>开始年份<select id="year"><option selected>2019</option><option>2026</option></select></label><label>开始月份<select id="month"><option selected>01</option><option>06</option></select></label>';
    const year=document.getElementById('year') as HTMLSelectElement;
    const month=document.getElementById('month') as HTMLSelectElement;
    year.addEventListener('change',()=>{month.innerHTML=year.value==='2026'?'<option>02</option>':'<option>01</option><option>06</option>';});
    const result=await fillFields({confirmed:true,fields:[{reference:fingerprintOf(year),kind:'select',value:'2026',writeGroup:'start'},{reference:fingerprintOf(month),kind:'select',value:'06',writeGroup:'start'}]});
    expect(year.value).toBe('2019'); expect(month.value).toBe('01');
    expect(result.outcomes.every(o=>o.status==='failed')).toBe(true);
  });
  it('控件在保留的原包装内重建时重新定位、覆盖和撤销',async()=>{
    document.body.innerHTML='<label>姓名<div><input id="stable-name" name="name" value="旧姓名"></div></label>';
    const original=document.querySelector('input')!;
    const install=(input:HTMLInputElement)=>input.addEventListener('input',()=>{const replacement=input.cloneNode(true) as HTMLInputElement;replacement.value=input.value;input.replaceWith(replacement);install(replacement);},{once:true});
    install(original);
    const result=await fillFields({confirmed:true,fields:[{reference:fingerprintOf(original),kind:'text',value:'新姓名'}]});
    expect(result.outcomes[0]!.status).toBe('filled');
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('新姓名');
    expect(await undoFill(result.originals)).toEqual({restored:1,failed:0});
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('旧姓名');
    expect(document.querySelector('[data-afa-undo]')).toBeNull();
  });
  it('原包装被移除或无身份字段消失时不猜邻居',()=>{
    document.body.innerHTML='<div><input id="unique" aria-label="姓名"></div><div><input aria-label="姓名"></div>';
    const old=document.querySelector('input')!;const ref=fingerprintOf(old);old.parentElement!.remove();
    expect(findElementByFingerprint(ref)).toBeNull();
    const unnamed=document.querySelector('input')!;const anonymous=fingerprintOf(unnamed);unnamed.replaceWith(unnamed.cloneNode(true));
    expect(findElementByFingerprint(anonymous)).toBeNull();
  });
  it('隐藏原生 radio 使用可见标签，禁用首项不阻断可用选项',async()=>{
    document.body.innerHTML='<fieldset><legend>性别</legend><label><input type="radio" name="gender" disabled value="未知">未知</label><label><input type="radio" name="gender" style="opacity:0" value="男">男</label><label><input type="radio" name="gender" style="display:none" value="女" checked>女</label></fieldset>';
    const fields=scanPage();expect(fields).toHaveLength(1);
    const result=await fillFields({confirmed:true,fields:[{reference:fields[0]!.reference,kind:'radio',value:'男'}]});
    expect(result.outcomes[0]!.status).toBe('filled');
    expect((document.querySelector('input[value="男"]') as HTMLInputElement).checked).toBe(true);
  });
  it('隐藏模板中的同名选项不参与选择',async()=>{
    document.body.innerHTML='<fieldset><legend>性别</legend><div style="display:none"><label><input type="radio" name="gender" value="male">男</label></div><label><input type="radio" name="gender" value="m">男</label><label><input type="radio" name="gender" value="f">女</label></fieldset>';
    const field=scanPage()[0]!;
    await fillFields({confirmed:true,fields:[{reference:field.reference,kind:'radio',value:'男'}]});
    expect((document.querySelector('input[value="m"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[value="male"]') as HTMLInputElement).checked).toBe(false);
  });
  for(const type of ['radio','checkbox'])it(`${type} 被网页取消点击时保留原状态，不强改勾选制造假成功`,async()=>{
    document.body.innerHTML=`<fieldset><legend>语言能力</legend><label><input type="${type}" name="language" value="CET6">CET6</label></fieldset>`;
    const input=document.querySelector('input')!;input.addEventListener('click',event=>event.preventDefault());
    const field=scanPage()[0]!;
    const result=await fillFields({confirmed:true,fields:[{reference:field.reference,kind:type,value:'CET6'}]});
    expect(result.outcomes[0]!.status).toBe('failed');expect(input.checked).toBe(false);
  });
  it('多选覆盖中途被网页拒绝时恢复原选择，避免只清掉旧选项',async()=>{
    document.body.innerHTML='<fieldset><legend>语言能力</legend><label><input type="checkbox" name="language" checked>CET4</label><label><input type="checkbox" name="language">CET6</label></fieldset>';
    const inputs=Array.from(document.querySelectorAll('input'));inputs[1]!.addEventListener('click',event=>event.preventDefault());
    const field=scanPage()[0]!;const result=await fillFields({confirmed:true,fields:[{reference:field.reference,kind:'checkbox',value:'CET6'}]});
    expect(result.outcomes[0]!.status).toBe('failed');expect(inputs.map(input=>input.checked)).toEqual([true,false]);
  });
  it('嵌套可编辑区域只扫描根编辑器，aria-readonly 编辑器跳过',()=>{
    document.body.innerHTML='<label>工作职责<div contenteditable="true"><div contenteditable="true">旧职责</div></div></label><div contenteditable="true" aria-label="概述" aria-readonly="true">只读概述</div>';
    for(const el of document.querySelectorAll('[contenteditable]'))Object.defineProperty(el,'isContentEditable',{value:true});
    expect(scanPage()).toHaveLength(1);
  });
  it('查询组件宿主自身的开放 ShadowRoot',()=>{
    const host=document.body.appendChild(document.createElement('div'));host.attachShadow({mode:'open'}).innerHTML='<input aria-label="公司">';
    expect(queryAllOpenRoots(host,'input')).toHaveLength(1);
  });
  it('已有某张卡片正在编辑时，保持当前卡片，不切回其他只读段',async()=>{
    document.body.innerHTML='<section><h2>工作经历</h2><article class="work-item"><button type="button">编辑</button></article><article class="work-item"><label>公司<input value="当前公司"></label><label>工作职责<textarea>当前职责</textarea></label></article></section>';
    const clicked=vi.fn();document.querySelector('button')!.addEventListener('click',clicked);
    await ensureInternshipEntries(2);
    expect(clicked).not.toHaveBeenCalled();
  });
  it('无 name、不同 name 的语言多选按同一 fieldset 覆盖',async()=>{
    document.body.innerHTML='<fieldset><legend>语言能力</legend><label><input type="checkbox" checked>CET4</label><label><input type="checkbox" name="cet6">CET6</label></fieldset>';
    const fields=scanPage();expect(fields).toHaveLength(1);
    const result=await fillFields({confirmed:true,fields:[{reference:fields[0]!.reference,kind:'checkbox',value:'CET6'}]});
    expect(result.outcomes[0]!.status).toBe('filled');
    expect(Array.from(document.querySelectorAll('input')).map(i=>i.checked)).toEqual([false,true]);
    await undoFill(result.originals);
    expect(Array.from(document.querySelectorAll('input')).map(i=>i.checked)).toEqual([true,false]);
  });
  it('撤销空多选使用真实点击，让页面监听的勾选状态也清空',async()=>{
    document.body.innerHTML='<fieldset><legend>语言能力</legend><label><input type="checkbox" name="language">CET6</label></fieldset>';
    const input=document.querySelector('input')!;let state=false;
    input.addEventListener('click',()=>{state=input.checked;});
    const field=scanPage()[0]!;const result=await fillFields({confirmed:true,fields:[{reference:field.reference,kind:'checkbox',value:'CET6'}]});
    expect(state).toBe(true);
    expect(await undoFill(result.originals)).toEqual({restored:1,failed:0});
    expect(state).toBe(false);
  });
  it('日期回滚引发其他字段联动时，重新核对其他字段结果',async()=>{
    document.body.innerHTML='<label>年份<select id="year"><option selected>2019</option><option>2026</option></select></label><label>月份<select id="month"><option selected>01</option><option>06</option></select></label><label>邮箱<input id="email" value="old@example.invalid"></label>';
    const year=document.getElementById('year') as HTMLSelectElement;const month=document.getElementById('month') as HTMLSelectElement;const email=document.getElementById('email') as HTMLInputElement;
    year.addEventListener('change',()=>{month.innerHTML=year.value==='2026'?'<option>02</option>':'<option>01</option>';if(year.value==='2019')email.value='old@example.invalid';});
    const result=await fillFields({confirmed:true,fields:[{reference:fingerprintOf(year),kind:'select',value:'2026',writeGroup:'date'},{reference:fingerprintOf(month),kind:'select',value:'06',writeGroup:'date'},{reference:fingerprintOf(email),kind:'text',value:'new@example.invalid'}]});
    expect(result.outcomes.every(o=>o.status==='failed')).toBe(true);
  });
  it('日期恢复的后一个控件再次改变前一个控件时，不报告整组恢复成功',async()=>{
    document.body.innerHTML='<select id="year"><option>2019</option><option>2026</option></select><select id="month"><option>01</option><option>06</option></select>';
    const year=document.getElementById('year') as HTMLSelectElement;const month=document.getElementById('month') as HTMLSelectElement;
    year.addEventListener('change',()=>{month.innerHTML=year.value==='2026'?'<option>02</option>':'<option>06</option><option>01</option>';});
    month.addEventListener('change',()=>{if(month.value==='01')year.value='2026';});
    const result=await fillFields({confirmed:true,fields:[{reference:fingerprintOf(year),kind:'select',value:'2026',writeGroup:'date'},{reference:fingerprintOf(month),kind:'select',value:'06',writeGroup:'date'}]});
    expect(result.outcomes.every(o=>o.detail?.includes('整组恢复未完成'))).toBe(true);
  });
  it('撤销后后续字段再次联动修改先前值时，返回真实恢复数量',async()=>{
    document.body.innerHTML='<input id="name" value="新姓名"><input id="email" value="new@example.invalid">';
    const name=document.getElementById('name') as HTMLInputElement;const email=document.getElementById('email') as HTMLInputElement;
    email.addEventListener('input',()=>{name.value='被网页重新改写';});
    expect(await undoFill([{reference:fingerprintOf(name),kind:'text',previousValue:'旧姓名'},{reference:fingerprintOf(email),kind:'text',previousValue:'old@example.invalid'}])).toEqual({restored:1,failed:1});
  });
});
