# CAPEX PRO — Cloud Architecture & Security Design

**Siloam Hospitals | Low Level Architecture (LLA) | Internal Use**

Pattern: **VPS + Docker + Cloudflare + Caddy + BFF** — NOT Kubernetes

---

## Diagram Layout Guide (for image generation)

Generate as **single-page landscape diagram**, 5 horizontal sections stacked top-to-bottom:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TITLE: CAPEX PRO — Cloud Architecture & Security Design                │
│  Subtitle: Siloam Hospitals | Pattern: VPS+Docker+Cloudflare+Caddy+BFF │
│  Badge: NOT Kubernetes                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  SECTION 1: DEPLOY PIPELINE (GitHub Actions Gate)                       │
├─────────────────────────────────────────────────────────────────────────┤
│  SECTION 2: RUNTIME TRAFFIC & SECURITY LAYERS                         │
├─────────────────────────────────────────────────────────────────────────┤
│  SECTION 3: SECURITY DESIGN (Defense in Depth) — sidebar box           │
├─────────────────────────────────────────────────────────────────────────┤
│  SECTION 4 + 5: PLATFORM & MODULE | PORTS (VPS) — footer row            │
└─────────────────────────────────────────────────────────────────────────┘
```

Color zones:
- Deploy pipeline: purple/lavender background
- Runtime layers: blue gradient (L1 browser → L4 data)
- Security sidebar: grey box right side
- Footer: dark blue bars for Platform + Ports

---

## SECTION 1 — Deploy Pipeline (GitHub Actions Gate)

**Subtitle:** All gates on GitHub — fail = code does NOT reach VPS

```
Developer (Local Dev)
  - git push -> main -
GitHub Actions — Security Gate [GATE 1]
  • npm ci
  • verify:middleware / verify:query-safety
  • build:secure (compiler)
  [FAIL -> deploy job blocked, VPS unchanged]
  - build OK -
Docker Build (Node 22 Alpine)
  • 2 images: capex-web + capex-api
  [FAIL -> no image push]
  - push image -
GHCR (GitHub Container Registry)
  • ghcr.io/owner/capex-web:latest + :sha
  • Images immutable once pushed
  - SSH deploy -
SSH Deploy -> VPS
  • docker login ghcr.io
  • docker compose pull
  • docker compose up -d
  • smoke test curl
  [smoke FAIL -> exit 1, manual rollback]
  - pull + up -
VPS Production State
  • Docker Compose /opt/capex-deploy
  • 2 containers: capex-web (:8080) + capex-api (:8082)
