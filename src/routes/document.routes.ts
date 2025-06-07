import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateParams } from '../middleware/validation.middleware';
import { upload } from '../middleware/upload.middleware';
import { idParamsSchema } from '../utils/validation';

const router = Router();

// All document routes require authentication
router.use(authenticate);

// Document routes for projects
router.post('/:id/documents', 
  validateParams(idParamsSchema), 
  upload.array('files', 10), // Max 10 files
  DocumentController.uploadDocuments
);

router.get('/:id/documents', 
  validateParams(idParamsSchema), 
  DocumentController.getDocuments
);

router.get('/:id/documents/:docId', 
  validateParams(idParamsSchema), 
  DocumentController.getDocument
);

router.delete('/:id/documents/:docId', 
  validateParams(idParamsSchema), 
  DocumentController.deleteDocument
);

export default router;
