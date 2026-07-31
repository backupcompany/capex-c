#!/usr/bin/env node
/** Health-check all microservices (local compose or dev ports). */
const HOST = process.env.COMPOSE_HEALTH_HOST || '127.0.0.1';

const SERVICES = [
  { name: 'capex-api (auth)', port: 3001, path: '/health' },
  { name: 'capex-notifications', port: 3002 },
  { name: 'capex-audit', port: 3003 },
  { name: 'capex-backup', port: 3004 },
  { name: 'capex-config', port: 3005 },
  { name: 'capex-mom-daily-summary', port: 3006 },
  { name: 'capex-asset-timeline', port: 3007 },
  { name: 'capex-duplicate-detection', port: 3008 },
  { name: 'capex-user-admin', port: 3009 },
  { name: 'capex-procurement', port: 3010 },
  { name: 'capex-fs', port: 3011 },
  { name: 'capex-monitoring', port: 3012 },
  { name: 'capex-reporting', port: 3013 },
  { name: 'capex-executive-summary', port: 3014 },
  { name: 'capex-tasks', port: 3015 },
  { name: 'capex-core', port: 3016 },
  { name: 'capex-smart-migration', port: 3017 },
  { name: 'capex-auth', port: 3018 },
];

const failures = [];

console.log(`=== CAPEX compose health check (${HOST}) ===\n`);

for (const svc of SERVICES) {
  const path = svc.path ?? '/health';
  const url = `http://${HOST}:${svc.port}${path}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.status !== 200) failures.push(`${svc.name} :${svc.port} → ${res.status}`);
    else console.log(`OK  ${svc.name} :${svc.port} → 200`);
  } catch (e) {
    failures.push(`${svc.name} :${svc.port} unreachable: ${e instanceof Error ? e.message : e}`);
  }
}

if (failures.length) {
  console.error('\nCompose health check FAILED:', failures);
  process.exit(1);
}
console.log('\nAll 18 services healthy');
