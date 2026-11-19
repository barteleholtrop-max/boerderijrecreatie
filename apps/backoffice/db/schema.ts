// Postgres (Supabase), besluit eigenaar 4 november 2026 (docs/SUPABASE-OVERSTAP.md). Gehele getallen zijn bigint als JavaScript-getal
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
// purpose: 'klantgesprekken' (rianne@, lezen en concepten) of 'factuurmail' (administratie@, alleen lezen). Sinds migratie 0017.
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
// Coöperatieve winkel (migratie 0022): deelnemers, inhouding per datum, eigenaar per product, goedgekeurde weken.
export const coopParticipants=pgTable('coop_participants',{id:text('id').primaryKey(),name:text('name').notNull(),holder:text('holder').notNull().default(''),ibanSealed:text('iban_sealed'),ibanLast4:text('iban_last4').notNull().default(''),email:text('email').notNull().default(''),vatInclusive:bigint('vat_inclusive',{mode:'number'}).notNull().default(0),active:bigint('active',{mode:'number'}).notNull().default(1),version:bigint('version',{mode:'number'}).notNull().default(1),created:text('created').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default(''),
 // Ledenkaart (besluit eigenaar 5 november 2026): soort lid volgens het reglement (A/B/C, '' = nog niet ingevuld), lid sinds, stemrecht
 // ('auto' = volgens het reglement, of 'ja'/'nee' door het bestuur), contact en onderdelen. Gaat later over naar Bloei (bloei_member_id).
 memberClass:text('member_class').notNull().default(''),memberSince:text('member_since').notNull().default(''),voting:text('voting').notNull().default('auto'),
 phone:text('phone').notNull().default(''),address:text('address').notNull().default(''),units:text('units').notNull().default('[]'),bloeiMemberId:text('bloei_member_id').notNull().default(''),
 // Rollen waarvoor het lid is aangenomen, per pot (besluit eigenaar 5 november 2026): {"restaurant":["barista",…]}. Alleen die rollen
 // kan het lid zelf claimen op de ledenpagina; Rianne of Bartele vinkt ze aan op de ledenkaart en kan iedereen overal inplannen.
 potRoles:text('pot_roles').notNull().default('{}'),
 // Lid als bedrijf (wens eigenaar 6 november 2026): het lidmaatschap blijft hetzelfde; facturen (zoals de creditfactuur bij het opnemen
 // van tegoed) gaan naar deze bedrijfsgegevens. JSON (lib/members-core.ts CompanyFields), '' = geen bedrijf.
 company:text('company').notNull().default(''),
 // Vrijwilliger (wens eigenaar 8 november 2026): geen stemrecht en geen deel in een pot, wel rooster, potbeheer en BB-saldo.
 // De vergoeding is per vrijwilliger afgesproken: een bedrag per dienst of per maand, samen hoogstens € 160 per kalendermaand.
 volunteer:bigint('volunteer',{mode:'number'}).notNull().default(0),volunteerCents:bigint('volunteer_cents',{mode:'number'}).notNull().default(0),
 volunteerBasis:text('volunteer_basis').notNull().default('maand'),
 // Student (wens eigenaar 13 november 2026): zelfde regels als een vrijwilliger (geen stemrecht, geen pot, wel rooster en vergoeding),
 // alleen een eigen naam. 'vrijwilliger' of 'student'; telt alleen als volunteer aan staat.
 volunteerKind:text('volunteer_kind').notNull().default('vrijwilliger'),
 // Eigen Google-login voor ondertekenen. Contactwijzigingen geven geen nieuwe tekenbevoegdheid.
 memberLoginEmail:text('member_login_email').notNull().default('')});
