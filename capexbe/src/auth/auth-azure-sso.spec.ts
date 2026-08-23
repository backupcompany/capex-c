import { pickUserRowByEmail, emailsMatch, type AppUserRow } from './auth-user.resolver';
import { isAppUserLookupUnauthorized, isPostgrestInfraError } from './auth-oauth-errors.util';
import { roleNameToSlug } from './auth.constants';
import { resolveSessionAuthId, isUuid } from './azure-oauth.util';

/** Slim dump allowlist — Super Admin / All. */
const ALLOWLIST: AppUserRow[] = [
  {
    id: 179,
    username: 'wahyu',
    email: 'wahyu.pratama760001@siloamhospitals.com',
    auth_id: '0955c7e9-bfa8-4488-a777-e96036d26658',
  },
  {
    id: 130,
    username: 'adriyan.putra',
    email: 'Adriyan.Putra@siloamhospitals.com', // mixed-case as seen in legacy dumps
    auth_id: 'fdd931a1-9a37-4012-9980-198e7971fb68',
  },
  {
    id: 230,
    username: 'pentest.1',
    email: 'pentest.1@siloamhospitals.com',
    auth_id: 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001',
  },
  {
    id: 231,
    username: 'pentest.2',
    email: 'pentest.2@siloamhospitals.com',
    auth_id: null, // forces UUID generation path
  },
];

const ASSIGNMENTS: Record<number, { roleName: string; assignedScopes: string[] }> = {
  179: { roleName: 'Super Admin', assignedScopes: ['All'] },
  130: { roleName: 'Super Admin', assignedScopes: ['All'] },
  230: { roleName: 'Super Admin', assignedScopes: ['All'] },
  231: { roleName: 'Super Admin', assignedScopes: ['All'] },
};

describe('Azure SSO local allowlist (4 users)', () => {
  it.each([
    'wahyu.pratama760001@siloamhospitals.com',
    'adriyan.putra@siloamhospitals.com',
    'pentest.1@siloamhospitals.com',
    'pentest.2@siloamhospitals.com',
  ])('finds %s (case-insensitive) with Super Admin / All', (email) => {
    const row = pickUserRowByEmail(ALLOWLIST, email);
    expect(row).toBeTruthy();
    expect(emailsMatch(row!.email, email)).toBe(true);

    const assignment = ASSIGNMENTS[row!.id];
    expect(assignment.roleName).toBe('Super Admin');
    expect(assignment.assignedScopes).toEqual(['All']);
    expect(roleNameToSlug(assignment.roleName)).toBe('super_admin');

    const authId = resolveSessionAuthId(row!.auth_id, email);
    expect(isUuid(authId)).toBe(true);
  });

  it('mixed-case Azure email still matches PascalCase DB row', () => {
    expect(pickUserRowByEmail(ALLOWLIST, 'ADRIYAN.PUTRA@SILOAMHOSPITALS.COM')?.id).toBe(130);
  });

  it('emailsMatch ignores case and surrounding spaces', () => {
    expect(emailsMatch('Adriyan.Putra@siloamhospitals.com', ' adriyan.putra@siloamhospitals.com ')).toBe(
      true,
    );
    expect(emailsMatch('wahyu.pratama760001@siloamhospitals.com', 'Wahyu.Pratama760001@SiloamHospitals.com')).toBe(
      true,
    );
    expect(emailsMatch('pentest.1@siloamhospitals.com', 'pentest.2@siloamhospitals.com')).toBe(false);
  });

  it('unknown email is not found', () => {
    expect(pickUserRowByEmail(ALLOWLIST, 'nobody@siloamhospitals.com')).toBeNull();
  });
});

describe('isAppUserLookupUnauthorized (error masking)', () => {
  it('maps only lookup failures to not-registered', () => {
    expect(isAppUserLookupUnauthorized('User lookup failed')).toBe(true);
    expect(isAppUserLookupUnauthorized('User not registered in application')).toBe(true);
  });

  it('does NOT treat session/JWT infra errors as not-registered', () => {
    expect(isAppUserLookupUnauthorized('Could not create session')).toBe(false);
    expect(isAppUserLookupUnauthorized('JWT secret not configured')).toBe(false);
    expect(isAppUserLookupUnauthorized('Database not configured')).toBe(false);
    expect(isAppUserLookupUnauthorized('Unauthorized')).toBe(false);
  });
});

describe('isPostgrestInfraError', () => {
  it('detects PGRST002 schema-cache outage', () => {
    expect(
      isPostgrestInfraError({
        code: 'PGRST002',
        message: 'Could not query the database for the schema cache. Retrying.',
      }),
    ).toBe(true);
  });

  it('does not flag empty lookup as infra', () => {
    expect(isPostgrestInfraError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(
      false,
    );
  });
});
