import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller';
import { DocumentController } from '../controllers/document.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateBody, validateParams } from '../middleware/validation.middleware';
import { upload, handleMulterError } from '../middleware/upload.middleware';
import { createProjectSchema, updateProjectSchema, idParamsSchema, docParamsSchema } from '../utils/validation';

const router = Router();

// All project routes require authentication
router.use(authenticate);

// Project CRUD routes
router.post('/', validateBody(createProjectSchema), ProjectController.createProject);
router.get('/', ProjectController.getProjects);
router.get('/:id', validateParams(idParamsSchema), ProjectController.getProject);
router.put('/:id', validateParams(idParamsSchema), validateBody(updateProjectSchema), ProjectController.updateProject);
router.delete('/:id', validateParams(idParamsSchema), ProjectController.deleteProject);

// Document routes
router.post('/:id/documents', 
  validateParams(idParamsSchema), 
  upload.array('files', 10), 
  handleMulterError,
  DocumentController.uploadDocuments
);
router.get('/:id/documents', 
  validateParams(idParamsSchema), 
  DocumentController.getDocuments
);
router.get('/:id/documents/:docId', 
  validateParams(docParamsSchema), 
  DocumentController.getDocument
);
router.get('/:id/documents/:docId/download', 
  validateParams(docParamsSchema), 
  DocumentController.downloadDocument
);
router.delete('/:id/documents/:docId', 
  validateParams(docParamsSchema), 
  DocumentController.deleteDocument
);

// TODO: AI interaction routes will be added in Phase 3
// router.post('/:id/chat', aiRateLimiter, validate(chatSchema), AIController.chat);

export default router;
