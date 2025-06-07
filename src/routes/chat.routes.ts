import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all chat routes
router.use(authenticate);

/**
 * Conversation Management Routes
 */

// Start a new conversation
router.post('/conversations', ChatController.startConversation);

// Start a new conversation with an initial message
router.post('/conversations/chat', ChatController.newConversationWithMessage);

// Get conversation history
router.get('/conversations/:conversationId', ChatController.getConversation);

// List conversations for a project
router.get('/projects/:projectId/conversations', ChatController.listConversations);

// Update conversation (e.g., change title)
router.put('/conversations/:conversationId', ChatController.updateConversation);

// Delete a conversation
router.delete('/conversations/:conversationId', ChatController.deleteConversation);

/**
 * Message Routes
 */

// Send a message in an existing conversation
router.post('/messages', ChatController.sendMessage);

/**
 * RAG System Routes
 */

// Get RAG system status for a project
router.get('/projects/:projectId/rag/status', ChatController.getRAGStatus);

// Process all unprocessed documents in a project
router.post('/projects/:projectId/rag/process', ChatController.processProject);

// Health check for RAG services
router.get('/rag/health', ChatController.healthCheck);

export default router;
