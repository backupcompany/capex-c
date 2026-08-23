# CAPEX Pro — Update Releases

Skema versi: **`Major.Minor.Patch.Build`** (contoh `1.1.1.4`).

| Segmen | Arti |
|--------|------|
| Major | Breaking / platform besar |
| Minor | Fitur bisnis / arsitektur |
| Patch | Hardening, bug fix, keamanan |
| Build | Hotfix / iterasi kecil dalam patch yang sama |

**Runtime target:** monolit Siloam (`capex-web` + `capex-api` + Postgres/PostgREST + Redis).  
**Panduan bump / optimasi:** lihat [README.md](./README.md).

---

## 1.1.1.4 — 23 Agustus 2026

**Status:** pushed ke `main` (`eda471e`)  
**Bump:** build dari `1.1.1.3` — auth UX production, search/pipeline Project List, anti-loop session, Sonar a11y lanjutan.

### Ringkasan
Sign-in kembali **production SSO-only** (demo door off). Perbaikan session zombie (refresh gagal → logout bersih), kurangi noise 401 guest, overlay loading masuk/keluar disederhanakan, Capex Project List search lebih jelas (scoped + busy state), Budget HU dirty-ref + stamp timeout, a11y Sonar (button/label/aria).

### Auth / session
- Production: `CAPEX_AUTH_MODE=sso`, `CAPEX_DEMO_MODE=false` (FE+BE lokal).
- Refresh tanpa cookie → BFF **204** (bukan 401 merah di console).
- `authenticatedFetch` / axios: logout setelah refresh gagal **tanpa** bergantung cookie hint.
- Task notification poll stop diam pada 401.
- Bootstrap pack tidak memakai cache user saat guest.
- `AuthBusyOverlay`: spinner token Siloam + teks singkat (`Memuat…` / `Keluar…`).

### Capex Project List / Budget HU
- Search: flush Enter/Cari, debounce, overlay busy, banner hasil di luar scope RBAC.
- Pipeline: jangan `placeholderData` menahan halaman unfiltered saat filter aktif.
- Budget HU: `isDirtyRef` sync segera di `updateIsDirty`; `hu-sync-stamp` timeout 12s.

### A11y / Sonar (lanjutan)
- `type="button"` massal; label terasosiasi; klikable `div` → `button` / keyboard.
- `aria-hidden` pada sel spacer tabel virtual (bukan `<tr>`).

### Docs
- `RELEASES.md` + `README.md` di-track di git (panduan versi + optimasi).

### Cara verifikasi

```bash
make check
make run
# Login: hanya Microsoft SSO (tanpa tombol demo)
# Logout → overlay “Keluar…” lalu halaman login bersih
# Project List: Cari di luar scope → empty + penjelasan (bukan angka total lama)
```

---

## 1.1.1.3 — 21 Agustus 2026

**Status:** siap commit/push (working tree lokal)  
**Bump:** build dari `1.1.1.2` — residual expose data ditutup + rapikan repo monolit (hapus dead surface).

### Ringkasan
Monolit Siloam dikunci: SSO-only, scope/permission server-authoritative, Sonar Medium Security ditutup di source, leaf microservices & bloat deploy/scripts/packages dihapus. Residual oversharing (roles matrix View Only + MOM `scopeAll` client) **sudah di-resolve**.

---

### Keamanan (code + authz)

- **Sonar `typescript:S2245`:** seluruh `Math.random` di `capex-apps` + `capexbe` → `crypto.randomUUID` / `secureId` / `secureInt`.
- **Docker / GHA InfoSec:** `npm ci` + lockfile; `--ignore-scripts` (API: patch Nest setelah ci); Actions pin commit SHA; Dockerfile tanpa `COPY . .` rekursif.
- **SSO-only default** (`CAPEX_AUTH_MODE=sso`): password login / change-password / Sync ke Auth dimatikan di FE+BE.
- **Super Admin — Tambah User:** provision `public.users` (+ roles/scopes) tanpa password Auth (SSO).
- **Permission matrix = source of truth:** hapus bypass PMO di `assertAnyHierarchyPermission`.
- **Nav / deep-link:** screen permission **+** data scope (`canNavigateToPage`); menu scope-required disembunyikan bila user tanpa scope.
- **Notifications:** inbox sendiri tanpa butuh matrix My Task; poll FE hanya jika ada akses My Task.
- **Configuration pack:**
  - slice operasional: signed-in OK; `users` / `roles` tetap Configuration.
  - write Viewer → **403** (butuh View & Update).
  - **`roles` egress:** View Only → label saja (`permissions: []`); matrix penuh hanya View & Update (`sanitizeRolesForViewer`).
