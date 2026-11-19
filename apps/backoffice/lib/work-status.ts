export const stations=['kok','barista','winkel'] as const;
export const workStates=['nieuw','behandeling','gereed'] as const;
export type WorkState=typeof workStates[number];
export function canMove(from:string,to:string){return (from==='nieuw'&&to==='behandeling')||(from==='behandeling'&&to==='gereed')||(from==='gereed'&&to==='behandeling')}