export const coopRates=pgTable('coop_rates',{participantId:text('participant_id').notNull().references(()=>coopParticipants.id),validFrom:text('valid_from').notNull(),percentBp:bigint('percent_bp',{mode:'number'}).notNull(),created:text('created').notNull(),createdBy:text('created_by').notNull().default('')},t=>[primaryKey({columns:[t.participantId,t.validFrom]})]);
export const productOwners=pgTable('product_owners',{productId:text('product_id').primaryKey(),participantId:text('participant_id').references(()=>coopParticipants.id),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')});
export const coopWeeks=pgTable('coop_weeks',{week:text('week').primaryKey(),status:text('status').notNull(),snapshot:text('snapshot').notNull(),approvedBy:text('approved_by').notNull(),approvedAt:text('approved_at').notNull(),paidBy:text('paid_by'),paidAt:text('paid_at')});
export const coopSettings=pgTable('coop_settings',{id:text('id').primaryKey(),debtorName:text('debtor_name').notNull().default(''),ibanSealed:text('iban_sealed'),ibanLast4:text('iban_last4').notNull().default(''),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')});
// Tafels voor het opnamescherm (migratie 0023), zelf in te stellen.
export const serviceTables=pgTable('service_tables',{id:text('id').primaryKey(),name:text('name').notNull().unique(),position:bigint('position',{mode:'number'}).notNull(),active:bigint('active',{mode:'number'}).notNull().default(1),updated:text('updated').notNull()});

// Deelnemerspagina (migratie 0024): persoonlijke link per deelnemer (hash voor opzoeken, versleuteld om opnieuw te tonen)
// en verzoeken van deelnemers die goedkeuring vragen (een nieuw IBAN). Zie lib/coop-portal.ts.
export const coopPortalLinks=pgTable('coop_portal_links',{participantId:text('participant_id').primaryKey().references(()=>coopParticipants.id),tokenHash:text('token_hash').notNull(),tokenSealed:text('token_sealed').notNull(),created:text('created').notNull(),createdBy:text('created_by').notNull().default(''),lastUsed:text('last_used'),
 // Proefstand (wens eigenaar 9 november 2026): 1 = het lid ziet zijn eigen omgeving, maar kan nog niets wijzigen of ondertekenen.
 proef:bigint('proef',{mode:'number'}).notNull().default(0)},
 t=>[uniqueIndex('coop_portal_links_hash').on(t.tokenHash)]);
// Agendalink van een lid (wens eigenaar 7 november 2026): alleen-lezen abonnement op de eigen diensten voor Google, Apple of Outlook.
// Bewust een eigen sleutel, los van de persoonlijke ledenlink: wie de agendalink ziet, kan niets claimen of gegevens inzien.
export const memberCalendarLinks=pgTable('member_calendar_links',{participantId:text('participant_id').primaryKey().references(()=>coopParticipants.id),tokenHash:text('token_hash').notNull(),tokenSealed:text('token_sealed').notNull(),created:text('created').notNull(),lastUsed:text('last_used')},
 t=>[uniqueIndex('member_calendar_links_hash').on(t.tokenHash)]);
export const coopRequests=pgTable('coop_requests',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),kind:text('kind').notNull(),holder:text('holder').notNull().default(''),ibanSealed:text('iban_sealed'),ibanLast4:text('iban_last4').notNull().default(''),status:text('status').notNull().default('open'),created:text('created').notNull(),decidedBy:text('decided_by'),decidedAt:text('decided_at'),
 // Nieuw product van een deelnemer (migratie 0026): de melding verwijst naar het product.
 productId:text('product_id')},
 t=>[index('coop_requests_status_idx').on(t.status,t.created)]);
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

// Bloei-proef (issue #93, migratie 0093 in SQLite): afgezonderd, fictief grootboek.
export const bloeiProef=pgTable('bloei_proef',{id:text('id').primaryKey(),revision:bigint('revision',{mode:'number'}).notNull(),data:text('data').notNull()},t=>[check('bloei_proef_fictief',sql`id='fictief-v1'`)]);

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
// Pot-afspraken (besluit eigenaar 5 november 2026): percentage van de omzet exclusief btw, rollen met punten en de fooiregel per pot.
// Een voorstel geldt pas als alle leden van die pot hebben ingestemd (via hun ledenkaart of vastgelegd in een vergadering);
// tot dan blijft de vorige afspraak gelden. Elke versie blijft bewaard. Zie lib/pot-core.ts.
export const potAgreements=pgTable('pot_agreements',{id:text('id').primaryKey(),pot:text('pot').notNull(),validFrom:text('valid_from').notNull(),percentBp:bigint('percent_bp',{mode:'number'}).notNull(),roles:text('roles').notNull().default('[]'),tipRule:text('tip_rule').notNull().default('gelijk'),note:text('note').notNull().default(''),required:text('required').notNull().default('[]'),status:text('status').notNull().default('voorstel'),proposedBy:text('proposed_by').notNull().default(''),proposedAt:text('proposed_at').notNull(),decidedAt:text('decided_at'),version:bigint('version',{mode:'number'}).notNull().default(1)},
 t=>[index('pot_agreements_pot').on(t.pot,t.status,t.validFrom)]);
export const potConsents=pgTable('pot_consents',{agreementId:text('agreement_id').notNull().references(()=>potAgreements.id),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),decision:text('decision').notNull(),via:text('via').notNull(),note:text('note').notNull().default(''),at:text('at').notNull(),by:text('by').notNull().default('')},
 t=>[primaryKey({columns:[t.agreementId,t.participantId]})]);
// Restaurantpot per dag en weekafrekening (besluit eigenaar 5 november 2026). Een dienst is een dag: per lid per dag één rol.
// De punten komen uit de pot-afspraak die die dag gold. Een goedgekeurde week ligt vast (snapshot) en wordt niet meer herberekend.
export const potShifts=pgTable('pot_shifts',{pot:text('pot').notNull(),day:text('day').notNull(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),roleId:text('role_id').notNull(),at:text('at').notNull(),by:text('by').notNull().default(''),
 // Personeelsplanning (besluit eigenaar 5 november 2026): „gepland” = geclaimd, „aanwezig” = aangemeld op de tablet op de boerderij
 // (of vastgelegd door Rianne of Bartele). Alleen aanwezig telt mee in de pot. Een lid kan meer rollen op een dag hebben.
 status:text('status').notNull().default('aanwezig'),
 // Aanbieden voor overname (besluit eigenaar 5 november 2026: „teruggeven kan niet, alleen aanbieden voor overname”): het moment van
 // aanbieden, '' = niet aangeboden. Tot een collega de dienst overneemt, blijft hij van wie hem had.
 offered:text('offered').notNull().default(''),
 // Halve dienst (wens eigenaar 5 november 2026): 1 = de helft van de punten van de rol, bijvoorbeeld bij extra hulp op een drukke dag.
 half:bigint('half',{mode:'number'}).notNull().default(0)},
 t=>[primaryKey({columns:[t.pot,t.day,t.participantId,t.roleId]})]);
// Hoeveel mensen per rol nodig zijn: day '' = standaard, anders voor die ene dag (personeelsplanning, 5 november 2026).
export const potNeeds=pgTable('pot_needs',{pot:text('pot').notNull(),day:text('day').notNull(),roleId:text('role_id').notNull(),count:bigint('count',{mode:'number'}).notNull(),at:text('at').notNull(),by:text('by').notNull().default(''),
 // Omschrijving van de dienst, bijv. „schoonmaak + inrichting” (wens eigenaar 6 november 2026).
 note:text('note').notNull().default('')},
 t=>[primaryKey({columns:[t.pot,t.day,t.roleId]})]);
export const potWeeks=pgTable('pot_weeks',{pot:text('pot').notNull(),week:text('week').notNull(),status:text('status').notNull(),snapshot:text('snapshot').notNull(),approvedBy:text('approved_by').notNull(),approvedAt:text('approved_at').notNull(),paidBy:text('paid_by'),paidAt:text('paid_at')},
 t=>[primaryKey({columns:[t.pot,t.week]})]);
// Betalen met dividend (wens eigenaar 5 november 2026, migratie 0010): een lid koppelt een telefoon via zijn persoonlijke
// ledenlink; daarna betaalt hij op de bestelpagina met het dividend van vorig jaar. Alleen de sha-256 van de koppeling.
export const memberDevices=pgTable('member_devices',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),
 tokenHash:text('token_hash').notNull().unique(),created:text('created').notNull(),lastUsed:text('last_used')},t=>[index('member_devices_participant_idx').on(t.participantId)]);

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

// Pushberichten naar leden (wens eigenaar 5 november 2026): per lid en telefoon een aanmelding via de eigen ledenlink.
// Voor „het is drukker dan verwacht, help je een halve dienst mee?” en later winkelberichten. Verlopen adressen worden opgeruimd.
export const memberPush=pgTable('member_push',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),endpoint:text('endpoint').notNull(),
 p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),created:text('created').notNull(),lastSent:text('last_sent').notNull().default('')},
 t=>[uniqueIndex('member_push_participant_endpoint_unique').on(t.participantId,t.endpoint)]);
// Meldingen voor medewerkers (wens eigenaar 9 november 2026): Rianne en Bartele krijgen in de backoffice-app een melding bij
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
// Berichten aan leden (wens eigenaar 8 november 2026): elk pushbericht wordt ook bewaard, zodat het lid het in de app kan teruglezen
// (scherm Berichten) en een tik op de melding precies dat bericht opent. Ook voor leden zonder telefoonmeldingen.
export const memberMessages=pgTable('member_messages',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),
 title:text('title').notNull(),body:text('body').notNull().default(''),tag:text('tag').notNull().default(''),at:text('at').notNull(),readAt:text('read_at').notNull().default('')},
 t=>[index('member_messages_participant_at').on(t.participantId,t.at)]).enableRLS();
