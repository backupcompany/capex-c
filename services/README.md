# CAPEX leaf services (strangler fig extraction)

Each subdirectory becomes an independent NestJS deployable, extracted from `capexbe/`.

| Service | Status | Monolith module | Port (dev) |
|---------|--------|-----------------|------------|
| `capex-notifications/` | **Scaffolded** | `notifications/` | 3002 |
| `capex-audit/` | Planned | `audit/` | 3003 |
| `capex-backup/` | Planned | `backup/` | 3004 |

## Before creating a service

1. Read [MICROSERVICES.md](../MICROSERVICES.md) Phase 1 checklist
2. Ensure `@capex/auth-core` exists (Phase 3) **or** temporarily symlink auth from monolith for POC
3. Wire BFF: `CAPEX_SERVICE_<NAME>_URL` in `capex-apps/.env.local`
4. Shadow test before removing module from monolith

## Template layout (each service)

```
services/capex-notifications/
├── package.json
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   └── notifications/   ← copied from capexbe, imports slimmed
├── Dockerfile
└── README.md
```

Do **not** extract `project-list`, `bootstrap`, or `budget-hu` until Phases 6–7.
