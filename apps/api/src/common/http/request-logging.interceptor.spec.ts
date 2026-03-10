import { BadRequestException, Logger, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

describe('RequestLoggingInterceptor', () => {
  const interceptor = new RequestLoggingInterceptor();

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('logs successful requests with request metadata', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const context = createHttpExecutionContext(
      {
        requestId: 'req-success',
        method: 'GET',
        originalUrl: '/capabilities',
      },
      { statusCode: 200 },
    );

    await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ ok: true }),
      }),
    );

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"requestId":"req-success"'));
  });

  it('logs warning-level requests for handled client errors', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const context = createHttpExecutionContext(
      {
        requestId: 'req-client-error',
        method: 'POST',
        originalUrl: '/capabilities',
      },
      { statusCode: 400 },
    );

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new BadRequestException('Invalid payload')),
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"statusCode":400'));
  });
});

function createHttpExecutionContext(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as ExecutionContext;
}
