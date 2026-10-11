// Existing data tooling imports local TypeScript modules without extensions.
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.') && context.parentURL){
    const url=new URL(specifier,context.parentURL);
    if(url.protocol==='file:' && !existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url)+'.ts'))return next(url.href+'.ts',context);
  }
  return next(specifier,context);
}});
