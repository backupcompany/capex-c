# Postgres clone dump (Capex)

| File | Format | Size (approx) |
|------|--------|----------------|
| `capex.dump` | `pg_dump -Fc` (custom) | ~11 MB |

**Source:** VPS `postgres-core` / DB `capex`  
**Stamp:** projects=3982 · assets=6889 · users=212 · `pentest.1`=Super Admin · `pentest.2`=PMO · scope All

Flags dump: `--no-owner --no-acl` (mudah restore di role lain).

## Restore di VM (Postgres Docker)

```bash
# 1) Copy dump ke host VM
scp deploy/postgres/artifacts/capex.dump ubuntu@VM:/tmp/capex.dump

# 2) Masukkan ke container + restore (ganti nama container/user bila beda)
docker cp /tmp/capex.dump postgres-core:/tmp/capex.dump
docker exec -i postgres-core pg_restore -U platform_admin -d capex --clean --if-exists --no-owner --no-acl /tmp/capex.dump

# 3) Reload PostgREST schema cache (wajib setelah restore)
#    contoh: NOTIFY pgrst, 'reload schema';
#    atau restart container postgrest
```

Atau pakai helper: `./deploy/postgres/restore-capex-dump.sh /tmp/capex.dump`

## Refresh dump dari VPS (laptop)

```bash
./deploy/postgres/refresh-capex-dump.sh
```
