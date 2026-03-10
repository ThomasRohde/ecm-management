export const requestIdHeaderName = 'x-request-id';

export interface RequestWithContext {
  headers?: Record<string, string | string[] | undefined>;
  requestId?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  user?: {
    sub?: string;
  };
}
