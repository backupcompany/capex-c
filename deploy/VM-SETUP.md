# CAPEX on VM — monorepo deploy flow

Source of truth: **this repo** (`backupcompany/capex-c`).  
VM only runs images + Caddy; no app git checkout needed for deploys.

```
GitHub (monorepo)
  capexbe/      → ghcr.io/<org>/capex-api
  capex-apps/   → ghcr.io/<org>/capex-web
        │
        ▼  SSH + docker compose pull
/opt/capex-deploy/
  docker-compose.yml   ← from deploy/docker-compose.production.yml
  .env                 ← from deploy/.env.vps.example (secrets)
        │
        ▼  bind localhost only
  127.0.0.1:8080  capex-web
  127.0.0.1:8082  capex-api
        │
        ▼  gateway-caddy (host network)
  https://capex.cgp-ai.com
  https://capex-api.cgp-ai.com
```

## vs old multi-repo (aldryan)

| | Old | Now |
|--|-----|-----|
| Code | 2 repos + env per app | 1 monorepo |
| Deploy dir | `/ops-agentic/.../capex-deploy` | `/opt/capex-deploy` |
| Web port | `:3002` | `:8080` |
| Env | `capex-apps/.env` + `capexbe/.env` | one `.env` |
| Images | `ghcr.io/cgpai/capex-*` | `ghcr.io/<org>/capex-*` (CI) |

## One-time bootstrap

```bash
# laptop, from repo root
./deploy/bootstrap-production-vps.sh

ssh capex-vps 'nano /opt/capex-deploy/.env'   # fill secrets
```

Caddy — replace maintenance blocks with `deploy/caddy/Caddyfile.capex`:

```bash
ssh capex-vps
# edit: /ops-agentic/workspaces/gateway/Caddyfile
docker exec gateway-caddy caddy reload --config /etc/caddy/Caddyfile
```

Then first pull:

```bash
ssh capex-vps 'cd /opt/capex-deploy && docker compose pull && docker compose up -d'
```

## Ongoing deploy

Push `main` → workflows build/push GHCR → SSH → `docker compose pull` + recreate service.

See `deploy/GITHUB-ACTIONS-SETUP.md` for secrets.

## Checklist before go-live

- [ ] `/opt/capex-deploy/.env` has `JWT_ACCESS_SECRET`, DB, Redis URL `redis://cgp-redis:6379`
- [ ] Networks exist: `database-net`, `cgp-cgolangp_default` (redis)
- [ ] Caddy points to **8080 / 8082** (not 3002, not maintenance page)
- [ ] `NEXT_PUBLIC_CAPEXBE_URL` CI secret = public API or same-origin BFF URL you use
- [ ] Smoke: `curl -fsS http://127.0.0.1:8082/health` and `curl -fsS http://127.0.0.1:8080/`
