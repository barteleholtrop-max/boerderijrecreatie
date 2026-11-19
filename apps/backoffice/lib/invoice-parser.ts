import {makeId} from './id.mjs';
import type {Invoice,PurchaseLine,Unit} from './operations-core';
const n=(s:string)=>Number(s.replace(/\./g,'').replace(',','.'));
const months=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
function dateOf(t:string){const d=t.match(/(?:Factuurdatum|Datum\s*:)\s*(\d{1,2})[- ]([a-z]+|\d{1,2})[- ](\d{4})/i);return d?`${d[3]}-${String(/^\d+$/.test(d[2])?Number(d[2]):months.indexOf(d[2].toLowerCase())+1).padStart(2,'0')}-${d[1].padStart(2,'0')}`:'';}
export function parseInvoice(t:string,filename=''): {invoice:Invoice;warnings:string[]}{
 if(/creditnota|creditfactuur|credit invoice/i.test(t))throw Error('Creditnota’s vereisen handmatige beoordeling; de automatische verwerking is nog niet aangesloten.');
 const supplier=/HANOS/i.test(t)?'HANOS Heerenveen':/SLIGRO/i.test(t)?'Sligro':/Op Kop|Jouster Melange/i.test(t)?'Op Kop Koffiebranders':'';
 const match=t.match(/Factuurnummer\s*:?\s*([A-Z0-9-]+)/i)||t.match(/Factuurnr\.?\s*([A-Z0-9-]+)/i);const number=match?.[1]||'';const warnings:string[]=[];const lines:PurchaseLine[]=[];
 const add=(article:string,description:string,quantity:number,unit:Unit,net:number,kind:'product'|'deposit'|'other'='product')=>lines.push({id:'line-'+(lines.length+1),article,description,quantity,unit,netCents:Math.round(net*100),ingredientId:'',kind,received:false});
 if(supplier==='Op Kop Koffiebranders'){
 const m=t.match(/(?:^|\n)\s*(\d+(?:,\d+)?)\s+(Jouster[^\n]*?)\s+€?\s*(\d+[.,]\d{2})\s+9\s*%/i);
 if(m)add('',m[2].trim(),n(m[1]),'st',n(m[3]));warnings.push('Gewicht per koffie-eenheid ontbreekt: bevestig de verpakking voordat je naar kg omrekent.');
 }else if(supplier==='HANOS Heerenveen'){
 const joined=t.split('\n').reduce<string[]>((a,line)=>{if(/^\s*\d{6,9}\s/.test(line))a.push(line.trim());else if(a.length)a[a.length-1]+=' '+line.trim();return a},[]);
 for(const raw of joined){const m=raw.trim().match(/^(\d{6,9})\s+(?:(KRT|DS|ZAK)\s*)?(\d+(?:[,.]\d+)?)\s+(FL\.?|ST|L|GR)\s+(.+?)\s+(\d+(?:,\d+)?)\s+(\d+,\d{2})\s+(\d+,\d{2})\s+(9%|21%|EM)(?:\s|$)/i);if(!m)continue;
 const count=n(m[6]),content=n(m[3]);let unit:Unit='st',qty=count*content;if(m[4]==='GR'){unit='kg';qty/=1000}else if(m[4]==='L')unit='l';add(m[1],m[5].trim(),qty,unit,n(m[8]),m[9]==='EM'?'deposit':'product');}
 }else if(supplier==='Sligro'){
 const normalized=t.replace(/(\d+,\d+)\s+(MINI DONUTS[^\n]*?\d+,\d{2}\s+\d+,\d{2}\s+9%)\s*\n\s*KG/g,'$1 KG $2');
 for(const raw of normalized.split('\n')){const m=raw.trim().match(/^(\d{4,9})\s+\d+\s+(\d+(?:,\d+)?)\s+(\d+)\s+(KP|FL|BL|PT|ZK|DS|EM|RL|PK|CN|BS|BK|ST|BN|KS)\s+(\d+(?:,\d+)?)\s+(GR|KG|LT|CL|ST)\s+(.+?)\s+(\d+,\d{2})\s+(\d+,\d{2})\s+(9%|21%)/i);if(!m)continue;
 const delivered=n(m[2]),packs=n(m[3]),content=n(m[5]);const unit:Unit=['KG','GR'].includes(m[6])?'kg':['LT','CL'].includes(m[6])?'l':'st';let qty=delivered*packs*content;if(m[6]==='GR')qty/=1000;if(m[6]==='CL')qty/=100;
 // Bottles sold by piece retain their piece unit for direct POS consumption.
 if(m[4]==='FL'&&m[6]==='CL') {qty=delivered*packs;add(m[1],m[7].trim()+' ('+m[5]+' '+m[6]+')',qty,'st',n(m[9]));}
 else add(m[1],m[7].trim(),qty,unit,n(m[9]),[118,119,120,544].includes(Number(raw.trim().split(/\s+/)[1]))?'other':'product');}
 warnings.push('Sligro kan meerdere afleverbonnen bevatten. Bevestig ontvangsten per werkelijke levering. Niet alle emballageregels worden automatisch herkend.');
 }
 if(!lines.length)warnings.push('Geen betrouwbare regels herkend. Voeg regels handmatig toe of plak de tekst met elke factuurregel op één regel.');
 warnings.push('Controleer alle aantallen, eenheden, kortingen en bedragen tegen de factuur. De herkenning is een voorstel en verwerkt geen voorraad.');
 return {invoice:{id:makeId(),supplier,number,date:dateOf(t),source:filename,lines,reviewed:false},warnings};
}
