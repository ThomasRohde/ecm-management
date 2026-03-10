import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { RequestWithContext } from './request-context';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const forwardedTracker = this.readForwardedTracker(req);
    if (forwardedTracker) {
      return forwardedTracker;
    }

    const ipAddress = typeof req.ip === 'string' ? req.ip.trim() : '';
    if (ipAddress.length > 0) {
      return ipAddress;
    }

    return super.getTracker(req);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const requestId =
      typeof request.requestId === 'string' && request.requestId.trim().length > 0
        ? request.requestId
        : undefined;

    throw new HttpException({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: await this.getErrorMessage(context, throttlerLimitDetail),
        ...(requestId
          ? {
              details: {
                requestId,
              },
            }
          : {}),
      },
    }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private readForwardedTracker(req: Record<string, unknown>): string | null {
    const headers = req.headers;
    if (typeof headers !== 'object' || headers === null) {
      return null;
    }

    const forwardedHeader = (headers as Record<string, unknown>)['x-forwarded-for'];
    const firstForwardedValue = Array.isArray(forwardedHeader)
      ? forwardedHeader[0]
      : forwardedHeader;

    if (typeof firstForwardedValue !== 'string') {
      return null;
    }

    const tracker = firstForwardedValue.split(',')[0]?.trim() ?? '';
    return tracker.length > 0 ? tracker : null;
  }
}
