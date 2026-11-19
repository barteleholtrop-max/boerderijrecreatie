import {isSameOrigin} from '@/lib/portable/origin';
import {SheetError} from './sheets';
export function authorizeSheet(request:Request,write=false){
 // Trusted headers are supplied by the Sites authentication boundary.
 if(request.headers.get('x-boer-bart-verified-user')!=='owner')throw new SheetError('Meld je aan als eigenaar om de backoffice te beheren.',403);
 if(write&&!isSameOrigin(request))throw new SheetError('Ongeldige herkomst van het verzoek.',403);
}
