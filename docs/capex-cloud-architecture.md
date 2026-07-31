# CAPEX PRO — Cloud Architecture & Security Design

**Siloam Hospitals | Internal Use | Verified from Repository**

---

## ⚠️ Diagram GPT Hub-Spoke Kubernetes = BUKAN Design Kita

Gambar referensi IT (Hub-Spoke + Kubernetes Cluster + User Nodepool + Service Mesh + Flux CD) **tidak menggambarkan Capex Pro**.

| Elemen di diagram IT standard | Capex Pro actual |
|------------------------------|------------------|
| Kubernetes Cluster | ❌ **Tidak** — VPS + Docker Compose |
| Hub-Spoke network peering | ❌ **Tidak** — single VPS + Cloudflare edge |
| WAF / API Gateway (in-cluster) | ✅ Cloudflare WAF di **edge** (ops-managed) |
| Ingress Controller + Service Mesh | ❌ **Tidak** — Caddy reverse proxy di VPS |
| 10+ microservices di K8s nodepool | ❌ **Tidak di production CI/CD** — 2 container (web + api monolith) |
| Key Vault / Container Registry (Azure) | ✅ GHCR (GitHub Container Registry) |
| Flux CD / Secrets CSI | ❌ **Tidak** — GitHub Actions + SSH deploy |

**Kesimpulan:** Pattern kita = **VPS + Docker + Cloudflare + Caddy + BFF**, bukan cloud-native K8s hub-spoke.

---

## 1. Pattern Architecture Kita (Actual)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DEPLOY PIPELINE                                  │
│  (semua gate di GitHub — gagal = TIDAK masuk VPS)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Developer ──git push──▶ GitHub Actions                                  │
│                              │                                           │
│                    ┌─────────▼─────────┐                                 │
│                    │  JOB: security    │  ◀── GATE 1                    │
│                    │  npm ci           │                                 │
│                    │  verify:middleware│                                 │
│                    │  build:secure     │                                 │
│                    └─────────┬─────────┘                                 │
│                              │ PASS only                                 │
│                    ┌─────────▼─────────┐                                 │
│                    │  JOB: deploy      │  ◀── GATE 2 (needs: security) │
│                    │  Docker build     │                                 │
│                    │  push → GHCR      │                                 │
│                    │  SSH → VPS        │                                 │
│                    │  compose pull/up  │                                 │
│                    └─────────┬─────────┘                                 │
│                              │                                           │
│                    ┌─────────▼─────────┐                                 │
│                    │  VPS              │                                 │
│                    │  2 containers     │                                 │
│                    └───────────────────┘                                 │
│                                                                          │
│  ❌ Gate 1 FAIL → job deploy TIDAK jalan → VPS tidak berubah            │
│  ❌ Docker build FAIL → image tidak push → VPS tidak pull versi baru    │
│  ❌ SSH/smoke FAIL → deploy job exit 1 → rollback manual di VPS          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Evidence:** `deploy-web.yml` line 51-53: `deploy` job has `needs: security` — security fail = no deploy.

---

## 2. Runtime Traffic Flow (End-User ↔ App)

```
                    HTTPS :443 only (public)
                            │
┌──────────┐    ┌───────────▼───────────┐    ┌────────────────────────────┐
│ End User │───▶│ CLOUDFLARE (Edge)     │───▶│ VPS — Ubuntu               │
│ Browser  │◀───│ • DNS                 │    │                            │
└──────────┘    │ • Reverse Proxy       │    │  ┌──────────────────────┐  │
                │ • WAF                 │    │  │ CADDY                │  │
                │ • DDoS protection     │    │  │ /opt/gateway         │  │
                │ • SSL/TLS (edge)      │    │  │ → localhost only     │  │
                └───────────────────────┘    │  └──────────┬───────────┘  │
                                             │             │               │
                                             │  ┌──────────▼───────────┐  │
                                             │  │ DOCKER COMPOSE       │  │
                                             │  │ /opt/capex-deploy    │  │
                                             │  │                      │  │
                                             │  │ ┌────────┐ ┌───────┐ │  │
                                             │  │ │capex-  │ │capex- │ │  │
                                             │  │ │web     │─│api    │ │  │
                                             │  │ │:8080   │ │:8082  │ │  │
                                             │  │ └────────┘ └───────┘ │  │
                                             │  └──────────────────────┘  │
                                             └─────────────┬──────────────┘
                                                           │ Postgres SSL
                              ┌────────────────────────────┼──────────────┐
                              ▼                            ▼              ▼
                       Supabase Cloud              Azure Entra       GHCR
                       (Postgres + Auth)           (SSO OAuth)    (images)
```

