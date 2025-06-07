import { Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { createError } from '../middleware/error.middleware';
import { AuthenticatedRequest, CreateProjectRequest, UpdateProjectRequest } from '../types';

export class ProjectController {
  /**
   * Create a new project
   */
  static async createProject(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError('User not authenticated', 401);
      }

      const { name, subject, description }: CreateProjectRequest = req.body;

      const project = await prisma.project.create({
        data: {
          name,
          subject,
          description,
          professorId: req.user.id
        },
        include: {
          professor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              documents: true,
              conversations: true
            }
          }
        }
      });

      res.status(201).json({
        message: 'Project created successfully',
        data: project
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all projects for the authenticated professor
   */
  static async getProjects(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError('User not authenticated', 401);
      }

      const projects = await prisma.project.findMany({
        where: {
          professorId: req.user.id
        },
        include: {
          _count: {
            select: {
              documents: true,
              conversations: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      res.status(200).json({
        message: 'Projects retrieved successfully',
        data: projects
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a specific project by ID
   */
  static async getProject(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError('User not authenticated', 401);
      }

      const { id } = req.params;

      const project = await prisma.project.findFirst({
        where: {
          id,
          professorId: req.user.id
        },
        include: {
          professor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          documents: {
            select: {
              id: true,
              originalName: true,
              size: true,
              mimeType: true,
              processedAt: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          conversations: {
            select: {
              id: true,
              title: true,
              createdAt: true,
              _count: {
                select: {
                  messages: true
                }
              }
            },
            orderBy: {
              updatedAt: 'desc'
            }
          }
        }
      });

      if (!project) {
        throw createError('Project not found', 404);
      }

      res.status(200).json({
        message: 'Project retrieved successfully',
        data: project
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a project
   */
  static async updateProject(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError('User not authenticated', 401);
      }

      const { id } = req.params;
      const updateData: UpdateProjectRequest = req.body;

      // Check if project exists and belongs to the user
      const existingProject = await prisma.project.findFirst({
        where: {
          id,
          professorId: req.user.id
        }
      });

      if (!existingProject) {
        throw createError('Project not found', 404);
      }

      const updatedProject = await prisma.project.update({
        where: { id },
        data: updateData,
        include: {
          professor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              documents: true,
              conversations: true
            }
          }
        }
      });

      res.status(200).json({
        message: 'Project updated successfully',
        data: updatedProject
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a project
   */
  static async deleteProject(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError('User not authenticated', 401);
      }

      const { id } = req.params;

      // Check if project exists and belongs to the user
      const existingProject = await prisma.project.findFirst({
        where: {
          id,
          professorId: req.user.id
        }
      });

      if (!existingProject) {
        throw createError('Project not found', 404);
      }

      // TODO: Delete from Qdrant and S3 before deleting from database
      // This will be implemented in Phase 2

      await prisma.project.delete({
        where: { id }
      });

      res.status(200).json({
        message: 'Project deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}
