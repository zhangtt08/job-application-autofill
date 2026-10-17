import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {launchWithExtension,openSidePanel,PROFILE_FIXTURE} from './helpers';
const path='public/profile-project-links.local.json';
const patch=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
test('本机资料更新：真实扩展存储备份并更新全部项目，之后不覆盖编辑',async()=>{
 test.skip(!patch,'只验证本机附带的数据更新包');
 const {context,extensionId}=await launchWithExtension();
 try{
  const panel=await openSidePanel(context,extensionId);
  const profile=structuredClone(PROFILE_FIXTURE);profile.basic.name=patch.ownerName;
  profile.projects=[{...profile.projects[0]!,link:'https://old.example/'}];
  const before=await panel.evaluate(async p=>{
   const {basic,education,sensitive,...content}=p;
   const makeLibrary=(id:string,name:string)=>({id,name,directions:[],note:'合成资料',content:structuredClone(content),createdAt:'2026-01-01',updatedAt:'2026-01-01'});
   const store={schemaVersion:2,shared:{basic,education,sensitive},libraries:[makeLibrary('synthetic-first','合成资料库一'),makeLibrary('synthetic-second','合成资料库二')],activeLibraryId:'synthetic-first'};
   const data={'afa.profiles.v2':store,'afa.profile.v1':p};
   await chrome.storage.local.set(data);return data;
  },profile);
  await panel.reload();
  await expect.poll(()=>panel.evaluate(async key=>(await chrome.storage.local.get(key))[key],`afa.project-links.applied.${patch.id}`)).toBe(true);
  const after=await panel.evaluate(async()=>chrome.storage.local.get(null));
  expect(after[`afa.project-links.backup.${patch.id}`]).toEqual(before);
  const updated=after['afa.profiles.v2'];
  expect(updated.libraries).toHaveLength(2);
  for(const lib of updated.libraries)expect(lib.content.projects.map((p:{link:string})=>p.link)).toEqual([patch.link]);
  for(let i=0;i<updated.libraries.length;i++)updated.libraries[i].content.projects[0].link=before['afa.profiles.v2'].libraries[i].content.projects[0].link;
  expect(updated).toEqual(before['afa.profiles.v2']);
  await panel.getByRole('button',{name:'资料',exact:true}).click();
  await panel.getByText('项目经历（1）',{exact:true}).click();
  await expect(panel.getByLabel('项目链接',{exact:true})).toHaveValue(patch.link);
  mkdirSync('test-results/project-links',{recursive:true});
  await panel.screenshot({path:'test-results/project-links/profile-link.png'});
  await panel.evaluate(async()=>{const data=await chrome.storage.local.get('afa.profiles.v2');data['afa.profiles.v2'].libraries[0].content.projects[0].link='https://edited.example/';await chrome.storage.local.set(data)});
  await panel.reload();
  expect(await panel.evaluate(async()=>{const data=await chrome.storage.local.get('afa.profiles.v2');return data['afa.profiles.v2'].libraries[0].content.projects[0].link})).toBe('https://edited.example/');
 }finally{await context.close()}
});
