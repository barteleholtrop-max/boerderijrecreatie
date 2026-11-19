// Database side of eigen bedrag and groepscodes. Rules live in lib/order-options.ts.
import {env} from '@/lib/portable/env';
import {DEFAULT_SETTING,newGroupCode,type OwnAmountSetting,type SalesContext,type GroupCode} from './order-options';

export const amsterdamToday=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(now);

export async function getSetting(context:SalesContext):Promise<OwnAmountSetting&{version:number}>{
 const r=await env.DB.prepare(`SELECT context, enabled, max_percent AS "maxPercent", allow_zero AS "allowZero", version FROM order_price_settings WHERE context=?`).bind(context).first() as {context:SalesContext;enabled:number;maxPercent:number;allowZero:number;version:number}|null;
 return r?{context,enabled:!!r.enabled,maxPercent:r.maxPercent,allowZero:!!r.allowZero,version:r.version}:{...DEFAULT_SETTING(context),version:0};
}
/** Saves a setting if nobody changed it in the meantime (version). Returns false on a conflict. */
export async function saveSetting(s:OwnAmountSetting,version:number,by:string){
 const now=new Date().toISOString();
 const r=version===0
  ?await env.DB.prepare(`INSERT INTO order_price_settings(context, enabled, max_percent, allow_zero, version, updated, updated_by) VALUES(?,?,?,?,1,?,?) ON CONFLICT(context) DO NOTHING`).bind(s.context,s.enabled?1:0,s.maxPercent,s.allowZero?1:0,now,by).run()
  :await env.DB.prepare(`UPDATE order_price_settings SET enabled=?, max_percent=?, allow_zero=?, version=version+1, updated=?, updated_by=? WHERE context=? AND version=?`).bind(s.enabled?1:0,s.maxPercent,s.allowZero?1:0,now,by,s.context,version).run();
 return r.meta.changes===1;
}

const GROUP_COLUMNS=`g.id, g.code, g.name, g.host, g.budget_cents AS "budgetCents", g.valid_from AS "validFrom", g.valid_until AS "validUntil", g.status, g.version, g.created, g.origin, g.holder_name AS "holderName", g.paid_at AS "paidAt", g.kind, g.warn_cents AS "warnCents"`;
export type GroupRow=GroupCode&{created:string;spentCents:number;orders:number};
export async function listGroups():Promise<GroupRow[]>{
 return (await env.DB.prepare(`SELECT ${GROUP_COLUMNS}, COALESCE(SUM(o.total_cents),0) AS "spentCents", COUNT(o.id) AS orders FROM group_codes g LEFT JOIN orders o ON o.group_code_id=g.id GROUP BY g.id ORDER BY g.created DESC LIMIT 200`).all()).results as GroupRow[];
}
type FoundGroup=GroupCode&{created:string;origin:string;holderName:string;paidAt:string;kind:string;warnCents:number|null};
export async function findGroup(code:string){
 return await env.DB.prepare(`SELECT ${GROUP_COLUMNS} FROM group_codes g WHERE g.code=?`).bind(code).first() as FoundGroup|null;
}
export async function findGroupById(id:string){
 return await env.DB.prepare(`SELECT ${GROUP_COLUMNS} FROM group_codes g WHERE g.id=?`).bind(id).first() as FoundGroup|null;
}
export async function groupSpent(id:string){
 return Number((await env.DB.prepare(`SELECT COALESCE(SUM(total_cents),0) AS n FROM orders WHERE group_code_id=?`).bind(id).first() as {n:number}).n);
}
/** New group code; a rare code collision is retried with a fresh code. The id doubles as request id (no doubles). */
export async function createGroup(id:string,g:Pick<GroupCode,'name'|'host'|'budgetCents'|'validFrom'|'validUntil'>,by:string){
 const existing=await env.DB.prepare(`SELECT code FROM group_codes WHERE id=?`).bind(id).first() as {code:string}|null;
 if(existing)return existing.code;
 const now=new Date().toISOString();
 for(let attempt=0;attempt<5;attempt++){
  const code=newGroupCode();
  const r=await env.DB.prepare(`INSERT INTO group_codes(id, code, name, host, budget_cents, valid_from, valid_until, status, version, created, created_by, updated) VALUES(?,?,?,?,?,?,?,'actief',1,?,?,?) ON CONFLICT DO NOTHING`)
   .bind(id,code,g.name.trim(),g.host.trim(),g.budgetCents,g.validFrom,g.validUntil,now,by,now).run();
  if(r.meta.changes===1)return code;
  const again=await env.DB.prepare(`SELECT code FROM group_codes WHERE id=?`).bind(id).first() as {code:string}|null;
  if(again)return again.code;
 }
 throw Error('Er kon geen unieke groepscode worden gemaakt. Probeer het opnieuw.');
}
export async function updateGroup(id:string,version:number,c:{status?:'actief'|'gesloten';budgetCents?:number;validUntil?:string}){
 const r=await env.DB.prepare(`UPDATE group_codes SET status=COALESCE(?,status), budget_cents=COALESCE(?,budget_cents), valid_until=COALESCE(?,valid_until), version=version+1, updated=? WHERE id=? AND version=? AND COALESCE(?,valid_until)>=valid_from`)
  .bind(c.status??null,c.budgetCents??null,c.validUntil??null,new Date().toISOString(),id,version,c.validUntil??null).run();
 return r.meta.changes===1;
}
/** The orders on one group's bill, for the host's settlement. */
export async function groupOrders(id:string){
 return (await env.DB.prepare(`SELECT id, created, total_cents AS "totalCents", data FROM orders WHERE group_code_id=? ORDER BY id`).bind(id).all()).results as {id:number;created:string;totalCents:number;data:string}[];
}

export {GROUP_ORDER_INSERT_SQL,LINES_FOR_ORDER_SQL} from './order-options-sql';
