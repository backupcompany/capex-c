import { formatPostgrestError } from './session.service';
import { isUuid } from './azure-oauth.util';

describe('formatPostgrestError', () => {
  it('reads message/code/details/hint', () => {
    const s = formatPostgrestError({
      message: 'boom',
      code: '42501',
      details: 'denied',
      hint: 'grant',
    });
    expect(s).toContain('message=boom');
    expect(s).toContain('code=42501');
    expect(s).toContain('details=denied');
  });

  it('stringifies empty/opaque error objects (VM code=? msg=undefined case)', () => {
    expect(formatPostgrestError({})).toBe('json={}');
  });
});

describe('createSession auth_id UUID gate', () => {
  it('accepts Wahyu auth_id used in known-working probe', () => {
    expect(isUuid('0955c7e9-bfa8-4488-a777-e96036d26658')).toBe(true);
  });
});
