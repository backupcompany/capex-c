# GitHub Actions CI/CD — setup checklist

Production deploy = **2 containers** (`capex-web` + `capex-api` monolith) via SSH + Docker Compose.

Workflows: `.github/workflows/deploy-web.yml`, `.github/workflows/deploy-api.yml`, `verify-microservices.yml` (CI only).

---

## 1. GitHub Secrets (repo → Settings → Secrets and variables → Actions)

| Secret | Required | Example / notes |
|--------|----------|-----------------|
| `VPS_HOST` | yes | `43.134.46.149` |
| `VPS_SSH_KEY` | yes | Private key for user `ubuntu` (full PEM, including `BEGIN`/`END`) |
| `DEPLOY_PATH` | yes | `/opt/capex-deploy` |
| `GHCR_TOKEN` | yes | GitHub PAT with `read:packages` (pull images on VPS) |
| `GHCR_USERNAME` | no | Defaults to `github.actor` if empty |
| `NEXT_PUBLIC_CAPEXBE_URL` | yes (web build) | Public API URL baked into FE image, e.g. `https://capex-api.siloamhospitals.com` |
| `PUBLIC_API_URL` | no | Optional post-deploy smoke test from CI (e.g. `https://capex-api.siloamhospitals.com/health`) |

**Note:** `deploy-web.yml` and `deploy-api.yml` both use `GHCR_TOKEN`. (Legacy name `GHCR_PAT` is no longer used.)

---

## 2. GHCR package visibility

After first workflow run, images appear as:

- `ghcr.io/<org>/capex-api`
- `ghcr.io/<org>/capex-web`

For private packages: VPS must `docker login ghcr.io` with `GHCR_TOKEN` (workflow does this each deploy).

---

## 3. One-time VPS bootstrap

On the VPS (as `ubuntu`):

```bash
sudo mkdir -p /opt/capex-deploy
sudo chown ubuntu:ubuntu /opt/capex-deploy
```

From your laptop (repo root):

```bash
./deploy/bootstrap-production-vps.sh
```

Then edit secrets on VPS:

```bash
ssh capex-vps 'nano /opt/capex-deploy/.env'
```

Template: `deploy/.env.vps.example` — fill `SUPABASE_*`, `JWT_ACCESS_SECRET`, `PUBLIC_ID_SALT`, `CORS_ORIGINS`, `FRONTEND_URL`.

**`JWT_ACCESS_SECRET` must match** between `capex-api` and `capex-web` `.env`.

Start stack manually once (before CI):

```bash
ssh capex-vps 'cd /opt/capex-deploy && docker compose pull && docker compose up -d'
```

Gateway (Caddy/nginx) should proxy:

- Public site → `127.0.0.1:8080` (`capex-web`)
- API (if exposed) → `127.0.0.1:8082` (`capex-api`)

---

## 4. Trigger deploy

| Event | Workflow |
|-------|----------|
| Push `main` + changes in `capexbe/**` | Deploy API |
| Push `main` + changes in `capex-apps/**` | Deploy Web |
| Manual | Actions → workflow → **Run workflow** |

Both workflows run a **security gate** first (build + verify). Deploy job runs only if gate passes.

---

## 5. Smoke tests (CI)

- API: `curl http://127.0.0.1:8082/health` on VPS after deploy
- Optional public: `PUBLIC_API_URL` secret

---

## 6. Not in CI/CD (manual ops)

- VPS Postgres / PostgREST: `deploy/postgres/` — schema clone, not auto-deployed
- Full microservices stack: `deploy/docker-compose.microservices.yml` — local/dev only
- Maintenance page: `deploy/maintenance/`
