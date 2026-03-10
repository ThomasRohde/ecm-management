import { RequestContextMiddleware } from './request-context.middleware';

describe('RequestContextMiddleware', () => {
  const middleware = new RequestContextMiddleware();

  it('should preserve an incoming request id header', () => {
    const request: { headers: { 'x-request-id': string }; requestId?: string } = {
      headers: {
        'x-request-id': 'req-123',
      },
    };
    const response = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    middleware.use(request, response, next);

    expect(request.requestId).toBe('req-123');
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'req-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should generate a request id when one is not supplied', () => {
    const request: { headers: Record<string, never>; requestId?: string } = {
      headers: {},
    };
    const response = {
      setHeader: jest.fn(),
    };

    middleware.use(request, response, jest.fn());

    expect(typeof request.requestId).toBe('string');
    expect(request.requestId).toHaveLength(36);
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', request.requestId);
  });
});
