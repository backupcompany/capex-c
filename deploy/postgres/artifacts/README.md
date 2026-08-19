# DB dump for Siloam VM (dummy / seed)

- `capex.dump` — PostgreSQL custom format (`pg_dump -Fc`)
- Approved for repo transfer (dummy/seed data for IT restore on VM)

On VM after `git pull`:

```bash
./postgres/restore-dump-on-vm.sh ./postgres/artifacts/capex.dump
# script reloads PostgREST schema (NOTIFY + restart) — required for auth_sessions POST
docker restart capex-api capex-web
```
