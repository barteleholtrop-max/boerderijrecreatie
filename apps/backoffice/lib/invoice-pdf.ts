// Factuur als PDF (wens eigenaar 11 november 2026: „geen pdf bij de factuur”). Hangt aan de factuurmail van de gezamenlijke rekening.
// Zelfde opmaak als /financien/factuur: rustige kop, gegevensblokken, tabel, totalen en een voet met alle bedrijfsgegevens.
// pdf-lib met de standaardletters (Helvetica): geen lettertypebestanden, werkt op Cloud Run zonder browser.
import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import type {invoiceData,InvoicePayment} from './group-bill-core';
import {INVOICE_LOGO_PNG} from './invoice-logo';

type Invoice=ReturnType<typeof invoiceData>&{payment?:InvoicePayment};
const INK=rgb(.12,.16,.14),DARK=rgb(.12,.23,.16),MUTED=rgb(.45,.5,.47),LINE=rgb(.87,.89,.86),SOFT=rgb(.945,.965,.937),GREEN=rgb(.17,.42,.22),AMBER=rgb(.54,.29,0);
const W=595.28,H=841.89,M=50;
// Standaardletters kennen alleen WinAnsi: emoji en andere tekens vallen weg (ze horen ook niet op een factuur).
const EXTRA='€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export const pdfText=(s:string)=>[...String(s??'')].filter(c=>{const n=c.codePointAt(0)!;return (n>=32&&n<127)||(n>=160&&n<=255)||EXTRA.includes(c)}).join('').replace(/\s+/g,' ').trim();
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100).replace(/ /g,' ');
const longDate=(d:string)=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d.slice(0,10)+'T12:00:00Z'));

function wrap(text:string,font:PDFFont,size:number,width:number){
 const out:string[]=[];let line='';
 for(const w of pdfText(text).split(' ')){const t=line?line+' '+w:w;if(font.widthOfTextAtSize(t,size)<=width||!line)line=t;else{out.push(line);line=w}}
 if(line)out.push(line);return out.length?out:[''];
}

