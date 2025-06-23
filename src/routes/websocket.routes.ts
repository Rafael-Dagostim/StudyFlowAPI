import { Router } from 'express';
import { AuthenticatedRequest } from '../types';
import { getWebSocketService } from '../services/websocket.service';

const router = Router();

/**
 * Get WebSocket connection info
 */
router.get('/connection-info', (req: AuthenticatedRequest, res) => {
  try {
    const wsService = getWebSocketService();
    const connectedClients = wsService.getIO().engine.clientsCount;
    
    res.json({
      websocket: {
        endpoint: `/socket.io/`,
        transports: ['websocket', 'polling'],
        connectedClients,
        events: {
          incoming: [
            'chat:start',
            'chat:get-conversations', 
            'chat:get-messages'
          ],
          outgoing: [
            'chat:status',
            'chat:stream-start',
            'chat:stream-chunk',
            'chat:stream-complete',
            'chat:user-message',
            'chat:conversation-created',
            'chat:conversations',
            'chat:messages',
            'chat:error'
          ]
        }
      },
      authentication: {
        required: true,
        method: 'JWT token in handshake.auth.token or Authorization header'
      },
      streaming: {
        enabled: true,
        features: [
          'Real-time chat responses',
          'Progress updates during processing',
          'Conversation synchronization',
          'Memory-enhanced responses'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'WebSocket service not available',
      fallback: 'Use HTTP chat endpoints'
    });
  }
});

/**
 * WebSocket usage guide
 */
router.get('/guide', (req, res) => {
  res.json({
    title: 'StudyFlow WebSocket Chat Guide',
    description: 'Real-time streaming chat with enhanced memory',
    
    quickStart: {
      '1_connect': {
        description: 'Connect to WebSocket with authentication',
        code: `
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
        `
      },
      '2_listen': {
        description: 'Listen for streaming events',
        code: `
// Listen for status updates
socket.on('chat:status', (data) => {
  console.log('Status:', data.stage, data.message);
});

// Listen for streaming response chunks
socket.on('chat:stream-chunk', (data) => {
  console.log('New content:', data.content);
  // Update UI with streamed content
});

// Listen for completion
socket.on('chat:stream-complete', (data) => {
  console.log('Response complete:', data.content);
});
        `
      },
      '3_send': {
        description: 'Send chat messages',
        code: `
// Start new conversation
socket.emit('chat:start', {
  projectId: 'your-project-id',
  message: 'Hello, can you help me with math?'
});

// Continue existing conversation
socket.emit('chat:start', {
  projectId: 'your-project-id',
  message: 'What did we discuss before?',
  conversationId: 'existing-conversation-id'
});
        `
      }
    },
    
    events: {
      client_to_server: {
        'chat:start': {
          description: 'Start new chat or continue conversation',
          payload: {
            projectId: 'string (required)',
            message: 'string (required)',
            conversationId: 'string (optional, for continuing)'
          }
        },
        'chat:get-conversations': {
          description: 'Get list of conversations for project',
          payload: {
            projectId: 'string (required)'
          }
        },
        'chat:get-messages': {
          description: 'Get messages for specific conversation',
          payload: {
            conversationId: 'string (required)'
          }
        }
      },
      
      server_to_client: {
        'chat:status': {
          description: 'Processing status updates',
          payload: {
            status: 'processing | completed | error',
            stage: 'validating | conversation | memory | embedding | search | generating | saving',
            message: 'Human readable status message'
          }
        },
        'chat:stream-start': {
          description: 'Response streaming begins',
          payload: {
            sources: 'Array of document sources found'
          }
        },
        'chat:stream-chunk': {
          description: 'Partial response content (real-time)',
          payload: {
            content: 'New content chunk',
            fullContent: 'Full content so far'
          }
        },
        'chat:stream-complete': {
          description: 'Response streaming finished',
          payload: {
            messageId: 'Database message ID',
            content: 'Complete response',
            tokensUsed: 'Token count',
            sources: 'Document sources used'
          }
        },
        'chat:user-message': {
          description: 'User message saved confirmation',
          payload: {
            message: 'Message object with ID and content'
          }
        },
        'chat:conversation-created': {
          description: 'New conversation created',
          payload: {
            conversationId: 'New conversation ID',
            title: 'Conversation title'
          }
        },
        'chat:conversations': {
          description: 'List of conversations for project',
          payload: {
            conversations: 'Array of conversation objects'
          }
        },
        'chat:messages': {
          description: 'Messages for specific conversation',
          payload: {
            conversation: 'Conversation object with messages array'
          }
        },
        'chat:error': {
          description: 'Error during processing',
          payload: {
            error: 'Error message'
          }
        }
      }
    },
    
    benefits: [
      'No timeout issues - responses stream in real-time',
      'Progress updates during long operations',
      'Enhanced memory with conversation context',
      'Real-time conversation synchronization',
      'Better user experience with immediate feedback',
      'Efficient token usage with streaming',
      'Automatic reconnection on connection loss'
    ],
    
    examples: {
      basic_chat: {
        description: 'Basic chat conversation',
        frontend_code: `
// Connect
const socket = io('http://localhost:3000', {
  auth: { token: localStorage.getItem('token') }
});

// Set up listeners
socket.on('chat:status', (data) => {
  updateStatus(data.stage, data.message);
});

socket.on('chat:stream-chunk', (data) => {
  appendToResponse(data.content);
});

socket.on('chat:stream-complete', (data) => {
  finalizeResponse(data.content, data.sources);
});

// Send message
function sendMessage(projectId, message, conversationId = null) {
  socket.emit('chat:start', {
    projectId,
    message,
    conversationId
  });
}
        `
      },
      
      conversation_management: {
        description: 'Load and manage conversations',
        frontend_code: `
// Load conversations for project
socket.emit('chat:get-conversations', { 
  projectId: 'your-project-id' 
});

socket.on('chat:conversations', (data) => {
  displayConversations(data.conversations);
});

// Load specific conversation
socket.emit('chat:get-messages', { 
  conversationId: 'conversation-id' 
});

socket.on('chat:messages', (data) => {
  displayMessages(data.conversation.messages);
});
        `
      }
    }
  });
});

export default router;
