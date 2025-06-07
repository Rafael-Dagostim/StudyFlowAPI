import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
// Rate limiting disabled for MVP
// import { authRateLimiter } from '../middleware/rateLimiter.middleware';
import { signUpSchema, signInSchema, updateProfileSchema } from '../utils/validation';

const router = Router();

// Rate limiter disabled for MVP
// router.use(authRateLimiter);

// Public routes
router.post('/signup', validateBody(signUpSchema), AuthController.signUp);
router.post('/signin', validateBody(signInSchema), AuthController.signIn);
router.post('/refresh', AuthController.refreshToken);

// Protected routes
router.get('/profile', authenticate, AuthController.getProfile);
router.put('/profile', authenticate, validateBody(updateProfileSchema), AuthController.updateProfile);

export default router;