// Hulpvraag aan de leden van een pot (wens eigenaar 5 november 2026): wie, wanneer en naar hoeveel telefoons. Ook de rem tegen te vaak versturen.
export const potHelpCalls=pgTable('pot_help_calls',{id:text('id').primaryKey(),pot:text('pot').notNull(),day:text('day').notNull(),at:text('at').notNull(),by:text('by').notNull().default(''),
 kind:text('kind').notNull(),sent:bigint('sent',{mode:'number'}).notNull().default(0)},t=>[index('pot_help_calls_pot_day_idx').on(t.pot,t.day)]);

// Oogstabonnementen: centrale instellingen, prijsafspraak bij inschrijving en betaalperioden van 14 dagen.
// Uitstraling van de bestelapp (wens eigenaar 9 november 2026): één rij 'main', gekozen bij Website & uitstraling. Zie lib/uitstraling.ts.
export const websiteSettings=pgTable('website_settings',{id:text('id').primaryKey(),uitstraling:text('uitstraling').notNull().default('klassiek'),onderdelen:text('onderdelen').notNull().default('{}'),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},t=>[check('website_settings_main',sql`id='main'`)]).enableRLS();
// Werkplek open of dicht (wens eigenaar 14 november 2026): per werkplek (kok, barista, winkel) wanneer gasten kunnen bestellen,
// en „Nu niet beschikbaar”. Eén rij; data is JSON (lib/station-open-core.ts StationSettings).
export const stationSettings=pgTable('station_settings',{id:text('id').primaryKey(),data:text('data').notNull().default('{}'),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},t=>[check('station_settings_main',sql`id='main'`)]).enableRLS();
export const harvestSettings=pgTable('harvest_settings',{id:text('id').primaryKey(),data:text('data').notNull(),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull()});
export const harvestSubscriptions=pgTable('harvest_subscriptions',{id:text('id').primaryKey(),requestId:text('request_id').notNull().unique(),request:text('request').notNull(),name:text('name').notNull(),email:text('email').notNull(),phone:text('phone').notNull(),selection:text('selection').notNull(),agreement:text('agreement').notNull(),status:text('status').notNull().default('actief'),version:bigint('version',{mode:'number'}).notNull().default(1),created:text('created').notNull(),updated:text('updated').notNull()},t=>[index('harvest_subscriptions_status').on(t.status)]);
export const harvestPeriods=pgTable('harvest_periods',{id:text('id').primaryKey(),subscriptionId:text('subscription_id').notNull().references(()=>harvestSubscriptions.id),start:text('start').notNull(),orderId:bigint('order_id',{mode:'number'}).notNull().references(()=>orders.id),data:text('data').notNull(),created:text('created').notNull()},t=>[uniqueIndex('harvest_periods_once').on(t.subscriptionId,t.start)]);
export const harvestCollections=pgTable('harvest_collections',{periodId:text('period_id').notNull().references(()=>harvestPeriods.id),date:text('date').notNull(),collected:bigint('collected',{mode:'number'}).notNull().default(0)},t=>[primaryKey({columns:[t.periodId,t.date]})]);
// Real Bloei capital administration: encrypted source archive and identities, never mixed with fixtures.
export const bloeiAdministration=pgTable('bloei_administration',{
 id:text('id').primaryKey(),digest:text('digest').notNull().unique(),dataSealed:text('data_sealed').notNull(),sourcesSealed:text('sources_sealed').notNull(),importedAt:text('imported_at').notNull(),importedBy:text('imported_by').notNull(),
},t=>[check('bloei_administration_main',sql`id='main'`)]).enableRLS();
// Uittreksel per Bloei-lid (wens eigenaar 12 november 2026: „Bloei goed inrichten”). Afgeleid van bloei_administration (die blijft de
// enige bron): per lid een versleuteld uittreksel, zodat de ledenpagina niet het hele pakket van ruim 600 kB hoeft te openen. bron =
// md5 van de administratie waaruit het is gemaakt; de rij member_id '*' zegt welke administratie de uittreksels als geheel volgen.
export const bloeiLeden=pgTable('bloei_leden',{memberId:text('member_id').primaryKey(),bron:text('bron').notNull(),dataSealed:text('data_sealed').notNull()}).enableRLS();

// Eén incassoafspraak per oogstabonnement. Zonder vastgelegde toestemming geen automatische incasso.
export const harvestBilling=pgTable('harvest_billing',{subscriptionId:text('subscription_id').primaryKey().references(()=>harvestSubscriptions.id),customerId:text('customer_id'),mandateId:text('mandate_id'),mode:text('mode').notNull().default(''),status:text('status').notNull().default('eerste-betaling'),nextStart:text('next_start'),pendingOrderId:bigint('pending_order_id',{mode:'number'}).references(()=>orders.id),problem:text('problem').notNull().default(''),consentAt:text('consent_at').notNull(),updated:text('updated').notNull()},t=>[index('harvest_billing_due').on(t.status,t.nextStart)]);
// Vastgelegde incasso-intentie vóór de externe aanvraag; nodig voor herstel na time-outs en verificatie van oude machtigingen.
export const harvestDebits=pgTable('harvest_debits',{id:text('id').primaryKey(),subscriptionId:text('subscription_id').notNull().references(()=>harvestSubscriptions.id),orderId:bigint('order_id',{mode:'number'}).notNull().references(()=>orders.id),customerId:text('customer_id').notNull(),mandateId:text('mandate_id'),sequence:text('sequence').notNull(),mode:text('mode').notNull(),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),created:text('created').notNull()},t=>[index('harvest_debits_order').on(t.orderId)]);

