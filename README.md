# Capex Pro

Monorepo CAPEX Pro (Siloam): **Next.js** (`capex-apps`) + **Nest** (`capexbe`) + Postgres/PostgREST (+ Redis opsional).

Sign-in **production** = **Microsoft SSO only** (`CAPEX_AUTH_MODE=sso`, `CAPEX_DEMO_MODE=false`). Tidak ada pintu demo / password form.

| Dokumen | Isi |
|---------|-----|
| [RELEASES.md](./RELEASES.md) | Changelog per versi (`Major.Minor.Patch.Build`) |
| README ini | Cara bump versi, mode auth, optimasi yang aktif sekarang |

---

## Versi — skema & step bump

Skema: **`Major.Minor.Patch.Build`** (contoh `1.1.1.4`).

| Segmen | Kapan naik |
|--------|------------|
| Major | Breaking / ganti platform besar |
| Minor | Fitur bisnis / arsitektur baru |
| Patch | Hardening, bugfix, keamanan |
| Build | Hotfix / iterasi kecil dalam patch yang sama |

### Step rilis (ringkas)

1. Kerjakan perubahan di branch / `main` lokal; pastikan `make check` (atau smoke login SSO) OK.
2. Tulis entri baru di **atas** [RELEASES.md](./RELEASES.md) (versi + tanggal + ringkasan + cara verifikasi).
3. Update baris “versi sekarang” di README ini bila perlu.
4. Commit dengan pesan fokus **why** (bukan daftar file).
5. `git push -u origin HEAD` (atau push branch + PR).
6. Setelah merge `main`: cek deploy GHA + SonarCloud bila relevan.

Jangan commit `.env` / secret. Contoh auth ada di `capex-apps/.env.example` dan `capexbe/.env.example`.

---

## Versi sekarang

**`1.1.1.4`** (23 Agustus 2026) — lihat [RELEASES.md](./RELEASES.md).

---

## Sign-in: production vs lokal

| Mode | FE | BE | UI login |
|----------|----|----------|
| **Production (default)** | `NEXT_PUBLIC_CAPEX_AUTH_MODE=sso` · `NEXT_PUBLIC_CAPEX_DEMO_MODE=false` | `CAPEX_AUTH_MODE=sso` · `CAPEX_DEMO_MODE=false` | Tombol Microsoft saja |
| Demo / LAN | `NEXT_PUBLIC_CAPEX_DEMO_MODE=true` | `CAPEX_DEMO_MODE=true` | Pintu “dev enter” (hanya jika flag on) |
| Password (emergency) | `NEXT_PUBLIC_CAPEX_AUTH_MODE=password` atau `both` | mirror di BE | Form email/password |

Lokal VPS Postgres: `USE_VPS_POSTGRES=1` + tunnel (`deploy/postgres/ensure-vps-dev.sh`) — **bukan** mengubah mode SSO production.

---

## Optimasi & hardening yang aktif (ringkas)

### Auth / session
- BFF httpOnly cookies + CSRF; refresh tanpa cookie → **204** (hindari spam 401 di console).
- Logout setelah refresh gagal meski cookie sudah kosong (hindari “zombie session” + poll 401).
- Overlay masuk/keluar disederhanakan (`AuthBusyOverlay`).
- Bootstrap pack **tidak** dipanggil untuk guest (tanpa cache user stale).

### Product / UX
- Capex Project List: search scoped + banner di luar RBAC; flush Cari/Enter; overlay “Mencari…”.
- Budget HU: sync `isDirtyRef` segera; stamp peer sync timeout 12s.

### Keamanan / a11y (lanjutan dari 1.1.1.x)
- SSO-only + domain Siloam; permission matrix server-authoritative.
- Sonar a11y: `type="button"`, label `htmlFor`, klik → button/keyboard, `aria-hidden` di sel virtual.
- Monolit: leaf microservices dihapus dari surface deploy.

### Ops
- Compose Siloam: `deploy/docker-compose.siloam.yml`.
- `make run` / `make check` untuk FE+BE (+ tunnel DB bila VPS).
- Redis opsional (`REDIS_URL`); tanpa Redis = memory cache (tanpa wajib lokal Redis).

### Integrasi data
- Trigger Postgres `send_asset_to_power_automate` (pg_net) di VPS — outbound ke Power Automate (dokumentasikan ke IT bila berubah).

---

## Perintah berguna

```bash
make check          # env + DB/PostgREST
make run            # BE :3001 + FE :3000
# Opsional:
# make compose-up && make compose-verify
```

---

## Catatan

- `RELEASES.md` = sumber kebenaran changelog.
- README ini = panduan proses + snapshot optimasi; jangan duplikasi changelog panjang di sini.
