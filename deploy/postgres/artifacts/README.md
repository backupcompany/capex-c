# Postgres clone dump (Capex)

| File | Format | Size (approx) |
|------|--------|----------------|
| `capex.dump` | `pg_dump -Fc` (custom) | ~11 MB |
| `capex-vps-20260823T150223Z.dump` | timestamped copy of above | ~11 MB |
| `capex-vps-backup-before-supabase-sync-*.dump` | pre-overwrite safety | ~11 MB |

**Source of truth in dump (2026-08-23):** VPS `postgres-core` / DB `capex`  
(= Supabase Capex `abbgvfuanefrnxtttllo` public schema, then PA prod trigger applied)

**SHA256 (`capex.dump`):** `a29f8c540fb0b975efc241c1a6798acf1ace2a9d6093914e571a13e8c3b5c4dd`

**Stamp:** projects=4016 · assets=6917 · users=209 · asset_task_statuses=128307  
**PA:** `pg_net` + `trigger_send_asset_to_power_automate` → production Power Automate URL

Flags dump: `-Fc --no-owner --no-acl`.

## Restore di VM (compose Siloam: container `capex-postgres`, user `capex_app`)

```bash
# Backup first
docker exec capex-postgres pg_dump -U capex_app -d capex -Fc -f /tmp/pre-restore.dump
docker cp capex-postgres:/tmp/pre-restore.dump /tmp/pre-restore.dump

docker cp /path/to/capex.dump capex-postgres:/tmp/capex.dump
docker exec capex-postgres pg_restore -U capex_app -d capex --clean --if-exists --no-owner --no-acl /tmp/capex.dump || true

docker exec capex-postgres psql -U capex_app -d capex -c "
GRANT USAGE ON SCHEMA public TO capex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO capex_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO capex_app;
NOTIFY pgrst, 'reload schema';
"

# Re-apply PA SQL from git (safe if pg_net missing)
docker exec -i capex-postgres psql -U capex_app -d capex -v ON_ERROR_STOP=1 \
  < deploy/postgres/fix-asset-power-automate-trigger-safe.sql
```

## Refresh dump dari VPS (laptop)

```bash
./deploy/postgres/refresh-capex-dump.sh
```
