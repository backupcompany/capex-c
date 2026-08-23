import { defaultBackendBase } from './serviceRoutes';

describe('defaultBackendBase', () => {
  const prevCapex = process.env.CAPEXBE_URL;
  const prevPublic = process.env.NEXT_PUBLIC_CAPEXBE_URL;

  afterEach(() => {
    if (prevCapex === undefined) delete process.env.CAPEXBE_URL;
    else process.env.CAPEXBE_URL = prevCapex;
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_CAPEXBE_URL;
    else process.env.NEXT_PUBLIC_CAPEXBE_URL = prevPublic;
  });

  it('prefers CAPEXBE_URL over NEXT_PUBLIC_CAPEXBE_URL', () => {
    process.env.CAPEXBE_URL = 'http://capex-api:3001';
    process.env.NEXT_PUBLIC_CAPEXBE_URL = '/api/be';
    expect(defaultBackendBase()).toBe('http://capex-api:3001');
  });
});
