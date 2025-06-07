import { NextFunction, Response } from "express";
import { createError } from "../middleware/error.middleware";
import { LangChainDocumentProcessor } from "../services/langchain-document.service";
import { S3Service } from "../services/s3.service";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../utils/database";

export class DocumentController {
  /**
   * Upload documents to a project
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

      const uploadedDocuments = [];

      for (const file of files) {
        try {
          // Validate file type
          const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(",") || [
            "pdf",
            "docx",
            "doc",
            "txt",
            "md",
          ];
          const fileExtension = file.originalname
            .split(".")
            .pop()
            ?.toLowerCase();

          if (!fileExtension || !allowedTypes.includes(fileExtension)) {
            throw createError(
              `File type .${fileExtension} not allowed. Allowed types: ${allowedTypes.join(
                ", "
              )}`,
              400
            );
          }

          const s3Key = await S3Service.uploadFile(file, projectId);

          // Extract text content with LangChain
          const processResult =
            await LangChainDocumentProcessor.processDocument(file);
          const textContent = processResult.text;

          // Save document metadata to database
          const document = await prisma.document.create({
            data: {
              filename: file.originalname,
              originalName: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              s3Key: s3Key,
              s3Bucket: process.env.AWS_S3_BUCKET!,
              textContent: textContent,
              projectId: projectId,
              uploadedById: req.user.id,
            },
          });

          uploadedDocuments.push(document);
        } catch (error) {
          console.error(`Error processing file ${file.originalname}:`, error);
          // Continue with other files, but log the error
        }
      }

      if (uploadedDocuments.length === 0) {
        throw createError("No files were successfully uploaded", 400);
      }

      res.status(201).json({
        message: `Successfully uploaded ${uploadedDocuments.length} document(s)`,
        data: {
          uploaded: uploadedDocuments.length,
          failed: files.length - uploadedDocuments.length,
          documents: uploadedDocuments.map((doc) => ({
            id: doc.id,
            filename: doc.filename,
            size: doc.size,
            mimeType: doc.mimeType,
            uploadedAt: doc.createdAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all documents for a project
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

      const documents = await prisma.document.findMany({
        where: {
          projectId: projectId,
        },
        select: {
          id: true,
          filename: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
          updatedAt: true,
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.status(200).json({
        message: "Documents retrieved successfully",
        data: {
          projectId,
          documents,
          totalCount: documents.length,
          totalSize: documents.reduce((sum, doc) => sum + doc.size, 0),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a specific document
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

      res.status(200).json({
        message: "Document retrieved successfully",
        data: document,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download a document
   */
  static async downloadDocument(
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

      const downloadUrl = await S3Service.getDownloadUrl(document.s3Key);

      res.status(200).json({
        message: "Download URL generated successfully",
        data: {
          documentId: document.id,
          filename: document.filename,
          downloadUrl: downloadUrl,
          expiresIn: "1 hour",
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a document
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

      await S3Service.deleteFile(document.s3Key);

      // Delete from database
      await prisma.document.delete({
        where: {
          id: docId,
        },
      });

      res.status(200).json({
        message: "Document deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}