export async function invoicePdf(inv:Invoice):Promise<Uint8Array>{
 const doc=await PDFDocument.create();
 doc.setTitle('Factuur '+inv.number);doc.setAuthor(pdfText(inv.seller.name));doc.setCreator('Boer Bart backoffice');doc.setCreationDate(new Date(inv.date+'T12:00:00Z'));
 const reg=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),serif=await doc.embedFont(StandardFonts.TimesRomanBold);
 const logo=await doc.embedPng(Buffer.from(INVOICE_LOGO_PNG,'base64'));
 let page:PDFPage=doc.addPage([W,H]);let y=H-M;
 const s=inv.seller;
 const text=(t:string,x:number,yy:number,o:{font?:PDFFont;size?:number;color?:ReturnType<typeof rgb>;right?:boolean}={})=>{const f=o.font??reg,z=o.size??9.5,v=pdfText(t);page.drawText(v,{x:o.right?x-f.widthOfTextAtSize(v,z):x,y:yy,size:z,font:f,color:o.color??INK})};
 const hr=(yy:number,thick=.75,color=LINE)=>page.drawLine({start:{x:M,y:yy},end:{x:W-M,y:yy},thickness:thick,color});
 const label=(t:string,x:number,yy:number,right=false)=>text(t.toUpperCase(),x,yy,{font:bold,size:7.5,color:MUTED,right});
 const footer=()=>{
  const fy=M+34,col=(W-2*M)/3;hr(fy+16);
  const cols=[[pdfText(s.name),s.street,[s.postalCode,s.city].filter(Boolean).join('  ')],[s.phone,s.email,s.website||''],[s.kvk&&'KvK '+s.kvk,s.vatNumber&&'Btw '+s.vatNumber,inv.payment?.iban&&'IBAN '+inv.payment.iban]];
  cols.forEach((lines,i)=>lines.filter(Boolean).forEach((l,j)=>text(String(l),M+i*col,fy-j*11,{size:7.5,color:i===0&&j===0?INK:MUTED,font:i===0&&j===0?bold:reg})));
 };
 const need=(h:number)=>{if(y-h<M+70){footer();page=doc.addPage([W,H]);y=H-M}};

 // Kop: logo, naam en adres links; FACTUUR en status rechts.
 page.drawImage(logo,{x:M,y:y-50,width:50,height:50});
 text(s.name,M+62,y-16,{font:serif,size:15,color:DARK});
 text(s.street,M+62,y-31,{size:9,color:MUTED});text([s.postalCode,s.city].filter(Boolean).join('  '),M+62,y-43,{size:9,color:MUTED});
 text('FACTUUR',W-M,y-18,{size:20,color:DARK,right:true});
 const st=inv.paid?'VOLDAAN':'OPENSTAAND',sw=bold.widthOfTextAtSize(st,7.5)+16;
 page.drawRectangle({x:W-M-sw,y:y-43,width:sw,height:14,color:inv.paid?rgb(.9,.945,.89):rgb(.984,.937,.863)});
 text(st,W-M-8,y-39,{font:bold,size:7.5,color:inv.paid?GREEN:AMBER,right:true});
 y-=68;hr(y);y-=26;

 // Factuur aan (links) en factuurgegevens (rechts).
 label('Factuur aan',M,y);
 [[inv.holder.name||'–',bold],[inv.holder.email,reg],[inv.holder.phone,reg]].filter(([v])=>v).forEach(([v,f],i)=>text(String(v),M,y-15-i*13,{font:f as PDFFont,size:9.5}));
 const meta:[string,string][]=[['Factuurnummer',inv.number],['Factuurdatum',longDate(inv.date)],['Rekening',inv.bill],['Kenmerk',inv.code]];
 meta.forEach(([k,v],i)=>{text(k,W-M-150,y-i*14,{color:MUTED,size:9});text(v,W-M,y-i*14,{font:bold,size:9,right:true})});
 y-=Math.max(15+3*13,4*14)+22;

 // Tabel.
 const cQty=W-M-150,cVat=W-M-95,cAmt=W-M,descW=cQty-M-40;
 label('Omschrijving',M,y);label('Aantal',cQty,y,true);label('Btw',cVat,y,true);label('Bedrag',cAmt,y,true);
 y-=7;hr(y,1.2,DARK);y-=16;
 for(const l of inv.products){
  const lines=wrap(l.name,reg,9.5,descW);need(lines.length*12+12);
  lines.forEach((t,i)=>text(t,M,y-i*12));
  text(String(l.quantity),cQty,y,{right:true});text(l.vat+'%',cVat,y,{right:true});text(euro(l.totalCents),cAmt,y,{right:true});
  y-=lines.length*12+2;hr(y+6);y-=10;
 }
 if(inv.orderedBy.length){y-=4;for(const t of wrap('Besteld door: '+inv.orderedBy.join(', '),reg,8.5,descW)){text(t,M,y,{size:8.5,color:MUTED});y-=11}}

 // Totalen rechts.
 need(150);y-=8;const tx=W-M-200;
 const row=(k:string,v:string,o:{font?:PDFFont;size?:number;color?:ReturnType<typeof rgb>}={})=>{text(k,tx,y,{color:o.color??MUTED,size:o.size??9,font:o.font});text(v,W-M,y,{right:true,size:o.size??9,font:o.font??bold,color:o.color??INK});y-=15};
 row('Subtotaal excl. btw',euro(inv.exclCents));
 for(const v of inv.vat)row(`Btw ${v.rate}% over ${euro(v.exclCents)}`,euro(v.vatCents));
 y-=2;page.drawLine({start:{x:tx,y:y+11},end:{x:W-M,y:y+11},thickness:1.2,color:DARK});y-=4;
 row('Totaal incl. btw',euro(inv.totalCents),{font:bold,size:11,color:INK});
 for(const p of inv.payments)row(`Betaald · ${p.method} · ${longDate(p.paidAt)}`,'- '+euro(p.amountCents));
 if(inv.differenceCents)row(`Geef wat goed voelt (${inv.differenceCents<0?'minder':'meer'} betaald)`,(inv.differenceCents<0?'- ':'+ ')+euro(Math.abs(inv.differenceCents)));
 y-=4;page.drawRectangle({x:tx-8,y:y-6,width:W-M-tx+8,height:22,color:inv.paid?SOFT:DARK});
 text(inv.paid?'Voldaan':'Te betalen',tx,y+1,{font:bold,size:10,color:inv.paid?GREEN:rgb(1,1,1)});text(euro(inv.paid?0:inv.openCents),W-M-8,y+1,{font:bold,size:10,color:inv.paid?GREEN:rgb(1,1,1),right:true});
 y-=34;

 // Betalen (alleen bij een open factuur).
 if(!inv.paid&&inv.openCents>0){
  const links=inv.payment?.links||[];need(40+links.length*24);
  label('Betalen',M,y);y-=15;
  for(const l of links){text((l.count>1?`Deel ${l.position} van ${l.count} (${euro(l.amountCents)}): `:'')+'Betaal online met iDEAL',M,y,{font:bold,size:9,color:GREEN});y-=12;text(l.url,M,y,{size:8,color:MUTED});y-=16}
  const iban=inv.payment?.iban;
  for(const t of wrap(`${links.length?'Of maak het bedrag over':'Maak het bedrag over'}${iban?` naar ${iban}${inv.payment?.accountName?' t.n.v. '+inv.payment.accountName:''}`:''}, onder vermelding van ${inv.number}.`,reg,9,W-2*M)){text(t,M,y,{size:9});y-=12}
  y-=10;
 }
 need(30);
 for(const t of wrap('Dank je wel voor je bezoek aan Boer Bart. Alle bedragen zijn inclusief btw, met het tarief van het moment van bestellen.',reg,8.5,W-2*M)){text(t,M,y,{size:8.5,color:MUTED});y-=11}
 footer();
 return doc.save();
}
