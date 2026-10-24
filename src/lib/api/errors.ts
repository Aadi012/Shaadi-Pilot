export type ErrorDetail = { field: string; reason: string };

type ApiErrorOptions = {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
};

// Only deliberately public messages/details belong in this error type.
// Raw provider and database errors should remain ordinary Errors.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetail[];

  constructor({ status, code, message, details }: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
