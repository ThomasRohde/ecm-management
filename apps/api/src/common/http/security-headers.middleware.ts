import { Injectable, type NestMiddleware } from '@nestjs/common';

interface ResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: unknown, res: ResponseWithHeaders, next: () => void): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    next();
  }
}
