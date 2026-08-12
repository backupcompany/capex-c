# CAPEX monorepo — local dev shortcuts
# Usage: ./run setup && ./run   (Mac + Windows PowerShell 7+)
#        make setup && make run (Mac/Linux, requires make)

BE_DIR   := capexbe
FE_DIR   := capex-apps
NOTIF_DIR := services/capex-notifications
AUDIT_DIR := services/capex-audit
BACKUP_DIR := services/capex-backup
CONFIG_DIR := services/capex-config
MOM_DIR := services/capex-mom-daily-summary
TIMELINE_DIR := services/capex-asset-timeline
DUP_DIR := services/capex-duplicate-detection
USER_ADMIN_DIR := services/capex-user-admin
PROC_DIR := services/capex-procurement
FS_DIR := services/capex-fs
MON_DIR := services/capex-monitoring
REPORTING_DIR := services/capex-reporting
EXEC_SUMMARY_DIR := services/capex-executive-summary
TASKS_DIR := services/capex-tasks
CORE_DIR := services/capex-core
MIGRATION_DIR := services/capex-smart-migration
AUTH_DIR := services/capex-auth
BE_PORT  := 3001
FE_PORT  := 3000
NOTIF_PORT := 3002
AUDIT_PORT := 3003
BACKUP_PORT := 3004
CONFIG_PORT := 3005
MOM_PORT := 3006
TIMELINE_PORT := 3007
DUP_PORT := 3008
USER_ADMIN_PORT := 3009
PROC_PORT := 3010
FS_PORT := 3011
MON_PORT := 3012
REPORTING_PORT := 3013
EXEC_SUMMARY_PORT := 3014
TASKS_PORT := 3015
CORE_PORT := 3016
MIGRATION_PORT := 3017
AUTH_PORT := 3018

.PHONY: help setup install env ensure-install run run-tunnel run-tunnel-demo run-public run-be run-fe run-notifications run-audit run-backup run-config run-mom-daily-summary run-asset-timeline run-duplicate-detection run-user-admin run-procurement run-fs run-monitoring run-reporting run-executive-summary run-tasks run-core run-smart-migration run-auth run-all-leaf stop check check-env ensure-vps-dev postgrest-up postgrest-down seed-vps-demo vps-dev-up logs public-url tunnel-help tunnel-cf redis-up redis-down redis-status compose-env compose-config compose-build compose-up compose-down compose-verify compose-logs build-all-leaf verify-leaf-build sync-leaf-env shadow-notifications shadow-phase2 shadow-phase4 shadow-mom-daily-summary shadow-asset-timeline shadow-duplicate-detection shadow-user-admin shadow-procurement shadow-fs shadow-monitoring shadow-reporting shadow-executive-summary shadow-tasks shadow-core shadow-smart-migration shadow-auth verify-bff-routing verify-phase1 verify-phase2 verify-phase3 verify-phase4 verify-phase5a verify-phase5b verify-phase5c verify-phase5d verify-phase5 verify-phase6 verify-phase7a verify-phase7b verify-phase7c verify-phase7d verify-phase7e verify-phase8 verify-phase10 verify-microservices verify-microservices-static verify-compose-config verify-bff-health verify-cross-hu-scope verify-phase11 verify-all verify-auth-core-typecheck

