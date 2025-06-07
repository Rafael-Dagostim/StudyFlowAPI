import { Request, Response, NextFunction } from 'express';

// Simple rate limiter implementation
const requests = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 minutes
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');

const cleanupOldEntries = () => {
  const now = Date.now();
  for (const [key, value] of requests.entries()) {
    if (now > value.resetTime) {
      requests.delete(key);
    }
  }
};

export const rateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  cleanupOldEntries();
  
  const userRequests = requests.get(ip);
  
  if (!userRequests) {
    requests.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    next();
    return;
  }
  
  if (now > userRequests.resetTime) {
    requests.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    next();
    return;
  }
  
  if (userRequests.count >= MAX_REQUESTS) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.'
    });
    return;
  }
  
  userRequests.count++;
  next();
};

// More restrictive rate limiter for auth endpoints
export const authRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const authKey = `auth_${ip}`;
  
  cleanupOldEntries();
  
  const userRequests = requests.get(authKey);
  
  if (!userRequests) {
    requests.set(authKey, { count: 1, resetTime: now + WINDOW_MS });
    next();
    return;
  }
  
  if (now > userRequests.resetTime) {
    requests.set(authKey, { count: 1, resetTime: now + WINDOW_MS });
    next();
    return;
  }
  
  if (userRequests.count >= 5) { // 5 auth attempts per window
    res.status(429).json({
      error: 'Too Many Authentication Attempts',
      message: 'Too many authentication attempts, please try again later.'
    });
    return;
  }
  
  userRequests.count++;
  next();
};

// Rate limiter for AI endpoints (more restrictive)
export const aiRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const aiKey = `ai_${ip}`;
  
  cleanupOldEntries();
  
  const userRequests = requests.get(aiKey);
  
  if (!userRequests) {
    requests.set(aiKey, { count: 1, resetTime: now + WINDOW_MS });
    next();
    return;
  }
  
  if (now > userRequests.resetTime) {
    requests.set(aiKey, { count: 1, resetTime: now + WINDOW_MS });
    next();
    return;
  }
  
  if (userRequests.count >= 20) { // 20 AI requests per window
    res.status(429).json({
      error: 'Too Many AI Requests',
      message: 'Too many AI requests, please try again later.'
    });
    return;
  }
  
  userRequests.count++;
  next();
};
