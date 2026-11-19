// Test-only: lets Node's test runner load lib files that import each other without the .ts extension,
// the way Next.js does, including the "@/..." alias for the backoffice root. Import this first, then load
// the modules with a dynamic import().
import {register} from 'node:module';
const root=new URL('../../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`
import fs from 'node:fs';
const root=${JSON.stringify(root)};
export async function resolve(specifier,context,next){
 if(specifier.startsWith('@/'))specifier=new URL(specifier.slice(2),root).href;
 if((specifier.startsWith('./')||specifier.startsWith('../')||specifier.startsWith('file:'))&&!/\\.[a-z]+$/i.test(specifier)&&(context.parentURL||specifier.startsWith('file:'))){
  for(const end of ['.ts','/index.ts']){const url=new URL(specifier+end,context.parentURL);if(fs.existsSync(url))return next(url.href,context);}
 }
 return next(specifier,context);
}`));