help:
	@echo "CAPEX dev commands:"
	@echo "  ./run           Start backend (:$(BE_PORT)) + auth (:$(AUTH_PORT)) + frontend (:$(FE_PORT)) [Mac/Win]"
	@echo "  make setup      Copy env templates + npm install (first time)"
	@echo "  make install    npm install in backend + frontend"
	@echo "  make env        Copy .env.example → .env / .env.local (skip if exists)"
	@echo "  make check      Verify env + VPS tunnel/PostgREST (auto) + API health"
	@echo "  make ensure-vps-dev  Start SSH tunnel :5433 + PostgREST :54321 (USE_VPS_POSTGRES=1)"
	@echo "  make run        Start backend (:$(BE_PORT)) + auth (:$(AUTH_PORT)) + frontend (:$(FE_PORT))"
	@echo "  make run-tunnel     Dev mode for tunnel (HMR off, no WS errors)"
	@echo "  make run-tunnel-demo Production + cloudflared (best for sharing)"
	@echo "  make public-url Print access URLs for allowed devices"
	@echo "  make tunnel-help  Cursor port-forward setup (recommended)"
	@echo "  make tunnel-cf    Cloudflare quick tunnel (if Cursor tunnel fails)"
	@echo "  make run-be     Start backend only"
	@echo "  make run-fe     Start frontend only"
	@echo "  make run-notifications  Leaf service (:$(NOTIF_PORT)) — Phase 1"
	@echo "  make run-audit          Leaf service (:$(AUDIT_PORT)) — Phase 2"
	@echo "  make run-backup         Leaf service (:$(BACKUP_PORT)) — Phase 2"
	@echo "  make run-config         Leaf service (:$(CONFIG_PORT)) — Phase 4"
	@echo "  make run-mom-daily-summary  Leaf service (:$(MOM_PORT)) — Phase 5a"
	@echo "  make run-asset-timeline     Leaf service (:$(TIMELINE_PORT)) — Phase 5b"
	@echo "  make run-duplicate-detection Leaf service (:$(DUP_PORT)) — Phase 5c"
	@echo "  make run-user-admin         Leaf service (:$(USER_ADMIN_PORT)) — Phase 5d"
	@echo "  make run-procurement        Leaf service (:$(PROC_PORT)) — Phase 5 (PO + GR)"
	@echo "  make run-fs                 Leaf service (:$(FS_PORT)) — Phase 6 (FS cluster)"
	@echo "  make run-monitoring         Leaf service (:$(MON_PORT)) — Phase 7a"
	@echo "  make run-reporting          Leaf service (:$(REPORTING_PORT)) — Phase 7b"
	@echo "  make run-executive-summary  Leaf service (:$(EXEC_SUMMARY_PORT)) — Phase 7c"
	@echo "  make run-tasks              Leaf service (:$(TASKS_PORT)) — Phase 7d"
	@echo "  make run-core               Leaf service (:$(CORE_PORT)) — Phase 7e (core hub)"
	@echo "  make run-smart-migration    Leaf service (:$(MIGRATION_PORT)) — Phase 8"
	@echo "  make run-auth               Leaf service (:$(AUTH_PORT)) — Phase 10 (auth)"
	@echo "  make run-all-leaf           Start monolith + all 17 leaf services (background)"
	@echo "  make build-all-leaf          Compile all 17 leaf services (no runtime)"
	@echo "  make verify-leaf-build       Canary compile ×3 (notifications, core, auth)"
	@echo "  make sync-leaf-env          Copy capexbe/.env secrets → leaf .env files"
	@echo "  make compose-env            Generate deploy/.env.compose from local env"
	@echo "  make compose-config         Validate docker-compose YAML (static + docker)"
	@echo "  make compose-build          Docker build all 18 services"
	@echo "  make compose-up             Docker Compose full stack (:3000–:3018)"
	@echo "  make compose-verify         Health-check all compose services"
	@echo "  make shadow-fs                 Phase 6 shadow test (FS cluster)"
	@echo "  make shadow-procurement        Phase 5 shadow test (procurement)"
	@echo "  make shadow-phase4         Phase 4 shadow test (configuration)"
	@echo "  make shadow-mom-daily-summary  Phase 5a shadow test (mom-daily-summary)"
	@echo "  make shadow-asset-timeline     Phase 5b shadow test (asset-timeline)"
	@echo "  make shadow-notifications  Phase 1 shadow test"
	@echo "  make shadow-phase2         Phase 2 shadow test (audit + backup)"
	@echo "  make verify-bff-routing    Phase 1 BFF path → leaf env check"
	@echo "  make verify-phase1         Phase 1 checks"
	@echo "  make verify-phase2         Phase 2 cutover checks"
	@echo "  make verify-phase3         @capex/auth-core bridge check"
	@echo "  make verify-microservices-static  CI-safe scaffold + BFF checks"
	@echo "  make verify-bff-health       BFF /api/health/services (stack must be running)"
	@echo "  make verify-cross-hu-scope   Phase 11.9 — HU assignment scope unit tests"
	@echo "  make prod-up                Build + start + verify full production stack"
	@echo "  make prod-check             Health-check stack (must be running)"
	@echo "  make verify-prod-readiness   Go-live code gate (security + build)"
	@echo "  make verify-phase11          Phase 11 gate (static + auth + cross-HU + build)"
	@echo "  make verify-all            All microservice + auth-core checks"
	@echo ""
	@echo "  make redis-up   Start local Redis (:6379) for BE perf-cache"
	@echo "  make redis-down Stop local Redis container"
	@echo "  make stop       Kill processes on ports $(FE_PORT) and $(BE_PORT)"