**Yang TIDAK exposed ke internet:**
- Port Docker backend (`8080`, `8082`) — hanya localhost, diakses via Caddy
- Supabase credentials — server-side only
- JWT secrets — server-side only, never in browser JS bundle

---

## 3. Security Design — Defense in Depth

### Layer 0 — Edge (Cloudflare, ops-managed)

| Control | Fungsi |
|---------|--------|
| DNS | `capex.siloamhospitals.com` |
| Proxy | Semua traffic lewat Cloudflare dulu |
| WAF | Block malicious requests sebelum sampai VPS |
| DDoS | Rate limiting & absorption di edge |
| SSL/TLS | HTTPS enforced |

> Config Cloudflare di dashboard ops — **tidak ada di app repo** (`SECURITY.md`: "ops manual").

---

### Layer 1 — Gateway VPS (Caddy)

| Control | Fungsi |
|---------|--------|
| Reverse proxy | Forward ke `127.0.0.1:8080` (web) saja |
| TLS termination | HTTPS ke origin (atau Cloudflare Full Strict) |
| Host routing | Hanya domain yang diizinkan |

**Evidence:** `deploy/maintenance/install-on-vps.sh` — Caddy di `/opt/gateway`

---

### Layer 2 — Application Edge (capex-web middleware)

**File:** `capex-apps/middleware.ts`

| Control | Behavior |
|---------|----------|
| Session gate | No valid JWT → redirect login |
| CSRF | Double-submit cookie + header match untuk POST `/api/be` |
| Path allowlist | Unknown `/api/*` → **deny** |
| Rate limit | Login 8/15min, BFF proxy 180 POST/min/IP |
| CSP | Nonce-based Content Security Policy (prod) |

---

### Layer 3 — BFF (Backend-for-Frontend)

**Files:** `beProxy.ts`, `authBff.ts`, `bePathAllowlist.ts`

| Control | Behavior |
|---------|----------|
| **httpOnly cookies only** | Token session **tidak pernah** di `localStorage` / JS |
| POST-only data API | GET ke `/api/be` diblok — no URL/cache leakage |
| Server-side cookie forward | Browser tidak tahu backend URL/token |
| Path traversal block | `..` dan encoded dots ditolak |
| Auto token refresh | Refresh server-side sebelum forward ke backend |
| Build-time secret scan | `build:secure` — block Supabase/Gemini keys di client bundle |

#### Cookie model (httpOnly only)

```
Set by server (Set-Cookie):
  capex_access   → httpOnly + Secure + SameSite=Strict
  capex_refresh  → httpOnly + Secure + SameSite=Strict
  csrf_token     → readable by JS (needed for CSRF header only)

NOT stored in browser:
  ❌ localStorage session token
  ❌ Supabase anon key in client bundle (prod)
  ❌ JWT_ACCESS_SECRET in client
  ❌ Direct Supabase REST calls from browser
```

**Invariant:** Semua data bisnis = `POST /api/be/*` same-origin → BFF proxy → backend.

---

### Layer 4 — Backend API (capex-api monolith)

**File:** `capexbe/src/app.module.ts`

