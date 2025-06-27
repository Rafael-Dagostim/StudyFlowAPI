import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { GeneratedFilesService, CreateFileParams, EditFileParams } from '../services/generated-files.service';
import { PDFService } from '../services/pdf.service';
import { RAGService } from '../services/rag.service';
import { OpenAIService } from '../services/openai.service';
import { S3Service } from '../services/s3.service';
import { prisma } from '../utils/database';
import { z } from 'zod';
import { createError } from '../middleware/error.middleware';

// Validation schemas
const createFileSchema = z.object({
  prompt: z.string().min(10).max(2000),
  displayName: z.string().min(1).max(100),
  fileType: z.enum(['study-guide', 'quiz', 'summary', 'lesson-plan', 'custom']),
  format: z.enum(['pdf', 'markdown', 'docx']),
  options: z.object({
    includeImages: z.boolean().optional(),
    language: z.enum(['en', 'pt']).optional(),
    difficulty: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    customPrompt: z.string().optional()
  }).optional()
});

const editFileSchema = z.object({
  editPrompt: z.string().min(10).max(1000),
  baseVersion: z.number().int().positive().optional()
});

export class GeneratedFilesController {
  private generatedFilesService: GeneratedFilesService;

  constructor() {
    // Initialize services properly
    this.generatedFilesService = new GeneratedFilesService();
  }

