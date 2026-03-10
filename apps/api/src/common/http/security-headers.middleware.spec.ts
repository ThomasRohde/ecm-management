import { SecurityHeadersMiddleware } from './security-headers.middleware';

describe('SecurityHeadersMiddleware', () => {
  const middleware = new SecurityHeadersMiddleware();

  it('should apply baseline hardening headers to responses', () => {
    const response = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    middleware.use({}, response, next);

    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Referrer-Policy',
      'no-referrer',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Permissions-Policy',
      'camera=(), geolocation=(), microphone=()',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
