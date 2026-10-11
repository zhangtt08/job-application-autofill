// 已安装 dist 使用旧描述结构；隔离正在编辑的源码，只验证这次资料写入。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(dir);
const installed=fs.readFileSync(path.join(root,'dist/sidepanel.js'),'utf8');
for(const key of ['descriptionShort','descriptionMedium','descriptionLong'])if(!installed.includes(key))throw Error('Installed schema changed; re-check before importing');
const refs=execFileSync('git',['log','-12','--format=%H','--','src/profile/profileResolver.ts'],{cwd:root,encoding:'utf8'}).trim().split('\n');
let source,schema,ref;
for(const candidate of refs){
 const resolver=execFileSync('git',['show',`${candidate}:src/profile/profileResolver.ts`],{cwd:root,encoding:'utf8'});
 if(!resolver.includes('chooseVariant'))continue;
 const validator=execFileSync('git',['show',`${candidate}:src/profile/schema.ts`],{cwd:root,encoding:'utf8'});
 if(!validator.includes('descriptionShort'))continue;
 source=resolver;schema=validator;ref=candidate;break;
}
if(!source)throw Error('没有找到匹配已安装插件结构的历史快照；不修改业务源码');
const {build}=createRequire(import.meta.url)('esbuild');
await build({stdin:{contents:source,sourcefile:'installed-profile-resolver.ts',resolveDir:path.join(root,'src/profile'),loader:'ts'},outfile:path.join(dir,'installed-profile-resolver.mjs'),bundle:true,platform:'node',format:'esm',target:'node24'});
await build({stdin:{contents:schema,sourcefile:'installed-profile-schema.ts',resolveDir:path.join(root,'src/profile'),loader:'ts'},outfile:path.join(dir,'installed-profile-schema.mjs'),bundle:true,platform:'neutral',format:'esm',target:'es2022'});
console.log(JSON.stringify({verificationTarget:'installed-legacy-extension',sourceRef:ref,committedSourceSha256:createHash('sha256').update(source).digest('hex')}));
