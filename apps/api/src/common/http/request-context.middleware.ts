import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { requestIdHeaderName, type RequestWithContext } from './request-context';

interface ResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: ResponseWithHeaders, next: () => void): void {
    const requestId = this.readHeaderValue(req.headers?.[requestIdHeaderName]) ?? randomUUID();

    req.requestId = requestId;
    res.setHeader(requestIdHeaderName, requestId);
    next();
  }

  private readHeaderValue(value: string | string[] | undefined): string | null {
    const candidateValue = Array.isArray(value) ? value[0] : value;

    if (typeof candidateValue !== 'string') {
      return null;
    }

    const trimmedValue = candidateValue.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }
}
