import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';

export class HttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new HttpError(404, 'not_found', 'Route not found'));
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    const httpError = error instanceof HttpError ? error : undefined;
    const status = httpError?.status ?? 500;
    const code = httpError?.code ?? 'internal_error';
    const message = httpError?.message ?? 'Internal server error';

    logger[status >= 500 ? 'error' : 'warn'](
      { err: error, requestId: request.id, status },
      'request failed',
    );

    response.status(status).json({
      error: { code, message, requestId: request.id },
    });
  };
}
