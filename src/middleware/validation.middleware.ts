import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { createError } from "./error.middleware";

/**
 * Middleware to validate request parameters using Zod schemas
 */
export const validateParams = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedParams = schema.parse(req.params);
      req.params = validatedParams;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(createError("Invalid request parameters", 400));
      } else {
        next(error);
      }
    }
  };
};

/**
 * Middleware to validate request body using Zod schemas
 */
export const validateBody = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedBody = schema.parse(req.body);
      req.body = validatedBody;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(createError("Invalid request body", 400));
      } else {
        next(error);
      }
    }
  };
};

/**
 * Middleware to validate request query parameters using Zod schemas
 */
export const validateQuery = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedQuery = schema.parse(req.query);
      req.query = validatedQuery;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(createError("Invalid query parameters", 400));
      } else {
        next(error);
      }
    }
  };
};
