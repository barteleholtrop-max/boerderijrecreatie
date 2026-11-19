// Postgres (Supabase), besluit eigenaar 4 november 2026 (docs/ONLINE-ZETTEN.md). Gehele getallen zijn bigint als JavaScript-getal
// (er staan tijdstempels in milliseconden in); ja/nee blijft 0/1, zoals de code het al gebruikt.
import { pgTable, text, bigint, bigserial, doublePrecision, index, uniqueIndex, primaryKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const products = pgTable('products', {id:text('id').primaryKey(), draft:text('draft').notNull(), published:text('published'), version:bigint('version',{mode:'number'}).notNull().default(1)});
export const media = pgTable('media', {id:text('id').primaryKey(),name:text('name').notNull(),source:text('source').notNull().default(''),sourceId:text('source_id').notNull().unique(),mime:text('mime').notNull(),size:bigint('size',{mode:'number'}).notNull()});
// `data` keeps the full order as recorded (historical prices and VAT); the columns below make it queryable without parsing JSON.
export const orders = pgTable('orders',{id:bigserial('id',{mode:'number'}).primaryKey(),requestId:text('request_id').notNull().unique(),request:text('request').notNull(),data:text('data').notNull(),created:text('created').notNull(),
 mode:text('mode').notNull().default(''),reference:text('reference').notNull().default(''),status:text('status').notNull().default('vastgelegd'),paymentStatus:text('payment_status').notNull().default('niet-gekoppeld'),
 totalCents:bigint('total_cents',{mode:'number'}).notNull().default(0),vat9Cents:bigint('vat9_cents',{mode:'number'}).notNull().default(0),vat21Cents:bigint('vat21_cents',{mode:'number'}).notNull().default(0),test:bigint('test',{mode:'number'}).notNull().default(0),
 // Eigen bedrag en groepscode (migratie 0016): normale waarde, gekozen bedrag, verschil en btw over het betaalde bedrag; null = normale prijs.
 salesContext:text('sales_context').notNull().default(''),commercialCents:bigint('commercial_cents',{mode:'number'}),chosenCents:bigint('chosen_cents',{mode:'number'}),differenceCents:bigint('difference_cents',{mode:'number'}).notNull().default(0),chosenVat9Cents:bigint('chosen_vat9_cents',{mode:'number'}),chosenVat21Cents:bigint('chosen_vat21_cents',{mode:'number'}),groupCodeId:text('group_code_id')},
 t=>[index('orders_created_idx').on(t.created),index('orders_group_code_idx').on(t.groupCodeId)]);
export const orderLines = pgTable('order_lines',{id:bigserial('id',{mode:'number'}).primaryKey(),orderId:bigint('order_id',{mode:'number'}).notNull().references(()=>orders.id),position:bigint('position',{mode:'number'}).notNull(),productId:text('product_id').notNull(),name:text('name').notNull(),station:text('station').notNull(),quantity:bigint('quantity',{mode:'number'}).notNull(),unitCents:bigint('unit_cents',{mode:'number'}).notNull(),totalCents:bigint('total_cents',{mode:'number'}).notNull(),vat:text('vat').notNull(),vatCents:bigint('vat_cents',{mode:'number'}).notNull(),paidCents:bigint('paid_cents',{mode:'number'}),paidVatCents:bigint('paid_vat_cents',{mode:'number'}),
 // Eigenaar (deelnemer van de coöperatieve winkel) op het moment van verkopen (migratie 0022). Leeg = huidige eigenaar / coöperatie.
 ownerId:text('owner_id')},
 t=>[uniqueIndex('order_lines_order_position_unique').on(t.orderId,t.position),index('order_lines_station_order_idx').on(t.station,t.orderId)]);
// Payments are recorded separately from orders: one row per payment attempt. No bank or payment provider is connected yet.
export const payments = pgTable('payments',{id:text('id').primaryKey(),requestId:text('request_id').notNull().unique(),orderId:bigint('order_id',{mode:'number'}).notNull().references(()=>orders.id),method:text('method').notNull(),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),status:text('status').notNull().default('open'),provider:text('provider').notNull().default(''),externalRef:text('external_ref'),version:bigint('version',{mode:'number'}).notNull().default(1),created:text('created').notNull(),updated:text('updated').notNull()},
 t=>[uniqueIndex('payments_provider_external_ref_unique').on(t.provider,t.externalRef),index('payments_order_idx').on(t.orderId)]);
export const workStatus=pgTable('work_status',{id:text('id').primaryKey(),status:text('status').notNull(),version:bigint('version',{mode:'number'}).notNull(),updated:text('updated').notNull()});
export const sheetConfig=pgTable('sheet_config',{id:bigint('id',{mode:'number'}).primaryKey(),secret:text('secret').notNull(),lockToken:text('lock_token'),lockUntil:bigint('lock_until',{mode:'number'}).notNull().default(0),lastSync:text('last_sync'),lastError:text('last_error')});
export const sheetLinks=pgTable('sheet_links',{sourceId:text('source_id').primaryKey(),productId:text('product_id').notNull().unique(),revision:text('revision').notNull(),baseline:text('baseline').notNull()});
export const operationsState=pgTable('operations_state',{id:bigint('id',{mode:'number'}).primaryKey(),data:text('data').notNull(),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull()});
// Inkoop, voorraad en recepten (sinds migratie 0007; daarvoor één JSON-document in operations_state, dat als back-up blijft staan).
export const ingredients=pgTable('ingredients',{id:text('id').primaryKey(),name:text('name').notNull(),unit:text('unit').notNull(),supplier:text('supplier').notNull().default(''),article:text('article').notNull().default(''),stock:doublePrecision('stock').notNull().default(0),known:bigint('known',{mode:'number'}).notNull().default(0),countedAt:text('counted_at').notNull().default(''),pack:doublePrecision('pack').notNull(),min:doublePrecision('min').notNull().default(0),leadDays:doublePrecision('lead_days').notNull().default(0),shelfDays:doublePrecision('shelf_days').notNull().default(0),allergens:text('allergens').notNull().default('[]'),checked:bigint('checked',{mode:'number'}).notNull().default(0),notes:text('notes').notNull().default(''),position:bigint('position',{mode:'number'}).notNull().default(0),origin:text('origin').notNull().default('inkoop'),ownCents:doublePrecision('own_cents'),
 // Soort (wens eigenaar 8 november 2026): 'keuken' (keuken, bar, winkel) of 'magazijn' (toiletpapier, schoonmaakmiddel: nooit voor gasten).
 kind:text('kind').notNull().default('keuken')});
