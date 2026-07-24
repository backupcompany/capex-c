import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { assertMetricsAccessAllowed } from './metrics-access.util';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as Request;
}

describe('assertMetricsAccessAllowed', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.METRICS_PUBLIC;
    delete process.env.METRICS_SECRET;
  });

  afterAll(() => {
    process.env = env;
  });

  it('allows localhost', () => {
    expect(() => assertMetricsAccessAllowed(mockReq())).not.toThrow();
  });

  it('allows when METRICS_PUBLIC=1', () => {
    process.env.METRICS_PUBLIC = '1';
    expect(() =>
      assertMetricsAccessAllowed(mockReq({ ip: '8.8.8.8', socket: { remoteAddress: '8.8.8.8' } } as Request)),
    ).not.toThrow();
  });

  it('allows remote IP with matching X-Metrics-Token', () => {
    process.env.METRICS_SECRET = 'test-secret';
    expect(() =>
      assertMetricsAccessAllowed(
        mockReq({
          ip: '8.8.8.8',
          socket: { remoteAddress: '8.8.8.8' },
          headers: { 'x-metrics-token': 'test-secret' },
        } as Request),
      ),
    ).not.toThrow();
  });

  it('denies remote IP without token', () => {
    expect(() =>
      assertMetricsAccessAllowed(mockReq({ ip: '8.8.8.8', socket: { remoteAddress: '8.8.8.8' } } as Request)),
    ).toThrow(ForbiddenException);
  });
});
