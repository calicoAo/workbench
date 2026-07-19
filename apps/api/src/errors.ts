export const ErrorCode = {
  SUCCESS: 0,
  PARAM_ERROR: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  SERVER_ERROR: 50000
} as const;

export class BusinessError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 500 = 400
  ) {
    super(message);
  }
}
