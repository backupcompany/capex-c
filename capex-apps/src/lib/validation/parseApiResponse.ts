import type { ZodType, ZodError } from 'zod';

export class ApiValidationError extends Error {
  readonly source: string;
  readonly issues: string[];

  constructor(source: string, error: ZodError) {
    super(`Invalid API response (${source})`);
    this.name = 'ApiValidationError';
    this.source = source;
    this.issues = error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    });
  }
}

function logValidationFailure(source: string, error: ZodError): void {
  const summary = {
    source,
    issueCount: error.issues.length,
    fields: error.issues.slice(0, 8).map((issue) => issue.path.join('.') || '(root)'),
  };
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[api-validation]', summary, error.flatten());
  } else {
    console.warn('[api-validation]', summary);
  }
}

/** Strict parse — throws ApiValidationError (use for small critical payloads). */
export function parseApiResponse<T>(source: string, schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  logValidationFailure(source, result.error);
  throw new ApiValidationError(source, result.error);
}

/** Safe parse — returns fallback instead of crashing the UI. */
export function parseApiResponseOrFallback<T>(
  source: string,
  schema: ZodType<T>,
  raw: unknown,
  fallback: T,
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  logValidationFailure(source, result.error);
  return fallback;
}
