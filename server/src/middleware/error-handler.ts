import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

// http-errors / body-parser 互換のエラー形（status / statusCode / expose）を尊重する。
// expose が true（4xx 系・クライアント表示前提）のときだけ err.message を素通しする。
// それ以外（500 系・素の Error）は内部実装の文言が漏れないよう "Internal Server Error" に塗り潰す。
type HttpError = Error & {
  status?: number;
  statusCode?: number;
  expose?: boolean;
};

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const reqLogger = (req as Request & { log?: typeof logger }).log ?? logger;
  reqLogger.error({ err }, err.message || 'Internal Server Error');

  const status = err.status ?? err.statusCode ?? 500;
  const exposeMessage = err.expose === true && typeof err.message === 'string' && err.message.length > 0;
  const error = exposeMessage ? err.message : 'Internal Server Error';

  res.status(status).json({
    success: false,
    data: null,
    error,
  });
}