// Onderdeelpotten (wens eigenaar 5 november 2026), eerst de kippenpot: een onderdeel van de coöperatie met een eigen budget,
// beheerd door een lid. De opbrengst van gekoppelde producten (excl. btw, min het coöperatiedeel) gaat naar de pot, niet naar
// het lid: het is geen inkomen van de beheerder. De beheerder legt uitgaven voor het onderdeel vast (voer, stro, dierenarts).
// Saldo = opbrengst sinds koppelen − uitgaven ± correcties; de opbrengst wordt steeds opnieuw uit de bestellingen berekend.
export const unitFunds=pgTable('unit_funds',{id:text('id').primaryKey(),name:text('name').notNull(),
 managerId:text('manager_id').references(()=>coopParticipants.id),shareBp:bigint('share_bp',{mode:'number'}).notNull().default(0),
 note:text('note').notNull().default(''),active:bigint('active',{mode:'number'}).notNull().default(1),version:bigint('version',{mode:'number'}).notNull().default(1),
 created:text('created').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')}).enableRLS();
// Een product hoort bij hoogstens één pot; vanaf `since` (dag) telt de verkoop voor de pot.
export const unitFundProducts=pgTable('unit_fund_products',{productId:text('product_id').primaryKey(),fundId:text('fund_id').notNull().references(()=>unitFunds.id),
 since:text('since').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},t=>[index('unit_fund_products_fund').on(t.fundId)]).enableRLS();
// Uitgaven (door de beheerder, gelden meteen; besluit eigenaar) en correcties (door de eigenaar). Bedragen in centen, positief.
export const unitFundEntries=pgTable('unit_fund_entries',{id:text('id').primaryKey(),fundId:text('fund_id').notNull().references(()=>unitFunds.id),
 day:text('day').notNull(),kind:text('kind').notNull(),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),description:text('description').notNull(),
 paidBy:text('paid_by').notNull().default('cooperatie'),at:text('at').notNull(),by:text('by').notNull().default(''),voided:text('voided'),
 // Bon bij een uitgave (wens eigenaar 10 november 2026): foto of pdf in de opslag (sleutel), alleen voor beheerder en eigenaar.
 receiptKey:text('receipt_key'),receiptMime:text('receipt_mime').notNull().default(''),receiptAt:text('receipt_at')},
 t=>[index('unit_fund_entries_fund').on(t.fundId,t.day),check('unit_fund_entries_kind',sql`kind in ('uitgave','correctie-plus','correctie-min')`),check('unit_fund_entries_amount',sql`amount_cents>0`)]).enableRLS();

// Bankverdeling via bunq (wens eigenaar 6 november 2026, docs/BANK-VERDELING.md). Het Mollie-geld op bunq Main gaat na akkoord van
// de eigenaar naar de eigen subrekeningen: BB-tegoed leden, onderdeelpotten, btw-reserve en coöperatie. Standaard de bunq-sandbox.
// Welke bunq-rekening welke rol heeft (JSON: {main:{id,iban,description},tegoed:…}).
export const bankSettings=pgTable('bank_settings',{id:text('id').primaryKey(),accounts:text('accounts').notNull().default('{}'),
 // Inkoop (besluit eigenaar 9 november 2026): per pot het deel van de omzet zonder btw dat elke week naar de rekening Inkoop gaat,
 // in basispunten. Uit het deel van de coöperatie; de pot van de leden blijft gelijk.
 purchase:text('purchase').notNull().default('{"restaurant":3000,"ite":3000}'),
 version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[check('bank_settings_main',sql`id='main'`)]).enableRLS();
// Sessie met bunq (installatie, apparaat en sessietoken), versleuteld. Hoort bij één API-sleutel (vingerafdruk).
export const bunqSession=pgTable('bunq_session',{id:text('id').primaryKey(),fingerprint:text('fingerprint').notNull(),dataSealed:text('data_sealed').notNull(),updated:text('updated').notNull()},
 t=>[check('bunq_session_main',sql`id='main'`)]).enableRLS();
// De verdeelstaat per week (maandag). Na akkoord ligt hij vast; de overboekingen staan per bestemming in bank_split_transfers.
// draft_id: de conceptbetaling bij bunq met alle regels van de week; de eigenaar bevestigt hem in de bunq-app (besluit 6 november 2026).
export const bankSplits=pgTable('bank_splits',{week:text('week').primaryKey(),status:text('status').notNull(),snapshot:text('snapshot').notNull(),
 approvedBy:text('approved_by').notNull(),approvedAt:text('approved_at').notNull(),doneAt:text('done_at'),draftId:bigint('draft_id',{mode:'number'})},
 t=>[check('bank_splits_status',sql`status in ('goedgekeurd','uitgevoerd')`)]).enableRLS();
// Eén regel per week en bestemming: nooit dubbel. 'bezig' = concept wordt klaargezet (bij een verloren antwoord eerst teruggezocht),
// 'in-bunq' = wacht op bevestiging in de bunq-app, 'verstuurd' = afschrijving op Main gevonden (bunq_id).
export const bankSplitTransfers=pgTable('bank_split_transfers',{week:text('week').notNull().references(()=>bankSplits.week),target:text('target').notNull(),
 amountCents:bigint('amount_cents',{mode:'number'}).notNull(),accountId:bigint('account_id',{mode:'number'}).notNull(),iban:text('iban').notNull(),
 status:text('status').notNull().default('nieuw'),bunqId:bigint('bunq_id',{mode:'number'}),error:text('error').notNull().default(''),at:text('at').notNull()},
 t=>[primaryKey({columns:[t.week,t.target]}),check('bank_split_transfers_status',sql`status in ('nieuw','bezig','in-bunq','verstuurd','fout')`),check('bank_split_transfers_amount',sql`amount_cents>0`)]).enableRLS();
// Elke Mollie-bijschrijving op Main wordt hoogstens één keer verdeeld.
export const bankInflows=pgTable('bank_inflows',{bunqId:bigint('bunq_id',{mode:'number'}).primaryKey(),week:text('week').notNull().references(()=>bankSplits.week),
 amountCents:bigint('amount_cents',{mode:'number'}).notNull(),created:text('created').notNull()},t=>[index('bank_inflows_week').on(t.week)]).enableRLS();
// Uitbetaling van BB-tegoed (bank_split, 6 november 2026): het lid vraagt aan, de eigenaar keurt goed, bunq zet een conceptbetaling
// klaar die de eigenaar in de bunq-app bevestigt. Pas als de afschrijving bestaat, komt er een regel 'opname' in bb_entries (het enige
// BB-grootboek). Per lid hoogstens één aanvraag tegelijk open.
export const bbPayouts=pgTable('bb_payouts',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),
 amountCents:bigint('amount_cents',{mode:'number'}).notNull(),ibanSealed:text('iban_sealed').notNull(),ibanLast4:text('iban_last4').notNull(),holder:text('holder').notNull(),
 status:text('status').notNull(),requestedAt:text('requested_at').notNull(),decidedBy:text('decided_by'),decidedAt:text('decided_at'),
 fromAccountId:bigint('from_account_id',{mode:'number'}),bunqDraftId:bigint('bunq_draft_id',{mode:'number'}),note:text('note').notNull().default(''),version:bigint('version',{mode:'number'}).notNull().default(1),
 // Maandagvraag (BB stap 2, 6 november 2026): de maandag waarvoor de aanvraag uit de keuze van het lid is gemaakt. Eén per lid per maandag.
 week:text('week')},
 t=>[index('bb_payouts_participant').on(t.participantId),uniqueIndex('bb_payouts_week').on(t.participantId,t.week).where(sql`week is not null`),uniqueIndex('bb_payouts_one_open').on(t.participantId).where(sql`status in ('aangevraagd','in-bunq','aandacht')`),
  check('bb_payouts_status',sql`status in ('aangevraagd','in-bunq','aandacht','uitbetaald','afgewezen','geweigerd-in-bunq')`),check('bb_payouts_amount',sql`amount_cents>0`)]).enableRLS();
