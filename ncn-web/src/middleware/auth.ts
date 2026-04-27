import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface JwtPayload {
  lanId: string;
  displayName: string;
  email: string;
  department: string;
  isAdmin: boolean;
}

/**
 * 从 JWT Cookie 中解析用户信息，挂载到 req.user
 */
export const jwtCookieMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[config.jwt.cookieName];
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
      (req as any).user = payload;
    } catch (err) {
      // Token 无效或过期，清除 Cookie
      res.clearCookie(config.jwt.cookieName);
      logger.debug('JWT token invalid or expired, cleared cookie');
    }
  }
  next();
};

/**
 * 签发 JWT 并写入 HttpOnly Cookie
 */
export const setJwtCookie = (res: Response, payload: JwtPayload) => {
  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as any
  });

  // 解析过期时间（秒）
  const expiresMs = parseExpiresIn(config.jwt.expiresIn);

  res.cookie(config.jwt.cookieName, token, {
    httpOnly: true,          // JS 无法读取，防 XSS
    secure: false,           // 内网 HTTP，不强制 HTTPS
    sameSite: 'lax',
    maxAge: expiresMs,       // 毫秒
    path: '/'
  });
};

/**
 * 清除 JWT Cookie（登出用）
 */
export const clearJwtCookie = (res: Response) => {
  res.clearCookie(config.jwt.cookieName, { path: '/' });
};

/**
 * 路由保护中间件：需要登录
 */
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (user?.lanId) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized - Please login' });
};

export const getCurrentUser = (req: Request): JwtPayload | null => {
  return (req as any).user || null;
};

export const getCurrentUserLanId = (req: Request): string => {
  return (req as any).user?.lanId || '';
};

// 解析 expiresIn 字符串为毫秒，例如 '7d' => 604800000
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1]);
  const unit = match[2];
  const multiplier: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return num * multiplier[unit];
}
