/**
 * Base API client for communicating with the admin backend.
 * Handles fetch, error handling, and retry logic.
 */

const ADMIN_API = __DEV__ ? 'http://localhost:3000' : 'https://english-learning-admin.fly.dev';

declare const __DEV__: boolean;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions {
  retries?: number;
  retryDelay?: number;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { retries = 2, retryDelay = 1000 } = options;
  const url = `${ADMIN_API}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new ApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          url,
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (attempt === retries) throw error;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        throw error; // Don't retry client errors
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
    }
  }

  throw new Error('Unreachable');
}
