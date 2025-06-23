import { NextFunction, Response } from "express";
import { z } from "zod";
import { createError } from "../middleware/error.middleware";
import { ragService } from "../services/rag.service";
import { LangChainDocumentProcessor } from "../services/langchain-document.service";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../utils/database";

// Validation schemas
const processDocumentSchema = z.object({
  force: z.string().optional(),
});

const educationalQuerySchema = z.object({
  query: z.string().min(1).max(5000),
  type: z.enum(["question", "summary", "quiz", "explanation"]).optional(),
});

export class EnhancedDocumentController {
  /**
   * Upload and process documents with LangChain
   */
  static async uploadDocuments(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId } = req.params;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw createError("No files provided", 400);
      }

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: req.user.id,
        },
      });

      if (!project) {
        throw createError("Project not found or access denied", 404);
      }

      // Process files with consolidated RAG service
      const result = await ragService.batchProcessDocuments(
        files,
        projectId,
        req.user.id
      );

      res.status(201).json({
        message: `Successfully processed ${result.successful} document(s)`,
        data: {
          uploaded: result.successful,
          failed: result.failed,
          results: result.results,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all documents for a project with enhanced information
   */
  static async getDocuments(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId } = req.params;

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: req.user.id,
        },
      });

      if (!project) {
        throw createError("Project not found or access denied", 404);
      }

      // Get project status
      const projectStatus = await ragService.getProjectStatus(
        projectId
      );

      res.status(200).json({
        message: "Documents retrieved successfully",
        data: projectStatus,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a specific document with enhanced analysis
   */
  static async getDocument(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId, docId } = req.params;

      // Verify project and document
      const document = await prisma.document.findFirst({
        where: {
          id: docId,
          projectId: projectId,
          project: {
            professorId: req.user.id,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              qdrantCollectionId: true,
            },
          },
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!document) {
        throw createError("Document not found or access denied", 404);
      }

      // Add enhanced information
      const enhancedDocument = {
        ...document,
        hasText: !!document.textContent,
        isProcessed: !!document.processedAt,
        supportedByLangChain: LangChainDocumentProcessor.isFileTypeSupported(
          document.originalName
        ),
        analysis: document.textContent
          ? LangChainDocumentProcessor.analyzeDocument(document.textContent)
          : null,
      };

      res.status(200).json({
        message: "Document retrieved successfully",
        data: enhancedDocument,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Process or reprocess a document with LangChain
   */
  static async processDocument(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId, docId } = req.params;
      const { force } = processDocumentSchema.parse(req.query);

      // Verify document exists and user has access
      const document = await prisma.document.findFirst({
        where: {
          id: docId,
          projectId: projectId,
          project: {
            professorId: req.user.id,
          },
        },
      });

      if (!document) {
        throw createError("Document not found or access denied", 404);
      }

      // Check if document is already processed (unless forcing)
      if (document.processedAt && force !== "true") {
        res.status(200).json({
          message: "Document already processed",
          data: {
            documentId: document.id,
            processedAt: document.processedAt,
            message: "Use force=true to reprocess",
          },
        });
        return;
      }

      // Process document
      const result =
        force === "true"
          ? await ragService.reprocessDocument(docId)
          : await ragService.processDocument(docId);

      res.status(200).json({
        message: result.success
          ? "Document processed successfully"
          : "Document processing failed",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a document and its embeddings
   */
  static async deleteDocument(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId, docId } = req.params;

      // Verify document exists and user has access
      const document = await prisma.document.findFirst({
        where: {
          id: docId,
          projectId: projectId,
          project: {
            professorId: req.user.id,
          },
        },
      });

      if (!document) {
        throw createError("Document not found or access denied", 404);
      }

      // Delete document using RAG service
      await ragService.deleteDocument(docId);

      // Delete from database
      await prisma.document.delete({
        where: {
          id: docId,
        },
      });

      res.status(200).json({
        message: "Document deleted successfully",
        data: {
          documentId: docId,
          filename: document.filename,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get document processing status for a project
   */
  static async getProcessingStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId } = req.params;

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: req.user.id,
        },
      });

      if (!project) {
        throw createError("Project not found or access denied", 404);
      }

      const status = await ragService.getProjectStatus(projectId);

      res.status(200).json({
        message: "Processing status retrieved successfully",
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Process all unprocessed documents in a project
   */
  static async processAllDocuments(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId } = req.params;

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: req.user.id,
        },
      });

      if (!project) {
        throw createError("Project not found or access denied", 404);
      }

      const results = await ragService.processProject(projectId);

      res.status(200).json({
        message: "Project processing completed",
        data: {
          projectId,
          results,
          totalDocuments: results.length,
          successfullyProcessed: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Educational query endpoint for documents
   */
  static async educationalQuery(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId } = req.params;
      const { query, type = "question" } = educationalQuerySchema.parse(
        req.body
      );

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: req.user.id,
        },
      });

      if (!project) {
        throw createError("Project not found or access denied", 404);
      }

      const result = await ragService.educationalQuery(
        projectId,
        query,
        type
      );

      res.status(200).json({
        message: "Educational query completed successfully",
        data: {
          query,
          type,
          ...result,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(createError("Invalid input", 400));
      }
      next(error);
    }
  }

  /**
   * Get LangChain configuration and health status
   */
  static async getSystemStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const [healthStatus, configuration] = await Promise.all([
        ragService.healthCheck(),
        ragService.getConfiguration(),
      ]);

      res.status(200).json({
        message: "System status retrieved successfully",
        data: {
          health: healthStatus,
          configuration,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get processing recommendations for a project
   */
  static async getRecommendations(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId } = req.params;

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: req.user.id,
        },
      });

      if (!project) {
        throw createError("Project not found or access denied", 404);
      }

      const recommendations =
        await ragService.getProcessingRecommendations(projectId);

      res.status(200).json({
        message: "Processing recommendations retrieved successfully",
        data: recommendations,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Analyze project documents
   */
  static async analyzeDocuments(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId } = req.params;

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: req.user.id,
        },
      });

      if (!project) {
        throw createError("Project not found or access denied", 404);
      }

      const analysis = await ragService.analyzeProjectDocuments(
        projectId
      );

      res.status(200).json({
        message: "Document analysis completed successfully",
        data: analysis,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export project data
   */
  static async exportProject(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw createError("User not authenticated", 401);
      }

      const { id: projectId } = req.params;

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId: req.user.id,
        },
      });

      if (!project) {
        throw createError("Project not found or access denied", 404);
      }

      const exportData = await ragService.exportProjectData(projectId);

      res.status(200).json({
        message: "Project data exported successfully",
        data: exportData,
      });
    } catch (error) {
      next(error);
    }
  }
}