// BB-tegoed (besluiten eigenaar 5 en 6 november 2026, stap 1): het grootboek per lid. A- en B-leden krijgen hun vergoeding
// (voorschot op de winst uit de potten, en de opbrengst van hun producten in de winkel) als BB in plaats van op de bank.
// Saldo = som van de regels. `source` maakt elke bijschrijving eenmalig (bijv. 'pot:restaurant:2026-11-02', 'winkel:2026-11-02').
// Hoort bij Bloei (de kapitaaladministratie); gekoppeld aan het lid op de ledenkaart.
export const bbEntries=pgTable('bb_entries',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),
 day:text('day').notNull(),kind:text('kind').notNull(),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),source:text('source').notNull(),
 note:text('note').notNull().default(''),at:text('at').notNull(),by:text('by').notNull().default(''),
 // Stap 2 (6 november 2026): per btw-tarief het bedrag van geleverde producten (JSON), en op welk document het staat.
 meta:text('meta').notNull().default(''),documentId:text('document_id')},
 t=>[uniqueIndex('bb_entries_source').on(t.participantId,t.source),index('bb_entries_member').on(t.participantId,t.day),
  check('bb_entries_kind',sql`kind in ('pot-week','winkel-week','vrijwilliger','correctie','opname','besteding','ruil','inkomenslening','aflossing','evenement')`)]).enableRLS();

// BB-tegoed stap 2 (besluiten eigenaar 6 november 2026): de maandagvraag en de documenten. De uitbetaling zelf loopt via bb_payouts
// (bunq-conceptbetaling, Financiën → Bank & verdeling); uitbetalen kan alleen via de maandagvraag (besluit eigenaar).
// Keuze per lid: 'alles' overmaken, 'laten' staan, of 'deel': overmaken maar een bedrag (keepCents) of percentage (keepBp) laten staan.
// Zonder nieuwe keuze geldt de vorige. Geen keuze ooit = laten staan.
export const bbChoices=pgTable('bb_choices',{participantId:text('participant_id').primaryKey().references(()=>coopParticipants.id),
 choice:text('choice').notNull(),keepCents:bigint('keep_cents',{mode:'number'}),keepBp:bigint('keep_bp',{mode:'number'}),updated:text('updated').notNull(),by:text('by').notNull().default('')},
 t=>[check('bb_choices_choice',sql`choice in ('alles','laten','deel')`)]).enableRLS();
// Creditfactuur (lid met bedrijf en geleverde producten, in- en verkoop) of uitbetalingsoverzicht. Eén per uitbetaling, doorlopend genummerd.
export const bbDocuments=pgTable('bb_documents',{id:text('id').primaryKey(),number:text('number').notNull().unique(),kind:text('kind').notNull(),
 participantId:text('participant_id').notNull().references(()=>coopParticipants.id),payoutId:text('payout_id').notNull().unique().references(()=>bbPayouts.id),
 week:text('week').notNull(),date:text('date').notNull(),data:text('data').notNull(),
 totalCents:bigint('total_cents',{mode:'number'}).notNull(),mail:text('mail').notNull().default(''),mailError:text('mail_error').notNull().default('')},
 t=>[index('bb_documents_member').on(t.participantId,t.date),check('bb_documents_kind',sql`kind in ('creditfactuur','overzicht')`)]).enableRLS();
// Overleg en afspraken (wens eigenaar 6 november 2026, docs/OVERLEG.md): vergaderingen, voorstellen met instemming van de leden van de
// pot (7 dagen, wie niet reageert staat als „niet gereageerd”, niet akkoord = een beter voorstel), en actiepunten. Rekenregels in lib/overleg-core.ts.
export const overlegMeetings=pgTable('overleg_meetings',{id:text('id').primaryKey(),date:text('date').notNull(),title:text('title').notNull(),pot:text('pot').notNull().default(''),
 attendees:text('attendees').notNull().default('[]'),agenda:text('agenda').notNull().default(''),notes:text('notes').notNull().default(''),
 version:bigint('version',{mode:'number'}).notNull().default(1),created:text('created').notNull(),createdBy:text('created_by').notNull().default(''),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[index('overleg_meetings_date').on(t.date)]).enableRLS();
// Een voorstel. voters: de leden van de pot op het moment van versturen (JSON). parent_id: dit is een beter voorstel bij dat voorstel.
export const overlegProposals=pgTable('overleg_proposals',{id:text('id').primaryKey(),pot:text('pot').notNull().default(''),topic:text('topic').notNull().default('algemeen'),
 title:text('title').notNull(),text:text('text').notNull(),parentId:text('parent_id'),meetingId:text('meeting_id').references(()=>overlegMeetings.id),
 status:text('status').notNull(),voters:text('voters').notNull().default('[]'),notify:text('notify').notNull().default('direct'),
 createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull(),sentAt:text('sent_at'),deadline:text('deadline'),remindedAt:text('reminded_at'),
 wantedFrom:text('wanted_from'),validFrom:text('valid_from'),decidedAt:text('decided_at'),decidedBy:text('decided_by'),version:bigint('version',{mode:'number'}).notNull().default(1)},
 t=>[index('overleg_proposals_status').on(t.status,t.deadline),index('overleg_proposals_parent').on(t.parentId),
  check('overleg_proposals_status_check',sql`status in ('concept','voorstel','aangehouden','vastgesteld','ingetrokken')`),check('overleg_proposals_topic',sql`topic in ('algemeen','verdeling')`),
  check('overleg_proposals_notify',sql`notify in ('direct','weekbericht')`)]).enableRLS();
// Eén reactie per lid per voorstel; een lid mag zijn reactie wijzigen zolang het voorstel openstaat.
export const overlegVotes=pgTable('overleg_votes',{proposalId:text('proposal_id').notNull().references(()=>overlegProposals.id),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),
 vote:text('vote').notNull(),reaction:text('reaction').notNull().default(''),counterId:text('counter_id'),at:text('at').notNull()},
 t=>[primaryKey({columns:[t.proposalId,t.participantId]}),check('overleg_votes_vote',sql`vote in ('akkoord','beter-voorstel')`)]).enableRLS();