  async createFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw createError('Unauthorized', 401);
      }

      // Validate request body
      const validatedData = createFileSchema.parse(req.body);

      // Check if user has access to project
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: userId
        }
      });

      if (!project) {
        throw createError('Project not found or access denied', 404);
      }

      // Create file generation parameters
      const params: CreateFileParams = {
        projectId,
        professorId: userId,
        prompt: validatedData.prompt,
        displayName: validatedData.displayName,
        fileType: validatedData.fileType,
        format: validatedData.format,
        options: validatedData.options
      };

      // Generate file (this runs in background)
      const file = await this.generatedFilesService.createFile(params);

      res.status(201).json({
        success: true,
        data: {
          fileId: file.id,
          fileName: file.fileName,
          displayName: file.displayName,
          version: file.currentVersion,
          status: 'processing',
          message: 'File generation started successfully'
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createError('Validation error: ' + error.errors.map(e => e.message).join(', '), 400);
      }
      throw error;
    }
  }

  async editFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId, fileId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw createError('Unauthorized', 401);
      }

      // Validate request body
      const validatedData = editFileSchema.parse(req.body);

      // Check if user has access to the file
      const file = await prisma.generatedFile.findFirst({
        where: {
          id: fileId,
          projectId,
          professorId: userId
        }
      });

      if (!file) {
        throw createError('File not found or access denied', 404);
      }

      // Create new version
      const params: EditFileParams = {
        fileId,
        editPrompt: validatedData.editPrompt,
        baseVersion: validatedData.baseVersion
      };

      const newVersion = await this.generatedFilesService.createNewVersion(params);

      res.json({
        success: true,
        data: {
          fileId,
          version: newVersion.version,
          status: 'processing',
          message: 'File edit started successfully'
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createError('Validation error: ' + error.errors.map(e => e.message).join(', '), 400);
      }
      throw error;
    }
  }

  async listProjectFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw createError('Unauthorized', 401);
      }

      // Check if user has access to project
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: userId
        }
      });

      if (!project) {
        throw createError('Project not found or access denied', 404);
      }

      // Get all files for the project
      const files = await this.generatedFilesService.getProjectFiles(projectId);

      // Format response
      const formattedFiles = files.map(file => ({
        id: file.id,
        fileName: file.fileName,
        displayName: file.displayName,
        fileType: file.fileType,
        format: file.format,
        currentVersion: file.currentVersion,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        versions: (file as any).versions?.map((version: any) => ({
          version: version.version,
          createdAt: version.createdAt,
          sizeBytes: version.sizeBytes,
          pageCount: version.pageCount,
          generationTime: version.generationTime,
          editPrompt: version.editPrompt,
          hasContent: !!version.s3Key
        })) || []
      }));

      res.json({
        success: true,
        data: {
          files: formattedFiles,
          total: formattedFiles.length
        }
      });

    } catch (error) {
      throw error;
    }
  }

  async getFileDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId, fileId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw createError('Unauthorized', 401);
      }

      // Check if user has access to the file
      const file = await this.generatedFilesService.getFileById(fileId);

      if (!file || file.projectId !== projectId || file.professorId !== userId) {
        throw createError('File not found or access denied', 404);
      }

      // Format response
      const formattedFile = {
        id: file.id,
        fileName: file.fileName,
        displayName: file.displayName,
        fileType: file.fileType,
        format: file.format,
        currentVersion: file.currentVersion,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        versions: (file as any).versions?.map((version: any) => ({
          version: version.version,
          prompt: version.version === 1 ? version.prompt : undefined,
          editPrompt: version.editPrompt,
          baseVersion: version.baseVersion,
          createdAt: version.createdAt,
          sizeBytes: version.sizeBytes,
          pageCount: version.pageCount,
          generationTime: version.generationTime,
          contextUsed: version.contextUsed,
          hasContent: !!version.s3Key
        })) || []
      };

      res.json({
        success: true,
        data: formattedFile
      });

    } catch (error) {
      throw error;
    }
  }

  async downloadFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId, fileId } = req.params;
      const version = req.query.version ? parseInt(req.query.version as string) : undefined;
      const userId = req.user?.id;

      if (!userId) {
        throw createError('Unauthorized', 401);
      }

      // Check if user has access to the file
      const file = await this.generatedFilesService.getFileById(fileId);

      if (!file || file.projectId !== projectId || file.professorId !== userId) {
        throw createError('File not found or access denied', 404);
      }

      // Download file
      const { buffer, metadata } = await this.generatedFilesService.downloadFile(fileId, version);

      // Set response headers
      res.setHeader('Content-Type', metadata.contentType);
      res.setHeader('Content-Length', metadata.size);
      res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename}"`);

      // Send file
      res.send(buffer);

    } catch (error) {
      throw error;
    }
  }

  async deleteFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId, fileId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw createError('Unauthorized', 401);
      }

      // Check if user has access to the file
      const file = await this.generatedFilesService.getFileById(fileId);

      if (!file || file.projectId !== projectId || file.professorId !== userId) {
        throw createError('File not found or access denied', 404);
      }

      // Delete file
      await this.generatedFilesService.deleteFile(fileId);

      res.json({
        success: true,
        message: 'File deleted successfully'
      });

    } catch (error) {
      throw error;
    }
  }

  async getGenerationStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId, fileId } = req.params;
      const version = req.query.version ? parseInt(req.query.version as string) : undefined;
      const userId = req.user?.id;

      if (!userId) {
        throw createError('Unauthorized', 401);
      }

      // Check if user has access to the file
      const file = await this.generatedFilesService.getFileById(fileId);

      if (!file || file.projectId !== projectId || file.professorId !== userId) {
        throw createError('File not found or access denied', 404);
      }

      const targetVersion = version || file.currentVersion;
      const fileVersion = (file as any).versions?.find((v: any) => v.version === targetVersion);

      if (!fileVersion) {
        throw createError('Version not found', 404);
      }

      // Use the actual status from database
      const status = fileVersion.status || 'pending';
      
      res.json({
        success: true,
        data: {
          fileId,
          version: targetVersion,
          status,
          generationTime: fileVersion.generationTime,
          sizeBytes: fileVersion.sizeBytes,
          pageCount: fileVersion.pageCount,
          errorMessage: fileVersion.errorMessage,
          downloadUrl: status === 'completed' ? `/api/projects/${projectId}/generated-files/${fileId}/download?version=${targetVersion}` : null
        }
      });

    } catch (error) {
      throw error;
    }
  }

  async getFileTypes(req: AuthenticatedRequest, res: Response): Promise<void> {
    const fileTypes = [
      {
        id: 'study-guide',
        name: 'Study Guide',
        description: 'Comprehensive learning materials with key concepts, examples, and practice questions',
        formats: ['pdf', 'markdown']
      },
      {
        id: 'quiz',
        name: 'Quiz',
        description: 'Assessment with multiple choice, short answer, and essay questions',
        formats: ['pdf', 'markdown']
      },
      {
        id: 'summary',
        name: 'Summary',
        description: 'Concise overview of key topics and concepts',
        formats: ['pdf', 'markdown']
      },
      {
        id: 'lesson-plan',
        name: 'Lesson Plan',
        description: 'Structured teaching plan with objectives, activities, and assessments',
        formats: ['pdf', 'markdown']
      },
      {
        id: 'custom',
        name: 'Custom Document',
        description: 'Custom content based on your specific requirements',
        formats: ['pdf', 'markdown', 'docx']
      }
    ];

    res.json({
      success: true,
      data: { fileTypes }
    });
  }

  async getHTMLContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId, fileId } = req.params;
      const userId = req.user?.id;
      const version = req.query.version ? parseInt(req.query.version as string) : undefined;

      if (!userId) {
        throw createError('Unauthorized', 401);
      }

      // Verify project access
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: userId
        }
      });

      if (!project) {
        throw createError('Project not found or access denied', 404);
      }

      // Get file and verify access
      const file = await prisma.generatedFile.findFirst({
        where: {
          id: fileId,
          projectId: projectId
        },
        include: {
          versions: {
            orderBy: { version: 'desc' }
          }
        }
      });

      if (!file) {
        throw createError('File not found or access denied', 404);
      }

      // Determine which version to get
      const targetVersion = version || file.currentVersion;
      const fileVersion = file.versions.find(v => v.version === targetVersion);

      if (!fileVersion) {
        throw createError('Version not found', 404);
      }

      // For PDF format, return the stored HTML content
      if (file.format === 'pdf') {
        // In a real implementation, you'd read from S3
        // For now, we'll regenerate the HTML from the stored content
        res.set('Content-Type', 'text/html');
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${file.displayName}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; margin-bottom: 30px; }
              .content { max-width: 800px; margin: 0 auto; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${file.displayName}</h1>
              <div class="metadata">Generated on ${new Date().toLocaleDateString()}</div>
            </div>
            <div class="content">
              <p>HTML content for ${file.fileType} would be generated here.</p>
              <p>File: ${file.fileName}</p>
              <p>Version: ${targetVersion}</p>
            </div>
          </body>
          </html>
        `);
      } else {
        throw createError('HTML content only available for PDF format', 400);
      }

    } catch (error) {
      throw error;
    }
  }
}