- **Scope server-authoritative (tidak bisa dilebarkan client):**
  - Capex Project List — client `scopeAll` diabaikan (sudah dari `1.1.1.1` + spec).
  - **MOM Daily Summary** — sama; client `scopeAll` / scope HU diabaikan (`1.1.1.3`).
- **Budget HU:** jangan inject HU di luar scope; clear pin/seleksi stale.
- **Project list stale check:** bandingkan ke `dbMatchedCount` (scoped empty ≠ stale vs `dbTruth`).

---

### Hapus / rapikan (kurangi attack surface + noise Sonar)

| Area | Dihapus / diganti |
|------|-------------------|
| Leaf microservices | `services/*`, `verify-microservices.yml`, compose microservices |
| Shared package | `packages/capex-auth-core` — auth sudah di `capexbe/src/auth`; Dockerfile API self-contained di `capexbe/` |
| `deploy/` | Sisakan Siloam + Redis + postgres tunnel/seed/bootstrap; hapus maintenance page, dump, skrip one-off, compose lama (production/caddy/db terpisah) |
| Root `scripts/` | Sisakan `setup-env.sh` (lokal, `make env`); hapus tunnel/verify-prod/microservices/shadow-test |
| Docs lokal | Markdown proyek selain `RELEASES.md` (gitignore) |

**Docker / CI setelah hapus package:**
- `capexbe/Dockerfile` build context = `capexbe/`
- Compose Siloam + GHA `deploy-api`: `context: capexbe`

---

### Platform / DX

- Compose default: `deploy/docker-compose.siloam.yml` (web :8080, api :8082).
- `make run` / `make check` — env + DB/PostgREST connect (`deploy/postgres/ensure-vps-dev.sh`).
- BFF auth URL: prefer `CAPEXBE_URL` / `NEXT_PUBLIC_CAPEXBE_URL`.
- Chunk asset id My Task diperketat (query).

---

### Configuration / akses (produk)

- **Users & Roles** = Super Admin set screen, CRUD, tombol, dan scope org (`All` / Network / HU).
- User tanpa scope + role yang butuh scope → data kosong **by design**; menu scope-required tidak ditampilkan.
- Setelah ubah role/scope di DB: **logout/login** agar session & matrix segar.

---

### Cara verifikasi

```bash
make check          # env + DB/PostgREST connect
make run            # BE :3001 + FE :3000
# Opsional stack VM:
# make compose-up && make compose-verify

# Setelah push: SonarCloud analysis main → Medium Security harus turun / bersih
```

**Cek residual (manual singkat):**
1. Login role **View Only** Configuration → Roles: nama ada, matrix permission kosong / tidak editable write.
2. User scoped (bukan All) + `scopeAll: true` di body MOM → response tetap terfilter scope server.
3. User tanpa scope → menu Project List / Budget HU tidak muncul.

---

### Catatan residual berikutnya (opsional, bukan blocker)

| Prioritas | Item | Usulan bump |
|-----------|------|-------------|
| P2 | Drop overload SQL `user_has_permission_for_hierarchy` yang short-circuit All | patch + SQL ops |
| P2 | FE Users & Roles: hide tombol Save untuk View Only (defense-in-depth UI) | build |

---

## 1.1.1.2 — 21 Agustus 2026 (superseded oleh 1.1.1.3)

**Status:** digabung ke `1.1.1.3` (belum terpisah di `main`).

Fokus awal: Sonar Medium Security 65, Docker/GHA hardening, hapus leaf microservices. Residual roles/MOM + cleanup `deploy`/`packages`/`scripts` diselesaikan di **1.1.1.3**.

---

## 1.1.1.1 — Agustus 2026 (baseline VM / SSO)

**Status:** sudah di `main` (commit SSO + PostgREST self-hosted)

### Highlight
- Link `auth_id` SSO ke `users.auth_id` sebelum `establishSession`.
- Cookie/session setelah Azure callback; redirect BFF absolut.
- Self-hosted Postgres/PostgREST di VM; dump restore + reload schema PostgREST.
- Docker one-shot Siloam; GHCR deploy API/Web.
- Cross-HU project list: client `scopeAll` diabaikan + spec.

---

## Riwayat singkat (lebih lama)

| Versi | Fokus |
|-------|--------|
| ≤ 1.1.0.x | App shell UX, dashboard, SSO-only domain Siloam, strangler BFF → monolit penuh |
| 1.0.x | Baseline CAPEX Pro monorepo (FE BFF + Nest API) |

*(Detail pre-1.1.1 tidak dilacak penuh di file ini.)*

---

Setelah **commit + push** `1.1.1.3`, pastikan SonarCloud analysis `main` hijau sebelum hand-off InfoSec.