// Actiepunten: wie doet wat en wanneer; ook zichtbaar bij Vandaag & taken.
export const overlegActions=pgTable('overleg_actions',{id:text('id').primaryKey(),meetingId:text('meeting_id').references(()=>overlegMeetings.id),text:text('text').notNull(),
 ownerId:text('owner_id').references(()=>coopParticipants.id),ownerName:text('owner_name').notNull().default(''),due:text('due'),done:text('done'),doneBy:text('done_by'),
 created:text('created').notNull(),createdBy:text('created_by').notNull().default('')},t=>[index('overleg_actions_open').on(t.done,t.due)]).enableRLS();


// Openbare Bloeimarkt: uitsluitend aanbod, aanvragen en betaalafhandeling; bezit blijft in de Bloei-kapitaaladministratie.
// Contact- en betaalgegevens staan samen versleuteld; publicatie gebruikt een afzonderlijke beperkte projectie.
export const bloeiMarket=pgTable('bloei_market',{id:text('id').primaryKey(),version:bigint('version',{mode:'number'}).notNull(),dataSealed:text('data_sealed').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull()},t=>[check('bloei_market_main',sql`id='main'`)]).enableRLS();
// Waarde van de coöperatie (besluit eigenaar 9 november 2026): opbouw uit bezit (taxatie en boekwaarde), leningen en goodwill uit
// de vrije kasstroom (reglement artikel 3.1), de bevroren inbreng van de VOF en het voorstel voor de winstbestemming. Eén rij.
export const bloeiWaardering=pgTable('bloei_waardering',{id:text('id').primaryKey(),version:bigint('version',{mode:'number'}).notNull(),data:text('data').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull()},t=>[check('bloei_waardering_main',sql`id='main'`)]).enableRLS();

// Automatische ledenafspraken. De partij is altijd de bestaande coop_participant; geen tweede ledenregister.
export const memberAgreementRules=pgTable('member_agreement_rules',{id:text('id').primaryKey(),version:bigint('version',{mode:'number'}).notNull(),data:text('data').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull()},t=>[check('member_agreement_rules_main',sql`id='main'`)]).enableRLS();
export const memberAgreements=pgTable('member_agreements',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),contractKey:text('contract_key').notNull().default('lidmaatschap'),sequence:bigint('sequence',{mode:'number'}).notNull(),revision:bigint('revision',{mode:'number'}).notNull().default(1),
 data:text('data').notNull(),hash:text('hash').notNull(),sourceHash:text('source_hash').notNull(),status:text('status').notNull().default('concept'),proposals:text('proposals').notNull().default('{}'),acceptedAt:text('accepted_at'),acceptedHash:text('accepted_hash'),validFrom:text('valid_from'),validUntil:text('valid_until'),
 events:text('events').notNull().default('[]'),created:text('created').notNull(),createdBy:text('created_by').notNull()},
 t=>[uniqueIndex('member_agreements_sequence').on(t.participantId,t.contractKey,t.sequence),index('member_agreements_member').on(t.participantId,t.status),check('member_agreements_status',sql`status in ('concept','voorgesteld','geldig','vervangen','ingetrokken')`)]).enableRLS();
// Vastgestelde sjablonen staan los van teksten die nog als voorstel worden besproken.
export const memberAgreementRuleVersions=pgTable('member_agreement_rule_versions',{id:text('id').primaryKey(),version:bigint('version',{mode:'number'}).notNull().unique(),data:text('data').notNull(),hash:text('hash').notNull(),status:text('status').notNull().default('concept'),proposals:text('proposals').notNull().default('{}'),events:text('events').notNull().default('[]'),created:text('created').notNull(),createdBy:text('created_by').notNull()},t=>[check('member_agreement_rule_versions_status',sql`status in ('concept','voorgesteld','geldig','vervangen','ingetrokken')`)]).enableRLS();
// Renteloze inkomenslening: hoofdsom en twaalf maandtermijnen. BB blijft het bestaande grootboek voor de geldbewegingen.
export const bloeiIncomeLoans=pgTable('bloei_income_loans',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),firstMonth:text('first_month').notNull(),plan:text('plan').notNull(),status:text('status').notNull().default('aangevraagd'),
 requestedAt:text('requested_at').notNull(),consentAt:text('consent_at').notNull(),decidedAt:text('decided_at'),decidedBy:text('decided_by'),note:text('note').notNull().default(''),exitPlan:text('exit_plan').notNull().default(''),events:text('events').notNull().default('[]')},
 t=>[index('bloei_income_loans_member').on(t.participantId,t.status),check('bloei_income_loans_amount',sql`amount_cents>0`),check('bloei_income_loans_status',sql`status in ('aangevraagd','goedgekeurd','afgewezen','afgelost')`)]).enableRLS();
export const bloeiLoanRepayments=pgTable('bloei_loan_repayments',{id:text('id').primaryKey(),loanId:text('loan_id').notNull().references(()=>bloeiIncomeLoans.id),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),method:text('method').notNull(),month:text('month').notNull(),bbEntryId:text('bb_entry_id').unique().references(()=>bbEntries.id),externalRef:text('external_ref').unique(),at:text('at').notNull(),by:text('by').notNull()},
 t=>[index('bloei_loan_repayments_loan').on(t.loanId),check('bloei_loan_repayments_amount',sql`amount_cents>0`),check('bloei_loan_repayments_method',sql`method in ('bb','bank')`)]).enableRLS();