export const invoices=pgTable('invoices',{id:text('id').primaryKey(),supplier:text('supplier').notNull(),number:text('number').notNull(),date:text('date').notNull(),source:text('source').notNull().default(''),reviewed:bigint('reviewed',{mode:'number'}).notNull().default(0),position:bigint('position',{mode:'number'}).notNull().default(0)},
 t=>[index('invoices_date_idx').on(t.date)]);
export const invoiceLines=pgTable('invoice_lines',{invoiceId:text('invoice_id').notNull().references(()=>invoices.id),id:text('id').notNull(),position:bigint('position',{mode:'number'}).notNull(),article:text('article').notNull().default(''),description:text('description').notNull().default(''),quantity:doublePrecision('quantity').notNull(),unit:text('unit').notNull(),netCents:bigint('net_cents',{mode:'number'}).notNull(),ingredientId:text('ingredient_id').notNull().default(''),kind:text('kind').notNull(),received:bigint('received',{mode:'number'}).notNull().default(0),orderId:text('order_id')},
 t=>[primaryKey({columns:[t.invoiceId,t.id]}),index('invoice_lines_ingredient_idx').on(t.ingredientId)]);
export const recipes=pgTable('recipes',{productId:text('product_id').primaryKey(),name:text('name').notNull(),yield:doublePrecision('yield').notNull(),method:text('method').notNull().default(''),lossPct:doublePrecision('loss_pct').notNull().default(0),packagingCents:bigint('packaging_cents',{mode:'number'}).notNull().default(0),version:bigint('version',{mode:'number'}).notNull().default(1),reviewed:bigint('reviewed',{mode:'number'}).notNull().default(0),position:bigint('position',{mode:'number'}).notNull().default(0)});
export const recipeLines=pgTable('recipe_lines',{productId:text('product_id').notNull().references(()=>recipes.productId),ingredientId:text('ingredient_id').notNull(),position:bigint('position',{mode:'number'}).notNull(),quantity:doublePrecision('quantity').notNull()},
 t=>[primaryKey({columns:[t.productId,t.ingredientId]})]);
export const recipeHistory=pgTable('recipe_history',{id:bigserial('id',{mode:'number'}).primaryKey(),productId:text('product_id').notNull(),date:text('date').notNull(),portionCents:bigint('portion_cents',{mode:'number'}),recipe:text('recipe').notNull()},
 t=>[index('recipe_history_product_idx').on(t.productId)]);
export const stockMoves=pgTable('stock_moves',{id:text('id').primaryKey(),seq:bigint('seq',{mode:'number'}).notNull(),ingredientId:text('ingredient_id').notNull(),quantity:doublePrecision('quantity').notNull(),date:text('date').notNull(),reason:text('reason').notNull(),reference:text('reference').notNull().default('')},
 t=>[uniqueIndex('stock_moves_seq_unique').on(t.seq),index('stock_moves_ingredient_idx').on(t.ingredientId),index('stock_moves_reason_idx').on(t.reason)]);
export const incomingOrders=pgTable('incoming_orders',{id:text('id').primaryKey(),ingredientId:text('ingredient_id').notNull(),quantity:doublePrecision('quantity').notNull(),remaining:doublePrecision('remaining').notNull(),due:text('due').notNull(),status:text('status').notNull(),supplier:text('supplier').notNull().default(''),position:bigint('position',{mode:'number'}).notNull().default(0)});
// One row per processed request: request_id prevents double processing; version (unique) prevents two simultaneous changes from both being saved.
export const operationRequests=pgTable('operation_requests',{requestId:text('request_id').primaryKey(),version:bigint('version',{mode:'number'}),action:text('action').notNull().default(''),created:text('created').notNull().default('')},
 t=>[uniqueIndex('operation_requests_version_unique').on(t.version)]);

// Weekassistent (fase 1, 31 oktober 2026). Conversations and voice messages are removed after 14 days by the
// outbox job 'opruimen-gesprekken'; menus, proposals and decisions stay as business records.
export const assistantThreads=pgTable('assistant_threads',{id:text('id').primaryKey(),domain:text('domain').notNull(),week:text('week').notNull(),account:text('account').notNull(),title:text('title').notNull().default(''),status:text('status').notNull().default('open'),created:text('created').notNull(),updated:text('updated').notNull()},
 t=>[index('assistant_threads_week').on(t.domain,t.week)]);
export const assistantMessages=pgTable('assistant_messages',{id:text('id').primaryKey(),threadId:text('thread_id').notNull().references(()=>assistantThreads.id),seq:bigint('seq',{mode:'number'}).notNull(),role:text('role').notNull(),account:text('account').notNull().default(''),source:text('source').notNull().default('tekst'),text:text('text').notNull().default(''),audioKey:text('audio_key'),content:text('content').notNull().default('[]'),sources:text('sources').notNull().default('[]'),created:text('created').notNull()},
 t=>[uniqueIndex('assistant_messages_thread_seq').on(t.threadId,t.seq),index('assistant_messages_created').on(t.created)]);
export const weekMenus=pgTable('week_menus',{id:text('id').primaryKey(),week:text('week').notNull(),status:text('status').notNull().default('concept'),version:bigint('version',{mode:'number'}).notNull().default(1),threadId:text('thread_id'),confirmedBy:text('confirmed_by'),confirmedAt:text('confirmed_at'),created:text('created').notNull(),updated:text('updated').notNull()},
 t=>[index('week_menus_week').on(t.week),uniqueIndex('week_menus_one_confirmed').on(t.week).where(sql`status = 'bevestigd'`)]);
export const weekMenuItems=pgTable('week_menu_items',{menuId:text('menu_id').notNull().references(()=>weekMenus.id),position:bigint('position',{mode:'number'}).notNull(),productId:text('product_id').notNull(),day:text('day').notNull().default(''),portions:doublePrecision('portions'),note:text('note').notNull().default('')},
 t=>[primaryKey({columns:[t.menuId,t.position]})]);
export const proposals=pgTable('proposals',{id:text('id').primaryKey(),requestId:text('request_id').notNull().unique(),kind:text('kind').notNull(),domain:text('domain').notNull(),title:text('title').notNull(),summary:text('summary').notNull().default(''),payload:text('payload').notNull().default('{}'),status:text('status').notNull().default('concept'),version:bigint('version',{mode:'number'}).notNull().default(1),threadId:text('thread_id'),createdBy:text('created_by').notNull(),created:text('created').notNull(),decidedBy:text('decided_by'),decidedAt:text('decided_at'),decisionNote:text('decision_note').notNull().default(''),decisionRequestId:text('decision_request_id').unique()},
 t=>[index('proposals_status').on(t.status,t.created)]);
