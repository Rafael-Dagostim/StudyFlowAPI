import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ragService } from '../services/rag.service';
import { AuthenticatedRequest } from '../types';

const prisma = new PrismaClient();

// Validation schemas
const startConversationSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().optional(),
});

const sendMessageSchema = z.object({
  conversationId: z.string().cuid(),
  message: z.string().min(1).max(5000),
});

const newConversationSchema = z.object({
  projectId: z.string().cuid(),
  message: z.string().min(1).max(5000),
  title: z.string().optional(),
});

export class ChatController {
  /**
   * Start a new conversation
   */
  static async startConversation(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { projectId, title } = startConversationSchema.parse(req.body);
      const professorId = req.user?.id;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify project ownership
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId,
        },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Create conversation
      const conversation = await prisma.conversation.create({
        data: {
          projectId,
          title: title || `Conversation ${new Date().toLocaleDateString()}`,
        },
      });

      res.status(201).json({
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        createdAt: conversation.createdAt,
        messages: [],
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      
      res.status(500).json({ error: 'Failed to start conversation' });
    }
  }

  /**
   * Send a message in an existing conversation
   */
  static async sendMessage(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { conversationId, message } = sendMessageSchema.parse(req.body);
      const professorId = req.user?.id;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify conversation access
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          project: {
            professorId,
          },
        },
        include: {
          project: true,
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Save user message
      const userMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'USER',
          content: message,
        },
      });

      // Get conversation history for context
      const chatHistory = await ragService.getConversationHistory(conversationId);

      // Query RAG system with memory
      const ragResult = await ragService.queryDocumentsWithMemory(
        conversation.project.id, 
        message,
        chatHistory
      );

      // Save assistant message
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: ragResult.answer,
          metadata: {
            tokensUsed: ragResult.tokensUsed,
            sources: ragResult.sources,
          },
        },
      });

      // Return both messages
      res.json({
        userMessage: {
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          createdAt: userMessage.createdAt,
        },
        assistantMessage: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          createdAt: assistantMessage.createdAt,
          metadata: assistantMessage.metadata,
        },
        sources: ragResult.sources,
        tokensUsed: ragResult.tokensUsed,
      });
    } catch (error) {
      console.error('Error sending message:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      
      res.status(500).json({ error: 'Failed to send message' });
    }
  }

  /**
   * Start a new conversation with an initial message
   */
  static async newConversationWithMessage(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { projectId, message, title } = newConversationSchema.parse(req.body);
      const professorId = req.user?.id;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify project ownership
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId,
        },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Create conversation
      const conversation = await prisma.conversation.create({
        data: {
          projectId,
          title: title || `Chat: ${message.substring(0, 50)}...`,
        },
      });

      // Save user message
      const userMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'USER',
          content: message,
        },
      });

      // Query RAG system
      const ragResult = await ragService.queryDocuments(projectId, message);

      // Save assistant message
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: ragResult.answer,
          metadata: {
            tokensUsed: ragResult.tokensUsed,
            sources: ragResult.sources,
          },
        },
      });

      // Return conversation with messages
      res.status(201).json({
        conversation: {
          id: conversation.id,
          projectId: conversation.projectId,
          title: conversation.title,
          createdAt: conversation.createdAt,
        },
        messages: [
          {
            id: userMessage.id,
            role: userMessage.role,
            content: userMessage.content,
            createdAt: userMessage.createdAt,
          },
          {
            id: assistantMessage.id,
            role: assistantMessage.role,
            content: assistantMessage.content,
            createdAt: assistantMessage.createdAt,
            metadata: assistantMessage.metadata,
          },
        ],
        sources: ragResult.sources,
        tokensUsed: ragResult.tokensUsed,
      });
    } catch (error) {
      console.error('Error creating conversation with message:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  }

  /**
   * Get conversation history
   */
  static async getConversation(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { conversationId } = req.params;
      const professorId = req.user?.id;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          project: {
            professorId,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              subject: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      res.json({
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        project: conversation.project,
        messages: conversation.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
          metadata: msg.metadata,
        })),
      });
    } catch (error) {
      console.error('Error getting conversation:', error);
      res.status(500).json({ error: 'Failed to get conversation' });
    }
  }

  /**
   * List conversations for a project
   */
  static async listConversations(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { projectId } = req.params;
      const professorId = req.user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify project ownership
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId,
        },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const [conversations, total] = await Promise.all([
        prisma.conversation.findMany({
          where: { projectId },
          include: {
            messages: {
              select: {
                id: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.conversation.count({
          where: { projectId },
        }),
      ]);

      res.json({
        conversations: conversations.map(conv => ({
          id: conv.id,
          projectId: conv.projectId,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: conv.messages.length,
          lastMessageAt: conv.messages[0]?.createdAt || conv.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Error listing conversations:', error);
      res.status(500).json({ error: 'Failed to list conversations' });
    }
  }

  /**
   * Update conversation title
   */
  static async updateConversation(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { conversationId } = req.params;
      const { title } = z.object({ title: z.string().min(1).max(200) }).parse(req.body);
      const professorId = req.user?.id;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify conversation ownership
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          project: {
            professorId,
          },
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      });

      res.json({
        id: updatedConversation.id,
        title: updatedConversation.title,
        updatedAt: updatedConversation.updatedAt,
      });
    } catch (error) {
      console.error('Error updating conversation:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      
      res.status(500).json({ error: 'Failed to update conversation' });
    }
  }

  /**
   * Delete a conversation
   */
  static async deleteConversation(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { conversationId } = req.params;
      const professorId = req.user?.id;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify conversation ownership
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          project: {
            professorId,
          },
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      await prisma.conversation.delete({
        where: { id: conversationId },
      });

      res.json({ message: 'Conversation deleted successfully' });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  }

  /**
   * Get RAG system status for a project
   */
  static async getRAGStatus(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { projectId } = req.params;
      const professorId = req.user?.id;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify project ownership
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId,
        },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const status = await ragService.getProjectStatus(projectId);
      res.json(status);
    } catch (error) {
      console.error('Error getting RAG status:', error);
      res.status(500).json({ error: 'Failed to get RAG status' });
    }
  }

  /**
   * Process project documents for RAG
   */
  static async processProject(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const { projectId } = req.params;
      const professorId = req.user?.id;

      if (!professorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify project ownership
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          professorId,
        },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const results = await ragService.processProject(projectId);
      
      res.json({
        message: 'Project processing completed',
        results,
        totalDocuments: results.length,
        successfullyProcessed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      });
    } catch (error) {
      console.error('Error processing project:', error);
      res.status(500).json({ error: 'Failed to process project' });
    }
  }

  /**
   * Health check for RAG services
   */
  static async healthCheck(req: AuthenticatedRequest, res: Response): Promise<Response | void> {
    try {
      const healthStatus = await ragService.healthCheck();
      const configuration = ragService.getConfiguration();
      
      res.json({
        ...healthStatus,
        configuration,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error in RAG health check:', error);
      res.status(500).json({ error: 'Health check failed' });
    }
  }
}
