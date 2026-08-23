# Postgres clone dump (Capex)

| File | Format | Size |
|------|--------|------|
| `capex.dump` | `pg_dump -Fc` | ~11 MB |
| `capex-schema-from-vps-testing.sql` | schema-only (VPS testing) | ~165 KB |
| `capex-data-from-supabase.dump` | data-only (Supabase Capex) | ~10 MB |
| `capex-vps-backup-before-supabase-sync-*.dump` | safety backup | ~11 MB |

## Hybrid source of truth (2026-08-23)

| Layer | Source |
|-------|--------|
| **Schema** (functions/triggers/DDL) | VPS testing backup (pre-sync) |
| **Data** | Supabase Capex `abbgvfuanefrnxtttllo` public (no `tor_*`) |
| **PA overlay** | `fix-asset-power-automate-trigger-safe.sql` (prod webhook) |

**SHA256 (`capex.dump`):** `65e58b6ca0b6502b3fb3ae4cc92bf19481f8d2ffc6769a99d00246713967ebf0`  
**Stamp:** projects=4016 · assets=6917 · users=209 · asset_task_statuses=128307  
**Extras kept from VPS schema:** e.g. `reserve_next_asset_seq` + PA trigger prod URL

## Restore di Siloam VM

```bash
cd /opt/capex && git fetch origin main && git reset --hard origin/main

# backup VM first
sudo docker exec capex-postgres pg_dump -U capex_app -d capex -Fc -f /tmp/pre.dump
sudo docker cp capex-postgres:/tmp/pre.dump /tmp/capex-vm-pre-$(date -u +%Y%m%dT%H%M%SZ).dump

shasum -a 256 deploy/postgres/artifacts/capex.dump

sudo docker cp deploy/postgres/artifacts/capex.dump capex-postgres:/tmp/capex.dump
sudo docker exec capex-postgres pg_restore -U capex_app -d capex \
  --clean --if-exists --no-owner --no-acl /tmp/capex.dump || true

sudo docker exec capex-postgres psql -U capex_app -d capex -c "
GRANT USAGE ON SCHEMA public TO capex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO capex_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO capex_app;
NOTIFY pgrst, 'reload schema';
"

sudo docker exec -i capex-postgres psql -U capex_app -d capex -v ON_ERROR_STOP=1 \
  < deploy/postgres/fix-asset-power-automate-trigger-safe.sql
```
