CREATE SCHEMA IF NOT EXISTS doctor_demo;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'sql_%'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS doctor_demo.%I CASCADE', t.tablename);
    EXECUTE format('CREATE TABLE doctor_demo.%I (LIKE public.%I INCLUDING ALL)', t.tablename, t.tablename);
  END LOOP;

  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'sql_%'
  LOOP
    EXECUTE format('INSERT INTO doctor_demo.%I SELECT * FROM public.%I', t.tablename, t.tablename);
  END LOOP;
END $$;
