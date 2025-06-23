import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Create an API error with status code
 */
export const createError = (
  message: string,
  statusCode: number = 500
): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

/**
 * Global error handling middleware
 */
export const errorHandler = (
  error: ApiError | ZodError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error("Error occurred:", {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString(),
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation Error",
      message: "Invalid input data",
      details: error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
        code: err.code,
      })),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle API errors
  const apiError = error as ApiError;
  const statusCode = apiError.statusCode || 500;
  const message = apiError.message || "Internal Server Error";

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV !== "production";
  const responseMessage =
    statusCode >= 500 && !isDevelopment ? "Internal Server Error" : message;

  res.status(statusCode).json({
    error: getErrorName(statusCode),
    message: responseMessage,
    ...(isDevelopment && statusCode >= 500 && { stack: error.stack }),
    timestamp: new Date().toISOString(),
  });
};

/**
 * Get error name based on status code
 */
const getErrorName = (statusCode: number): string => {
  switch (statusCode) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 409:
      return "Conflict";
    case 422:
      return "Unprocessable Entity";
    case 429:
      return "Too Many Requests";
    case 500:
      return "Internal Server Error";
    case 502:
      return "Bad Gateway";
    case 503:
      return "Service Unavailable";
    default:
      return "Error";
  }
};

/**
 * Handle 404 routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Async wrapper to catch errors in async route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation error for specific use cases
 */
export class ValidationError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/**
 * Database error handler
 */
export class DatabaseError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
    this.statusCode = 500;
    this.isOperational = true;
  }
}

/**
 * External service error handler
 */
export class ExternalServiceError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public service: string;

  constructor(message: string, service: string, statusCode: number = 502) {
    super(message);
    this.name = "ExternalServiceError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.service = service;
  }
}