setup: env install sync-leaf-env
	@echo "Setup done. Edit capexbe/.env and capex-apps/.env.local then: make check && make run"

env:
	@./scripts/setup-env.sh

install:
	@echo "==> Installing $(BE_DIR)..."
	@cd $(BE_DIR) && npm install
	@echo "==> Installing $(FE_DIR)..."
	@cd $(FE_DIR) && npm install
	@echo "Install complete."

ensure-install:
	@test -d $(BE_DIR)/node_modules || $(MAKE) install
	@test -d $(FE_DIR)/node_modules/.bin/next || $(MAKE) install

check: ensure-install check-env

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
	  s.on('timeout',()=>{ s.destroy(); console.warn('WARN Redis not reachable at', host+':'+port,'— run: make redis-up (perf-cache uses memory until then)'); process.exit(0); }); \
	  s.on('error',()=>{ console.warn('WARN Redis not reachable at', host+':'+port,'— run: make redis-up (perf-cache uses memory until then)'); process.exit(0); });"
	@echo "==> Testing API health..."
	@cd $(BE_DIR) && node -e "require('dotenv').config(); \
	  const vps=process.env.USE_VPS_POSTGRES==='1'||process.env.USE_VPS_POSTGRES==='true'; \
	  if(vps && !process.env.DATABASE_URL){ console.error('FAIL: USE_VPS_POSTGRES=1 but DATABASE_URL missing'); process.exit(1); } \
	  fetch(process.env.SUPABASE_URL+'/auth/v1/health',{headers:{apikey:process.env.SUPABASE_ANON_KEY}}) \
	    .then(r=>console.log(r.status===200?(vps?'OK  VPS PostgREST':'OK  Supabase Auth health'):'WARN API health', r.status)) \
	    .catch(e=>{ console.error('FAIL API health', e.message, vps?'— tunnel/PostgREST? run: make ensure-vps-dev':''); process.exit(1); });"

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
	@echo "==> Seed demo user on VPS Postgres (demo@capex.local / demo123)"
	@set -a && . capexbe/.env && set +a && psql "$$DATABASE_URL" -f deploy/postgres/seed-demo-user.sql

seed-infosec:
	@echo "==> Seed InfoSec pentest users (admin + viewer) — passwords via INFOSEC_* env"
	@set -a && . capexbe/.env && set +a && psql "$$DATABASE_URL" -f deploy/postgres/seed-infosec-pentest-users.sql

vps-dev-up: postgrest-up seed-vps-demo
	@echo "OK  VPS dev — tunnel: ssh -N -L 5433:127.0.0.1:5432 capex-vps"
	@echo "    login: demo@capex.local / demo123"
	@echo "    InfoSec: make seed-infosec + set INFOSEC_* in capexbe/.env"

