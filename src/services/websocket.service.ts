import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/database';

export interface SocketUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers = new Map<string, SocketUser>();

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: true,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: any, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        console.log('WebSocket JWT decoded:', { id: decoded.id, professorId: decoded.professorId, email: decoded.email });
        
        // Get user from database
        const user = await prisma.professor.findUnique({
          where: { id: decoded.id || decoded.professorId }, // Support both id and professorId
          select: { id: true, name: true, email: true }
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.user = user;
        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        console.error('Token provided:', socket.handshake.auth.token ? 'Present' : 'Missing');
        next(new Error('Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.user?.name} connected (${socket.id})`);
      
      // Store connected user
      this.connectedUsers.set(socket.id, socket.user!);

      // Join user to their personal room
      socket.join(`user:${socket.user?.id}`);

      // Handle chat streaming events
      this.setupChatHandlers(socket);

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.user?.name} disconnected (${socket.id})`);
        this.connectedUsers.delete(socket.id);
      });
    });
  }

  private setupChatHandlers(socket: AuthenticatedSocket) {
    // Handle new chat message with streaming
    socket.on('chat:start', async (data: {
      projectId: string;
      message: string;
      conversationId?: string;
    }) => {
      try {
        console.log(`Starting chat stream for user ${socket.user?.id}`);
        
        // Emit initial status
        socket.emit('chat:status', {
          status: 'processing',
          stage: 'validating',
          message: 'Validating request...'
        });

        // Validate project ownership
        const project = await prisma.project.findFirst({
          where: {
            id: data.projectId,
            professorId: socket.user?.id
          }
        });

        if (!project) {
          socket.emit('chat:error', {
            error: 'Project not found or access denied'
          });
          return;
        }

        // Start the streaming chat process
        await this.processChatStream(socket, data);

      } catch (error) {
        console.error('Chat streaming error:', error);
        socket.emit('chat:error', {
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
      }
    });

    // Handle conversation history requests
    socket.on('chat:get-conversations', async (data: { projectId: string }) => {
      try {
        const conversations = await prisma.conversation.findMany({
          where: {
            projectId: data.projectId,
            project: {
              professorId: socket.user?.id
            }
          },
          include: {
            messages: {
              select: { id: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
          orderBy: { updatedAt: 'desc' },
          take: 20
        });

        socket.emit('chat:conversations', { conversations });
      } catch (error) {
        socket.emit('chat:error', { error: 'Failed to load conversations' });
      }
    });

    // Handle conversation messages request
    socket.on('chat:get-messages', async (data: { conversationId: string }) => {
      try {
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: data.conversationId,
            project: {
              professorId: socket.user?.id
            }
          },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' }
            },
            project: {
              select: { id: true, name: true }
            }
          }
        });

        if (!conversation) {
          socket.emit('chat:error', { error: 'Conversation not found' });
          return;
        }

        socket.emit('chat:messages', {
          conversation: {
            id: conversation.id,
            title: conversation.title,
            projectId: conversation.projectId,
            project: conversation.project,
            messages: conversation.messages
          }
        });
      } catch (error) {
        socket.emit('chat:error', { error: 'Failed to load messages' });
      }
    });
  }

  private async processChatStream(
    socket: AuthenticatedSocket,
    data: {
      projectId: string;
      message: string;
      conversationId?: string;
    }
  ) {
    const { ragService } = await import('../services/rag.service');
    let conversationId = data.conversationId;
    let userMessageId: string;

    try {
      // Step 1: Create or get conversation
      socket.emit('chat:status', {
        status: 'processing',
        stage: 'conversation',
        message: 'Setting up conversation...'
      });

      if (!conversationId) {
        // Create new conversation
        const conversation = await prisma.conversation.create({
          data: {
            projectId: data.projectId,
            title: `Chat: ${data.message.substring(0, 50)}...`
          }
        });
        conversationId = conversation.id;
        
        socket.emit('chat:conversation-created', {
          conversationId: conversation.id,
          title: conversation.title
        });
      }

      // Step 2: Save user message
      socket.emit('chat:status', {
        status: 'processing',
        stage: 'saving',
        message: 'Saving your message...'
      });

      const userMessage = await prisma.message.create({
        data: {
          conversationId: conversationId!,
          role: 'USER',
          content: data.message
        }
      });
      userMessageId = userMessage.id;

      socket.emit('chat:user-message', {
        message: {
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          createdAt: userMessage.createdAt
        }
      });

      // Step 3: Process with RAG and Memory
      socket.emit('chat:status', {
        status: 'processing',
        stage: 'memory',
        message: 'Analyzing conversation memory...'
      });

      // Use streaming RAG query
      await this.streamRAGResponse(socket, data.projectId, data.message, conversationId!);

    } catch (error) {
      console.error('Error in chat stream:', error);
      socket.emit('chat:error', {
        error: error instanceof Error ? error.message : 'Processing failed'
      });
    }
  }

  private async streamRAGResponse(
    socket: AuthenticatedSocket,
    projectId: string,
    query: string,
    conversationId: string
  ) {
    const { ragService } = await import('../services/rag.service');
    const { conversationMemoryService } = await import('../services/conversation-memory.service');
    const { openaiService } = await import('../services/openai.service');
    const { qdrantService } = await import('../services/qdrant.service');

    try {
      // Get project info
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });

      if (!project || !project.qdrantCollectionId) {
        throw new Error('Project not found or no documents processed');
      }

      // Step 1: Get conversation memory
      socket.emit('chat:status', {
        status: 'processing',
        stage: 'memory',
        message: 'Loading conversation context...'
      });

      const conversationMemory = await conversationMemoryService.getConversationMemory(conversationId);
      
      // Step 2: Generate query embedding
      socket.emit('chat:status', {
        status: 'processing',
        stage: 'embedding',
        message: 'Processing your question...'
      });

      const queryEmbedding = await openaiService.generateQueryEmbedding(query);

      // Step 3: Search documents
      socket.emit('chat:status', {
        status: 'processing',
        stage: 'search',
        message: 'Searching relevant documents...'
      });

      const searchResults = await qdrantService.searchSimilarChunks(
        project.qdrantCollectionId,
        queryEmbedding,
        5, // maxChunks
        0.4 // similarity threshold
      );

      // Prepare context
      const contextDocuments = searchResults.map(result => result.chunk.content);
      const memoryMessages = conversationMemoryService.formatMemoryForAI(conversationMemory);
      memoryMessages.push({
        role: 'user',
        content: query
      });

      // Step 4: Stream AI response
      socket.emit('chat:status', {
        status: 'processing',
        stage: 'generating',
        message: 'AI is generating response...'
      });

      socket.emit('chat:stream-start', {
        sources: searchResults.map(result => ({
          documentId: result.chunk.documentId,
          filename: result.chunk.metadata.filename,
          content: result.chunk.content.substring(0, 200) + '...',
          score: result.score
        }))
      });

      // Generate streaming response
      const stream = await openaiService.generateStreamingChatCompletion(
        memoryMessages,
        contextDocuments
      );

      let fullResponse = '';
      let tokenCount = 0;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        
        if (content) {
          fullResponse += content;
          tokenCount += 1; // Rough estimate
          
          // Stream content to client
          socket.emit('chat:stream-chunk', {
            content: content,
            fullContent: fullResponse
          });
        }
      }

      // Step 5: Save AI response and finish
      socket.emit('chat:status', {
        status: 'processing',
        stage: 'saving',
        message: 'Saving response...'
      });

      const assistantMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: fullResponse,
          metadata: {
            tokensUsed: { total: tokenCount },
            sources: searchResults.map(r => ({
              documentId: r.chunk.documentId,
              filename: r.chunk.metadata.filename,
              score: r.score
            }))
          }
        }
      });

      // Stream complete
      socket.emit('chat:stream-complete', {
        messageId: assistantMessage.id,
        content: fullResponse,
        tokensUsed: tokenCount,
        sources: searchResults.map(result => ({
          documentId: result.chunk.documentId,
          filename: result.chunk.metadata.filename,
          content: result.chunk.content.substring(0, 200) + '...',
          score: result.score
        }))
      });

      socket.emit('chat:status', {
        status: 'completed',
        message: 'Response generated successfully!'
      });

    } catch (error) {
      console.error('Streaming RAG error:', error);
      socket.emit('chat:error', {
        error: error instanceof Error ? error.message : 'Failed to generate response'
      });
    }
  }

  // Method to send updates to specific user
  public sendToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Method to broadcast to all connected users
  public broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  // Get WebSocket server instance
  public getIO() {
    return this.io;
  }
}

// Export singleton instance
let webSocketService: WebSocketService;

export const initializeWebSocket = (server: HTTPServer): WebSocketService => {
  webSocketService = new WebSocketService(server);
  return webSocketService;
};

export const getWebSocketService = (): WebSocketService => {
  if (!webSocketService) {
    throw new Error('WebSocket service not initialized');
  }
  return webSocketService;
};
