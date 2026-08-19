import {
  azureAuthIdForEmail,
  isUuid,
  resolveSessionAuthId,
} from './azure-oauth.util';

const SSO_EMAILS = [
  'wahyu.pratama760001@siloamhospitals.com',
  'adriyan.putra@siloamhospitals.com',
  'pentest.1@siloamhospitals.com',
  'pentest.2@siloamhospitals.com',
] as const;

describe('azureAuthIdForEmail / resolveSessionAuthId', () => {
  it('returns a valid UUID for every SSO allowlist email (auth_sessions.auth_id is uuid)', () => {
    for (const email of SSO_EMAILS) {
      const id = azureAuthIdForEmail(email);
      expect(isUuid(id)).toBe(true);
      expect(id.startsWith('azure-')).toBe(false);
    }
  });

  it('is stable for the same email', () => {
    const a = azureAuthIdForEmail(SSO_EMAILS[0]);
    const b = azureAuthIdForEmail(SSO_EMAILS[0]);
    expect(a).toBe(b);
  });

  it('differs across emails', () => {
    const ids = new Set(SSO_EMAILS.map((e) => azureAuthIdForEmail(e)));
    expect(ids.size).toBe(SSO_EMAILS.length);
  });

  it('resolveSessionAuthId prefers existing UUID auth_id', () => {
    const existing = '0955c7e9-bfa8-4488-a777-e96036d26658';
    expect(resolveSessionAuthId(existing, SSO_EMAILS[0])).toBe(existing);
  });

  it('resolveSessionAuthId rejects legacy azure-hash stubs', () => {
    const legacy = `azure-${'a'.repeat(32)}`;
    const resolved = resolveSessionAuthId(legacy, SSO_EMAILS[0]);
    expect(isUuid(resolved)).toBe(true);
    expect(resolved).toBe(azureAuthIdForEmail(SSO_EMAILS[0]));
  });

  it('legacy azure-hash is not a UUID (documents the production bug)', () => {
    expect(isUuid(`azure-${'ab'.repeat(16)}`)).toBe(false);
  });
});