export const marketingTasks=pgTable('marketing_tasks',{id:text('id').primaryKey(),weekMenuId:text('week_menu_id'),status:text('status').notNull().default('open'),mediaId:text('media_id'),channels:text('channels').notNull().default('[]'),drafts:text('drafts').notNull().default('{}'),created:text('created').notNull(),updated:text('updated').notNull()},
 t=>[index('marketing_tasks_status').on(t.status)]);
export const outboxJobs=pgTable('outbox_jobs',{id:bigserial('id',{mode:'number'}).primaryKey(),key:text('key').notNull().unique(),kind:text('kind').notNull(),payload:text('payload').notNull().default('{}'),status:text('status').notNull().default('wachtend'),attempts:bigint('attempts',{mode:'number'}).notNull().default(0),runAfter:text('run_after').notNull(),lockedUntil:text('locked_until'),lastError:text('last_error').notNull().default(''),created:text('created').notNull(),updated:text('updated').notNull()},
 t=>[index('outbox_jobs_due').on(t.status,t.runAfter)]);
// Openingstijden en Yte-momenten (één rij, id 1): centrale bron voor de website. Zie lib/availability.ts.
export const availabilitySettings=pgTable('availability_settings',{id:bigint('id',{mode:'number'}).primaryKey(),data:text('data').notNull(),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull()});
// Sleutels per koppeling (Systeem & koppelingen), versleuteld opgeslagen. Zie lib/integrations.ts.
export const integrationSettings=pgTable('integration_settings',{id:text('id').primaryKey(),secret:text('secret').notNull(),hint:text('hint').notNull().default(''),note:text('note').notNull().default(''),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')});
// Klantgesprekken (Gmail-koppeling). Gmail blijft de bron voor berichten, concepten en verzendstatus; deze tabellen
// bevatten alleen de koppeling (versleuteld token), een index met metadata (geen mailteksten) en backofficegegevens
// (status afgehandeld, koppelingen, verzendregistratie). Zie lib/mail-*.ts en docs/KLANTGESPREKKEN-GMAIL.md.
export const mailAccounts=pgTable('mail_accounts',{mailbox:text('mailbox').primaryKey(),refreshToken:text('refresh_token'),scopes:text('scopes').notNull().default(''),labelName:text('label_name').notNull(),labelId:text('label_id'),historyId:text('history_id'),status:text('status').notNull().default('niet-verbonden'),lastSyncOk:text('last_sync_ok'),lastSyncAttempt:text('last_sync_attempt'),lastError:text('last_error'),connectedBy:text('connected_by').notNull().default(''),connectedAt:text('connected_at'),lockToken:text('lock_token'),lockUntil:bigint('lock_until',{mode:'number'}).notNull().default(0)});
// purpose: 'klantgesprekken' (sanne@, lezen en concepten) of 'factuurmail' (administratie@, alleen lezen). Sinds migratie 0017.
export const mailOauthStates=pgTable('mail_oauth_states',{state:text('state').primaryKey(),account:text('account').notNull(),expires:bigint('expires',{mode:'number'}).notNull(),purpose:text('purpose').notNull().default('klantgesprekken')});
// Facturen uit de mail (migratie 0017): index van mails met het label „Inkoop” in de factuurmailbox, met de verwerkstatus
// ('nieuw', 'verwerkt', 'overgeslagen'). Geen mailtekst en geen PDF: die blijven in Gmail. Zie lib/invoice-mail.ts.
export const invoiceMails=pgTable('invoice_mails',{mailbox:text('mailbox').notNull(),messageId:text('message_id').notNull(),threadId:text('thread_id').notNull(),fromEmail:text('from_email').notNull().default(''),fromName:text('from_name').notNull().default(''),subject:text('subject').notNull().default(''),received:text('received').notNull(),attachments:text('attachments').notNull().default('[]'),status:text('status').notNull().default('nieuw'),invoiceId:text('invoice_id'),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[primaryKey({columns:[t.mailbox,t.messageId]}),index('invoice_mails_status_idx').on(t.mailbox,t.status,t.received)]);
export const mailThreads=pgTable('mail_threads',{mailbox:text('mailbox').notNull(),threadId:text('thread_id').notNull(),subject:text('subject').notNull().default(''),customerEmail:text('customer_email').notNull().default(''),customerName:text('customer_name').notNull().default(''),lastMessageAt:text('last_message_at').notNull().default(''),lastMessageId:text('last_message_id').notNull().default(''),lastFromUs:bigint('last_from_us',{mode:'number'}).notNull().default(0),lastCustomerAt:text('last_customer_at').notNull().default(''),unread:bigint('unread',{mode:'number'}).notNull().default(0),labeled:bigint('labeled',{mode:'number'}).notNull().default(1),messageCount:bigint('message_count',{mode:'number'}).notNull().default(0),attachmentCount:bigint('attachment_count',{mode:'number'}).notNull().default(0),draftCount:bigint('draft_count',{mode:'number'}).notNull().default(0),automated:bigint('automated',{mode:'number'}).notNull().default(0),snippet:text('snippet').notNull().default(''),synced:text('synced').notNull().default('')},
 t=>[primaryKey({columns:[t.mailbox,t.threadId]}),index('mail_threads_list_idx').on(t.mailbox,t.labeled,t.lastMessageAt)]);
export const mailMessages=pgTable('mail_messages',{mailbox:text('mailbox').notNull(),messageId:text('message_id').notNull(),threadId:text('thread_id').notNull(),internalDate:text('internal_date').notNull(),fromEmail:text('from_email').notNull().default(''),fromUs:bigint('from_us',{mode:'number'}).notNull().default(0),isDraft:bigint('is_draft',{mode:'number'}).notNull().default(0),unread:bigint('unread',{mode:'number'}).notNull().default(0),attachments:bigint('attachments',{mode:'number'}).notNull().default(0),labelIds:text('label_ids').notNull().default('[]')},
 t=>[primaryKey({columns:[t.mailbox,t.messageId]}),index('mail_messages_thread_idx').on(t.mailbox,t.threadId)]);
export const mailDrafts=pgTable('mail_drafts',{mailbox:text('mailbox').notNull(),draftId:text('draft_id').notNull(),threadId:text('thread_id').notNull(),messageId:text('message_id').notNull(),source:text('source').notNull().default('gmail'),createdBy:text('created_by').notNull().default(''),seen:text('seen').notNull().default('')},
 t=>[primaryKey({columns:[t.mailbox,t.draftId]}),index('mail_drafts_thread_idx').on(t.mailbox,t.threadId)]);
export const mailDraftRequests=pgTable('mail_draft_requests',{requestId:text('request_id').primaryKey(),mailbox:text('mailbox').notNull(),threadId:text('thread_id').notNull(),draftId:text('draft_id'),created:text('created').notNull()});
// Backoffice work on a Gmail conversation (status afgehandeld, responsible employee, customer card). Not a copy of the mail.
export const mailThreadState=pgTable('mail_thread_state',{mailbox:text('mailbox').notNull(),threadId:text('thread_id').notNull(),status:text('status').notNull().default('open'),assigned:text('assigned').notNull().default(''),customerId:text('customer_id').notNull().default(''),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[primaryKey({columns:[t.mailbox,t.threadId]})]);
export const mailThreadLinks=pgTable('mail_thread_links',{mailbox:text('mailbox').notNull(),threadId:text('thread_id').notNull(),kind:text('kind').notNull(),ref:text('ref').notNull(),label:text('label').notNull().default(''),created:text('created').notNull(),createdBy:text('created_by').notNull().default('')},
 t=>[primaryKey({columns:[t.mailbox,t.threadId,t.kind,t.ref]})]);
// One row per send request. request_id blocks a repeated request; the partial unique index blocks a second send of the same draft.
export const mailSends=pgTable('mail_sends',{requestId:text('request_id').primaryKey(),mailbox:text('mailbox').notNull(),threadId:text('thread_id').notNull(),draftId:text('draft_id').notNull(),draftMessageId:text('draft_message_id').notNull(),status:text('status').notNull(),sentMessageId:text('sent_message_id'),error:text('error'),created:text('created').notNull(),updated:text('updated').notNull(),by:text('by').notNull().default('')},
 t=>[uniqueIndex('mail_sends_active_draft').on(t.mailbox,t.draftId).where(sql`status IN ('bezig','verzonden','onzeker')`),index('mail_sends_thread_idx').on(t.mailbox,t.threadId)]);
// Google Agenda's die aan de backoffice gekoppeld zijn, elk met één rol: 'klanten' (concept-aanvragen en opties) of
// 'evenementen' (evenementen uit Planning). De backoffice is de bron; Google Agenda is de weergave. Zie lib/mail-calendar.ts.
export const mailCalendars=pgTable('mail_calendars',{mailbox:text('mailbox').notNull(),calendarId:text('calendar_id').notNull(),name:text('name').notNull().default(''),role:text('role').notNull(),lastSyncOk:text('last_sync_ok'),lastError:text('last_error'),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[primaryKey({columns:[t.mailbox,t.calendarId]})]);
// Agenda-items die de backoffice zelf heeft gemaakt (stabiel ID per item), zodat ze bijgewerkt of opgeruimd worden en nooit dubbel ontstaan.
export const mailCalendarEvents=pgTable('mail_calendar_events',{calendarId:text('calendar_id').notNull(),eventId:text('event_id').notNull(),ref:text('ref').notNull(),hash:text('hash').notNull(),updated:text('updated').notNull()},
 t=>[primaryKey({columns:[t.calendarId,t.eventId]})]);
// Aanmeldingen voor evenementen via de website (zie lib/event-signups-core.ts). Het evenement zelf staat in Planning.
export const eventSignups=pgTable('event_signups',{id:text('id').primaryKey(),requestId:text('request_id').notNull().unique(),eventId:text('event_id').notNull(),name:text('name').notNull(),email:text('email').notNull(),phone:text('phone').notNull().default(''),people:bigint('people',{mode:'number'}).notNull(),note:text('note').notNull().default(''),status:text('status').notNull().default('aangemeld'),
 // Betaald evenement: bedrag op het moment van aanmelden (prijs × personen) en betaalstatus ('' gratis, 'open', 'betaald').
 amountCents:bigint('amount_cents',{mode:'number'}).notNull().default(0),paymentStatus:text('payment_status').notNull().default(''),paidAt:text('paid_at'),paidBy:text('paid_by').notNull().default(''),
 // Online betalen (Mollie): de plaats wordt tot hold_until vastgehouden; daarna telt een onbetaalde aanmelding niet meer mee.
 holdUntil:text('hold_until'),
 // Bevestigingsmail via de Gmail-koppeling: '', 'wacht', 'verzonden', 'mislukt' of 'uit' (verzenden staat uit / geen koppeling).
 confirmation:text('confirmation').notNull().default(''),confirmationMessageId:text('confirmation_message_id'),confirmationError:text('confirmation_error'),
 created:text('created').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[index('event_signups_event_idx').on(t.eventId,t.status)]);
// Online betalen van een aanmelding via Mollie: één regel per betaalpoging (zoals `payments` voor bestellingen). Zie lib/signup-payments.ts.
export const signupPayments=pgTable('signup_payments',{id:text('id').primaryKey(),requestId:text('request_id').notNull().unique(),signupId:text('signup_id').notNull().references(()=>eventSignups.id),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),status:text('status').notNull().default('open'),provider:text('provider').notNull(),externalRef:text('external_ref'),version:bigint('version',{mode:'number'}).notNull().default(1),created:text('created').notNull(),updated:text('updated').notNull()},
 t=>[uniqueIndex('signup_payments_provider_external_ref_unique').on(t.provider,t.externalRef),index('signup_payments_signup_idx').on(t.signupId)]);

// Eigen bedrag per verkoopcontext (aan/uit, maximum, nul toegestaan) en groepscodes (migratie 0016).
export const orderPriceSettings=pgTable('order_price_settings',{context:text('context').primaryKey(),enabled:bigint('enabled',{mode:'number'}).notNull().default(0),maxPercent:bigint('max_percent',{mode:'number'}).notNull().default(300),allowZero:bigint('allow_zero',{mode:'number'}).notNull().default(1),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull().default(''),updatedBy:text('updated_by').notNull().default('')});
export const groupCodes=pgTable('group_codes',{id:text('id').primaryKey(),code:text('code').notNull().unique(),name:text('name').notNull(),host:text('host').notNull().default(''),budgetCents:bigint('budget_cents',{mode:'number'}).notNull(),validFrom:text('valid_from').notNull(),validUntil:text('valid_until').notNull(),status:text('status').notNull().default('actief'),version:bigint('version',{mode:'number'}).notNull().default(1),created:text('created').notNull(),createdBy:text('created_by').notNull().default(''),updated:text('updated').notNull(),
 // Gezamenlijke rekening (wens eigenaar 5 november 2026, migratie 0005): een gast opent zelf een rekening (origin 'gast')
 // als rekeninghouder; alleen wie de code heeft, bestelt erop. holderTokenHash: sha-256 van de beheerlink van de houder.
 origin:text('origin').notNull().default('backoffice'),holderName:text('holder_name').notNull().default(''),holderEmail:text('holder_email').notNull().default(''),
 holderPhone:text('holder_phone').notNull().default(''),holderTokenHash:text('holder_token_hash').notNull().default(''),
 invoiceNumber:bigint('invoice_number',{mode:'number'}),paidAt:text('paid_at').notNull().default(''),
 // Factuurmail aan de rekeninghouder (migratie 0006): '' | 'verzonden' | 'uit' | 'mislukt'. Voldaan zodra alles betaald is;
 // open de dag na het bezoek als er nog iets openstaat (met een iDEAL-betaallink).
 mailPaid:text('mail_paid').notNull().default(''),mailOpen:text('mail_open').notNull().default(''),mailError:text('mail_error').notNull().default(''),
 // Eigen rekening (wens eigenaar 11 november 2026): kind 'eigen' = één gast bestelt in het restaurant op zijn eigen rekening en
 // rekent na afloop in één keer af, met een zelfgekozen bedrag. warnCents: zelfgekozen grens voor een waarschuwing (geen blokkade).
 kind:text('kind').notNull().default('groep'),warnCents:bigint('warn_cents',{mode:'number'})},
 t=>[uniqueIndex('group_codes_invoice_number_unique').on(t.invoiceNumber)]);
// Afrekenen van een gezamenlijke rekening (migratie 0005): de rekening wordt in één of meer delen betaald (splitsen).
// Elk deel heeft een eigen onraadbare id (de betaallink), een vast bedrag en wordt betaald met iDEAL (Mollie), contant of pin.
// Bij iDEAL bewaart het deel de laatste betaalpoging (provider + kenmerk tr_…); een nieuwe poging pas als de vorige mislukt is.
export const groupBillShares=pgTable('group_bill_shares',{id:text('id').primaryKey(),groupCodeId:text('group_code_id').notNull().references(()=>groupCodes.id),
 position:bigint('position',{mode:'number'}).notNull(),count:bigint('count',{mode:'number'}).notNull(),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),
 status:text('status').notNull().default('open'),method:text('method').notNull().default(''),provider:text('provider').notNull().default(''),externalRef:text('external_ref'),
 attempts:bigint('attempts',{mode:'number'}).notNull().default(0),paidBy:text('paid_by').notNull().default(''),paidAt:text('paid_at').notNull().default(''),
 // Meebetalen (wens eigenaar 5 november 2026, migratie 0008): een deel per persoon (payer = wie de rekeninghouder aanvinkte),
 // paidCents = wat die persoon echt betaalde („Jou wat goed fielt”: minder of meer dan het gedeelde bedrag).
 payerEmail:text('payer_email').notNull().default(''),payerName:text('payer_name').notNull().default(''),paidCents:bigint('paid_cents',{mode:'number'}),
 version:bigint('version',{mode:'number'}).notNull().default(1),created:text('created').notNull(),updated:text('updated').notNull()},
 t=>[uniqueIndex('group_bill_shares_provider_external_ref_unique').on(t.provider,t.externalRef),index('group_bill_shares_group_idx').on(t.groupCodeId)]);
// Pushmelding "Je bestelling staat klaar" (migratie 0018): één aanmelding per bestelling en telefoon, na 1 dag verwijderd.
export const pushSubscriptions=pgTable('push_subscriptions',{id:text('id').primaryKey(),orderId:bigint('order_id',{mode:'number'}).notNull().references(()=>orders.id),endpoint:text('endpoint').notNull(),p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),created:text('created').notNull(),expires:text('expires').notNull(),sent:text('sent').notNull().default('')},
 t=>[uniqueIndex('push_subscriptions_order_endpoint_unique').on(t.orderId,t.endpoint),index('push_subscriptions_expires_idx').on(t.expires)]);
// Google Drive als beeldbank (migratie 0020): gezien Drive-bestanden en de stand van het ophalen. Alleen lezen uit Drive.
export const driveFiles=pgTable('drive_files',{fileId:text('file_id').primaryKey(),name:text('name').notNull(),status:text('status').notNull(),reason:text('reason').notNull().default(''),mediaId:text('media_id'),updated:text('updated').notNull()});
export const driveSync=pgTable('drive_sync',{id:text('id').primaryKey(),lastAttempt:text('last_attempt'),lastOk:text('last_ok'),lastError:text('last_error'),summary:text('summary').notNull().default('{}'),lockToken:text('lock_token'),lockUntil:bigint('lock_until',{mode:'number'}).notNull().default(0)});
// Tafels voor het opnamescherm (migratie 0023), zelf in te stellen.
export const serviceTables=pgTable('service_tables',{id:text('id').primaryKey(),name:text('name').notNull().unique(),position:bigint('position',{mode:'number'}).notNull(),active:bigint('active',{mode:'number'}).notNull().default(1),updated:text('updated').notNull()});

// Google Bedrijfsprofiel (migratie 0025): koppeling en de evenementberichten op Google. Zie lib/google-profile.ts.
export const gbpLink=pgTable('gbp_link',{id:text('id').primaryKey(),accountEmail:text('account_email').notNull().default(''),refreshSealed:text('refresh_sealed'),account:text('account').notNull().default(''),location:text('location').notNull().default(''),locationTitle:text('location_title').notNull().default(''),syncHours:bigint('sync_hours',{mode:'number'}).notNull().default(1),syncEvents:bigint('sync_events',{mode:'number'}).notNull().default(1),hoursHash:text('hours_hash').notNull().default(''),lastSync:text('last_sync'),lastError:text('last_error'),connectedBy:text('connected_by').notNull().default(''),connectedAt:text('connected_at'),lockUntil:bigint('lock_until',{mode:'number'}).notNull().default(0)});
export const gbpPosts=pgTable('gbp_posts',{eventId:text('event_id').primaryKey(),postName:text('post_name').notNull(),hash:text('hash').notNull(),updated:text('updated').notNull()});

// Tabellen die tot de overstap alleen in de SQLite-migraties stonden en via losse SQL worden gebruikt (gastgegevens en
// beveiligde instellingen). Nu ook hier beschreven, zodat de Postgres-opbouw uit één bron komt.
export const guestWorkspace=pgTable('guest_workspace',{id:bigint('id',{mode:'number'}).primaryKey(),version:bigint('version',{mode:'number'}).notNull(),data:text('data').notNull()},t=>[check('guest_workspace_one',sql`id=1`)]);
export const guestRequests=pgTable('guest_requests',{id:text('id').primaryKey(),created:text('created').notNull()});
export const guestDeliveries=pgTable('guest_deliveries',{id:text('id').primaryKey(),threadId:text('thread_id').notNull(),mailbox:text('mailbox').notNull(),messageId:text('message_id').notNull().unique(),status:text('status').notNull(),externalId:text('external_id'),error:text('error').notNull().default(''),created:text('created').notNull(),
 draftVersion:bigint('draft_version',{mode:'number'}).notNull().default(0),draftId:text('draft_id').notNull().default(''),draftHash:text('draft_hash').notNull().default('')},
 t=>[uniqueIndex('guest_one_pending_delivery').on(t.threadId).where(sql`status IN ('verzenden','onzeker')`),uniqueIndex('guest_one_delivery_per_draft').on(t.threadId,t.draftVersion)]);
export const guestLocks=pgTable('guest_locks',{id:text('id').primaryKey(),token:text('token').notNull(),untilMs:bigint('until_ms',{mode:'number'}).notNull()});
export const connectionSettings=pgTable('connection_settings',{id:bigint('id',{mode:'number'}).primaryKey(),version:bigint('version',{mode:'number'}).notNull(),secret:text('secret').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull()},t=>[check('connection_settings_one',sql`id=1`)]);
export const connectionSettingAudit=pgTable('connection_setting_audit',{id:bigserial('id',{mode:'number'}).primaryKey(),at:text('at').notNull(),account:text('account').notNull(),connectionId:text('connection_id').notNull(),fields:text('fields').notNull()});
export const guestSettings=pgTable('guest_settings',{id:bigint('id',{mode:'number'}).primaryKey(),rev:bigint('rev',{mode:'number'}).notNull(),resRev:bigint('res_rev',{mode:'number'}).notNull(),seq:bigint('seq',{mode:'number'}).notNull().default(0),data:text('data').notNull()},t=>[check('guest_settings_one',sql`id=1`)]);
const guestRows=(name:string,dayIndex:boolean)=>pgTable(name,{id:text('id').primaryKey(),rev:bigint('rev',{mode:'number'}).notNull(),pos:bigint('pos',{mode:'number'}).notNull(),day:text('day'),data:text('data').notNull()},
 t=>dayIndex?[index(name+'_day_idx').on(t.day)]:[]);
export const guestReservations=guestRows('guest_reservations',true);
export const guestCustomers=guestRows('guest_customers',false);
export const guestEvents=guestRows('guest_events',true);
export const guestPickups=guestRows('guest_pickups',true);
export const guestVisits=guestRows('guest_visits',false);
export const guestThreads=guestRows('guest_threads',false);
export const guestKnowledge=guestRows('guest_knowledge',false);
export const guestAdvice=guestRows('guest_advice',false);
// Afspraken met klanten, zoals een kennismakingsgesprek (wens eigenaar 9 november 2026). Geen boeking; zie lib/guest-core.ts.
export const guestAppointments=guestRows('guest_appointments',true);
export const guestDays=pgTable('guest_days',{day:text('day').primaryKey(),rev:bigint('rev',{mode:'number'}).notNull()});
export const guestAudit=pgTable('guest_audit',{seq:bigserial('seq',{mode:'number'}).primaryKey(),at:text('at').notNull(),by:text('by').notNull(),action:text('action').notNull(),reference:text('reference').notNull()});

// Toegangslijst voor inloggen via Supabase met Google (besluit eigenaar 4 november 2026). Supabase controleert wie iemand is;
// alleen e-mailadressen op deze lijst (actief) komen in de backoffice, met hun rol.
// Vastlegging van gevoelige handelingen in de backoffice (besluit eigenaar 6 november 2026): wie, wanneer, wat en waarom.
// Alleen toevoegen, nooit wijzigen of wissen vanuit de app. Zie lib/gevoelig.ts.
export const securityAudit=pgTable('security_audit',{id:text('id').primaryKey(),at:text('at').notNull(),account:text('account').notNull(),email:text('email').notNull().default(''),action:text('action').notNull(),path:text('path').notNull(),detail:text('detail').notNull().default('')},
 t=>[index('security_audit_at').on(t.at)]).enableRLS();
export const accessAccounts=pgTable('access_accounts',{email:text('email').primaryKey(),name:text('name').notNull().default(''),role:text('role').notNull().default('medewerker'),
 active:bigint('active',{mode:'number'}).notNull().default(1),created:text('created').notNull(),createdBy:text('created_by').notNull().default(''),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default(''),lastLogin:text('last_login'),
 // Supabase-gebruiker (id) bij dit adres, vastgelegd bij het inloggen: nodig om bij een kwijtgeraakte telefoon de
 // Authenticator weg te halen (besluit eigenaar 6 november 2026).
 authId:text('auth_id'),
 // Onderdelen die een medewerker mag openen (JSON-lijst, zie lib/onderdelen.ts); een eigenaar mag alles (besluit eigenaar 6 november 2026).
 modules:text('modules').notNull().default('[]'),
 // Binnenkomen zonder Authenticator-code (wens eigenaar 13 november 2026); gevoelige handelingen vragen de code wel (lib/gevoelig.ts).
 quickLogin:bigint('quick_login',{mode:'number'}).notNull().default(0)});
// Bonprinters (wens eigenaar 5 november 2026): beheerd onder Systeem → Printers. Alleen de instellingen per printer;
// afdrukken zelf volgt in een volgende stap (zie lib/printers.ts).
export const printers=pgTable('printers',{id:text('id').primaryKey(),name:text('name').notNull(),station:text('station').notNull(),host:text('host').notNull().default(''),port:bigint('port',{mode:'number'}).notNull().default(9100),model:text('model').notNull().default(''),paper:bigint('paper',{mode:'number'}).notNull().default(80),active:bigint('active',{mode:'number'}).notNull().default(1),note:text('note').notNull().default(''),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default(''),
 // Server Direct Print (akkoord eigenaar 5 november 2026): de printer haalt zelf zijn bonnen op. Alleen de sha-256 van de
 // koppelsleutel; printFrom = vanaf wanneer bestellingen automatisch een bon krijgen (nooit de oude bestellingen).
 secretHash:text('secret_hash').notNull().default(''),printFrom:text('print_from').notNull().default(''),lastSeen:text('last_seen').notNull().default('')},t=>[check('printers_port',sql`${t.port} BETWEEN 1 AND 65535`),check('printers_paper',sql`${t.paper} IN (58,80)`)]);
// Printwachtrij (Server Direct Print). Eén automatische bon per bestelling per printer (soort 'bon'); test en opnieuw afdrukken
// zijn losse opdrachten. status: wachtrij → verstuurd → afgedrukt; mislukt een bon, dan gaat hij terug naar de wachtrij.
export const printJobs=pgTable('print_jobs',{id:bigserial('id',{mode:'number'}).primaryKey(),printerId:text('printer_id').notNull().references(()=>printers.id,{onDelete:'cascade'}),orderId:bigint('order_id',{mode:'number'}).references(()=>orders.id),kind:text('kind').notNull(),status:text('status').notNull().default('wachtrij'),xml:text('xml').notNull(),title:text('title').notNull().default(''),attempts:bigint('attempts',{mode:'number'}).notNull().default(0),created:text('created').notNull(),sentAt:text('sent_at'),doneAt:text('done_at'),lastError:text('last_error').notNull().default(''),createdBy:text('created_by').notNull().default('')},
 t=>[uniqueIndex('print_jobs_one_bon').on(t.printerId,t.orderId).where(sql`kind='bon'`),index('print_jobs_queue_idx').on(t.printerId,t.status,t.id)]);

// Meldingen voor medewerkers (wens eigenaar 9 november 2026): Sanne en Jan krijgen in de backoffice-app een melding bij
// nieuwe gastmail (info@) en nieuwe aanvragen via de website. Per login en telefoon één aanmelding; verlopen adressen worden opgeruimd.
export const staffPush=pgTable('staff_push',{id:text('id').primaryKey(),account:text('account').notNull(),endpoint:text('endpoint').notNull(),
 p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),created:text('created').notNull(),lastSent:text('last_sent').notNull().default('')},
 t=>[uniqueIndex('staff_push_account_endpoint_unique').on(t.account,t.endpoint)]);
// Kennisbank voor gastmail (wens eigenaar 9 november 2026): veelgestelde vragen met het standaardantwoord, huisregels en
// werkwijzen. Goedgekeurde items gaan mee naar de assistent bij elke mail. Voorstellen uit oude Trello- en Wix-exports wachten op
// goedkeuring; de export zelf wordt niet bewaard en de items bevatten geen gegevens van gasten.
export const guestKb=pgTable('guest_kb',{id:text('id').primaryKey(),kind:text('kind').notNull(),title:text('title').notNull(),answer:text('answer').notNull(),
 source:text('source').notNull().default('handmatig'),sourceNote:text('source_note').notNull().default(''),status:text('status').notNull().default('voorstel'),
 version:bigint('version',{mode:'number'}).notNull().default(1),created:text('created').notNull(),createdBy:text('created_by').notNull().default(''),
 updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[index('guest_kb_status_idx').on(t.status)]);
// Oogstabonnementen: centrale instellingen, prijsafspraak bij inschrijving en betaalperioden van 14 dagen.
// Uitstraling van de bestelapp (wens eigenaar 9 november 2026): één rij 'main', gekozen bij Website & uitstraling. Zie lib/uitstraling.ts.
export const websiteSettings=pgTable('website_settings',{id:text('id').primaryKey(),uitstraling:text('uitstraling').notNull().default('klassiek'),onderdelen:text('onderdelen').notNull().default('{}'),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},t=>[check('website_settings_main',sql`id='main'`)]).enableRLS();
// Werkplek open of dicht (wens eigenaar 14 november 2026): per werkplek (kok, barista, winkel) wanneer gasten kunnen bestellen,
// en „Nu niet beschikbaar”. Eén rij; data is JSON (lib/station-open-core.ts StationSettings).
export const stationSettings=pgTable('station_settings',{id:text('id').primaryKey(),data:text('data').notNull().default('{}'),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},t=>[check('station_settings_main',sql`id='main'`)]).enableRLS();
// Sessie met bunq (installatie, apparaat en sessietoken), versleuteld. Hoort bij één API-sleutel (vingerafdruk).
export const bunqSession=pgTable('bunq_session',{id:text('id').primaryKey(),fingerprint:text('fingerprint').notNull(),dataSealed:text('data_sealed').notNull(),updated:text('updated').notNull()},
 t=>[check('bunq_session_main',sql`id='main'`)]).enableRLS();
// Voorspelling daggasten (wens eigenaar 6 november 2026): aanpasbaar en zelflerend op het werkelijke bezoek van een periode.
export const forecastSettings=pgTable('forecast_settings',{id:text('id').primaryKey(),auto:bigint('auto',{mode:'number'}).notNull().default(1),periodDays:bigint('period_days',{mode:'number'}).notNull().default(28),
 manualPct:bigint('manual_pct',{mode:'number'}).notNull().default(0),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default(''),
 // Jaren waarin de boerderij dicht was (JSON-lijst); die tellen niet mee als vergelijkingsjaar (besluit eigenaar 6 november 2026).
 closedYears:text('closed_years').notNull().default('[2026]')},
 t=>[check('forecast_settings_main',sql`id='main'`)]).enableRLS();
// Een eigen getal voor een dag, dat de berekening vervangt.
export const forecastOverrides=pgTable('forecast_overrides',{date:text('date').primaryKey(),visitors:bigint('visitors',{mode:'number'}).notNull(),note:text('note').notNull().default(''),
 at:text('at').notNull(),by:text('by').notNull().default('')}).enableRLS();
// De laatste berekende voorspelling vóór de dag (met het voorspelde weer): daarmee wordt achteraf vergeleken met het werkelijke bezoek.
export const forecastLog=pgTable('forecast_log',{date:text('date').primaryKey(),predicted:bigint('predicted',{mode:'number'}).notNull(),temperature:doublePrecision('temperature').notNull(),
 rain:doublePrecision('rain').notNull(),at:text('at').notNull()}).enableRLS();
// Berichten van Meta in Gesprekken (akkoord eigenaar 9 november 2026): WhatsApp, Facebook Messenger en Instagram Direct, geen
// reacties onder berichten. Meta stuurt elk bericht naar /api/public/meta (webhook); alles blijft bewaard bij de klant (besluit
// eigenaar: „voor altijd opslaan bij een klantenkaart”). Eén gesprek per kanaal en contact; berichten één keer (Meta-id is de sleutel).
export const metaThreads=pgTable('meta_threads',{id:text('id').primaryKey(),channel:text('channel').notNull(),contact:text('contact').notNull(),
 name:text('name').notNull().default(''),phone:text('phone').notNull().default(''),customerId:text('customer_id').notNull().default(''),
 lastMessageId:text('last_message_id').notNull().default(''),lastMessageAt:text('last_message_at').notNull().default(''),lastCustomerAt:text('last_customer_at').notNull().default(''),
 lastFromUs:bigint('last_from_us',{mode:'number'}).notNull().default(0),unread:bigint('unread',{mode:'number'}).notNull().default(0),snippet:text('snippet').notNull().default(''),
 status:text('status').notNull().default('open'),assigned:text('assigned').notNull().default(''),version:bigint('version',{mode:'number'}).notNull().default(1),
 statusBy:text('status_by').notNull().default(''),statusAt:text('status_at').notNull().default(''),created:text('created').notNull()},
 t=>[uniqueIndex('meta_threads_contact_unique').on(t.channel,t.contact),index('meta_threads_list_idx').on(t.lastMessageAt)]).enableRLS();
export const metaMessages=pgTable('meta_messages',{id:text('id').primaryKey(),threadId:text('thread_id').notNull().references(()=>metaThreads.id),
 fromUs:bigint('from_us',{mode:'number'}).notNull().default(0),kind:text('kind').notNull(),text:text('text').notNull().default(''),media:text('media').notNull().default(''),
 at:text('at').notNull(),status:text('status').notNull().default(''),by:text('by').notNull().default(''),source:text('source').notNull().default('')},
 t=>[index('meta_messages_thread_idx').on(t.threadId,t.at)]).enableRLS();
// Elke verzendopdracht één keer (aanvraag-id); per gesprek nooit twee tegelijk of een onzekere verzending dubbel.
export const metaSends=pgTable('meta_sends',{requestId:text('request_id').primaryKey(),threadId:text('thread_id').notNull().references(()=>metaThreads.id),
 kind:text('kind').notNull(),body:text('body').notNull(),status:text('status').notNull(),messageId:text('message_id').notNull().default(''),error:text('error').notNull().default(''),
 by:text('by').notNull().default(''),created:text('created').notNull(),updated:text('updated').notNull()},
 t=>[uniqueIndex('meta_one_pending_send').on(t.threadId).where(sql`status IN ('verzenden','onzeker')`)]).enableRLS();
// Zelf toegevoegde boodschappen (wens eigenaar 9 november 2026): naast wat het weekmenu en de voorraad vragen, kunnen Sanne en
// Jan (of de Weekassistent op hun verzoek) iets op de lijst van een week zetten, met een vinkje „besteld”.
export const shoppingItems=pgTable('shopping_items',{id:text('id').primaryKey(),week:text('week').notNull(),name:text('name').notNull(),amount:text('amount').notNull().default(''),
 checked:bigint('checked',{mode:'number'}).notNull().default(0),checkedBy:text('checked_by').notNull().default(''),checkedAt:text('checked_at').notNull().default(''),
 createdBy:text('created_by').notNull().default(''),created:text('created').notNull(),removed:bigint('removed',{mode:'number'}).notNull().default(0)},
 t=>[index('shopping_items_week_idx').on(t.week)]).enableRLS();
// Werkplektablets (besluit eigenaar 6 november 2026, gebouwd 9 november 2026): een eigenaar koppelt een tablet met een
// QR-code (één keer te gebruiken, 2 minuten geldig). De tablet krijgt een eigen werkplekpas (alleen de sha-256 staat hier)
// en kan daarmee alleen de werkplekschermen openen, nooit de backoffice. Ontkoppelen zet `revoked`. Zie lib/werkplek-pas.ts.
export const workplaceDevices=pgTable('workplace_devices',{id:text('id').primaryKey(),name:text('name').notNull(),tokenHash:text('token_hash').notNull(),
 created:text('created').notNull(),createdBy:text('created_by').notNull().default(''),lastSeen:text('last_seen'),revoked:text('revoked'),revokedBy:text('revoked_by').notNull().default('')},
 t=>[uniqueIndex('workplace_devices_hash').on(t.tokenHash)]).enableRLS();
export const workplacePairings=pgTable('workplace_pairings',{codeHash:text('code_hash').primaryKey(),name:text('name').notNull(),created:text('created').notNull(),
 createdBy:text('created_by').notNull().default(''),expires:text('expires').notNull(),usedAt:text('used_at'),deviceId:text('device_id').references(()=>workplaceDevices.id)}).enableRLS();
// Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026: „Die app moet altijd bij die telefoon
// passen.”). Na één keer gewoon inloggen kiest iemand „Deze telefoon ingelogd houden”; de telefoon krijgt een apparaatbewijs
// (alleen de sha-256 staat hier) en opent daarmee alleen de managerapp. Ontkoppelen (Toegang) zet `revoked`. Zie lib/telefoon-pas.ts.
export const phoneDevices=pgTable('phone_devices',{id:text('id').primaryKey(),email:text('email').notNull(),name:text('name').notNull(),tokenHash:text('token_hash').notNull(),
 created:text('created').notNull(),lastSeen:text('last_seen'),revoked:text('revoked'),revokedBy:text('revoked_by').notNull().default('')},
 t=>[uniqueIndex('phone_devices_hash').on(t.tokenHash),index('phone_devices_email_idx').on(t.email)]).enableRLS();
// Inhoud voor het dorp (wens eigenaar 13 november 2026: „een logische inrichting van verschillende sites die de informatie
// uit de backoffice halen, met plek voor nieuwsbrieven, blogs, filmpjes, evenementen”). Eén keer schrijven, op één of meer
// sites tonen. Soort: blog, nieuws of video. Sites: lijst van site-sleutels (JSON), zie lib/inhoud.ts. Alleen `gepubliceerd`
// met een publicatiedatum die al geweest is, is openbaar (via /api/public/v1/inhoud). Evenementen blijven in Planning.
export const contentItems=pgTable('content_items',{id:text('id').primaryKey(),kind:text('kind').notNull(),slug:text('slug').notNull(),
 title:text('title').notNull(),summary:text('summary').notNull().default(''),body:text('body').notNull().default(''),photo:text('photo').notNull().default(''),
 video:text('video').notNull().default(''),sites:text('sites').notNull().default('[]'),status:text('status').notNull().default('concept'),
 publishedAt:text('published_at').notNull().default(''),version:bigint('version',{mode:'number'}).notNull().default(1),
 createdBy:text('created_by').notNull().default(''),created:text('created').notNull(),updatedBy:text('updated_by').notNull().default(''),updated:text('updated').notNull(),
 // Herkomst bij overgehaalde stukken, bijvoorbeeld wix:<oud adres> (oude blogs van example.nl, 13 november 2026). Leeg = hier geschreven.
 // Uniek, zodat een blog nooit twee keer wordt overgehaald; later ook voor doorverwijzen van /post/<oud adres>.
 source:text('source').notNull().default('')},
 t=>[uniqueIndex('content_items_slug_unique').on(t.slug),index('content_items_status_idx').on(t.status,t.publishedAt),
  uniqueIndex('content_items_source_unique').on(t.source).where(sql`source <> ''`)]).enableRLS();
// Privacy voor alle sites (wens eigenaar 15 november 2026): één privacybeleid, beheerd bij Marketing & website → Privacy · alle sites.
// Eén rij 'main'; data is JSON (lib/privacy-core.ts Policy). Alle sites lezen het via /api/public/v1/privacy, met de bedrijfsgegevens erin.
export const privacyPolicy=pgTable('privacy_policy',{id:text('id').primaryKey(),data:text('data').notNull(),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},t=>[check('privacy_policy_main',sql`id='main'`)]).enableRLS();
