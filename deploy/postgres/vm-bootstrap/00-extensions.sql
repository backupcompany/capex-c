-- Run once on empty Postgres VM before importing capex-schema-only.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
-- Uncomment if full dump includes tor/vector columns:
-- CREATE EXTENSION IF NOT EXISTS vector;
