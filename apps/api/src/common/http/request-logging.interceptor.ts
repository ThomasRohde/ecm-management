import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import type { RequestWithContext } from './request-context';

interface ResponseWithStatusCode {
  statusCode?: number;
}

type LogLevel = 'log' | 'warn' | 'error';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithContext>();
    const response = httpContext.getResponse<ResponseWithStatusCode>();
    const startedAt = Date.now();
    const requestMetadata = {
      requestId: request.requestId ?? 'unknown',
      method: request.method ?? 'UNKNOWN',
      path: request.originalUrl ?? request.url ?? '',
      userId: typeof request.user?.sub === 'string' ? request.user.sub : undefined,
    };

    return next.handle().pipe(
      tap(() => {
        const statusCode = response.statusCode ?? 200;
        this.writeLog(this.resolveLogLevel(statusCode), {
          ...requestMetadata,
          statusCode,
          durationMs: Date.now() - startedAt,
        });
      }),
      catchError((error: unknown) => {
        const statusCode = this.resolveStatusCode(error, response.statusCode);
        this.writeLog(this.resolveLogLevel(statusCode), {
          ...requestMetadata,
          statusCode,
          durationMs: Date.now() - startedAt,
          errorCode: this.resolveErrorCode(error),
          errorMessage: this.resolveErrorMessage(error),
        });

        return throwError(() => error);
      }),
    );
  }

  private writeLog(level: LogLevel, payload: Record<string, unknown>): void {
    const serializedPayload = JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'request.completed',
      ...payload,
    });

    if (level === 'error') {
      this.logger.error(serializedPayload);
      return;
    }

    if (level === 'warn') {
      this.logger.warn(serializedPayload);
      return;
    }

    this.logger.log(serializedPayload);
  }

  private resolveLogLevel(statusCode: number): LogLevel {
    if (statusCode >= 500) {
      return 'error';
    }

    if (statusCode >= 400) {
      return 'warn';
    }

    return 'log';
  }

  private resolveStatusCode(error: unknown, fallbackStatusCode?: number): number {
    if (error instanceof HttpException) {
      return error.getStatus();
    }

    if (typeof fallbackStatusCode === 'number' && fallbackStatusCode >= 400) {
      return fallbackStatusCode;
    }

    return 500;
  }

  private resolveErrorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (
        typeof response === 'object' &&
        response !== null &&
        'error' in response &&
        typeof response.error === 'string'
      ) {
        return response.error;
      }

      if (
        typeof response === 'object' &&
        response !== null &&
        'error' in response &&
        typeof response.error === 'object' &&
        response.error !== null &&
        'code' in response.error &&
        typeof response.error.code === 'string'
      ) {
        return response.error.code;
      }
    }

    return 'INTERNAL_SERVER_ERROR';
  }

  private resolveErrorMessage(error: unknown): string | undefined {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (
        typeof response === 'object' &&
        response !== null &&
        'error' in response &&
        typeof response.error === 'object' &&
        response.error !== null &&
        'message' in response.error &&
        typeof response.error.message === 'string'
      ) {
        return response.error.message;
      }

      if (typeof response === 'string') {
        return response;
      }

      if (typeof response === 'object' && response !== null && 'message' in response) {
        const { message } = response as { message?: unknown };

        if (Array.isArray(message)) {
          return message.filter((value): value is string => typeof value === 'string').join('; ');
        }

        if (typeof message === 'string') {
          return message;
        }
      }

      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return undefined;
  }
}
