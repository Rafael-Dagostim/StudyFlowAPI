import { Router } from 'express';
import { GeneratedFilesController } from '../controllers/generated-files.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const generatedFilesController = new GeneratedFilesController();

// Apply auth middleware to all routes
router.use(authenticate);

// GET /api/projects/:projectId/generated-files/types - Get available file types
router.get(
  '/:projectId/generated-files/types',
  generatedFilesController.getFileTypes.bind(generatedFilesController)
);

// POST /api/projects/:projectId/generated-files - Create new file
router.post(
  '/:projectId/generated-files',
  generatedFilesController.createFile.bind(generatedFilesController)
);

// GET /api/projects/:projectId/generated-files - List project files
router.get(
  '/:projectId/generated-files',
  generatedFilesController.listProjectFiles.bind(generatedFilesController)
);

// GET /api/projects/:projectId/generated-files/:fileId - Get file details
router.get(
  '/:projectId/generated-files/:fileId',
  generatedFilesController.getFileDetails.bind(generatedFilesController)
);

// POST /api/projects/:projectId/generated-files/:fileId/versions - Create new version (edit)
router.post(
  '/:projectId/generated-files/:fileId/versions',
  generatedFilesController.editFile.bind(generatedFilesController)
);

// GET /api/projects/:projectId/generated-files/:fileId/status - Get generation status
router.get(
  '/:projectId/generated-files/:fileId/status',
  generatedFilesController.getGenerationStatus.bind(generatedFilesController)
);

// GET /api/projects/:projectId/generated-files/:fileId/download - Download file
router.get(
  '/:projectId/generated-files/:fileId/download',
  generatedFilesController.downloadFile.bind(generatedFilesController)
);

// GET /api/projects/:projectId/generated-files/:fileId/html - Get HTML content for PDF generation
router.get(
  '/:projectId/generated-files/:fileId/html',
  generatedFilesController.getHTMLContent.bind(generatedFilesController)
);

// DELETE /api/projects/:projectId/generated-files/:fileId - Delete file
router.delete(
  '/:projectId/generated-files/:fileId',
  generatedFilesController.deleteFile.bind(generatedFilesController)
);

export default router;