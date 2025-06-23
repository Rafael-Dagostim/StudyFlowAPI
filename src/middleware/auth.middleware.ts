import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../types";
import { AuthUtils } from "../utils/auth";

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = AuthUtils.extractTokenFromHeader(req.headers.authorization);
    const payload = AuthUtils.verifyAccessToken(token);

    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({
      error: "Unauthorized",
      message: error instanceof Error ? error.message : "Authentication failed",
    });
  }
};
