import { InternalServerErrorException, type ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('preserves explicit API error envelopes', () => {
    const response = createResponseWriter();
    const host = createArgumentsHost(
      new InternalServerErrorException({
        error: {
          code: 'API_NOT_READY',
          message: 'API is not ready',
        },
      }),
      response,
      { requestId: 'req-1' },
    );

    filter.catch(host.exception, host.argumentsHost);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'API_NOT_READY',
        message: 'API is not ready',
      },
    });
  });

  it('sanitizes unexpected errors and includes the request id', () => {
    const response = createResponseWriter();
    const host = createArgumentsHost(new Error('database connection leaked'), response, {
      requestId: 'req-2',
    });

    filter.catch(host.exception, host.argumentsHost);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        details: {
          requestId: 'req-2',
        },
      },
    });
  });
});

function createResponseWriter() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };

  response.status.mockReturnValue({
    json: response.json,
  });

  return response;
}

function createArgumentsHost(
  exception: unknown,
  response: ReturnType<typeof createResponseWriter>,
  request: Record<string, unknown>,
): { exception: unknown; argumentsHost: ArgumentsHost } {
  return {
    exception,
    argumentsHost: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
        getNext: () => undefined,
      }),
    } as ArgumentsHost,
  };
}
