# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

```bash
# Development
npm run dev                # Start development server with hot reload (nodemon + ts-node)
npm run build             # Build TypeScript to JavaScript (outputs to ./dist)
npm start                 # Start production server (requires build first)

# Database
npm run prisma:generate   # Generate Prisma client types
npm run prisma:migrate    # Run database migrations (development)
npm run prisma:deploy     # Deploy migrations (production)
npm run prisma:studio     # Open Prisma Studio GUI for database inspection

# Docker
docker compose up -d      # Start all services (API, PostgreSQL, Qdrant)
docker compose down       # Stop all services
docker compose logs -f api # View API logs
```

## Architecture Overview

StudyFlowAPI is an AI-powered educational platform backend that enables teachers to create intelligent assistants using RAG (Retrieval-Augmented Generation) technology. The system processes educational documents and provides contextual AI responses based on uploaded materials.

### Core Technology Stack
- **Runtime**: Node.js 20+ with TypeScript (strict mode)
- **API Framework**: Express.js with async/await pattern
- **AI/ML**: LangChain + OpenAI (o3-mini for chat, text-embedding-3-small for embeddings)
- **Databases**: PostgreSQL (via Prisma ORM) + Qdrant (vector search)
- **Real-time**: Socket.io for streaming responses
- **Authentication**: JWT with access/refresh token pattern
- **Validation**: Zod schemas throughout

### Request Flow Architecture
1. **Client Request** → Express Router → Validation Middleware → Auth Middleware → Controller
2. **Controller** orchestrates between multiple services
3. **Services** handle business logic and external integrations:
   - `RAGService` coordinates the entire RAG pipeline
   - `LangChainDocumentService` processes documents into chunks
   - `QdrantService` manages vector storage and retrieval
   - `OpenAIService` handles LLM interactions
   - `ConversationMemoryService` maintains chat context
4. **Response** flows back through middleware for error handling

### Key Design Patterns
- **Dependency Injection**: Services are instantiated in controllers
- **Error Propagation**: Errors bubble up to global error middleware
- **Type Safety**: All API contracts defined with Zod schemas
- **Streaming**: WebSocket for real-time AI responses
- **Multi-tenancy**: All data scoped by projectId and professorId

### Database Schema Relationships
```
Professor (user) → has many → Projects
Project → has many → Documents, Conversations
Conversation → has many → Messages
Document → has vector embeddings in Qdrant
```

### RAG Pipeline Process
1. **Document Upload**: Files stored in S3/local, metadata in PostgreSQL
2. **Processing**: LangChain splits documents into chunks with overlap
3. **Embedding**: OpenAI generates embeddings for each chunk
4. **Storage**: Vectors stored in Qdrant with metadata
5. **Retrieval**: User queries trigger similarity search
6. **Generation**: Context + query sent to LLM for response
7. **Attribution**: Sources included with similarity scores

### Important Configuration
- **TypeScript Paths**: Use `@/` prefix for imports (e.g., `@/services/rag.service`)
- **Environment**: Requires `.env` with OpenAI API key and JWT secrets
- **File Limits**: 10MB max, supports PDF/DOCX/TXT/MD
- **Chunking**: 1000 chars with 200 char overlap (configurable)
- **Context Window**: 5 most relevant chunks per query

### Testing Approach
Currently no automated tests are configured. When implementing tests:
- Use the existing TypeScript configuration
- Follow the controller → service → external API pattern
- Mock external services (OpenAI, Qdrant, S3)
- Test Zod validation schemas separately

### WebSocket Events
- `connection`: Initialize socket with auth
- `join-conversation`: Subscribe to conversation updates
- `send-message`: Trigger RAG query
- `message-chunk`: Receive streaming response
- `message-complete`: Final response with sources
- `error`: Handle failures gracefully

### Security Considerations
- JWT tokens expire in 15 minutes (refresh tokens in 7 days)
- All routes except auth endpoints require authentication
- File uploads validated by MIME type and extension
- Passwords hashed with bcrypt (10 rounds)
- CORS configured for production use