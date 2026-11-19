// Plain SQL for group orders (Postgres), without imports so the tests can run it on the real database opbouw.
// Met expliciete soorten (::text, ::bigint): bij INSERT … SELECT leidt Postgres die niet af uit de kolommen.
// Inserting a group order checks the budget in the same statement, inside one transaction: two guests ordering at
// the same moment can never take the bill over the host's maximum. Exported for the tests on the real migrations.
export const GROUP_ORDER_INSERT_SQL=`INSERT INTO orders(request_id, request, data, created, mode, reference, status, payment_status, total_cents, vat9_cents, vat21_cents, test, sales_context, commercial_cents, chosen_cents, difference_cents, chosen_vat9_cents, chosen_vat21_cents, group_code_id)
 SELECT ?1::text, ?2::text, ?3::text, ?4::text, ?5::text, ?6::text, ?7::text, ?8::text, ?9::bigint, ?10::bigint, ?11::bigint, 1, ?12::text, ?9::bigint, NULL, 0, NULL, NULL, g.id FROM group_codes g
 WHERE g.id=?13::text AND g.status='actief' AND ?14::text BETWEEN g.valid_from AND g.valid_until
  AND (SELECT COALESCE(SUM(o.total_cents),0) FROM orders o WHERE o.group_code_id=g.id)+?9::bigint<=g.budget_cents
 ON CONFLICT(request_id) DO NOTHING`;
// Lines are only written when their order exists (a refused group order leaves nothing behind).
export const LINES_FOR_ORDER_SQL=`INSERT INTO order_lines(order_id, position, product_id, name, station, quantity, unit_cents, total_cents, vat, vat_cents, paid_cents, paid_vat_cents, owner_id)
 SELECT o.id, ?2::bigint, ?3::text, ?4::text, ?5::text, ?6::bigint, ?7::bigint, ?8::bigint, ?9::text, ?10::bigint, ?11::bigint, ?12::bigint, ?13::text FROM orders o WHERE o.request_id=?1::text
 ON CONFLICT DO NOTHING`;