run: stop ensure-install check-env
	@test -f $(AUTH_DIR)/.env || (echo "Copy $(AUTH_DIR)/.env.example → .env" && exit 1)
	@echo "Starting CAPEX — backend :$(BE_PORT), auth :$(AUTH_PORT), frontend :$(FE_PORT)"
	@echo "Press Ctrl+C to stop all."
	@trap 'echo; echo Stopping...; kill 0 2>/dev/null; exit 0' INT TERM; \
		(cd $(BE_DIR) && npm run start:dev) & \
		(cd $(AUTH_DIR) && npm run start:dev) & \
		(cd $(FE_DIR) && npm run dev) & \
		wait

run-tunnel: stop ensure-install check-env
	@echo "Starting CAPEX for HTTPS tunnel (HMR disabled — no WebSocket errors)"
	@echo "Press Ctrl+C to stop both. Then: make tunnel-cf"
	@trap 'echo; echo Stopping...; kill 0 2>/dev/null; exit 0' INT TERM; \
		(cd $(BE_DIR) && npm run start:dev) & \
		(cd $(FE_DIR) && npm run dev:tunnel) & \
		wait

public-url:
	@chmod +x scripts/print-public-url.sh
	@./scripts/print-public-url.sh

run-public: stop ensure-install check-env public-url
	@echo ""
	@echo "Press Ctrl+C to stop both."
	@trap 'echo; echo Stopping...; kill 0 2>/dev/null; exit 0' INT TERM; \
		(cd $(BE_DIR) && npm run start:dev) & \
		(cd $(FE_DIR) && npm run dev) & \
		wait

run-be:
	@cd $(BE_DIR) && npm run start:dev

run-fe:
	@cd $(FE_DIR) && npm run dev

