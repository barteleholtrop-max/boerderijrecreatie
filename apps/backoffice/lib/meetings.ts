// Overleggen met gasten (wens eigenaar 9 november 2026: „nieuw overleg toevoegen. Dus als gasten bij ons komen dat we
// notities kunnen bijhouden, dingen als concept in de agenda kunnen zetten enz."). Een overleg hoort bij een klantenkaart,
// bewaart notities en actiepunten en kan een optie in Planning en een offerte krijgen. Opgeslagen bij de gastgegevens
// (zoals de offertes), zonder eigen tabel. De optie zelf is een gewone reservering met status 'optie'.
import {z} from 'zod';
import {dateSchema,timeSchema} from './guest-core';

const optionalDate=z.union([z.literal(''),dateSchema]);
export const meetingActionSchema=z.object({id:z.string().min(1).max(100),text:z.string().trim().min(1,'Vul het actiepunt in.').max(300),who:z.string().trim().max(100),due:optionalDate,done:z.boolean()});
export const meetingSchema=z.object({id:z.uuid(),date:dateSchema,from:z.union([z.literal(''),timeSchema]),subject:z.string().trim().min(1,'Vul het onderwerp van het overleg in.').max(200),
 customerId:z.string().max(400),customerName:z.string().trim().max(300),attendees:z.string().trim().max(500),notes:z.string().max(10000),
 actions:z.array(meetingActionSchema).max(50,'Maximaal 50 actiepunten per overleg.'),rev:z.number().int().min(0).optional()})
 .refine(v=>v.customerId!==''||v.customerName!=='','Kies een klant of vul de naam van de gast in.');
export type MeetingAction=z.infer<typeof meetingActionSchema>;
export type Meeting=Omit<z.infer<typeof meetingSchema>,'rev'>&{rev:number;reservationId:string;quoteId:string;created:string;createdBy:string;updated:string;updatedBy:string};

/** Nieuw of gewijzigd overleg; de koppelingen (optie, offerte) blijven staan en worden alleen via hun eigen stap gezet. */
export function saveMeeting(list:Meeting[],raw:unknown,by:string,now=new Date()):{list:Meeting[];meeting:Meeting}{
 const m=meetingSchema.parse(raw),at=now.toISOString(),old=list.find(x=>x.id===m.id);
 if(old&&typeof m.rev==='number'&&m.rev!==old.rev)throw Error('Dit overleg is intussen door iemand anders gewijzigd. Ververs en controleer de gegevens.');
 const {rev:_rev,...data}=m;
 const meeting:Meeting=old?{...old,...data,rev:old.rev+1,updated:at,updatedBy:by}
  :{...data,rev:1,reservationId:'',quoteId:'',created:at,createdBy:by,updated:at,updatedBy:by};
 return {list:[...list.filter(x=>x.id!==m.id),meeting],meeting};
}
export function linkMeeting(list:Meeting[],id:string,link:{reservationId?:string;quoteId?:string},by:string,now=new Date()):Meeting[]{
 const old=list.find(x=>x.id===id);if(!old)throw Error('Overleg niet gevonden.');
 return list.map(x=>x===old?{...old,...link,rev:old.rev+1,updated:now.toISOString(),updatedBy:by}:x);
}
export const openActions=(m:Pick<Meeting,'actions'>)=>m.actions.filter(a=>!a.done);
export function meetingsForCard(list:Meeting[],card:{id:string;reservationIds:string[]}){
 return list.filter(m=>m.customerId===card.id||(!!m.reservationId&&card.reservationIds.includes(m.reservationId))).sort(byDate);
}
export const byDate=(a:Meeting,b:Meeting)=>b.date.localeCompare(a.date)||b.from.localeCompare(a.from)||b.created.localeCompare(a.created);
/** Vervaldatum van een optie uit een overleg: standaard over 14 dagen, maar uiterlijk de dag zelf. */
export function optionExpiry(date:string,now=new Date(),days=14){
 const limit=new Date(now.getTime()+days*864e5),day=new Date(date+'T08:00:00Z');
 const pick=day<limit?day:limit;
 return (pick>now?pick:new Date(date+'T21:00:00Z')).toISOString();
}
