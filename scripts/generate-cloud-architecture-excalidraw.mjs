#!/usr/bin/env node
/**
 * docs/capex-cloud-architecture.excalidraw
 * Accurate cloud + traffic diagram — verified against repo deploy workflows.
 * Run: node scripts/generate-cloud-architecture-excalidraw.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/capex-cloud-architecture.excalidraw');

let seed = 200000;
let n = 0;
let ix = 0;
const id = () => `cap-${++n}-${Date.now().toString(36)}`;
const idx = () => `b${++ix}`;

function el(type, x, y, w, h, extra = {}) {
  seed += 9973;
  return {
    id: id(),
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: extra.strokeColor ?? '#1e1e1e',
    backgroundColor: extra.backgroundColor ?? 'transparent',
    fillStyle: 'solid',
    strokeWidth: extra.strokeWidth ?? 2,
    strokeStyle: extra.strokeStyle ?? 'solid',
    roughness: 0,
    opacity: 100,
    seed,
    version: 1,
    versionNonce: seed + 7,
    index: idx(),
    isDeleted: false,
    groupIds: [],
    frameId: extra.frameId ?? null,
    boundElements: extra.boundElements ?? null,
    updated: Date.now(),
    link: null,
    locked: false,
    roundness: extra.roundness ?? (type === 'rectangle' ? { type: 3 } : null),
    ...extra.rest,
  };
}

function box(x, y, w, h, bg, stroke, sw = 2) {
  return el('rectangle', x, y, w, h, { backgroundColor: bg, strokeColor: stroke, strokeWidth: sw });
}

function zone(x, y, w, h, name, bg, stroke) {
  return el('frame', x, y, w, h, {
    backgroundColor: bg,
    strokeColor: stroke,
    strokeStyle: 'dashed',
    strokeWidth: 1,
    roundness: null,
    rest: { name },
  });
}

function txt(x, y, w, h, text, opts = {}) {
  return el('text', x, y, w, h, {
    backgroundColor: 'transparent',
    strokeWidth: 1,
    rest: {
      text,
      originalText: text,
      fontSize: opts.fs ?? 14,
      fontFamily: 2,
      textAlign: opts.align ?? 'left',
      verticalAlign: opts.valign ?? 'top',
      containerId: opts.cid ?? null,
      strokeColor: opts.color ?? '#1e1e1e',
      lineHeight: 1.25,
    },
  });
}

function labeled(x, y, w, h, bg, stroke, lines, fs = 14) {
  const r = box(x, y, w, h, bg, stroke);
  const content = Array.isArray(lines) ? lines.join('\n') : lines;
  const t = txt(x + 10, y + 8, w - 20, h - 16, content, {
    fs,
    align: 'center',
    valign: 'middle',
    cid: r.id,
  });
  r.boundElements = [{ id: t.id, type: 'text' }];
  return [r, t];
}

function arr(x1, y1, x2, y2, label, color = '#364fc7') {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const a = el('arrow', x1, y1, dx, dy, {
    strokeColor: color,
    rest: {
      points: [
        [0, 0],
        [dx, dy],
      ],
      startArrowhead: null,
      endArrowhead: 'arrow',
      startBinding: null,
      endBinding: null,
    },
  });
  const out = [a];
  if (label) {
    out.push(
      txt(x1 + dx / 2 - 75, y1 + dy / 2 - 22, 150, 44, label, {
        fs: 11,
        align: 'center',
        valign: 'middle',
        color,
      }),
    );
  }
  return out;
}

function build() {
  const E = [];

  E.push(
    ...labeled(40, 12, 2040, 58, '#1e3a5f', '#1e3a5f', 'CAPEX PRO — Cloud Architecture & Traffic Flow (Verified from Repository)', 22),
  );
  E[1].strokeColor = '#ffffff';
  E.push(
    txt(40, 72, 2040, 22, 'Production deploy: VPS + Docker Compose (2 containers via CI/CD)  |  NOT Kubernetes  |  Edge: Cloudflare + Caddy/nginx (ops-managed)', {
      fs: 12,
      align: 'center',
      color: '#495057',
    }),
  );

  // ── A. CI/CD (what GitHub Actions ACTUALLY deploys) ───────────────────────
  E.push(zone(40, 108, 2040, 300, 'A. CI/CD PIPELINE — as implemented in .github/workflows/', '#f8f0fc', '#9c36b5'));

  E.push(...labeled(70, 155, 190, 95, '#dbe4ff', '#364fc7', ['Developer', 'Local codebase', 'git push → main'], 12));
  E.push(
    ...labeled(290, 145, 300, 115, '#e7f5ff', '#1971c2', [
      'GitHub Actions',
      'deploy-web.yml / deploy-api.yml',
      'Security gate: npm ci + audit',
      'Compiler: build:secure / npm run build',
      'verify:middleware / verify:query-safety',
    ], 11),
  );
  E.push(
    ...labeled(620, 145, 250, 115, '#fff3bf', '#e67700', [
      'Docker Build',
      'docker/build-push-action@v6',
      'Node 22 Alpine',
      'Only 2 images built',
    ], 11),
  );
  E.push(
    ...labeled(900, 145, 240, 115, '#ffe8cc', '#fd7e14', [
      'GHCR Registry',
      'ghcr.io/…/capex-web',
      'ghcr.io/…/capex-api',
      'tags: :latest + :sha',
    ], 11),
  );
  E.push(
    ...labeled(1170, 145, 280, 115, '#d3f9d8', '#2f9e44', [
      'SSH Deploy → VPS',
      'appleboy/ssh-action',
      'docker compose pull',
      'docker compose up -d --no-deps',
      'DEPLOY_PATH secret',
    ], 11),
  );
  E.push(
    ...labeled(1480, 145, 580, 115, '#e9ecef', '#495057', [
      'VPS: /opt/capex-deploy',
      'docker-compose.yml (ops-managed on server, not in public repo)',
      'Recreates: capex-web OR capex-api per workflow',
      'Smoke: curl 127.0.0.1:8080 (web) / :8082 (api)',
    ], 11),
  );

  E.push(...arr(260, 200, 290, 200, 'push', '#364fc7'));
  E.push(...arr(590, 200, 620, 200, 'build OK', '#e67700'));
  E.push(...arr(870, 200, 900, 200, 'push image', '#fd7e14'));
  E.push(...arr(1140, 200, 1170, 200, 'SSH', '#2f9e44'));
  E.push(...arr(1450, 200, 1480, 200, 'pull+up', '#495057'));

  E.push(
    txt(70, 280, 1980, 100, [
      '⚠ Verified fact: CI/CD deploys exactly 2 Docker images — NOT 19 microservices.',
      '• deploy-web.yml → capex-web only (context: capex-apps/)',
      '• deploy-api.yml → capex-api only (context: capexbe/ monolith)',
      '• verify-microservices.yml → PR gate only (static checks + leaf compile canary) — does NOT deploy leaf services',
      '• Full 19-service stack exists in deploy/docker-compose.microservices.yml — manual: make compose-up (not wired to GitHub Actions deploy)',
    ].join('\n'), { fs: 11, color: '#862e9c' }),
  );

  // ── B. RUNTIME TRAFFIC ────────────────────────────────────────────────────
  E.push(zone(40, 430, 2040, 520, 'B. RUNTIME TRAFFIC FLOW — End-User ↔ Application (Production)', '#e7f5ff', '#1971c2'));

  E.push(...labeled(70, 485, 170, 85, '#dbe4ff', '#364fc7', ['End User', 'Browser', 'Siloam staff'], 12));

  E.push(zone(270, 465, 320, 175, 'Edge Layer (ops-managed)', '#fff4e6', '#f76707'));
  E.push(
    ...labeled(290, 500, 280, 120, '#ffffff', '#f76707', [
      'Cloudflare',
      'DNS + Reverse Proxy',
      'WAF + DDoS protection',
      '(ops config — not in app repo)',
      'capex.siloamhospitals.com',
    ], 11),
  );

  E.push(zone(620, 430, 1440, 520, 'VPS — Ubuntu (secrets: VPS_HOST, VPS_SSH_KEY)', '#fff9db', '#e67700'));

  E.push(
    ...labeled(660, 475, 340, 100, '#fff3bf', '#e67700', [
      'Reverse Proxy Gateway',
      'Caddy (/opt/gateway) — per install script',
      'nginx template also in repo (deploy/nginx-*)',
      'TLS + Host routing → localhost',
    ], 11),
  );

  E.push(zone(660, 600, 1360, 310, 'Docker Compose — /opt/capex-deploy (production: 2 containers)', '#f8f9fa', '#868e96'));

  E.push(
    ...labeled(700, 645, 420, 110, '#d3f9d8', '#2f9e44', [
      'capex-web',
      'Next.js BFF + React UI',
      'Image: ghcr.io/…/capex-web',
      'Internal: :3000 → host :8080',
      'Edge middleware: JWT, CSRF, CSP',
    ], 11),
  );

  E.push(
    ...labeled(1160, 645, 420, 110, '#ffe8cc', '#fd7e14', [
      'capex-api',
      'NestJS monolith (capexbe/)',
      'Image: ghcr.io/…/capex-api',
      'Internal: :3001 → host :8082',
      'All business domains in one process',
    ], 11),
  );

  E.push(
    ...labeled(700, 775, 880, 95, '#fff9db', '#e67700', [
      'Optional (in codebase, manual deploy): Redis + 17 leaf microservices',
      'File: deploy/docker-compose.microservices.yml — strangler-fig migration in progress',
      'BFF routes via CAPEX_SERVICE_* env when leaf URLs are set; fallback = capex-api monolith',
    ], 11),
  );

  E.push(zone(660, 980, 1360, 130, 'External Managed Services', '#fff0f6', '#c2255c'));
  E.push(...labeled(690, 1015, 380, 75, '#ffffff', '#c2255c', ['Supabase Cloud', 'Postgres (SSL) + Auth Gateway'], 12));
  E.push(...labeled(1100, 1015, 380, 75, '#ffffff', '#364fc7', ['Microsoft Azure Entra', 'SSO OAuth 2.0 + MFA'], 12));
  E.push(...labeled(1510, 1015, 480, 75, '#ffffff', '#6741d9', ['GitHub Container Registry', 'Image storage (GHCR)'], 12));

  E.push(...arr(240, 527, 270, 527, 'HTTPS :443', '#364fc7'));
  E.push(...arr(590, 527, 620, 527, 'proxy', '#f76707'));
  E.push(...arr(830, 525, 870, 525, ':8080', '#e67700'));
  E.push(...arr(1120, 700, 1160, 700, 'POST /api/be/*', '#2f9e44'));
  E.push(...arr(1380, 700, 1100, 1015, 'Postgres SSL', '#c2255c'));
  E.push(...arr(900, 575, 1280, 1015, 'OAuth SSO', '#364fc7'));

  E.push(
    txt(290, 655, 300, 50, '↕ Request ↓\nResponse ↑', { fs: 11, align: 'center', color: '#364fc7' }),
  );

  // ── C. IN-APP REQUEST PATH ────────────────────────────────────────────────
  E.push(zone(40, 980, 600, 300, 'C. IN-APP DATA PATH (inside capex-web)', '#f8f9fa', '#495057'));

  const steps = [
    '1. Browser POST /api/be/{path} + httpOnly cookies + CSRF header',
    '2. middleware.ts — JWT verify, rate limit, path allowlist',
    '3. beProxy.ts — forward cookies server-side to backend',
    '4. resolveBackendBaseForPath() → capex-api (default)',
    '   or leaf service if CAPEX_SERVICE_* env is set',
    '5. NestJS guards: JWT + RBAC + throttle',
    '6. Supabase Postgres query (scoped by HU/archetype)',
    '7. JSON response → browser → React render',
  ];
  steps.forEach((s, i) => E.push(txt(55, 1020 + i * 30, 570, 26, s, { fs: 11, color: '#343a40' })));

  // ── D. FACT CHECK TABLE ───────────────────────────────────────────────────
  E.push(zone(680, 980, 1400, 300, 'D. FACT CHECK — what is in repo vs ops-managed', '#ffffff', '#868e96'));

  const facts = [
    ['Item', 'Status', 'Evidence in repo'],
    ['Platform', 'VPS + Docker Compose', 'deploy-web.yml, deploy-api.yml, DEPLOY.md'],
    ['Kubernetes', 'NO', 'No k8s/ manifests anywhere'],
    ['CI/CD images deployed', '2 only (web + api)', '.github/workflows/deploy-*.yml'],
    ['Backend in production CI/CD', 'Monolith (capexbe)', 'deploy-api.yml context: capexbe/'],
    ['19 microservices', 'In repo, manual deploy', 'deploy/docker-compose.microservices.yml'],
    ['Cloudflare WAF', 'Ops-managed (not in repo)', 'SECURITY.md: "template ready, ops manual"'],
    ['Caddy gateway', 'Ops-managed (/opt/gateway)', 'deploy/maintenance/install-on-vps.sh'],
    ['nginx', 'Template in repo', 'deploy/nginx-capex-ip-allowlist.conf'],
    ['Auth', 'Microsoft SSO via Azure Entra', 'NEXT_PUBLIC_ENABLE_AZURE_SSO, auth routes'],
    ['Session', 'httpOnly cookies via BFF', 'middleware.ts, authBff.ts, beProxy.ts'],
    ['Public modules count', '1 FE + 1 BE (deployed)', 'GitHub Actions workflows'],
  ];

  E.push(txt(700, 1018, 200, 20, facts[0][0], { fs: 11, color: '#1e3a5f' }));
  E.push(txt(920, 1018, 120, 20, facts[0][1], { fs: 11, color: '#1e3a5f' }));
  E.push(txt(1060, 1018, 980, 20, facts[0][2], { fs: 11, color: '#1e3a5f' }));

  facts.slice(1).forEach(([item, status, evidence], i) => {
    const y = 1045 + i * 22;
    E.push(txt(700, y, 200, 20, item, { fs: 10, color: '#343a40' }));
    E.push(txt(920, y, 120, 20, status, { fs: 10, color: status === 'NO' ? '#c92a2a' : '#2b8a3e' }));
    E.push(txt(1060, y, 980, 20, evidence, { fs: 10, color: '#495057' }));
  });

  E.push(
    txt(40, 1300, 2040, 18, 'Classification: Internal Use  |  All claims traceable to repository files  |  Regenerate: node scripts/generate-cloud-architecture-excalidraw.mjs', {
      fs: 10,
      align: 'center',
      color: '#868e96',
    }),
  );

  return E;
}

const elements = build();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements,
      appState: {
        gridSize: 20,
        viewBackgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 0.55 },
      },
      files: {},
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(`Wrote ${OUT} (${elements.length} elements)`);