```
Request
  → ThrottlerGuard (400/min, Redis-backed)
    → JwtAuthGuard (JWT + session active)
      → RolesGuard
        → PermissionsGuard
          → Service logic (double AuthZ check on high-risk ops)
            → Supabase Postgres (RLS + scope by HU/archetype)
```

| Auth hardening | Detail |
|----------------|--------|
| SSO only (prod) | Password login disabled |
| Domain gate | `@siloamhospitals.com` |
| Session rotation | Refresh token family tracking |
| Reuse detection | Revoke entire session family |
| Idle timeout | 3 jam + tab-hidden logout |
| Account lockout | Redis-backed |

---

### Layer 5 — Data (Supabase Cloud)

| Control | Detail |
|---------|--------|
| Postgres SSL | Encrypted in transit |
| RLS | Row Level Security di database |
| Scope | Query filtered by HU / archetype / RBAC |
| No browser direct access | Browser **tidak** hit Supabase REST untuk data bisnis |

---

## 4. CI/CD Gate Detail (Build Fail = Blocked from VPS)

### deploy-web.yml flow

```
push main (capex-apps/**)
        │
        ▼
┌───────────────────┐
│ job: security     │
│ • npm ci          │
│ • npm audit       │
│ • verify:middleware│
│ • build:secure    │──── FAIL ──▶ ❌ STOP (deploy tidak jalan)
└─────────┬─────────┘
          │ PASS
          ▼
┌───────────────────┐
│ job: deploy       │  needs: security
│ • docker build    │──── FAIL ──▶ ❌ STOP (no image push)
│ • push GHCR       │
│ • SSH VPS         │
│ • compose pull web│
│ • compose up web  │
└───────────────────┘
```

### deploy-api.yml flow

```
push main (capexbe/**)
        │
        ▼
┌───────────────────┐
│ job: security     │
│ • npm ci          │
│ • verify:query-safety│
│ • npm run build   │──── FAIL ──▶ ❌ STOP
│ • unit tests      │
└─────────┬─────────┘
          │ PASS
          ▼
┌───────────────────┐
│ job: deploy       │  needs: security
│ • docker build    │
│ • push GHCR       │
│ • SSH VPS         │
│ • compose up api  │
│ • smoke curl :8082│──── FAIL ──▶ ❌ deploy job exit 1
└───────────────────┘
```

**Poin kunci untuk IT:**
- Code **tidak langsung** masuk VPS — harus lewat compile + security gate dulu
- Gagal build/security = **zero deployment** ke production
- Image immutable di GHCR — VPS hanya pull image yang sudah verified

---

## 5. Module Count (Production)

| | Count | Name |
|---|-------|------|
| Frontend | **1** | `capex-web` (Next.js BFF + React UI) |
| Backend | **1** | `capex-api` (NestJS monolith) |
| **Total via CI/CD** | **2** | |

Bukan 4, bukan 19 — kecuali VPS confirmed manual deploy microservices stack.

---

## 6. Prompt GPT — Design Kita (BUKAN Kubernetes)

Copy prompt ini ke GPT. **Jangan** pakai prompt hub-spoke K8s.

