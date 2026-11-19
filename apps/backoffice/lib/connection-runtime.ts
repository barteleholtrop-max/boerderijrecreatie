import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage<Record<string,string>>();
/** Saved overrides belong to one request/job; never mutate process.env. An explicit empty override disables a server value. */
export function connectionSetting(name:string){const saved=context.getStore();return saved&&Object.hasOwn(saved,name)?saved[name]:process.env[name];}
export function runWithConnectionValues<T>(values:Record<string,string>,fn:()=>T){return context.run(values,fn);}
