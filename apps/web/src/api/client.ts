const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

function createApiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiErrorResponseBody {
  message?: string | string[];
}

function getResponseMessages(details: unknown): string[] {
  if (!details || typeof details !== 'object') {
    return [];
  }

  const { message } = details as ApiErrorResponseBody;

  if (Array.isArray(message)) {
    return message.filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
  }

  if (typeof message === 'string' && message.trim().length > 0) {
    return [message];
  }

  return [];
}

export function getApiErrorMessages(
  error: unknown,
  fallbackMessage = 'The request could not be completed.',
): string[] {
  if (error instanceof ApiError) {
    const responseMessages = getResponseMessages(error.details);

    if (responseMessages.length > 0) {
      return responseMessages;
    }

    if (error.message.trim().length > 0) {
      return [error.message];
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return [error.message];
  }

  return [fallbackMessage];
}

export function getApiErrorMessage(
  error: unknown,
  fallbackMessage = 'The request could not be completed.',
): string {
  return getApiErrorMessages(error, fallbackMessage)[0] ?? fallbackMessage;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      // Response body is not JSON
    }
    throw new ApiError(response.status, `API error: ${response.statusText}`, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.text();
  if (!body) {
    return undefined as T;
  }

  return JSON.parse(body) as T;
}

type ExtraHeaders = Record<string, string>;

export const apiClient = {
  async get<T>(path: string, extraHeaders?: ExtraHeaders): Promise<T> {
    const response = await fetch(createApiUrl(path), {
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    });
    return handleResponse<T>(response);
  },

  async post<T>(path: string, body: unknown, extraHeaders?: ExtraHeaders): Promise<T> {
    const response = await fetch(createApiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async put<T>(path: string, body: unknown, extraHeaders?: ExtraHeaders): Promise<T> {
    const response = await fetch(createApiUrl(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async patch<T>(path: string, body: unknown, extraHeaders?: ExtraHeaders): Promise<T> {
    const response = await fetch(createApiUrl(path), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async delete<T>(path: string, extraHeaders?: ExtraHeaders): Promise<T> {
    const response = await fetch(createApiUrl(path), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    });
    return handleResponse<T>(response);
  },
};
