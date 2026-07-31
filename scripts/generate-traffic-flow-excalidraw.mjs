#!/usr/bin/env node
/**
 * Generates docs/capex-traffic-flow.excalidraw — corporate traffic flow sheet for Capex Pro.
 * Run: node scripts/generate-traffic-flow-excalidraw.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/capex-traffic-flow.excalidraw');

let seedCounter = 100000;
let idCounter = 0;
let indexCounter = 0;

function id() {
  idCounter += 1;
  return `capex-${idCounter.toString(36)}-${Date.now().toString(36)}`;
}

function idx() {
  indexCounter += 1;
  return `a${indexCounter}`;
}

function base(type, extra = {}) {
  seedCounter += 7919;
  const now = Date.now();
  return {
    id: id(),
    type,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    seed: seedCounter,
    version: 1,
    versionNonce: seedCounter + 42,
    index: idx(),
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    ...extra,
  };
}

function rect(x, y, w, h, opts = {}) {
  return base('rectangle', {
    x,
    y,
    width: w,
    height: h,
    roundness: { type: 3 },
    backgroundColor: opts.bg ?? '#ffffff',
    strokeColor: opts.stroke ?? '#495057',
    strokeWidth: opts.strokeWidth ?? 2,
    ...opts.extra,
  });
}

function frame(x, y, w, h, name, opts = {}) {
  return base('frame', {
    x,
    y,
    width: w,
    height: h,
    name,
    backgroundColor: opts.bg ?? 'transparent',
    strokeColor: opts.stroke ?? '#868e96',
    strokeWidth: 1,
    strokeStyle: 'dashed',
    roundness: null,
    ...opts.extra,
  });
}

function textEl(x, y, w, h, content, opts = {}) {
  const el = base('text', {
    x,
    y,
    width: w,
    height: h,
    text: content,
    originalText: content,
    fontSize: opts.fontSize ?? 16,
    fontFamily: 2,
    textAlign: opts.align ?? 'left',
    verticalAlign: opts.valign ?? 'top',
    containerId: opts.containerId ?? null,
    strokeColor: opts.color ?? '#1e1e1e',
    backgroundColor: 'transparent',
    strokeWidth: 1,
    lineHeight: 1.25,
    ...opts.extra,
  });
  return el;
}

function labelOnRect(box, lines, opts = {}) {
  const pad = opts.pad ?? 12;
  const fs = opts.fontSize ?? 14;
  const lineH = fs * 1.35;
  const content = Array.isArray(lines) ? lines.join('\n') : lines;
  const t = textEl(box.x + pad, box.y + pad, box.width - pad * 2, box.height - pad * 2, content, {
    fontSize: fs,
    align: opts.align ?? 'center',
    valign: opts.valign ?? 'middle',
    containerId: box.id,
    color: opts.color ?? '#1e1e1e',
  });
  box.boundElements = [{ id: t.id, type: 'text' }];
  return [box, t];
}

function arrow(fromX, fromY, toX, toY, label, opts = {}) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const el = base('arrow', {
    x: fromX,
    y: fromY,
    width: dx,
    height: dy,
    points: [
      [0, 0],
      [dx, dy],
    ],
    startArrowhead: null,
    endArrowhead: 'arrow',
    strokeColor: opts.color ?? '#364fc7',
    strokeWidth: opts.strokeWidth ?? 2,
    startBinding: opts.startBinding ?? null,
    endBinding: opts.endBinding ?? null,
  });
  const els = [el];
  if (label) {
    const mx = fromX + dx / 2 - 80;
    const my = fromY + dy / 2 - 24;
    els.push(
      textEl(mx, my, 160, 48, label, {
        fontSize: 12,
        align: 'center',
        valign: 'middle',
        color: opts.labelColor ?? '#364fc7',
        extra: { strokeWidth: 1, backgroundColor: '#ffffff' },
      }),
    );
  }
  return els;
}

function binding(elementId, focus = 0.5, gap = 4) {
  return { elementId, focus, gap };
}

function buildDiagram() {
  const elements = [];

  // ── Title block ──────────────────────────────────────────────────────────
  const titleBox = rect(40, 20, 1720, 72, { bg: '#1e3a5f', stroke: '#1e3a5f' });
  elements.push(
    ...labelOnRect(titleBox, 'CAPEX PRO — Application Traffic Flow Sheet', {
      fontSize: 28,
      color: '#ffffff',
      align: 'center',
      valign: 'middle',
    }),
  );
  elements.push(
    textEl(40, 96, 1720, 28, 'Siloam Hospitals  |  Production Environment  |  Modular Monolith → Microservices (Strangler-Fig)', {
      fontSize: 14,
      align: 'center',
      color: '#495057',
    }),
  );

  // ── Zone: Public Internet ────────────────────────────────────────────────
  const pubFrame = frame(40, 140, 420, 200, 'PUBLIC INTERNET', { stroke: '#1971c2', bg: '#e7f5ff' });
  elements.push(pubFrame);

  const userBox = rect(100, 200, 300, 100, { bg: '#dbe4ff', stroke: '#364fc7', strokeWidth: 2 });
  elements.push(
    ...labelOnRect(userBox, ['End User', 'Browser (Siloam Staff)', 'Chrome / Edge — Desktop'], {
      fontSize: 15,
      align: 'center',
    }),
  );

  // ── Zone: Application Environment ────────────────────────────────────────
  const appFrame = frame(520, 140, 1240, 620, 'APPLICATION ENVIRONMENT (VPS / Private Cloud)', {
    stroke: '#e67700',
    bg: '#fff9db',
  });
  elements.push(appFrame);

  const proxyBox = rect(620, 190, 1040, 72, { bg: '#fff3bf', stroke: '#e67700' });
  elements.push(
    ...labelOnRect(proxyBox, ['Reverse Proxy — nginx / Caddy', 'TLS Termination (:443)  •  Rate Limit  •  X-Forwarded-* Headers'], {
      fontSize: 15,
      align: 'center',
    }),
  );

  const bffBox = rect(620, 300, 1040, 130, { bg: '#d3f9d8', stroke: '#2f9e44', strokeWidth: 2 });
  elements.push(
    ...labelOnRect(
      bffBox,
      [
        'capex-web — Next.js BFF + React UI (:3000)',
        'Edge Middleware: JWT verify • CSRF • CSP • Rate limit',
        '/api/auth/*  →  Auth proxy     |     /api/be/*  →  Business data proxy (POST only)',
      ],
      { fontSize: 14, align: 'center' },
    ),
  );

  const leafFrame = frame(620, 460, 1040, 260, 'BACKEND SERVICES — Internal Network (127.0.0.1 / Docker)', {
    stroke: '#868e96',
    bg: '#f8f9fa',
  });
  elements.push(leafFrame);

  const authBox = rect(660, 510, 200, 80, { bg: '#ffe8cc', stroke: '#fd7e14' });
  elements.push(...labelOnRect(authBox, ['capex-auth', ':3018'], { fontSize: 14, align: 'center' }));

  const coreBox = rect(880, 510, 200, 80, { bg: '#e9ecef', stroke: '#495057' });
  elements.push(...labelOnRect(coreBox, ['capex-core', ':3016'], { fontSize: 14, align: 'center' }));

  const tasksBox = rect(1100, 510, 200, 80, { bg: '#e9ecef', stroke: '#495057' });
  elements.push(...labelOnRect(tasksBox, ['capex-tasks', ':3015'], { fontSize: 14, align: 'center' }));

  const fsBox = rect(1320, 510, 200, 80, { bg: '#e9ecef', stroke: '#495057' });
  elements.push(...labelOnRect(fsBox, ['capex-fs', ':3011'], { fontSize: 14, align: 'center' }));

  const otherBox = rect(660, 610, 860, 80, { bg: '#e9ecef', stroke: '#495057' });
  elements.push(
    ...labelOnRect(
      otherBox,
      ['+ 13 leaf services (:3002–:3017)  •  procurement • reporting • monitoring • audit • backup • config • …', 'capex-api health stub (:3001)'],
      { fontSize: 13, align: 'center' },
    ),
  );

  const redisBox = rect(1540, 510, 100, 180, { bg: '#ffdeeb', stroke: '#c2255c' });
  elements.push(...labelOnRect(redisBox, ['Redis', ':6379'], { fontSize: 13, align: 'center' }));

  // ── Zone: External Services ──────────────────────────────────────────────
  const extFrame = frame(40, 780, 1720, 160, 'EXTERNAL SERVICES (Third-Party / Managed Cloud)', {
    stroke: '#c2255c',
    bg: '#fff0f6',
  });
  elements.push(extFrame);

  const supaBox = rect(120, 830, 480, 80, { bg: '#ffffff', stroke: '#c2255c' });
  elements.push(
    ...labelOnRect(supaBox, ['Supabase Cloud', 'Postgres (SSL) + Row Level Security'], { fontSize: 14, align: 'center' }),
  );

  const azureBox = rect(660, 830, 480, 80, { bg: '#ffffff', stroke: '#364fc7' });
  elements.push(
    ...labelOnRect(azureBox, ['Microsoft Azure Entra ID', 'SSO / OAuth 2.0 + MFA'], { fontSize: 14, align: 'center' }),
  );

  const sbAuthBox = rect(1200, 830, 480, 80, { bg: '#ffffff', stroke: '#c2255c' });
  elements.push(
    ...labelOnRect(sbAuthBox, ['Supabase Auth Gateway', 'OAuth token exchange'], { fontSize: 14, align: 'center' }),
  );

  // ── Arrows: main flow (request ↓ / response ↑) ───────────────────────────
  elements.push(
    ...arrow(400, 250, 520, 226, '① HTTPS :443\n(Request ↓ / Response ↑)', {
      color: '#364fc7',
      startBinding: binding(userBox.id, 1, 4),
      endBinding: binding(proxyBox.id, 0, 4),
    }),
  );
  elements.push(
    ...arrow(1140, 262, 1140, 300, '② HTTP :3000\n(internal)', {
      color: '#2f9e44',
      startBinding: binding(proxyBox.id, 0.5, 2),
      endBinding: binding(bffBox.id, 0.5, 2),
    }),
  );
  elements.push(
    ...arrow(1140, 430, 1140, 460, '③ CAPEX_SERVICE_*\npath routing', {
      color: '#495057',
      startBinding: binding(bffBox.id, 0.5, 2),
      endBinding: binding(leafFrame.id, 0.5, 2),
    }),
  );
  elements.push(
    ...arrow(1140, 720, 360, 830, '④ Postgres SSL\n(queries / rows)', {
      color: '#c2255c',
      startBinding: binding(otherBox.id, 0.5, 2),
      endBinding: binding(supaBox.id, 0.5, 2),
    }),
  );
  elements.push(
    ...arrow(760, 380, 900, 830, '⑤ OAuth redirect\n(login flow)', {
      color: '#364fc7',
      labelColor: '#364fc7',
      startBinding: binding(bffBox.id, 0.2, 2),
      endBinding: binding(azureBox.id, 0.5, 2),
    }),
  );
  elements.push(
    ...arrow(760, 550, 1440, 830, '⑥ Token exchange', {
      color: '#364fc7',
      startBinding: binding(authBox.id, 0.5, 2),
      endBinding: binding(sbAuthBox.id, 0.5, 2),
    }),
  );
  elements.push(
    ...arrow(1540, 600, 1540, 510, 'cache / throttle', {
      color: '#c2255c',
      strokeWidth: 1,
      startBinding: binding(redisBox.id, 0.5, 1),
      endBinding: binding(otherBox.id, 1, 4),
    }),
  );

  // ── Sheet 2: SSO + Data flow (right side legend / detail panel) ──────────
  const detailFrame = frame(40, 980, 1720, 520, 'DETAILED TRAFFIC FLOWS', { stroke: '#495057', bg: '#f8f9fa' });
  elements.push(detailFrame);

  // SSO flow column
  elements.push(
    textEl(80, 1020, 800, 32, 'A. SSO Login Flow (End-User → Application)', {
      fontSize: 18,
      color: '#1e3a5f',
    }),
  );

  const ssoSteps = [
    '1. User → GET /login → Reverse Proxy → BFF → Login page',
    '2. User → GET /api/auth/azure/start → BFF proxies → capex-auth',
    '3. capex-auth → redirect → Microsoft Azure Entra (OAuth + MFA)',
    '4. Azure → callback → /api/auth/azure/callback → capex-auth',
    '5. capex-auth ↔ Supabase Auth Gateway (token exchange)',
    '6. Response: httpOnly cookies (capex_access, capex_refresh, CSRF)',
    '7. Redirect → /dashboard → Middleware JWT verify → React SPA',
  ];
  ssoSteps.forEach((step, i) => {
    elements.push(
      textEl(80, 1060 + i * 28, 780, 24, step, { fontSize: 13, color: '#343a40' }),
    );
  });

  // Data flow column
  elements.push(
    textEl(920, 1020, 800, 32, 'B. Application Data Flow (End-User ↔ API)', {
      fontSize: 18,
      color: '#1e3a5f',
    }),
  );

  const dataSteps = [
    '1. Browser → POST /api/be/{domain}/{action} + cookies + X-CSRF-Token',
    '2. Reverse Proxy → BFF → Edge Middleware (rate limit 180/min/IP)',
    '3. Middleware: JWT signature verify + CSRF double-submit check',
    '4. beProxy.ts → resolveBackendBaseForPath() → leaf service URL',
    '5. Auto token refresh if access JWT expired (server-side)',
    '6. Leaf service: ThrottlerGuard → JwtAuthGuard → PermissionsGuard',
    '7. NestJS service → Supabase Postgres (scoped by HU / archetype / RBAC)',
    '8. JSON response → BFF → security headers → Browser → React UI render',
  ];
  dataSteps.forEach((step, i) => {
    elements.push(
      textEl(920, 1060 + i * 28, 780, 24, step, { fontSize: 13, color: '#343a40' }),
    );
  });

  // Security notes
  elements.push(
    textEl(80, 1280, 1620, 32, 'C. Security & Exposure Matrix', {
      fontSize: 18,
      color: '#1e3a5f',
    }),
  );

  const matrix = [
    '✓  Only capex-web (BFF) exposed via reverse proxy — backend services NOT internet-accessible',
    '✓  Browser NEVER calls Supabase REST directly for business data (BFF-only data path)',
    '✓  Session tokens stored in httpOnly + SameSite=Strict cookies — not accessible to JavaScript',
    '✓  Production auth: Microsoft SSO only (@siloamhospitals.com) — password login disabled',
    '✓  All /api/be requests: POST-only, path allowlist, CSRF protection, JWT at edge + backend',
  ];
  matrix.forEach((line, i) => {
    elements.push(textEl(80, 1320 + i * 26, 1620, 24, line, { fontSize: 13, color: '#2b8a3e' }));
  });

  // Legend
  const legendBox = rect(80, 1460, 1620, 24, { bg: '#e9ecef', stroke: '#868e96', strokeWidth: 1 });
  elements.push(legendBox);
  elements.push(
    textEl(
      100,
      1462,
      1580,
      20,
      'Legend:  ———  HTTPS (public)     ·····  HTTP (internal)     ■  Not exposed to internet     ■  External managed service',
      { fontSize: 12, align: 'center', color: '#495057' },
    ),
  );

  // Footer
  elements.push(
    textEl(40, 1520, 1720, 20, 'Document: Capex Pro Traffic Flow  |  Classification: Internal Use  |  Generated for IT Corporate Review', {
      fontSize: 11,
      align: 'center',
      color: '#868e96',
    }),
  );

  return elements;
}

const elements = buildDiagram();

const scene = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements,
  appState: {
    gridSize: 20,
    viewBackgroundColor: '#ffffff',
    scrollX: -20,
    scrollY: -20,
    zoom: { value: 0.75 },
  },
  files: {},
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(scene, null, 2)}\n`, 'utf8');
console.log(`Wrote ${OUT} (${elements.length} elements)`);
