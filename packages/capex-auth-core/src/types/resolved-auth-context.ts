import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnterpriseRoleSlug } from '../constants/enterprise-roles';

export type ResolvedAuthContext = {
  client: SupabaseClient;
  userId: number;
  authId: string;
  sessionId?: string;
  roles: EnterpriseRoleSlug[];
  accessToken: string;
  source: 'backend_jwt' | 'supabase_legacy';
};
