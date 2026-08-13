# Siloam VM — local Postgres + PostgREST (no Tencent at runtime)

## Goal

```text
capex-web → capex-api → capex-postgrest → capex-postgres
```

All on the Siloam VM. **No SSH tunnel to Tencent.**

## Why not `127.0.0.1:54321` in API env?

Inside container `capex-api`, `127.0.0.1` is **the API container itself**, not the VM host and not PostgREST.

Use Docker DNS:

```env
USE_VPS_POSTGRES=1
SUPABASE_URL=http://capex-postgrest
```

Host debug only (from VM shell): `http://127.0.0.1:54321`

## One-time bring-up (recommended)

```bash
cd /opt/capex-pro/app/capex-c   # or your repo path
cp deploy/.env.vps.example deploy/.env.compose   # fill secrets
docker compose -f deploy/docker-compose.siloam.yml --env-file deploy/.env.compose up -d --build
./deploy/postgres/restore-dump-on-vm.sh ./deploy/postgres/artifacts/capex.dump
docker restart capex-postgrest-engine capex-postgrest
```

API listens on **3001 inside** the container (`127.0.0.1:8082` on host).  
Web BFF must use `http://capex-api:3001` (not `:8082`, not `127.0.0.1`).

## Alternate: split compose

```bash
cd /opt/capex-deploy
# compose files from this repo:
#   docker-compose.db.yml
#   docker-compose.yml  ← copy of deploy/docker-compose.production.yml
#   .env                ← from deploy/.env.vps.example (secrets)

docker compose -f docker-compose.db.yml --env-file .env up -d
docker compose --env-file .env up -d
```

## Restore data (`capex.dump`)

Dummy/seed dump is in git: `postgres/artifacts/capex.dump` (~11MB).

```bash
# on VM after git pull (path relative to /opt/capex-deploy)
chmod +x postgres/restore-dump-on-vm.sh
./postgres/restore-dump-on-vm.sh ./postgres/artifacts/capex.dump
docker restart capex-postgrest-engine capex-postgrest
docker compose --env-file .env up -d --force-recreate capex-api
```

## Verify

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep capex
curl -fsS http://127.0.0.1:54321/auth/v1/health
curl -fsS http://127.0.0.1:8082/health
docker exec capex-postgres psql -U capex_app -d capex -c 'SELECT count(*) FROM users;'
```

## Authorization

Do **not** change RBAC / JWT / middleware for this migration. Only connectivity + dump restore.

## SSO

See `deploy/AUTH-SSO-SETUP.md`. `CAPEX_AUTH_MODE=sso` + Azure env on the VM.
