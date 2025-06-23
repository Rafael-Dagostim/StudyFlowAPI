import { Router } from "express";
import { ChatController } from "../controllers/chat.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// Apply authentication middleware to all chat routes
router.use(authenticate);

/**
 * Conversation Management Routes
 */

// Start a new conversation
router.post("/conversations", ChatController.startConversation);

// Moved to WebSocket: Use socket.emit('chat:start', {...}) for new conversations with messages

// Get conversation history
router.get("/conversations/:conversationId", ChatController.getConversation);

// List conversations for a project
router.get(
  "/projects/:projectId/conversations",
  ChatController.listConversations
);

// Update conversation (e.g., change title)
router.put("/conversations/:conversationId", ChatController.updateConversation);

// Delete a conversation
router.delete(
  "/conversations/:conversationId",
  ChatController.deleteConversation
);

/**
 * Message Routes - Moved to WebSocket
 * Use socket.emit('chat:start', {...}) for real-time messaging
 */

/**
 * RAG System Routes
 */

// Get RAG system status for a project
router.get("/projects/:projectId/rag/status", ChatController.getRAGStatus);

// Process all unprocessed documents in a project
router.post("/projects/:projectId/rag/process", ChatController.processProject);

// Health check for RAG services
router.get("/rag/health", ChatController.healthCheck);

export default router;
