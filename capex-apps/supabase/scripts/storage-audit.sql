-- CAPEX Supabase Storage Audit
-- Jalankan di: Supabase Dashboard → SQL Editor (atau psql / MCP execute_sql)
-- Snapshot: Agustus 2026 — project CAPEX production/dev

-- =============================================================================
-- 1. TOTAL DATABASE SIZE
-- =============================================================================
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS total_db_size,
  pg_database_size(current_database())                   AS total_db_bytes;

-- =============================================================================
-- 2. SIZE PER SCHEMA
-- =============================================================================
SELECT
  schemaname,
  COUNT(*)                                                          AS table_count,
  pg_size_pretty(SUM(pg_total_relation_size(format('%I.%I', schemaname, tablename)))) AS schema_total,
  SUM(pg_total_relation_size(format('%I.%I', schemaname, tablename)))                 AS schema_bytes
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname
ORDER BY schema_bytes DESC;

-- =============================================================================
-- 3. TOP TABLES BY SIZE (all schemas)
-- =============================================================================
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, tablename))) AS total_size,
  pg_total_relation_size(format('%I.%I', schemaname, tablename))                 AS total_bytes,
  pg_size_pretty(pg_relation_size(format('%I.%I', schemaname, tablename)))       AS heap_size,
  pg_size_pretty(
    pg_total_relation_size(format('%I.%I', schemaname, tablename))
    - pg_relation_size(format('%I.%I', schemaname, tablename))
  ) AS index_size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY total_bytes DESC
LIMIT 50;

-- =============================================================================
-- 4. PUBLIC SCHEMA ONLY — full table list
-- =============================================================================
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(format('public.%I', tablename))) AS total_size,
  pg_total_relation_size(format('public.%I', tablename))               AS total_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY total_bytes DESC;

-- =============================================================================
-- 5. ROW COUNT + SIZE (top public tables — actual COUNT, bisa lambat)
-- =============================================================================
-- Ganti daftar tabel sesuai kebutuhan; atau pakai query #3 dulu untuk pilih kandidat.
SELECT 'notifications'         AS tbl, COUNT(*) AS rows, pg_size_pretty(pg_total_relation_size('public.notifications'))         AS size FROM public.notifications
UNION ALL SELECT 'asset_task_statuses', COUNT(*), pg_size_pretty(pg_total_relation_size('public.asset_task_statuses')) FROM public.asset_task_statuses
UNION ALL SELECT 'tor_token_logs',        COUNT(*), pg_size_pretty(pg_total_relation_size('public.tor_token_logs'))        FROM public.tor_token_logs
UNION ALL SELECT 'projects',              COUNT(*), pg_size_pretty(pg_total_relation_size('public.projects'))              FROM public.projects
UNION ALL SELECT 'assets',                COUNT(*), pg_size_pretty(pg_total_relation_size('public.assets'))                FROM public.assets
UNION ALL SELECT 'task_logs',             COUNT(*), pg_size_pretty(pg_total_relation_size('public.task_logs'))             FROM public.task_logs
UNION ALL SELECT 'auth_sessions',         COUNT(*), pg_size_pretty(pg_total_relation_size('public.auth_sessions'))         FROM public.auth_sessions
UNION ALL SELECT 'audit_logs',            COUNT(*), pg_size_pretty(pg_total_relation_size('public.audit_logs'))            FROM public.audit_logs
UNION ALL SELECT 'moms',                  COUNT(*), pg_size_pretty(pg_total_relation_size('public.moms'))                  FROM public.moms
UNION ALL SELECT 'users',                 COUNT(*), pg_size_pretty(pg_total_relation_size('public.users'))                 FROM public.users
ORDER BY size DESC;

-- =============================================================================
-- 6. DEAD TUPLES / BLOAT HINT (perlu VACUUM jika dead_tup tinggi)
-- =============================================================================
SELECT
  schemaname,
  relname                                              AS table_name,
  n_live_tup,
  n_dead_tup,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname))) AS size,
  last_vacuum,
  last_autovacuum,
  last_analyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)) DESC
LIMIT 30;

-- =============================================================================
-- 7. INDEX SIZE PER TABLE (public)
-- =============================================================================
SELECT
  t.tablename,
  indexname,
  pg_size_pretty(pg_relation_size(format('public.%I', indexname))) AS index_size,
  pg_relation_size(format('public.%I', indexname))               AS index_bytes
FROM pg_indexes i
JOIN pg_tables t ON t.tablename = i.tablename AND t.schemaname = i.schemaname
WHERE i.schemaname = 'public'
ORDER BY index_bytes DESC
LIMIT 30;

-- =============================================================================
-- 8. SUPABASE FILE STORAGE (buckets + objects)
-- =============================================================================
SELECT id, name, public, created_at
FROM storage.buckets
ORDER BY name;

SELECT
  b.name                                              AS bucket_name,
  b.public,
  COUNT(o.id)                                         AS file_count,
  COALESCE(SUM((o.metadata->>'size')::bigint), 0)     AS total_bytes,
  pg_size_pretty(COALESCE(SUM((o.metadata->>'size')::bigint), 0)) AS total_size
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.name, b.public
ORDER BY total_bytes DESC;

-- Detail file terbesar (jika ada bucket)
SELECT
  bucket_id,
  name                                              AS file_path,
  (metadata->>'size')::bigint                       AS size_bytes,
  pg_size_pretty((metadata->>'size')::bigint)       AS size,
  created_at
FROM storage.objects
ORDER BY (metadata->>'size')::bigint DESC NULLS LAST
LIMIT 50;

-- =============================================================================
-- 9. AUTH SCHEMA FOOTPRINT
-- =============================================================================
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(format('auth.%I', tablename))) AS size
FROM pg_tables
WHERE schemaname = 'auth'
ORDER BY pg_total_relation_size(format('auth.%I', tablename)) DESC;

-- =============================================================================
-- 10. SUMMARY ONE-LINER (copy-paste ke report)
-- =============================================================================
WITH db AS (
  SELECT pg_database_size(current_database()) AS bytes
),
pub AS (
  SELECT SUM(pg_total_relation_size(format('public.%I', tablename))) AS bytes
  FROM pg_tables WHERE schemaname = 'public'
),
files AS (
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) AS bytes
  FROM storage.objects
)
SELECT
  pg_size_pretty(db.bytes)  AS database_total,
  pg_size_pretty(pub.bytes) AS public_schema,
  pg_size_pretty(files.bytes) AS file_storage,
  pg_size_pretty(db.bytes + files.bytes) AS combined_estimate
FROM db, pub, files;
