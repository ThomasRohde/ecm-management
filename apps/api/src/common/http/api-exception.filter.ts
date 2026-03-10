import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { RequestWithContext } from './request-context';

interface JsonResponseWriter {
  status(statusCode: number): {
    json(payload: unknown): void;
  };
}

interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const response = httpContext.getResponse<JsonResponseWriter>();
    const request = httpContext.getRequest<RequestWithContext>();
    const requestId =
      typeof request.requestId === 'string' && request.requestId.trim().length > 0
        ? request.requestId
        : undefined;
    const { statusCode, body } = this.normalizeException(exception, requestId);

    response.status(statusCode).json(body);
  }

  private normalizeException(
    exception: unknown,
    requestId?: string,
  ): { statusCode: number; body: unknown } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (this.isApiErrorEnvelope(exceptionResponse)) {
        return {
          statusCode,
          body: exceptionResponse,
        };
      }

      if (statusCode === 429) {
        return {
          statusCode,
          body: this.createErrorEnvelope(
            'RATE_LIMIT_EXCEEDED',
            'Too many requests. Please try again later.',
            requestId,
          ),
        };
      }

      if (statusCode >= 500) {
        return {
          statusCode,
          body: this.createErrorEnvelope(
            'INTERNAL_SERVER_ERROR',
            'An unexpected error occurred.',
            requestId,
          ),
        };
      }

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode,
          body: {
            statusCode,
            message: exceptionResponse,
            error: exception.name,
          },
        };
      }

      return {
        statusCode,
        body: exceptionResponse,
      };
    }

    return {
      statusCode: 500,
      body: this.createErrorEnvelope(
        'INTERNAL_SERVER_ERROR',
        'An unexpected error occurred.',
        requestId,
      ),
    };
  }

  private createErrorEnvelope(
    code: string,
    message: string,
    requestId?: string,
  ): ApiErrorEnvelope {
    if (!requestId) {
      return {
        error: {
          code,
          message,
        },
      };
    }

    return {
      error: {
        code,
        message,
        details: {
          requestId,
        },
      },
    };
  }

  private isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
    if (typeof value !== 'object' || value === null || !('error' in value)) {
      return false;
    }

    const { error } = value as { error?: unknown };
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      'message' in error &&
      typeof error.message === 'string'
    );
  }
}
