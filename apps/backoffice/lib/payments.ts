// Payment rules for the central checkout. Connections (since 3 November 2026: Mollie for online payments,
// lib/online-payments.ts) only call these rules and store the result in the `payments` table; they never set an
// order to paid on their own.
export const paymentMethods=['bank','contant','dividend','online','pin'] as const;
export const paymentStates=['open','betaald','mislukt','terugbetaald'] as const;
export type PaymentMethod=typeof paymentMethods[number];
export type PaymentState=typeof paymentStates[number];
export type Payment={id:string;orderId:number;method:PaymentMethod;amountCents:number;status:PaymentState;provider:string;externalRef:string|null;version:number};
export type PaymentUpdate={status:PaymentState;externalRef:string|null};

// Allowed status changes. Paid, failed and refunded are final, except paid → refunded.
const transitions:Record<PaymentState,PaymentState[]>={open:['betaald','mislukt'],betaald:['terugbetaald'],mislukt:[],terugbetaald:[]};
export function canTransition(from:PaymentState,to:PaymentState){return transitions[from]?.includes(to)??false}

export function validNewPayment(p:{orderId:unknown;method:unknown;amountCents:unknown;requestId:unknown}){
 return Number.isInteger(p.orderId)&&Number(p.orderId)>0&&paymentMethods.includes(p.method as PaymentMethod)&&Number.isSafeInteger(p.amountCents)&&Number(p.amountCents)>0&&Number(p.amountCents)<=100000000&&typeof p.requestId==='string'&&/^[a-f0-9-]{36}$/.test(p.requestId);
}

// Applies a confirmation (for example a bank notification) idempotently:
// - the same confirmation again → 'duplicate', nothing changes;
// - a valid next status → 'changed' with the new payment;
// - anything else is refused. A paid status always needs the provider's own reference.
export function applyPaymentUpdate(p:Payment,u:PaymentUpdate):{result:'duplicate'|'changed';payment:Payment}{
 if(!paymentStates.includes(u.status))throw Error('Onbekende betaalstatus.');
 if(u.externalRef!==null&&(typeof u.externalRef!=='string'||!u.externalRef.trim()||u.externalRef.length>200))throw Error('Ongeldig betaalkenmerk.');
 if(p.externalRef&&u.externalRef&&p.externalRef!==u.externalRef)throw Error('Deze bevestiging hoort bij een andere betaling.');
 if(p.status===u.status)return {result:'duplicate',payment:p};
 if(!canTransition(p.status,u.status))throw Error('Deze statuswijziging is niet toegestaan ('+p.status+' → '+u.status+').');
 const externalRef=p.externalRef??u.externalRef;
 if(u.status==='betaald'&&(p.method==='bank'||p.method==='online')&&!externalRef)throw Error('Een bankbetaling geldt pas als betaald met het kenmerk van de bank.');
 return {result:'changed',payment:{...p,status:u.status,externalRef,version:p.version+1}};
}

// Payment status of an order, derived from its payments. Paid only when confirmed payments cover the total.
export type OrderPaymentStatus='niet-gekoppeld'|'open'|'deels-betaald'|'betaald'|'terugbetaald';
export function orderPaymentStatus(totalCents:number,payments:Pick<Payment,'amountCents'|'status'>[]):OrderPaymentStatus{
 if(!payments.length)return 'niet-gekoppeld';
 const paid=payments.filter(p=>p.status==='betaald').reduce((s,p)=>s+p.amountCents,0);
 if(paid>=totalCents&&totalCents>0)return 'betaald';
 if(paid>0)return 'deels-betaald';
 if(payments.some(p=>p.status==='terugbetaald')&&!payments.some(p=>p.status==='open'))return 'terugbetaald';
 return 'open';
}
