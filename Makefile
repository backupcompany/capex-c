# CAPEX monorepo — monolith (capex-apps + capexbe)
# Compose: deploy/docker-compose.siloam.yml

BE_DIR := capexbe
FE_DIR := capex-apps
BE_PORT := 3001
FE_PORT := 3000

COMPOSE_FILE := deploy/docker-compose.siloam.yml
COMPOSE_ENV := deploy/.env.compose

.PHONY: help setup install env ensure-install run run-be run-fe stop check check-env ensure-vps-dev postgrest-up postgrest-down seed-vps-demo seed-infosec vps-dev-up redis-up redis-down redis-status compose-env compose-config compose-build compose-up compose-down compose-verify compose-logs prod-up prod-check

help:
	@echo "CAPEX monolith:"
	@echo "  make setup / install / env / check"
	@echo "  make ensure-vps-dev   SSH tunnel + PostgREST (USE_VPS_POSTGRES=1)"
	@echo "  make run              BE :$(BE_PORT) + FE :$(FE_PORT)"
	@echo "  make compose-up       Siloam stack (web :8080, api :8082)"
	@echo "  make redis-up / seed-infosec"

setup: env install
	@echo "Setup done. Edit capexbe/.env and capex-apps/.env.local then: make check && make run"

env:
	@./scripts/setup-env.sh

install:
	@cd $(BE_DIR) && npm install
	@cd $(FE_DIR) && npm install
	@echo "Install complete."

ensure-install:
	@test -d $(BE_DIR)/node_modules || $(MAKE) install
	@test -d $(FE_DIR)/node_modules/.bin/next || $(MAKE) install

check: ensure-install check-env

# Env + DB/PostgREST connect (VPS tunnel when USE_VPS_POSTGRES=1)
check-env:
	@echo "==> Checking backend env..."
	@cd $(BE_DIR) && node -e "require('dotenv').config(); \
	  const u=process.env.SUPABASE_URL, a=process.env.SUPABASE_ANON_KEY, s=process.env.SUPABASE_SERVICE_ROLE_KEY; \
	  if(!u||!a||!s) { console.error('FAIL: missing SUPABASE_* in capexbe/.env'); process.exit(1); } \
	  console.log('OK  capexbe/.env —', u, '| auth:', process.env.CAPEX_AUTH_MODE||'(default)');"
	@echo "==> Checking frontend env..."
	@cd $(FE_DIR) && node -e " \
	  const fs=require('fs'); \
	  const parse=f=>{ if(!fs.existsSync(f)) return {}; return Object.fromEntries(fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()&&!l.startsWith('#')).map(l=>{ const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })); }; \
	  const m={...parse('.env'),...parse('.env.local')}; \
	  if(!m.NEXT_PUBLIC_CAPEXBE_URL) { console.error('FAIL: missing NEXT_PUBLIC_CAPEXBE_URL in capex-apps/.env or .env.local'); process.exit(1); } \
	  if(m.NEXT_PUBLIC_SUPABASE_URL||m.NEXT_PUBLIC_SUPABASE_ANON_KEY) { console.warn('WARN: NEXT_PUBLIC_SUPABASE_* no longer needed on FE — move to capexbe/.env only'); } \
	  console.log('OK  capex-apps env — BE', m.NEXT_PUBLIC_CAPEXBE_URL, '| auth:', m.NEXT_PUBLIC_CAPEX_AUTH_MODE||'(default)');"
	@chmod +x deploy/postgres/ensure-vps-dev.sh
	@deploy/postgres/ensure-vps-dev.sh
	@echo "==> Redis cache (optional)..."
	@cd $(BE_DIR) && node -e " \
	  require('dotenv').config(); \
	  const url=process.env.REDIS_URL?.trim(); \
	  if(!url){ console.warn('WARN REDIS_URL not set — perf-cache memory-only (make redis-up)'); process.exit(0); } \
	  const net=require('net'); \
	  const u=new URL(url); \
	  const host=u.hostname||'127.0.0.1'; \
	  const port=Number(u.port||6379); \
	  const s=net.createConnection({host,port}); \
	  s.setTimeout(800); \
	  s.on('connect',()=>{ console.log('OK  Redis —', url); s.destroy(); process.exit(0); }); \
	  s.on('timeout',()=>{ s.destroy(); console.warn('WARN Redis not reachable — make redis-up'); process.exit(0); }); \
	  s.on('error',()=>{ console.warn('WARN Redis not reachable — make redis-up'); process.exit(0); });"
	@echo "==> Testing API health..."
	@cd $(BE_DIR) && node -e "require('dotenv').config(); \
	  const vps=process.env.USE_VPS_POSTGRES==='1'||process.env.USE_VPS_POSTGRES==='true'; \
	  fetch(process.env.SUPABASE_URL+'/auth/v1/health',{headers:{apikey:process.env.SUPABASE_ANON_KEY}}) \
	    .then(r=>console.log(r.status===200?(vps?'OK  VPS PostgREST':'OK  Supabase Auth health'):'WARN API health', r.status)) \
	    .catch(e=>{ console.error('FAIL API health', e.message, vps?'— tunnel/PostgREST? make ensure-vps-dev':''); process.exit(1); });"