run-notifications:
	@test -f $(NOTIF_DIR)/.env || (echo "Copy $(NOTIF_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(NOTIF_DIR) && npm run start:dev

run-audit:
	@test -f $(AUDIT_DIR)/.env || (echo "Copy $(AUDIT_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(AUDIT_DIR) && npm run start:dev

run-backup:
	@test -f $(BACKUP_DIR)/.env || (echo "Copy $(BACKUP_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(BACKUP_DIR) && npm run start:dev

run-config:
	@test -f $(CONFIG_DIR)/.env || (echo "Copy $(CONFIG_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(CONFIG_DIR) && npm run start:dev

run-mom-daily-summary:
	@test -f $(MOM_DIR)/.env || (echo "Copy $(MOM_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(MOM_DIR) && npm run start:dev

run-asset-timeline:
	@test -f $(TIMELINE_DIR)/.env || (echo "Copy $(TIMELINE_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(TIMELINE_DIR) && npm run start:dev

run-duplicate-detection:
	@test -f $(DUP_DIR)/.env || (echo "Copy $(DUP_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(DUP_DIR) && npm run start:dev

run-user-admin:
	@test -f $(USER_ADMIN_DIR)/.env || (echo "Copy $(USER_ADMIN_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(USER_ADMIN_DIR) && npm run start:dev

run-procurement:
	@test -f $(PROC_DIR)/.env || (echo "Copy $(PROC_DIR)/.env.example → .env (same secrets as capexbe)" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(PROC_DIR) && npm run start:dev

run-fs:
	@test -f $(FS_DIR)/.env || (echo "Copy $(FS_DIR)/.env.example → .env" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(FS_DIR) && npm run start:dev

run-monitoring:
	@test -f $(MON_DIR)/.env || (echo "Copy $(MON_DIR)/.env.example → .env" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(MON_DIR) && npm run start:dev

run-reporting:
	@test -f $(REPORTING_DIR)/.env || (echo "Copy $(REPORTING_DIR)/.env.example → .env" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(REPORTING_DIR) && npm run start:dev

run-executive-summary:
	@test -f $(EXEC_SUMMARY_DIR)/.env || (echo "Copy $(EXEC_SUMMARY_DIR)/.env.example → .env" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(EXEC_SUMMARY_DIR) && npm run start:dev

run-tasks:
	@test -f $(TASKS_DIR)/.env || (echo "Copy $(TASKS_DIR)/.env.example → .env" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(TASKS_DIR) && npm run start:dev

run-core:
	@test -f $(CORE_DIR)/.env || (echo "Copy $(CORE_DIR)/.env.example → .env" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(CORE_DIR) && npm run start:dev

run-smart-migration:
	@test -f $(MIGRATION_DIR)/.env || (echo "Copy $(MIGRATION_DIR)/.env.example → .env" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(MIGRATION_DIR) && npm run start:dev

run-auth:
	@test -f $(AUTH_DIR)/.env || (echo "Copy $(AUTH_DIR)/.env.example → .env" && exit 1)
	@test -d $(BE_DIR)/node_modules/@nestjs || (echo "Run: cd $(BE_DIR) && npm install" && exit 1)
	@cd $(AUTH_DIR) && npm run start:dev

run-all-leaf:
	@node scripts/microservices/run-all-leaf.mjs

build-all-leaf:
	@test -d $(BE_DIR)/node_modules || (echo "Run: make install" && exit 1)
	@node scripts/microservices/build-all-leaf.mjs

verify-leaf-build:
	@test -d $(BE_DIR)/node_modules || (echo "Run: make install" && exit 1)
	@node scripts/microservices/build-all-leaf.mjs --canary

shadow-notifications:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_NOTIFICATIONS_URL=$${CAPEX_SERVICE_NOTIFICATIONS_URL:-http://127.0.0.1:$(NOTIF_PORT)} \
	  node scripts/microservices/shadow-test-notifications.mjs

verify-bff-routing:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  node scripts/microservices/verify-bff-routing.mjs

verify-phase1:
	@cd $(FE_DIR) && npm run verify:service-routes
	@$(MAKE) verify-bff-routing
	@$(MAKE) shadow-notifications

verify-phase2:
	@$(MAKE) shadow-phase2

verify-microservices: verify-phase1 verify-phase2 verify-phase4 verify-phase5a verify-phase5b verify-phase5c verify-phase5d verify-phase5 verify-phase6 verify-phase7a verify-phase7b verify-phase7c verify-phase7d verify-phase7e verify-phase8 verify-phase10

verify-phase10:
	@$(MAKE) shadow-auth

verify-phase8:
	@$(MAKE) shadow-smart-migration

verify-phase7e:
	@$(MAKE) shadow-core

verify-phase7d:
	@$(MAKE) shadow-tasks

verify-phase7c:
	@$(MAKE) shadow-executive-summary

verify-phase7b:
	@$(MAKE) shadow-reporting

verify-phase7a:
	@$(MAKE) shadow-monitoring

verify-phase6:
	@$(MAKE) shadow-fs

verify-phase5:
	@$(MAKE) shadow-procurement

verify-phase5d:
	@$(MAKE) shadow-user-admin

verify-phase5c:
	@$(MAKE) shadow-duplicate-detection

verify-phase5b:
	@$(MAKE) shadow-asset-timeline

verify-phase5a:
	@$(MAKE) shadow-mom-daily-summary

verify-phase4:
	@$(MAKE) shadow-phase4

verify-phase3:
	@node scripts/microservices/verify-auth-core.mjs

verify-cross-hu-scope:
	@node scripts/microservices/verify-cross-hu-scope.mjs

verify-phase11: verify-microservices-static verify-phase3 verify-cross-hu-scope verify-phase12-domains verify-nest-symlinks verify-leaf-build

verify-prod-readiness:
	@node scripts/microservices/verify-prod-readiness.mjs

verify-no-prod-hardcode:
	@node scripts/microservices/verify-no-prod-hardcode.mjs

verify-nest-symlinks:
	@node scripts/microservices/verify-nest-symlinks.mjs

verify-phase12-domains:
	@node scripts/microservices/verify-phase12-domains.mjs

verify-phase12-notifications: verify-phase12-domains

verify-microservices-static:
	@node scripts/microservices/verify-static.mjs
	@cd $(FE_DIR) && npm run verify:service-routes

verify-compose-config:
	@node scripts/microservices/verify-compose-config.mjs

verify-bff-health:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  node scripts/microservices/verify-bff-health.mjs

verify-all: verify-microservices verify-phase3

shadow-phase2:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_AUDIT_URL=$${CAPEX_SERVICE_AUDIT_URL:-http://127.0.0.1:$(AUDIT_PORT)} \
	  CAPEX_SERVICE_BACKUP_URL=$${CAPEX_SERVICE_BACKUP_URL:-http://127.0.0.1:$(BACKUP_PORT)} \
	  node scripts/microservices/shadow-test-phase2.mjs

shadow-mom-daily-summary:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_MOM_DAILY_SUMMARY_URL=$${CAPEX_SERVICE_MOM_DAILY_SUMMARY_URL:-http://127.0.0.1:$(MOM_PORT)} \
	  node scripts/microservices/shadow-test-mom-daily-summary.mjs

shadow-asset-timeline:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_ASSET_TIMELINE_URL=$${CAPEX_SERVICE_ASSET_TIMELINE_URL:-http://127.0.0.1:$(TIMELINE_PORT)} \
	  node scripts/microservices/shadow-test-asset-timeline.mjs

shadow-duplicate-detection:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_DUPLICATE_DETECTION_URL=$${CAPEX_SERVICE_DUPLICATE_DETECTION_URL:-http://127.0.0.1:$(DUP_PORT)} \
	  node scripts/microservices/shadow-test-duplicate-detection.mjs

shadow-user-admin:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_USER_ADMIN_URL=$${CAPEX_SERVICE_USER_ADMIN_URL:-http://127.0.0.1:$(USER_ADMIN_PORT)} \
	  node scripts/microservices/shadow-test-user-admin.mjs

shadow-procurement:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_PROCUREMENT_URL=$${CAPEX_SERVICE_PROCUREMENT_URL:-http://127.0.0.1:$(PROC_PORT)} \
	  node scripts/microservices/shadow-test-procurement.mjs

shadow-fs:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_FS_URL=$${CAPEX_SERVICE_FS_URL:-http://127.0.0.1:$(FS_PORT)} \
	  node scripts/microservices/shadow-test-fs.mjs

shadow-monitoring:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_MONITORING_URL=$${CAPEX_SERVICE_MONITORING_URL:-http://127.0.0.1:$(MON_PORT)} \
	  node scripts/microservices/shadow-test-monitoring.mjs

shadow-reporting:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_REPORTING_URL=$${CAPEX_SERVICE_REPORTING_URL:-http://127.0.0.1:$(REPORTING_PORT)} \
	  node scripts/microservices/shadow-test-reporting.mjs

shadow-executive-summary:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_EXECUTIVE_SUMMARY_URL=$${CAPEX_SERVICE_EXECUTIVE_SUMMARY_URL:-http://127.0.0.1:$(EXEC_SUMMARY_PORT)} \
	  node scripts/microservices/shadow-test-executive-summary.mjs

shadow-tasks:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_TASKS_URL=$${CAPEX_SERVICE_TASKS_URL:-http://127.0.0.1:$(TASKS_PORT)} \
	  node scripts/microservices/shadow-test-tasks.mjs

shadow-core:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_CORE_URL=$${CAPEX_SERVICE_CORE_URL:-http://127.0.0.1:$(CORE_PORT)} \
	  node scripts/microservices/shadow-test-core.mjs

shadow-smart-migration:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_SMART_MIGRATION_URL=$${CAPEX_SERVICE_SMART_MIGRATION_URL:-http://127.0.0.1:$(MIGRATION_PORT)} \
	  node scripts/microservices/shadow-test-smart-migration.mjs

shadow-auth:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_AUTH_URL=$${CAPEX_SERVICE_AUTH_URL:-http://127.0.0.1:$(AUTH_PORT)} \
	  node scripts/microservices/shadow-test-auth.mjs

shadow-phase4:
	@test -f $(FE_DIR)/.env.local || (echo "Missing $(FE_DIR)/.env.local" && exit 1)
	@set -a && . $(FE_DIR)/.env.local && set +a && \
	  CAPEX_SERVICE_CONFIGURATION_URL=$${CAPEX_SERVICE_CONFIGURATION_URL:-http://127.0.0.1:$(CONFIG_PORT)} \
	  node scripts/microservices/shadow-test-phase4.mjs

stop:
	@-lsof -ti:$(FE_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(BE_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(NOTIF_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(AUDIT_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(BACKUP_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(CONFIG_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(MOM_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(TIMELINE_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(DUP_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(USER_ADMIN_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(PROC_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(FS_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(MON_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(REPORTING_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(EXEC_SUMMARY_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(TASKS_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(CORE_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(MIGRATION_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(AUTH_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@echo "Stopped (if anything was running on :$(FE_PORT) / :$(BE_PORT) / leaf ports :$(NOTIF_PORT)-:$(AUTH_PORT))."

tunnel-help:
	@chmod +x scripts/cursor-tunnel-help.sh
	@./scripts/cursor-tunnel-help.sh

tunnel-cf:
	@chmod +x scripts/start-public-tunnel.sh
	@./scripts/start-public-tunnel.sh 3000

run-tunnel-demo:
	@chmod +x scripts/run-tunnel-demo.sh
	@./scripts/run-tunnel-demo.sh 3000

redis-up:
	@docker compose -f deploy/docker-compose.redis.yml up -d
	@echo "Redis running on :6379 — REDIS_URL=redis://127.0.0.1:6379 in capexbe/.env"

redis-down:
	@docker compose -f deploy/docker-compose.redis.yml down

redis-status:
	@docker compose -f deploy/docker-compose.redis.yml ps

COMPOSE_FILE := deploy/docker-compose.microservices.yml
COMPOSE_ENV  := deploy/.env.compose

compose-env:
	@test -f $(BE_DIR)/.env || (echo "Missing $(BE_DIR)/.env — run: make env" && exit 1)
	@node scripts/microservices/apply-compose-env.mjs

compose-config: verify-compose-config
	@if command -v docker >/dev/null 2>&1; then \
	  test -f deploy/.env.compose.ci || (echo "Missing deploy/.env.compose.ci" && exit 1); \
	  docker compose -f $(COMPOSE_FILE) --env-file deploy/.env.compose.ci config --quiet \
	    && echo "OK  docker compose config (CI env)"; \
	else \
	  echo "SKIP docker compose config — docker not installed"; \
	fi

compose-build: compose-env
	docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) build

compose-up: compose-env
	docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) up -d
	@echo "Stack up — http://localhost:3000 (wait ~60s then: make compose-verify)"

compose-down:
	docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) down 2>/dev/null || docker compose -f $(COMPOSE_FILE) down

compose-verify:
	@node scripts/microservices/verify-compose-health.mjs

# Independent production — one command full stack
prod-check: compose-verify

prod-up: compose-env compose-build compose-up
	@echo "Waiting 45s for services to boot..."
	@sleep 45
	@$(MAKE) compose-verify

sync-leaf-env:
	@test -f $(BE_DIR)/.env || (echo "Missing $(BE_DIR)/.env — run: make env" && exit 1)
	@node scripts/microservices/sync-leaf-env.mjs $(if $(FORCE),--force,)

compose-logs:
	docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_ENV) logs -f --tail=100
