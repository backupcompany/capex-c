import { secureId } from './secureId';

describe('secureId', () => {
  it('returns uuid with optional prefix', () => {
    const id = secureId('ephemeral-');
    expect(id.startsWith('ephemeral-')).toBe(true);
    expect(id.length).toBeGreaterThan(20);
  });
});