ensure-vps-dev:
	@chmod +x deploy/postgres/ensure-vps-dev.sh
	@deploy/postgres/ensure-vps-dev.sh

postgrest-up: ensure-vps-dev
	@true

postgrest-down:
	@chmod +x deploy/postgres/run-postgrest-local.sh
	@deploy/postgres/run-postgrest-local.sh down
	@-test -f /tmp/capex-pg-tunnel.pid && kill "$$(cat /tmp/capex-pg-tunnel.pid)" 2>/dev/null || true
	@-rm -f /tmp/capex-pg-tunnel.pid
	@echo "==> SSH tunnel stopped (if we started it)"

seed-vps-demo:
	@set -a && . capexbe/.env && set +a && psql "$$DATABASE_URL" -f deploy/postgres/seed-demo-user.sql

seed-infosec:
	@set -a && . capexbe/.env && set +a && psql "$$DATABASE_URL" -f deploy/postgres/seed-infosec-pentest-users.sql

vps-dev-up: postgrest-up seed-vps-demo
	@echo "OK  VPS dev — make run; demo@capex.local / demo123"

run: stop ensure-install check-env
	@echo "Starting CAPEX monolith — backend :$(BE_PORT), frontend :$(FE_PORT)"
	@trap 'echo; echo Stopping...; kill 0 2>/dev/null; exit 0' INT TERM; \
		(cd $(BE_DIR) && npm run start:dev) & \
		(cd $(FE_DIR) && npm run dev) & \
		wait

run-be:
	@cd $(BE_DIR) && npm run start:dev

run-fe:
	@cd $(FE_DIR) && npm run dev

stop:
	@-lsof -ti:$(FE_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(BE_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@echo "Stopped :$(FE_PORT) / :$(BE_PORT)"

redis-up:
	@docker compose -f deploy/docker-compose.redis.yml up -d
	@echo "Redis :6379 — REDIS_URL=redis://127.0.0.1:6379 in capexbe/.env"

redis-down:
	@docker compose -f deploy/docker-compose.redis.yml down

redis-status:
	@docker compose -f deploy/docker-compose.redis.yml ps

compose-env:
	@test -f $(BE_DIR)/.env || (echo "Missing $(BE_DIR)/.env — run: make env" && exit 1)
	@if [ ! -f $(COMPOSE_ENV) ]; then \
	  cp deploy/.env.vps.example $(COMPOSE_ENV); \
	  echo "Created $(COMPOSE_ENV) from .env.vps.example — fill secrets before compose-up"; \
	else \
	  echo "OK  $(COMPOSE_ENV)"; \
	fi

compose-config:
	@if command -v docker >/dev/null 2>&1; then \
	  test -f $(COMPOSE_ENV) || $(MAKE) compose-env; \
	  docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) config --quiet \
	    && echo "OK  docker compose config (monolith/siloam)"; \
	else \
	  echo "SKIP docker — not installed"; \
	fi

compose-build: compose-env
	docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) build

compose-up: compose-env
	docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) up -d --build
	@echo "Monolith up — web :8080 api :8082 (make compose-verify)"

compose-down:
	docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) down 2>/dev/null || docker compose -f $(COMPOSE_FILE) down

compose-verify:
	@node -e "\
	const checks=[['api','http://127.0.0.1:8082/health'],['web','http://127.0.0.1:8080']];\
	let bad=0;\
	for (const [n,u] of checks) {\
	  try { const r=await fetch(u,{signal:AbortSignal.timeout(8000)});\
	    console.log(r.ok?'OK':'FAIL',n,r.status); if(!r.ok) bad++; }\
	  catch(e){ console.log('FAIL',n,e.message); bad++; }\
	}\
	process.exit(bad?1:0)"

compose-logs:
	docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) logs -f --tail=100

prod-check: compose-verify

prod-up: compose-env compose-build compose-up
	@echo "Waiting 45s..."
	@sleep 45
	@$(MAKE) compose-verify
