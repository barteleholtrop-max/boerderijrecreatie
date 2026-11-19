import {type GuestState,blocks} from './guest-core';
export function holidays(year:number){
 // Gregorian computus; Dutch national holidays, no fabricated school holidays.
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
 const easter=new Date(Date.UTC(year,month-1,day,12)),shift=(n:number)=>{const d=new Date(easter);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const king=new Date(Date.UTC(year,3,27)).getUTCDay()===0?'04-26':'04-27';
 return [[year+'-01-01','Nieuwjaarsdag'],[shift(-2),'Goede Vrijdag'],[shift(0),'Eerste paasdag'],[shift(1),'Tweede paasdag'],[year+'-'+king,'Koningsdag'],[year+'-05-05','Bevrijdingsdag'],[shift(39),'Hemelvaartsdag'],[shift(49),'Eerste pinksterdag'],[shift(50),'Tweede pinksterdag'],[year+'-12-25','Eerste kerstdag'],[year+'-12-26','Tweede kerstdag']].map(([date,title])=>({id:'nl:'+date,title,date,holiday:true,from:'',to:'',description:'',example:false}));
}
export function calendarView(s:GuestState,from:string,to:string){if(from>to)return {events:[],bookings:[],pickups:[]};return {events:[...s.events,...Array.from({length:Number(to.slice(0,4))-Number(from.slice(0,4))+1},(_,i)=>holidays(Number(from.slice(0,4))+i)).flat()].filter(e=>e.date>=from&&e.date<=to).sort((a,b)=>a.date.localeCompare(b.date)),bookings:s.reservations.filter(r=>r.date>=from&&r.date<=to).map(r=>({...r,holdsCapacity:blocks(r)})),pickups:s.pickups.filter(p=>p.date>=from&&p.date<=to)};}
