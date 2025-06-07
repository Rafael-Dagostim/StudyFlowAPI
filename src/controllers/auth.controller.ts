import { Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { AuthUtils } from '../utils/auth';
import { createError } from '../middleware/error.middleware';
import { AuthenticatedRequest, SignUpRequest, SignInRequest, AuthResponse } from '../types';

export class AuthController {
  /**
   * Sign up a new professor
   */
  static async signUp(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { name, email, password }: SignUpRequest = req.body;

      // Check if professor already exists
      const existingProfessor = await prisma.professor.findUnique({
        where: { email }
      });

      if (existingProfessor) {
        throw createError('A professor with this email already exists', 409);
      }

      // Hash password
      const hashedPassword = await AuthUtils.hashPassword(password);

      // Create professor
      const professor = await prisma.professor.create({
        data: {
          name,
          email,
          password: hashedPassword
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true
        }
      });

      // Generate tokens
      const { accessToken, refreshToken } = AuthUtils.generateTokens({
        id: professor.id,
        email: professor.email,
        name: professor.name
      });

      const response: AuthResponse = {
        professor: {
          id: professor.id,
          name: professor.name,
          email: professor.email
        },
        accessToken,
        refreshToken
      };

      res.status(201).json({
        message: 'Professor registered successfully',
        data: response
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sign in a professor
   */
  static async signIn(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password }: SignInRequest = req.body;

      // Find professor
      const professor = await prisma.professor.findUnique({
        where: { email }
      });

      if (!professor) {
        throw createError('Invalid email or password', 401);
      }

      // Verify password
      const isPasswordValid = await AuthUtils.comparePassword(password, professor.password);

      if (!isPasswordValid) {
        throw createError('Invalid email or password', 401);
      }

      // Generate tokens
      const { accessToken, refreshToken } = AuthUtils.generateTokens({
        id: professor.id,
        email: professor.email,
        name: professor.name
      });

      const response: AuthResponse = {
        professor: {
          id: professor.id,
          name: professor.name,
          email: professor.email
        },
        accessToken,
        refreshToken
      };

      res.status(200).json({
        message: 'Professor signed in successfully',
        data: response
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw createError('Refresh token is required', 400);
      }

      // Verify refresh token
      const payload = AuthUtils.verifyRefreshToken(refreshToken);

      // Verify professor still exists
      const professor = await prisma.professor.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          name: true,
          email: true
        }
      });

      if (!professor) {
        throw createError('Professor not found', 404);
      }

      // Generate new tokens
      const tokens = AuthUtils.generateTokens({
        id: professor.id,
        email: professor.email,
        name: professor.name
      });

      res.status(200).json({
        message: 'Token refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current professor profile
   */
  static async getProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError('User not authenticated', 401);
      }

      const professor = await prisma.professor.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          _count: {
            select: {
              projects: true
            }
          }
        }
      });

      if (!professor) {
        throw createError('Professor not found', 404);
      }

      res.status(200).json({
        message: 'Profile retrieved successfully',
        data: professor
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update professor profile
   */
  static async updateProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError('User not authenticated', 401);
      }

      const { name } = req.body;

      const updatedProfessor = await prisma.professor.update({
        where: { id: req.user.id },
        data: { name },
        select: {
          id: true,
          name: true,
          email: true,
          updatedAt: true
        }
      });

      res.status(200).json({
        message: 'Profile updated successfully',
        data: updatedProfessor
      });
    } catch (error) {
      next(error);
    }
  }
}
