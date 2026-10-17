import {validateProfileStore,type ProfileStore} from './libraryStore';

/** 无压缩 ZIP：只依赖浏览器标准 API，迁移时无需安装额外软件或联网服务。 */
function zip(files: {name:string; data:Uint8Array}[]): Blob {
  const encoder = new TextEncoder();
  const local: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    let crc = 0xffffffff;
    for (const byte of file.data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0,0x04034b50,true);header.setUint16(4,20,true);header.setUint16(6,0x800,true);header.setUint16(12,0x21,true);
    header.setUint32(14,crc,true);header.setUint32(18,file.data.length,true);header.setUint32(22,file.data.length,true);header.setUint16(26,name.length,true);
    local.push(header.buffer,name.buffer,new Uint8Array(file.data).buffer);
    const directory = new DataView(new ArrayBuffer(46));
    directory.setUint32(0,0x02014b50,true);directory.setUint16(4,20,true);directory.setUint16(6,20,true);directory.setUint16(8,0x800,true);directory.setUint16(14,0x21,true);
    directory.setUint32(16,crc,true);directory.setUint32(20,file.data.length,true);directory.setUint32(24,file.data.length,true);directory.setUint16(28,name.length,true);directory.setUint32(42,offset,true);
    central.push(directory.buffer,name.buffer);
    centralSize += 46 + name.length;
    offset += 30 + name.length + file.data.length;
    if (offset + centralSize > 0xffffffff || files.length > 0xffff) throw new Error('迁移包过大');
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,centralSize,true);end.setUint32(16,offset,true);
  return new Blob([...local,...central,end.buffer],{type:'application/zip'});
}

export async function createPortableArchive(store: ProfileStore): Promise<Blob> {
  const validated = validateProfileStore(store);
  const response = await fetch(chrome.runtime.getURL('portable-files.json'));
  if (!response.ok) throw new Error('扩展文件清单读取失败，请重新构建或更新扩展');
  const paths: unknown = await response.json();
  if (!Array.isArray(paths) || !paths.includes('manifest.json') || paths.some(path => typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some((part:string)=>!part || part==='..' || part==='.') || /profile-library|project-links|ztt-profile-import|portable-files\.json/.test(path)) || new Set(paths).size !== paths.length) throw new Error('扩展文件清单无效');
  const files = await Promise.all((paths as string[]).map(async name => {
    const file = await fetch(chrome.runtime.getURL(name));
    if (!file.ok) throw new Error(`扩展文件读取失败：${name}`);
    return {name,data:new Uint8Array(await file.arrayBuffer())};
  }));
  const encoder = new TextEncoder();
  files.push({name:'portable-files.json',data:encoder.encode(JSON.stringify(paths))});
  files.push({name:'profile-library.local.json',data:encoder.encode(JSON.stringify({kind:'application-form-assistant/libraries',version:1,store:validated}))});
  files.push({name:'迁移说明.txt',data:encoder.encode('解压到固定位置，在 Chrome / Edge 扩展管理页加载此文件夹。首次打开网申助手自动恢复全部资料库；已有资料不会被覆盖。以后更新资料后，使用“资料 → 更多 → 保存迁移包”重新保存。此包包含个人资料，请自行保管。')});
  return zip(files);
}
