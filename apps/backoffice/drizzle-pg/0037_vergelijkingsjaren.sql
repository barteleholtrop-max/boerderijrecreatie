-- Voorspelling daggasten: jaren waarin de boerderij dicht was tellen niet mee als vergelijkingsjaar (besluit eigenaar
-- 6 november 2026: in 2026 dicht, dus vergelijken met 2024 en 2025). Alleen een kolom erbij; de tabel heeft al beveiliging per rij.
ALTER TABLE "forecast_settings" ADD COLUMN "closed_years" text DEFAULT '[2026]' NOT NULL;
