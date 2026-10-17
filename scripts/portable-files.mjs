import {readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
async function files(folder=''){
  const result=[];
  for(const item of await readdir(path.join(root,folder),{withFileTypes:true})){
    const name=path.posix.join(folder,item.name);
    if(item.isDirectory())result.push(...await files(name));
    else if(!/^(?:portable-files\.json|profile-.*\.local\.json|ztt-profile-import\.)/.test(name))result.push(name);
  }
  return result.sort();
}
await writeFile(path.join(root,'portable-files.json'),JSON.stringify(await files()));
