import {z} from 'zod';
export type ConnectionField={key:string;label:string;secret?:boolean;kind?:'text'|'textarea'|'mailboxes'|'number'|'choice';hint?:string;options?:[string,string][]};
const f=(key:string,label:string,secret=false,kind:ConnectionField['kind']='text'):ConnectionField=>({key,label,secret,kind});
// Google: one OAuth client for Gmail and Google Agenda. The login itself (refresh token) is made with "Google koppelen" on
// Systeem & koppelingen → Gmail en agenda's and stored encrypted by the backoffice; nobody copies tokens. Calendars are chosen there from a list.
const google=[f('GUEST_GOOGLE_CLIENT_ID','Google OAuth client-ID'),f('GUEST_GOOGLE_CLIENT_SECRET','Google OAuth clientgeheim',true)];
export const CONNECTION_FIELDS:Record<string,ConnectionField[]>={
 gmail:[...google,{...f('GMAIL_MAILBOX','Mailbox voor klantgesprekken'),hint:'Standaard info@example.nl (al het gastcontact)'},{...f('GMAIL_CUSTOMER_LABEL','Gmail-label voor klantgesprekken'),hint:'Standaard TODO Klanten; vul INBOX in om alle mail in de inbox te tonen (info@). Het label-ID wordt uit het account opgehaald'},{...f('GMAIL_INVOICE_MAILBOX','Mailbox voor inkoopfacturen'),hint:'Standaard administratie@example.nl; alleen leesrechten'},{...f('GMAIL_INVOICE_LABEL','Gmail-label voor inkoopfacturen'),hint:'Standaard Inkoop; de mailassistent zet dit label op factuurmails van winkel- en horecaleveranciers'}],'google-agenda':google,
 // Google Bedrijfsprofiel (besluit eigenaar 4 november 2026): koppelen en profiel kiezen gebeurt bij Openingstijden & capaciteit.
 'google-bedrijfsprofiel':[{...f('GOOGLE_PROFILE_ACCOUNT','Google-account van het bedrijfsprofiel'),hint:'Standaard bedrijfsprofiel@example.nl; wordt bij het koppelen alvast ingevuld bij Google'},{...f('PUBLIC_WEBSITE_ORIGIN','Adres van de website'),hint:'Bijvoorbeeld https://www.example.nl; voor de knop „Meer informatie” bij evenementen op Google'}],
 // Guest advice can run on Claude or OpenAI (owner's choice, 3 November 2026); the Weekassistent and recipes stay on Claude.
 'gast-ai':[{...f('GUEST_AI_PROVIDER','AI voor advies bij gesprekken',false,'choice'),options:[['claude','Claude (Anthropic)'],['openai','OpenAI (ChatGPT)']],hint:'Weekassistent en receptvoorstellen gebruiken altijd Claude.'},
  {...f('ANTHROPIC_API_KEY','Claude API-sleutel (Anthropic)',true),hint:'Nodig voor de Weekassistent en receptvoorstellen, en voor het advies als Claude is gekozen.'},
  {...f('ANTHROPIC_WORKSPACE_ID','Claude werkruimte-ID (alleen bij een persoonlijke sleutel)'),hint:'Alleen nodig als de Claude-sleutel met sk-ant-usr- begint: het Werkruimte-ID uit de Claude Console bij de sleutel (begint met wrkspc_). Leeg laten bij een werkruimte-sleutel.'},
  {...f('OPENAI_API_KEY','OpenAI API-sleutel',true),hint:'Alleen als OpenAI is gekozen. Maak de sleutel aan op platform.openai.com (betaald per gebruik; los van een ChatGPT-abonnement).'},
  {...f('OPENAI_MODEL','OpenAI-model'),hint:'Alleen als OpenAI is gekozen: de exacte modelnaam uit platform.openai.com, bijvoorbeeld het model van jullie mailassistent.'},
  {...f('GUEST_WRITING_STYLE','Schrijfinstructies Jan en Sanne',false,'textarea'),hint:'Plak hier de instructies van jullie ChatGPT-mailassistent: toon, aanspreekvorm, vaste zinnen, groet.'},
  {...f('GUEST_AI_MODEL','Claude-model (optioneel)'),hint:'Leeg laten voor het standaardmodel.'}],
 weer:[f('GUEST_WEATHER_LATITUDE','Breedtegraad',false,'number'),f('GUEST_WEATHER_LONGITUDE','Lengtegraad',false,'number')],
 'google-drive':[{...f('GUEST_DRIVE_FOLDER_ID','Google Drive-map (link of map-ID)'),hint:'Plak de link van de map, bijvoorbeeld https://drive.google.com/drive/folders/…'}],
 bunq:[f('GUEST_BUNQ_API_KEY','bunq API-sleutel',true)],
 // Online betalen (besluit eigenaar 3 november 2026). Alleen een testsleutel, tot live bij publiceren wordt toegestaan.
 // Online betalen via Mollie of via een bunq-betaalverzoek (wens eigenaar 10 november 2026, Mollie gaf geen akkoord).
 mollie:[{...f('ONLINE_BETALEN','Online betalen via',false,'choice'),options:[['mollie','Mollie (iDEAL, kaart, Apple Pay)'],['bunq','bunq-betaalverzoek (iDEAL, rechtstreeks op bunq Main)']],hint:'Bij bunq: plak de bunq-sleutel níet hier, maar in het blok „bunq” (Bankverdeling) op deze pagina. Het veld Mollie API-sleutel hieronder mag dan leeg blijven. Kies daarna bij Financiën → Bank & verdeling bunq Main. Geldt voor de bestelpagina, de QR op de kassa en de zelfkassa.'},
  {...f('MOLLIE_API_KEY','Mollie API-sleutel',true),hint:'Alleen voor Mollie; bij bunq-betaalverzoek leeg laten. Begin met de testsleutel (test_…) uit het Mollie-dashboard → Ontwikkelaars → API-sleutels. Een live-sleutel werkt pas als bij publiceren live wordt aangezet.'}],
 snelstart:[f('GUEST_SNELSTART_SUBSCRIPTION_KEY','SnelStart abonnementssleutel',true),f('GUEST_SNELSTART_CLIENT_KEY','SnelStart koppelsleutel',true)],
 'google-formulieren':[f('GUEST_FORMS_FORM_ID','Google Formulier-ID')],
 // Meta (akkoord eigenaar 9 november 2026): één app voor WhatsApp, Messenger en Instagram; zie docs/WHATSAPP-META.md.
 whatsapp:[{...f('META_APP_SECRET','Meta app-geheim',true),hint:'Meta-app → App-instellingen → Basis → App-geheim. Hiermee controleert de backoffice dat een bericht echt van Meta komt.'},
  {...f('META_VERIFY_TOKEN','Verificatiecode voor de webhook',true),hint:'Zelf te kiezen, minstens 20 tekens. Vul dezelfde code in bij de webhook in de Meta-app.'},
  {...f('GUEST_WHATSAPP_PHONE_ID','WhatsApp telefoonnummer-ID'),hint:'WhatsApp → API-instellingen: het ID bij jullie zakelijke WhatsApp-nummer (niet het nummer zelf). Het nummer zelf staat bij Bedrijfsgegevens.'},
  {...f('META_WHATSAPP_WABA_ID','WhatsApp Business-account-ID'),hint:'Nodig voor de sjablonen (berichten na 24 uur).'},
  {...f('GUEST_WHATSAPP_TOKEN','WhatsApp toegangssleutel (systeemgebruiker)',true),hint:'Een vaste sleutel van een systeemgebruiker in Meta Business Suite, met whatsapp_business_messaging en whatsapp_business_management.'},
  {...f('META_PAGE_ID','Facebook-pagina-ID (Messenger)'),hint:'Leeg laten zolang Messenger niet gekoppeld is.'},
  {...f('META_INSTAGRAM_ID','Instagram-account-ID'),hint:'Het zakelijke Instagram-account dat aan de Facebook-pagina hangt.'},
  {...f('META_PAGE_TOKEN','Paginasleutel (Messenger en Instagram)',true),hint:'Een vaste paginasleutel met pages_messaging en instagram_manage_messages.'},
  {...f('META_HISTORY_DAYS','Oude WhatsApp-gesprekken ophalen (dagen)',false,'number'),hint:'Leeg laten: het nummer gaat volledig naar de backoffice en oude gesprekken uit de app komen niet mee. Alleen invullen bij koppelen met de WhatsApp Business-app erbij.'}],
 marketing:[f('GUEST_META_ACCOUNT_ID','Meta advertentieaccount-ID'),f('GUEST_META_TOKEN','Meta toegangstoken',true),f('GUEST_GOOGLE_ADS_CUSTOMER_ID','Google Ads klant-ID'),f('GUEST_GOOGLE_ADS_TOKEN','Google Ads ontwikkelaarstoken',true)],
};
export const googleMailboxSchema=z.object({id:z.string().regex(/^[a-z0-9_-]{1,40}$/),email:z.email(),tokenEnv:z.string().regex(/^[A-Z][A-Z0-9_]+$/),calendarId:z.string().max(300).optional()});
export const googleMailboxesSchema=z.array(googleMailboxSchema).max(10).refine(m=>new Set(m.map(x=>x.id)).size===m.length,'Iedere mailbox heeft een uniek kenmerk nodig.').refine(m=>new Set(m.map(x=>x.tokenEnv)).size===m.length,'Iedere mailbox heeft een eigen tokensleutel nodig.');
export function refreshKey(id:string){return 'GUEST_GOOGLE_REFRESH_'+id.toUpperCase().replace(/-/g,'_');}
export const IMPLEMENTED=new Set(['gmail','whatsapp','google-agenda','gast-ai','weer','mollie','bunq','google-drive','google-bedrijfsprofiel']);
