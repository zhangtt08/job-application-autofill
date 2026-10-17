import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchWithExtension,openSidePanel,seedProfileDeep,PROFILE_FIXTURE} from './helpers';

test('迁移包在全新浏览器自动恢复全部资料，再次打开保留编辑且不携带旧备份或密钥',async()=>{
  const source=await launchWithExtension();const temp=await fs.mkdtemp(path.join(os.tmpdir(),'afa-portable-'));
  try{
    const panel=await openSidePanel(source.context,source.extensionId);
    const profile=structuredClone(PROFILE_FIXTURE);
    Object.assign(profile.jobPreferences,{acceptOnlineInterview:'',acceptBusinessTrip:'',acceptRelocation:'',acceptOvertime:''});
    await seedProfileDeep(panel,profile);await panel.reload();
    await panel.evaluate(async()=>{
      const data=await chrome.storage.local.get('afa.profiles.v2');const store=data['afa.profiles.v2'];
      const second=structuredClone(store.libraries[0]);second.id='second';second.name='迁移第二库';second.content.projects[0].name='另一库的项目';
      store.libraries.push(second);store.activeLibraryId='second';
      await chrome.storage.local.set({'afa.profiles.v2':store,'afa.profiles.backup.ztt.123':{old:true},'afa.project-links.backup.old':{old:true},'afa.generation.settings.v1':{apiKey:'must-not-travel'},'afa.jobs.v2':[{secret:'must-not-travel'}]});
    });await panel.reload();
    await panel.getByRole('button',{name:'资料',exact:true}).click();await panel.locator('.pe-more summary').click();
    const currentStore=await panel.evaluate(async()=>{const data=await chrome.storage.local.get('afa.profiles.v2');return data['afa.profiles.v2'];});
    await panel.getByRole('textbox',{name:'姓名',exact:true}).fill('迁移包内的草稿姓名');
    const downloadPromise=panel.waitForEvent('download');await panel.getByRole('button',{name:'保存迁移包',exact:true}).click();
    const download=await downloadPromise;const zip=path.join(temp,'portable.zip');await download.saveAs(zip);
    const folder=path.join(temp,'extension');
    execFileSync('python',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])',zip,folder]);
    const packed=JSON.parse(await fs.readFile(path.join(folder,'profile-library.local.json'),'utf8'));
    const expected=structuredClone(currentStore);expected.shared.basic.name='迁移包内的草稿姓名';
    const comparison=structuredClone(packed.store);
    for(const library of comparison.libraries)library.updatedAt=expected.libraries.find((l:{id:string})=>l.id===library.id).updatedAt;
    expect(comparison).toEqual(expected);
    const destination=await launchWithExtension(folder);
    try{
      const restored=await openSidePanel(destination.context,destination.extensionId);
      await expect.poll(()=>restored.evaluate(async()=>{const data=await chrome.storage.local.get('afa.profiles.v2');return data['afa.profiles.v2']?.activeLibraryId;})).toBe('second');
      const saved=await restored.evaluate(()=>chrome.storage.local.get(null));
      expect(saved['afa.profiles.v2']).toEqual(packed.store);expect(saved['afa.profile.v1'].basic.name).toBe('迁移包内的草稿姓名');
      expect(saved['afa.generation.settings.v1']).toBeUndefined();expect(saved['afa.jobs.v2']).toBeUndefined();
      expect(Object.keys(saved).some(key=>key.includes('.backup.'))).toBe(false);
      await restored.evaluate(async()=>{const data=await chrome.storage.local.get('afa.profiles.v2');data['afa.profiles.v2'].shared.basic.name='新电脑手动修改';await chrome.storage.local.set(data);});
      await restored.reload();
      expect(await restored.evaluate(async()=>{const data=await chrome.storage.local.get('afa.profiles.v2');return data['afa.profiles.v2'].shared.basic.name;})).toBe('新电脑手动修改');
      await restored.getByRole('button',{name:'资料',exact:true}).click();await restored.locator('.pe-more summary').click();
      const nextDownload=restored.waitForEvent('download');await restored.getByRole('button',{name:'保存迁移包',exact:true}).click();
      const nextZip=path.join(temp,'second.zip');await (await nextDownload).saveAs(nextZip);
      const nextFolder=path.join(temp,'second-extension');
      execFileSync('python',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])',nextZip,nextFolder]);
      expect(JSON.parse(await fs.readFile(path.join(nextFolder,'profile-library.local.json'),'utf8')).store.shared.basic.name).toBe('新电脑手动修改');
    }finally{await destination.context.close();}
    const all=await panel.evaluate(()=>chrome.storage.local.get(null));expect(all['afa.generation.settings.v1'].apiKey).toBe('must-not-travel');
    expect(Object.keys(all).some(key=>key.includes('.backup.'))).toBe(false);
  }finally{
    await source.context.close();
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('afa-portable-'))throw Error('临时目录超出测试范围');
    await fs.rm(temp,{recursive:true,force:true});
  }
});
