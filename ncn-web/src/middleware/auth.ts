import { Request, Response, NextFunction } from 'express';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized - Please login' });
};

export const getCurrentUser = (req: Request) => {
  if (req.user) {
    return req.user;
  }
  return null;
};

export const getCurrentUserLanId = (req: Request): string => {
  const user = req.user as any;
  return user?.lanId || '';
};
