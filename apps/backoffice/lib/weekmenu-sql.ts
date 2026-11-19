// SQL for weekmenus, kept here so tests run exactly these statements against the real migrations.

/** A new concept replaces the open concept (and its proposal) of the same week. Confirmed menus are untouched. */
export const SUPERSEDE_PROPOSALS_SQL=`UPDATE proposals SET status='vervallen', version=version+1 WHERE kind='weekmenu' AND status='concept' AND (payload::jsonb->>'week')=?1`;
export const SUPERSEDE_MENUS_SQL=`UPDATE week_menus SET status='vervallen', updated=?2 WHERE week=?1 AND status='concept'`;
export const INSERT_MENU_SQL=`INSERT INTO week_menus(id, week, status, version, thread_id, created, updated) VALUES(?1, ?2, 'concept', 1, ?3, ?4, ?4)`;
export const INSERT_ITEM_SQL=`INSERT INTO week_menu_items(menu_id, position, product_id, day, portions, note) VALUES(?1, ?2, ?3, ?4, ?5, ?6)`;
export const INSERT_PROPOSAL_SQL=`INSERT INTO proposals(id, request_id, kind, domain, title, summary, payload, status, version, thread_id, created_by, created) VALUES(?1, ?2, 'weekmenu', 'keuken', ?3, ?4, ?5, 'concept', 1, ?6, 'assistent', ?7)`;

/** Approval: the confirmed menu of that week (if any) lapses, the concept becomes confirmed. */
export const LAPSE_CONFIRMED_SQL=`UPDATE week_menus SET status='vervallen', updated=?3 WHERE week=?1 AND status='bevestigd' AND id<>?2`;
export const CONFIRM_MENU_SQL=`UPDATE week_menus SET status='bevestigd', confirmed_by=?2, confirmed_at=?3, version=version+1, updated=?3 WHERE id=?1 AND status='concept'`;

export const MENU_ITEMS_SQL=`SELECT i.product_id AS "productId", i.day, i.portions, i.note, p.draft FROM week_menu_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.menu_id=?1 ORDER BY i.position`;
export const LATEST_MENU_SQL=`SELECT id, week, status, version FROM week_menus WHERE week=?1 AND status=?2 ORDER BY updated DESC LIMIT 1`;