// Winkelverantwoordelijkheid van leveranciers. Dit is een rooster, geen extra beloningspot.
export const memberShopShifts=pgTable('member_shop_shifts',{day:text('day').notNull(),part:text('part').notNull(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),offered:text('offered').notNull().default(''),cancelled:text('cancelled').notNull().default(''),events:text('events').notNull().default('[]'),at:text('at').notNull(),by:text('by').notNull()},
 t=>[primaryKey({columns:[t.day,t.part]}),index('member_shop_shifts_member').on(t.participantId,t.day),check('member_shop_shifts_part',sql`part in ('ochtend','middag')`)]).enableRLS();
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
// Rollen per pot (wens eigenaar 6 november 2026, docs/ROLLEN-PER-POT.md): de beheerder beheert de rollen direct; de punten blijven in de
// pot-afspraak (met instemming van de leden). kind: 'dag' (dagdienst) of 'week' (weektaak). Uitgezet = niet meer te plannen.
export const potRoles=pgTable('pot_roles',{pot:text('pot').notNull(),id:text('id').notNull(),name:text('name').notNull(),kind:text('kind').notNull().default('dag'),contractDraft:text('contract_draft').notNull().default(''),
 active:bigint('active',{mode:'number'}).notNull().default(1),position:bigint('position',{mode:'number'}).notNull().default(0),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[primaryKey({columns:[t.pot,t.id]}),check('pot_roles_kind',sql`kind in ('dag','week')`)]).enableRLS();

// Officiële documenten van de coöperatie (wens eigenaar 6 november 2026): akte, reglement, KvK-uittreksel en dergelijke, bij
// Bedrijfsgegevens. Met „Beschikbaar voor leden?” staan ze op elke ledenpagina. Het bestand zelf staat versleuteld in de opslag (blob_key).
export const coopDocuments=pgTable('coop_documents',{id:text('id').primaryKey(),title:text('title').notNull(),category:text('category').notNull(),version:text('version').notNull().default(''),
 forMembers:bigint('for_members',{mode:'number'}).notNull().default(0),forMarket:bigint('for_market',{mode:'number'}).notNull().default(0),fileName:text('file_name').notNull(),size:bigint('size',{mode:'number'}).notNull(),blobKey:text('blob_key').notNull(),
 uploaded:text('uploaded').notNull(),uploadedBy:text('uploaded_by').notNull().default('')},
 t=>[check('coop_documents_category',sql`category in ('akte','reglement','kvk','afm','voorwaarden','overig')`)]).enableRLS();

// Rente-uitbetaling obligaties (wens eigenaar 8 november 2026): alleen de 2%- en 2,6%-obligaties (cash2, cash26) krijgen rente op hun
// bankrekening, één keer per jaar op 15 mei, vanaf de bunq-rekening Rente & vaste kosten. De 6% boodschappenrente wordt alleen besteed.
// Eén regel per Bloei-houder per jaar (unieke index): nooit dubbel. Uitbetalen loopt als conceptbetaling die de eigenaar in de bunq-app
// bevestigt, net als de uitbetaling van BB-tegoed. `detail` is de berekening per obligatieregeling (JSON).
export const rentePayouts=pgTable('rente_payouts',{id:text('id').primaryKey(),year:bigint('year',{mode:'number'}).notNull(),bloeiMemberId:text('bloei_member_id').notNull(),
 participantId:text('participant_id').references(()=>coopParticipants.id),name:text('name').notNull(),amountCents:bigint('amount_cents',{mode:'number'}).notNull(),
 ibanSealed:text('iban_sealed').notNull(),ibanLast4:text('iban_last4').notNull(),holder:text('holder').notNull(),detail:text('detail').notNull().default('[]'),
 status:text('status').notNull(),createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull().default(''),decidedBy:text('decided_by'),decidedAt:text('decided_at'),
 fromAccountId:bigint('from_account_id',{mode:'number'}),bunqDraftId:bigint('bunq_draft_id',{mode:'number'}),note:text('note').notNull().default(''),version:bigint('version',{mode:'number'}).notNull().default(1)},
 t=>[uniqueIndex('rente_payouts_year_member').on(t.year,t.bloeiMemberId),index('rente_payouts_participant').on(t.participantId),
  check('rente_payouts_status',sql`status in ('klaar','in-bunq','aandacht','uitbetaald','afgewezen','geweigerd-in-bunq')`),check('rente_payouts_amount',sql`amount_cents>0`)]).enableRLS();
// Evenementen van leden (besluit eigenaar 8 november 2026): een lid met „Organiseert evenementen” op de ledenkaart vraagt een evenement
// aan (zingevingsavond, rondleiding door de tuinder). De evenementencoördinator (nu Rianne) keurt goed, wijst af of doet een voorstel
// (andere datum, koffiebedrag als de organisator de koffie betaalt, verdeling). Goedgekeurd = in de agenda (guest_events, event_id),
// diensten in het rooster van de restaurantpot met een hulpvraag aan de leden, en een marketingconcept (marketing_tasks).
// request: wat het lid vroeg (JSON, lib/member-events-core.ts EventRequest); terms: wat de coördinator vastlegde (EventTerms);
// change: een wijziging na goedkeuring die op de coördinator wacht; staffing: de diensten die in het rooster zijn gezet.
export const memberEvents=pgTable('member_events',{id:text('id').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),
 status:text('status').notNull().default('aangevraagd'),request:text('request').notNull(),terms:text('terms').notNull().default(''),change:text('change').notNull().default(''),
 eventId:text('event_id').notNull().default(''),staffing:text('staffing').notNull().default('[]'),note:text('note').notNull().default(''),
 decidedBy:text('decided_by').notNull().default(''),decidedAt:text('decided_at').notNull().default(''),version:bigint('version',{mode:'number'}).notNull().default(1),
 created:text('created').notNull(),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},
 t=>[index('member_events_participant').on(t.participantId),index('member_events_status').on(t.status),
  check('member_events_status_check',sql`status in ('aangevraagd','voorstel','goedgekeurd','afgewezen','ingetrokken','geannuleerd')`)]).enableRLS();
// Instellingen voor evenementen van leden: wie de coördinator is (een rol, nu Rianne; zij krijgt de meldingen) en welk deel van de
// kaartverkoop standaard bij de boerderij blijft voor ruimte en voorbereiding (in basispunten; 3000 = 30%, besluit eigenaar 9 november 2026,
// was 20%). Per evenement aan te passen.
export const memberEventSettings=pgTable('member_event_settings',{id:text('id').primaryKey(),coordinatorId:text('coordinator_id').notNull().default(''),
 farmShareBp:bigint('farm_share_bp',{mode:'number'}).notNull().default(3000),version:bigint('version',{mode:'number'}).notNull().default(1),
 updated:text('updated').notNull().default(''),updatedBy:text('updated_by').notNull().default('')},
 t=>[check('member_event_settings_main',sql`id='main'`)]).enableRLS();

// Demolink voor de ledenomgeving (wens eigenaar 9 november 2026): „ik moet hem naar anderen kunnen toesturen om te proberen, maar de
// pagina moet ik wel kunnen vernieuwen zodat ze niet eindeloos lang online blijft”. Eén rij: alleen de sha-256 van de geheime code, met
// een vervaldatum. Een nieuwe link vervangt de oude meteen; intrekken zet hem uit. De demo zelf slaat niets op en gebruikt geen echte gegevens.
export const demoLinks=pgTable('demo_links',{id:text('id').primaryKey(),tokenHash:text('token_hash').notNull(),created:text('created').notNull(),createdBy:text('created_by').notNull().default(''),
 expires:text('expires').notNull(),revoked:text('revoked').notNull().default('')},t=>[check('demo_links_one',sql`id='main'`)]).enableRLS();

