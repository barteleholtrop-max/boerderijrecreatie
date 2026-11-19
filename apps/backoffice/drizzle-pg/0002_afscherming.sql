-- Afscherming voor Supabase: Supabase stelt tabellen in het schema public automatisch open via de Data API (met de
-- openbare sleutel). De backoffice gebruikt die API niet; hij verbindt rechtstreeks met de database en heeft daar alle
-- rechten. Daarom staat beveiliging per rij (Row Level Security) aan op alle tabellen, zonder regels: via de Data API is
-- dan niets te lezen of te wijzigen. Ook nieuwe tabellen krijgen dit in hun eigen migratie.
DO $$
DECLARE t record;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
 END LOOP;
END $$;
