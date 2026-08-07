#!/usr/bin/env node
/** Generate a shared PUBLIC_ID_SALT for capex-apps + capexbe (prod). */
import { randomBytes } from 'node:crypto';

const salt = randomBytes(32).toString('base64url');
console.log('Add the SAME value to both env files:\n');
console.log(`# capex-apps/.env.local`);
console.log(`NEXT_PUBLIC_PUBLIC_ID_SALT=${salt}\n`);
console.log(`# capexbe/.env`);
console.log(`PUBLIC_ID_SALT=${salt}\n`);
console.log('Restart capexbe and capex-web after updating.');
