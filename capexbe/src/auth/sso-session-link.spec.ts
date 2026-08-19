import {
  authIdNeedsLink,
  emailsMatch,
  pickUserRowByEmail,
  type AppUserRow,
} from './auth-user.resolver';
import {
  azureAuthIdForEmail,
  isUuid,
  resolveSessionAuthId,
} from './azure-oauth.util';

/**
 * In-memory stand-in for users + auth_sessions — proves SSO link flow without
 * hardcoding session UUIDs (they come from resolveSessionAuthId / azureAuthIdForEmail).
 */
const SSO_EMAILS = [
  'wahyu.pratama760001@siloamhospitals.com',
  'adriyan.putra@siloamhospitals.com',
  'pentest.1@siloamhospitals.com',
  'pentest.2@siloamhospitals.com',
] as const;

type MemUser = AppUserRow & { assignments: { roleName: string; scopes: string[] }[] };

function seedUsers(): MemUser[] {
  return [
    {
      id: 1,
      username: 'wahyu',
      email: 'wahyu.pratama760001@siloamhospitals.com',
      auth_id: null,
      assignments: [{ roleName: 'Super Admin', scopes: ['All'] }],
    },
    {
      id: 2,
      username: 'adriyan',
      email: 'Adriyan.Putra@siloamhospitals.com',
      auth_id: null,
      assignments: [{ roleName: 'Super Admin', scopes: ['All'] }],
    },
    {
      id: 3,
      username: 'pentest.1',
      email: 'pentest.1@siloamhospitals.com',
      // Invalid RFC version nibble — same class of dump placeholders as aaaaaaaa-…
      auth_id: 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001',
      assignments: [{ roleName: 'Super Admin', scopes: ['All'] }],
    },
    {
      id: 4,
      username: 'pentest.2',
      email: 'pentest.2@siloamhospitals.com',
      auth_id: 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002',
      assignments: [{ roleName: 'Viewer', scopes: ['HU-SHMK'] }],
    },
  ];
}

/** Azure login → lookup → auth_id link → session → /auth/session resolve by auth_id */
function runSsoToSessionFlow(users: MemUser[], azureEmail: string) {
  const normalized = azureEmail.trim().toLowerCase();
  const row = pickUserRowByEmail(users, normalized);
  if (!row) throw new Error('user lookup failed');

  const sessionAuthId = resolveSessionAuthId(row.auth_id, normalized);
  expect(isUuid(sessionAuthId)).toBe(true);

  if (authIdNeedsLink(row.auth_id, sessionAuthId)) {
    row.auth_id = sessionAuthId;
  }

  const session = {
    id: 'sess-' + normalized,
    user_id: row.id,
    auth_id: sessionAuthId,
  };

  const byAuth = users.find((u) => (u.auth_id ?? '').trim() === session.auth_id);
  if (!byAuth) throw new Error('session resolve failed');

  return { user: byAuth, session, sessionAuthId };
}

describe('SSO → link auth_id → session → /auth/session (4 users)', () => {
  it.each([...SSO_EMAILS])('%s end-to-end without hardcoded session UUID', (email) => {
    const users = seedUsers();
    const { user, session, sessionAuthId } = runSsoToSessionFlow(users, email);

    expect(emailsMatch(user.email, email)).toBe(true);
    expect(user.auth_id).toBe(sessionAuthId);
    expect(session.auth_id).toBe(user.auth_id);
    expect(user.assignments.length).toBeGreaterThan(0);
    expect(sessionAuthId).toBe(azureAuthIdForEmail(email));
  });

  it('rejects dump placeholder auth_id via isUuid then links azure UUID', () => {
    expect(isUuid('aaaaaaaa-aaaa-aaaa-aaaa-000000000001')).toBe(false);
    const linked = resolveSessionAuthId(
      'aaaaaaaa-aaaa-aaaa-aaaa-000000000001',
      'pentest.1@siloamhospitals.com',
    );
    expect(isUuid(linked)).toBe(true);
    expect(authIdNeedsLink('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', linked)).toBe(true);
  });

  it('keeps already-valid users.auth_id (no unnecessary rewrite)', () => {
    const email = 'wahyu.pratama760001@siloamhospitals.com';
    const existing = azureAuthIdForEmail(email);
    expect(resolveSessionAuthId(existing, email)).toBe(existing);
    expect(authIdNeedsLink(existing, existing)).toBe(false);
  });
});