```

**Gate rules (callout box):**
- Gate 1 FAIL -> deploy job never runs -> VPS unchanged
- Docker build FAIL -> no image push -> VPS unchanged
- Smoke test FAIL -> deploy exit 1 -> manual rollback on VPS

---

## SECTION 2 — Runtime Traffic & Security Layers

**Subtitle:** End-User <-> Application (bidirectional HTTPS)

### Layer 1 — End User Browser
- Siloam staff browser
- HTTPS :443 only (public)

### Layer 2 — Cloudflare Edge (ops-managed)
- DNS: capex.siloamhospitals.com
- Reverse Proxy
- WAF (Web Application Firewall)
- DDoS Protection
- SSL/TLS at edge

### Layer 3 — VPS Ubuntu

**Caddy Gateway** (`/opt/gateway`)
- Reverse proxy on host
- Forwards to localhost only

**Docker Compose** (`/opt/capex-deploy`)

| Container | Stack | Port (host) | Role |
|-----------|-------|-------------|------|
| **capex-web** | Next.js + BFF | :8080 | Middleware JWT/CSRF/CSP, httpOnly session, rate limit |
| **capex-api** | NestJS monolith | :8082 | Business logic, JWT + RBAC guards, Redis throttle |

**Internal arrow:** capex-web - POST /api/be/* (httpOnly cookies forwarded server-side) - capex-api

### Layer 4 — Data & Identity (External Cloud)

| Service | Role | Protocol |
|---------|------|----------|
| **Supabase Cloud** | Postgres + Auth Gateway | HTTPS / Postgres SSL |
| **Azure Entra ID** | SSO OAuth 2.0 | HTTPS |
| **Redis** | Cache, rate limit, session | TCP internal |
| **GHCR** | Image registry (deploy only) | HTTPS |

**Traffic flow one-liner:**
```
User Browser - Cloudflare - Caddy - capex-web (BFF) - capex-api - Supabase
```

---

## SECTION 3 — Security Design (Defense in Depth)

**Sidebar box — place on right side of Section 2**

| Layer | Control |
|-------|---------|
| **L0 Edge** | Cloudflare: WAF, DDoS, SSL |
| **L1 Gateway** | Caddy reverse proxy |
| **L2 App Edge** | Middleware: JWT, CSRF, CSP, rate limit |
| **L3 BFF** | httpOnly cookies, POST-only /api/be, server-side token forward |
| **L4 Backend API** | JWT + RBAC, throttling, session rotation |
| **L5 Data** | Postgres SSL + RLS, scoped by HU/archetype |

**Key rules:**
- No JWT in localStorage / JavaScript
- No direct Supabase access from browser
- CSP nonce in production
- SSO only — @siloamhospitals.com domain gate
- Build fail = blocked from VPS

---

## SECTION 4 — Platform & Module (Production)

| Item | Value |
|------|-------|
| **Platform** | VPS Ubuntu + Docker Compose |
| **NOT** | Kubernetes |
| **capex-web** | Next.js BFF + UI — port 8080 |
| **capex-api** | NestJS monolith — port 8082 |
| **Total containers** | 2 |

---

## SECTION 5 — Ports (VPS)

| Port | Exposure | Path |
|------|----------|------|
| **443** | Public | Cloudflare -> Caddy |
| **8080** | Private (localhost) | capex-web |
| **8082** | Private (localhost) | capex-api |

Backend ports NOT exposed to internet — Caddy forwards only.

---

## GPT Image Generation Prompt

Copy-paste to generate diagram matching this structure:

```
Create a professional corporate Low Level Architecture diagram, landscape A4, titled "CAPEX PRO — Cloud Architecture & Security Design".

Subtitle: "Siloam Hospitals | Pattern: VPS + Docker + Cloudflare + Caddy + BFF — NOT Kubernetes"

SECTION 1 (top, purple/lavender background) — "DEPLOY PIPELINE (GitHub Actions Gate)":
Horizontal flow: Developer -> GitHub Actions Security Gate (npm ci, verify, build:secure) -> Docker Build (Node 22 Alpine, 2 images) -> GHCR -> SSH Deploy VPS -> VPS Production (2 containers).
Red callout: "FAIL = VPS unchanged"

SECTION 2 (middle, blue layers) — "RUNTIME TRAFFIC & SECURITY LAYERS":
Vertical layers top to bottom:
- Layer 1: End User Browser (HTTPS :443)
- Layer 2: Cloudflare Edge (DNS, WAF, DDoS, SSL)
- Layer 3: VPS Ubuntu with Caddy Gateway and Docker Compose box containing capex-web (Next.js BFF :8080) and capex-api (NestJS :8082)
- Layer 4: External cloud boxes: Supabase, Azure Entra ID, Redis, GHCR
Arrow: capex-web POST /api/be/* to capex-api

SECTION 3 (right sidebar, grey) — "SECURITY DESIGN (Defense in Depth)":
L0 Cloudflare -> L1 Caddy -> L2 Middleware -> L3 BFF -> L4 Backend -> L5 Data
Rules: httpOnly cookies, no JWT in JS, no browser to Supabase direct

SECTION 4+5 (bottom footer, dark blue bars):
Platform: VPS Ubuntu, Docker Compose, 2 containers
Ports: 443 public, 8080/8082 private localhost

Corporate style, clean flat design, readable labels, no cartoon.
```

---

## Form Answer (Architecture Sheet column)

```
Attached in Architecture Sheet — Low Level Architecture diagram covers:
Deploy Pipeline (GitHub Actions -> GHCR -> VPS),
Runtime Traffic (Browser - Cloudflare - Caddy - BFF - Backend API - Database),
Security layers L0-L5, 2 Docker containers on VPS, ports 443/8080/8082.
```

---

*For Traffic Flow Sheet use companion doc: `capex-cloud-architecture.md`*
