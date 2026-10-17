import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Blob as NodeBlob} from 'node:buffer';
import {createDefaultStore,LEGACY_KEY,STORE_KEY,loadStore,validateProfileStore,type ProfileStore} from '../src/profile/libraryStore';
import {createPortableArchive} from '../src/profile/portable';

let data:Record<string,unknown>;
let bundled:unknown;
beforeEach(()=>{
  vi.stubGlobal('Blob',NodeBlob);
  data={};bundled={kind:'application-form-assistant/libraries',version:1,store:createDefaultStore()};
  vi.stubGlobal('chrome',{runtime:{getURL:(path:string)=>`chrome-extension://test/${path}`},storage:{local:{
    get:vi.fn(async(keys:string[]|null)=>keys?Object.fromEntries(keys.map(key=>[key,data[key]])):structuredClone(data)),
    set:vi.fn(async(value:Record<string,unknown>)=>{Object.assign(data,structuredClone(value));}),
    remove:vi.fn(async(keys:string[])=>{for(const key of keys)delete data[key];}),
  }}});
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,status:200,json:async()=>url.endsWith('profile-library.local.json')?bundled:{}})));
});
afterEach(()=>vi.unstubAllGlobals());

it('全新浏览器自动恢复全部资料库、公共信息、选库和镜像，再加载不覆盖修改',async()=>{
  const store=createDefaultStore();store.shared.basic.name='合成姓名';store.libraries[0]!.name='第一库';
  store.libraries.push({...structuredClone(store.libraries[0]!),id:'second',name:'第二库'});store.activeLibraryId='second';
  bundled={kind:'application-form-assistant/libraries',version:1,store};
  const loaded=await loadStore();expect(loaded.activeLibraryId).toBe('second');expect(loaded.libraries.map(l=>l.name)).toEqual(['第一库','第二库']);expect(data[STORE_KEY]).toEqual(store);expect(data[LEGACY_KEY]).toMatchObject({basic:{name:'合成姓名'}});
  (data[STORE_KEY] as ProfileStore).shared.basic.name='后来手改';
  expect((await loadStore()).shared.basic.name).toBe('后来手改');
});
it('已有空白库、旧版库和异常库均不被随包资料覆盖',async()=>{
  data[STORE_KEY]=createDefaultStore();await loadStore();expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('profile-library.local.json'));
  data={[LEGACY_KEY]:{...structuredClone((bundled as {store:ProfileStore}).store.shared),...structuredClone((bundled as {store:ProfileStore}).store.libraries[0]!.content)}};
  await loadStore();expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('profile-library.local.json'));
  data={[STORE_KEY]:{broken:true}};await loadStore();expect(data[STORE_KEY]).toEqual({broken:true});
});
it('缺少随包资料正常使用空库，损坏随包资料不写入',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce({ok:false,status:404} as Response);await loadStore();expect(data[STORE_KEY]).toBeUndefined();
  bundled={kind:'application-form-assistant/libraries',version:1,store:{libraries:[]}};await loadStore();expect(data[STORE_KEY]).toBeUndefined();
});
it('读取随包文件期间已有资料写入时，保留后来写入的资料',async()=>{
  const existing=createDefaultStore();existing.shared.basic.name='已有资料';
  vi.mocked(fetch).mockImplementationOnce(async()=>{data[STORE_KEY]=existing;return {ok:true,json:async()=>bundled} as Response;});
  expect((await loadStore()).shared.basic.name).toBe('已有资料');
});
it('资料库校验拒绝重复 ID、无效选库和任一损坏库，不做部分迁移',()=>{
  const store=createDefaultStore();expect(validateProfileStore(store)).toEqual(store);
  expect(()=>validateProfileStore({...store,activeLibraryId:'missing'})).toThrow();
  expect(()=>validateProfileStore({...store,libraries:[...store.libraries,...store.libraries]})).toThrow();
  const bad=structuredClone(store);(bad.libraries[0]!.content.skills as unknown as {technical:unknown}).technical=123;
  expect(()=>validateProfileStore(bad)).toThrow();
});
it('删除已知旧备份，不删除正式资料、损坏恢复副本、其他应用键',async()=>{
  data={[STORE_KEY]:createDefaultStore(),'afa.profiles.backup.ztt.123':{},'afa.project-links.backup.old-update':{},'afa.profiles.v2.corrupt':{keep:true},'other.backup':{keep:true}};
  await loadStore();expect(data['afa.profiles.backup.ztt.123']).toBeUndefined();expect(data['afa.project-links.backup.old-update']).toBeUndefined();
  expect(data['afa.profiles.v2.corrupt']).toEqual({keep:true});expect(data['other.backup']).toEqual({keep:true});expect(data[STORE_KEY]).toBeDefined();
});
it('迁移包包含完整扩展和当前全部资料，不携带 API Key、历史岗位或旧备份',async()=>{
  const store=createDefaultStore();store.shared.basic.name='当前最新姓名';
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('portable-files.json')?
    {ok:true,json:async()=>['manifest.json','sidepanel.html','content.js','background.js']}:
    {ok:true,arrayBuffer:async()=>new TextEncoder().encode(url).buffer}));
  const blob=await createPortableArchive(store);const text=new TextDecoder().decode(await blob.arrayBuffer());
  expect(text).toContain('profile-library.local.json');expect(text).toContain('当前最新姓名');expect(text).toContain('manifest.json');
  expect(text).toContain('portable-files.json');
  expect(text).not.toContain('afa.generation.settings');expect(text).not.toContain('afa.jobs');expect(text).not.toContain('backup');
});
it('任一扩展文件读取失败时不生成半份迁移包',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('portable-files.json')?{ok:true,json:async()=>['manifest.json']}:{ok:false}));
  await expect(createPortableArchive(createDefaultStore())).rejects.toThrow();
});
it.each(['../secret','/absolute','./manifest.json','portable-files.json'])('拒绝越界或保留文件路径 %s',async unsafe=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>['manifest.json',unsafe]})));
  await expect(createPortableArchive(createDefaultStore())).rejects.toThrow('清单无效');
});