// Afrekening met de organisator van een evenement van een lid (besluit eigenaar 9 november 2026). Eén rij per evenement (nooit dubbel):
// kaartverkoop − btw (vat_cents, sinds 9 november 2026) − deel boerderij − koffie = uitkomst. De btw gaat in de bankverdeling van de
// week van de afrekening naar de rekening Btw. Positief: A-, B- en leverancierslid als BB-tegoed (bb_entries, soort 'evenement');
// anders keurt de coördinator goed en zet bunq een conceptbetaling klaar vanaf bunq Main, die zij in de bunq-app bevestigt (zoals de
// rente). Negatief: van het BB-tegoed af (niet onder nul); wat overblijft staat als „te ontvangen” tot de coördinator het afvinkt.
export const memberEventSettlements=pgTable('member_event_settlements',{id:text('id').primaryKey().references(()=>memberEvents.id),
 participantId:text('participant_id').notNull().references(()=>coopParticipants.id),
 revenueCents:bigint('revenue_cents',{mode:'number'}).notNull(),vatCents:bigint('vat_cents',{mode:'number'}).notNull().default(0),farmCents:bigint('farm_cents',{mode:'number'}).notNull(),coffeeCents:bigint('coffee_cents',{mode:'number'}).notNull(),
 payoutCents:bigint('payout_cents',{mode:'number'}).notNull(),bbCents:bigint('bb_cents',{mode:'number'}).notNull().default(0),dueCents:bigint('due_cents',{mode:'number'}).notNull().default(0),
 route:text('route').notNull(),status:text('status').notNull(),
 ibanSealed:text('iban_sealed'),ibanLast4:text('iban_last4').notNull().default(''),holder:text('holder').notNull().default(''),
 fromAccountId:bigint('from_account_id',{mode:'number'}),bunqDraftId:bigint('bunq_draft_id',{mode:'number'}),
 createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull().default(''),decidedAt:text('decided_at'),decidedBy:text('decided_by'),
 version:bigint('version',{mode:'number'}).notNull().default(1)},
 t=>[index('member_event_settlements_participant').on(t.participantId),
  check('member_event_settlements_route',sql`route in ('bb','bunq','bb-af','niets')`),
  check('member_event_settlements_status',sql`status in ('geboekt','klaar','in-bunq','aandacht','uitbetaald','geweigerd-in-bunq','te-ontvangen','ontvangen')`)]).enableRLS();
// Bonvraag (wens eigenaar 9 november 2026): een product dat de zelfkassa via een etiket nieuw aanmaakte, heeft nog geen eigenaar.
// Afrekenen mag gewoon; vóór het uitbetalen (de weekafsluiting van de winkel) vraagt de backoffice per verkochte regel bij wie die
// hoort: een lid (Bartele, Ingeborg, Pieter …) of Boer Bart zelf (participant_id leeg). Het lid komt ook op de bonregel
// (order_lines.owner_id), zodat de weekafrekening het meeneemt. „Volgende keer ook” maakt het lid eigenaar van het product.
export const shopLineAnswers=pgTable('shop_line_answers',{orderLineId:bigint('order_line_id',{mode:'number'}).primaryKey().references(()=>orderLines.id),
 participantId:text('participant_id').references(()=>coopParticipants.id),remember:bigint('remember',{mode:'number'}).notNull().default(0),
 answeredAt:text('answered_at').notNull(),answeredBy:text('answered_by').notNull().default('')}).enableRLS();
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
// Zelf toegevoegde boodschappen (wens eigenaar 9 november 2026): naast wat het weekmenu en de voorraad vragen, kunnen Rianne en
// Bartele (of de Weekassistent op hun verzoek) iets op de lijst van een week zetten, met een vinkje „besteld”.
export const shoppingItems=pgTable('shopping_items',{id:text('id').primaryKey(),week:text('week').notNull(),name:text('name').notNull(),amount:text('amount').notNull().default(''),
 checked:bigint('checked',{mode:'number'}).notNull().default(0),checkedBy:text('checked_by').notNull().default(''),checkedAt:text('checked_at').notNull().default(''),
 createdBy:text('created_by').notNull().default(''),created:text('created').notNull(),removed:bigint('removed',{mode:'number'}).notNull().default(0)},
 t=>[index('shopping_items_week_idx').on(t.week)]).enableRLS();
// Gesprek voor een lid (wens eigenaar 10 november 2026: „Rianne vinkt aan: dit gesprek is voor Pieter; die krijgt het in zijn
// ledenapp en beantwoordt het zelf”). Eén lid per gesprek (mail gmail:<thread> of Meta meta:<kanaal>:<contact>).
export const conversationMembers=pgTable('conversation_members',{ref:text('ref').primaryKey(),participantId:text('participant_id').notNull().references(()=>coopParticipants.id),
 assignedBy:text('assigned_by').notNull().default(''),assignedAt:text('assigned_at').notNull()},t=>[index('conversation_members_participant_idx').on(t.participantId)]).enableRLS();
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
 // Herkomst bij overgehaalde stukken, bijvoorbeeld wix:<oud adres> (oude blogs van boerbart.nl, 13 november 2026). Leeg = hier geschreven.
 // Uniek, zodat een blog nooit twee keer wordt overgehaald; later ook voor doorverwijzen van /post/<oud adres>.
 source:text('source').notNull().default('')},
 t=>[uniqueIndex('content_items_slug_unique').on(t.slug),index('content_items_status_idx').on(t.status,t.publishedAt),
  uniqueIndex('content_items_source_unique').on(t.source).where(sql`source <> ''`)]).enableRLS();
// Privacy voor alle sites (wens eigenaar 15 november 2026): één privacybeleid, beheerd bij Marketing & website → Privacy · alle sites.
// Eén rij 'main'; data is JSON (lib/privacy-core.ts Policy). Alle sites lezen het via /api/public/v1/privacy, met de bedrijfsgegevens erin.
export const privacyPolicy=pgTable('privacy_policy',{id:text('id').primaryKey(),data:text('data').notNull(),version:bigint('version',{mode:'number'}).notNull().default(1),updated:text('updated').notNull(),updatedBy:text('updated_by').notNull().default('')},t=>[check('privacy_policy_main',sql`id='main'`)]).enableRLS();
