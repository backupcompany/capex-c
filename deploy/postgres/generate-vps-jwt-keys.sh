#!/usr/bin/env bash
# Generate PostgREST-compatible JWT keys for USE_VPS_POSTGRES=1 (role=capex_app).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/capexbe"
node -e "
require('dotenv').config();
const jwt = require('jsonwebtoken');
const s = process.env.SUPABASE_JWT_SECRET;
if (!s) throw new Error('SUPABASE_JWT_SECRET missing');
const key = jwt.sign({ role: 'capex_app', iss: 'postgrest' }, s, { expiresIn: '3650d' });
console.log('Paste into capexbe/.env when USE_VPS_POSTGRES=1:');
console.log('SUPABASE_ANON_KEY=' + key);
console.log('SUPABASE_SERVICE_ROLE_KEY=' + key);
"
