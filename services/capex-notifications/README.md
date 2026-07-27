# capex-notifications (Phase 1 leaf service)

Notifications API extracted from `capexbe` via strangler fig. Reuses auth module from monolith until `@capex/auth-core` (Phase 3).

## Dev

```bash
# 1. Env (copy from capexbe/.env)
cp .env.example .env

# 2. Install + run
npm install
npm run start:dev
# → http://127.0.0.1:3002/health

# 3. Point BFF at leaf service (capex-apps/.env.local)
CAPEX_SERVICE_NOTIFICATIONS_URL=http://127.0.0.1:3002

# 4. Run FE + core BE as usual; notification calls route to :3002
```

## Endpoints

Same as monolith `NotificationsController`:

- `POST /notifications/list`
- `POST /notifications/save`
- `POST /notifications/mark-read`
- `POST /notifications/mark-all-read`

## Cutover checklist

- [ ] Shadow test with `CAPEX_SERVICE_NOTIFICATIONS_URL` in staging
- [ ] Smoke My Tasks notifications UI
- [ ] Remove `NotificationsModule` from `capexbe/src/app.module.ts` (after stable)
- [ ] Rollback: unset env var

## Docker

Build from monorepo root:

```bash
docker build -f services/capex-notifications/Dockerfile -t capex-notifications .
```
