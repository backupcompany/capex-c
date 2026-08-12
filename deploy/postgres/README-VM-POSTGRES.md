# CAPEX — migrasi schema Supabase → Postgres VM (kosong, tanpa data)

Supabase **adalah PostgreSQL**. Schema CAPEX bisa di-clone ke Postgres di VM dengan `pg_dump --schema-only` — tanpa data.

## Apa yang perlu di-export?

| Schema | Perlu di VM? | Catatan |
|--------|--------------|---------|
| **`public`** | **Ya** | Semua tabel CAPEX (~52 tabel core + ~40 tabel `tor_*` di DB ini) |
| `auth` | Opsional | Hanya jika tetap pakai **Supabase Auth** (GoTrue). CAPEX `public.users.auth_id` **tidak** FK ke `auth.users` |
| `storage` | Tidak | Ganti MinIO/S3/NFS di VM |
| `extensions` / `vault` | Tidak | Khusus Supabase platform |

**Rekomendasi VM (CAPEX saja):** export **`public`** saja. Auth tetap Supabase Cloud, DB app di VM — atau auth full di VM nanti (phase 2).

### Extensions yang dipakai (dari Supabase live)

```
pgcrypto, uuid-ossp, pg_trgm, citext, vector (jika tor/AI ikut)
```

## Local dev — VPS Postgres + dummy login

`capexbe/.env` dengan `USE_VPS_POSTGRES=1` → API baca DB VPS via PostgREST lokal (bukan Supabase Cloud).

**Satu perintah (auto tunnel + PostgREST):**
```bash
make run               # check-env → ensure-vps-dev → BE + FE
```

Atau manual:
```bash
make ensure-vps-dev    # ssh tunnel :5433 + PostgREST :54321
make seed-vps-demo     # user demo Super Admin (idempotent)
make run
```

**Dummy login**
| Field | Value |
|-------|-------|
| Email | `demo@capex.local` |
| Password | `demo123` |

**InfoSec pentest accounts** (PDF §18.3):
```bash
make seed-infosec   # users 227/228 + Viewer role matrix
# Set INFOSEC_ADMIN_* / INFOSEC_VIEWER_* passwords in capexbe/.env (gitignored)
```

| Email | Role | Scope |
|-------|------|-------|
| `capex.infosec.admin@siloamhospitals.com` | Super Admin | All |
| `capex.infosec.viewer@siloamhospitals.com` | Viewer | HU-SHMK |

JWT keys di `.env` harus match `SUPABASE_JWT_SECRET` (generate: `./deploy/postgres/generate-vps-jwt-keys.sh`).

Kembali ke Supabase Cloud: set `USE_VPS_POSTGRES=0`, restore `SUPABASE_URL` cloud + cloud anon/service keys.

---

## Cara export schema (dari laptop / CI)

1. Ambil **Database password** di Supabase Dashboard → **Project Settings → Database** (bukan anon/service key).

2. Jalankan:

```bash
cd /path/to/capex

# Semua public (CAPEX + tor_*)
SUPABASE_DB_PASSWORD='YOUR_DB_PASSWORD' ./deploy/postgres/export-capex-schema.sh

# Hanya CAPEX core (tanpa tor_*)
SUPABASE_DB_PASSWORD='YOUR_DB_PASSWORD' EXCLUDE_TOR=1 ./deploy/postgres/export-capex-schema.sh
```

Output:

```
deploy/postgres/artifacts/capex-schema-only-public-YYYYMMDD-HHMMSS.sql
deploy/postgres/artifacts/capex-schema-only-latest.sql   → symlink
```

3. Copy file `.sql` ke VM.

### Verifikasi isi dump

Harus ada (cek dengan `grep`):

- `CREATE TABLE public.users`
- `CREATE TABLE public.auth_sessions`
- `CREATE FUNCTION public.executive_dashboard_kpi`
- `CREATE FUNCTION public.monitoring_user_activity_snapshot`
- `CREATE INDEX` / `ALTER TABLE ... ADD CONSTRAINT`
- Trigger `audit_logs_append_only`

Repo `capex-apps/supabase/migrations/` hanya **delta** (10 file) — **bukan** baseline lengkap. **`pg_dump` dari Supabase = source of truth** untuk schema penuh.

## Cara import di VM (Postgres kosong)

```bash
# 1. Buat DB + user
sudo -u postgres psql <<'SQL'
CREATE USER capex WITH PASSWORD 'strong-password';
CREATE DATABASE capex OWNER capex;
GRANT ALL PRIVileges ON DATABASE capex TO capex;
SQL

# 2. Import
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=capex PGDATABASE=capex PGPASSWORD='strong-password'
./import-on-vm.sh ./capex-schema-only-latest.sql
```

## Update aplikasi (capexbe)

Ganti koneksi Supabase PostgREST dengan **Postgres langsung** (butuh refactor BE) **atau** tetap pakai Supabase hanya untuk Auth + arahkan `SUPABASE_URL` ke project lain.

Untuk **Postgres VM + service role pattern** (tanpa PostgREST):

- Set `DATABASE_URL=postgresql://capex:pass@vm-host:5432/capex`
- BE pakai `pg` / Prisma / Drizzle (belum ada di repo saat ini — capexbe pakai `@supabase/supabase-js`)

**Phase 1 (paling aman):** DB di VM, Auth masih Supabase — BE perlu adapter SQL langsung (migration terpisah).

**Phase 0 (sekarang):** Export schema untuk dokumentasi, DR, atau staging VM kosong.

## Inventory live DB (Supabase project `abbgvfuanefrnxtttllo`)

- **public tables (CAPEX core):** 52 (exclude `tor_*`)
- **public tables (tor_*):** ~40
- **RPC CAPEX penting:** `executive_dashboard_kpi`, `monitoring_user_activity_snapshot`, `set_current_user_id`, `user_has_permission_for_hierarchy`, `reserve_next_project_nn`, `reserve_next_asset_seq`
- **Auth app:** `public.auth_sessions`, `public.login_audit_logs` (bukan schema `auth`)

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `pg_dump: password authentication failed` | Password dari Database settings, bukan API key |
| `extension "vector" does not exist` | `CREATE EXTENSION vector` di VM (pgvector) atau `EXCLUDE_TOR=1` |
| Import gagal FK ke `auth.users` | Hanya tabel `tor_*` — pakai `EXCLUDE_TOR=1` atau buat stub schema `auth` |
| RLS / role `authenticated` error di VM | Normal — capexbe pakai service role; RLS di VM bisa disable untuk app user |

## Keamanan

- **Jangan commit** `SUPABASE_DB_PASSWORD` atau file dump ke git.
- `deploy/postgres/artifacts/` sudah di `.gitignore`.