```
Create a professional corporate IT architecture diagram for CAPEX PRO application.
IMPORTANT: This is NOT Kubernetes. Do NOT draw K8s cluster, nodepools, service mesh, or hub-spoke peering.

Style: clean flat enterprise diagram, white background, landscape A4, readable labels.

=== SECTION 1: CI/CD Pipeline (top, horizontal) ===

Title: "CAPEX PRO — Deploy Pipeline (GitHub Actions Gate)"

Flow left to right:
1. "Developer" — git push to main
2. "GitHub Actions — Security Gate" box with checklist:
   - npm ci
   - verify:middleware / verify:query-safety
   - npm run build:secure (compiler)
   RED X arrow labeled "FAIL → blocked, no deploy"
3. "Docker Build" — Node 22 Alpine, build image
4. "GHCR" — GitHub Container Registry (capex-web + capex-api)
5. "SSH Deploy VPS" — docker compose pull + up
6. "VPS /opt/capex-deploy" — 2 containers running

Show clearly: security gate FAIL means deploy job never runs, code never reaches VPS.

=== SECTION 2: Runtime + Security (bottom, vertical layers) ===

Title: "CAPEX PRO — Runtime Traffic & Security Layers"

Top to bottom layers (like a security onion):

Layer 1 — "End User Browser" (blue)

Layer 2 — "Cloudflare Edge" (orange border):
  DNS, Reverse Proxy, WAF, DDoS, SSL/TLS

Layer 3 — "VPS Ubuntu" (yellow border):
  Sub-layer: "Caddy Gateway /opt/gateway" — reverse proxy to localhost only
  Sub-layer: "Docker Compose" with 2 boxes:
    - "capex-web" (green): Next.js BFF, middleware JWT/CSRF/CSP, port 8080
    - "capex-api" (gray): NestJS monolith, JWT+RBAC guards, port 8082
  Arrow between them: "POST /api/be/* (httpOnly cookies forwarded server-side)"

Layer 4 — "External Cloud" (pink):
  Supabase Postgres (SSL), Azure Entra SSO (OAuth)

=== SECTION 3: Security callout box ===

Small box on the right:
"Security Design:
• httpOnly + Secure + SameSite=Strict cookies
• No JWT/token in JavaScript/localStorage
• No direct Supabase access from browser
• BFF-only data path (POST /api/be)
• CSRF double-submit
• CSP nonce (prod)
• SSO only (@siloamhospitals.com)
• Build fail = blocked from VPS"

Footer: "Platform: VPS + Docker Compose | NOT Kubernetes | 2 containers production"

No cartoon, no 3D, corporate grayscale with subtle color zones.
```

---

## 7. Teks Balasan ke Tim IT

```
Design cloud Capex Pro — berbeda dari standard Hub-Spoke Kubernetes:

Platform     : VPS Ubuntu + Docker Compose (BUKAN Kubernetes)
Deploy       : GitHub Actions → security gate → Docker build → GHCR → SSH VPS
Gate         : Build/security FAIL = code TIDAK masuk VPS (needs: security job)
Containers   : 2 production (capex-web BFF + capex-api monolith)
Edge         : Cloudflare (DNS, proxy, WAF, DDoS) — ops-managed
Gateway VPS  : Caddy /opt/gateway → localhost Docker only
Database     : Supabase Cloud Postgres (SSL)
Auth         : Microsoft Azure Entra SSO

Security pattern:
• Session via httpOnly cookies only (not localStorage/JS)
• All business data via BFF POST /api/be — no browser→Supabase direct
• Middleware: JWT verify, CSRF, CSP, rate limit, path allowlist
• Backend: JWT + RBAC guards, throttling, account lockout
• Prod: SSO only, @siloamhospitals.com domain gate

Traffic: User → Cloudflare → Caddy → capex-web → capex-api → Supabase
```

---

## 8. Fact Check (Quick Reference)

| Klaim | Benar? |
|-------|--------|
| Hub-Spoke Kubernetes | ❌ Bukan design kita |
| Docker Compose VPS | ✅ |
| Cloudflare WAF edge | ✅ (ops-managed) |
| Caddy reverse proxy | ✅ |
| GitHub Actions CI/CD | ✅ |
| Build fail blocks VPS deploy | ✅ (`needs: security`) |
| httpOnly cookie session | ✅ |
| 2 modules production CI/CD | ✅ |
| 19 microservices production | ❌ (manual only, not CI/CD) |

---

*Evidence: `.github/workflows/deploy-*.yml`, `SECURITY.md`, `middleware.ts`, `beProxy.ts`, `authBff.ts`, `install-on-vps.sh`*
