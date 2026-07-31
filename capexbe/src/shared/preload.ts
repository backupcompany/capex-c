import 'dotenv/config';
import { bootstrapTls } from './tls-bootstrap';
import { assertProductionEnv } from './prod-env.util';

/** Run before any Supabase outbound call (import this module first). */
bootstrapTls();
assertProductionEnv();
