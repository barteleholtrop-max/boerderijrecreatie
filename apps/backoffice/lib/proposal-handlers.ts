// What happens after approval, per kind of proposal. Approving is only possible for a kind listed here.
// The returned statements run in the same transaction as the decision. Bestelling (fase 4) and marketing
// (fase 5) are added in their own phase.
import {env} from '@/lib/portable/env';
import type {ProposalKind} from './assistant-core';
import {GUARD_SQL} from './assistant-core';
import {LAPSE_CONFIRMED_SQL,CONFIRM_MENU_SQL} from './weekmenu-sql';
export type ApprovalHandler=(payload:unknown,by:string,now:string)=>Promise<unknown[]>; // returns extra database statements

const weekmenu:ApprovalHandler=async(payload,by,now)=>{
 const p=payload as {menuId?:unknown;week?:unknown};
 if(typeof p?.menuId!=='string'||typeof p.week!=='string')throw Error('Ongeldig weekmenuvoorstel.');
 return [
  env.DB.prepare(LAPSE_CONFIRMED_SQL).bind(p.week,p.menuId,now),
  env.DB.prepare(CONFIRM_MENU_SQL).bind(p.menuId,by,now),
  env.DB.prepare(GUARD_SQL), // the concept must still exist; otherwise nothing is saved
 ];
};
export const approvalHandlers:Partial<Record<ProposalKind,ApprovalHandler>>={weekmenu};
export const canApprove=(kind:string)=>Object.prototype.hasOwnProperty.call(approvalHandlers,kind);
