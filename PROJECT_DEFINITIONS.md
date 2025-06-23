# Study Flow API - Project Definitions & Architecture

## 📋 Project Overview

**Study Flow API** is a production-ready RESTful backend service that empowers educators to create intelligent AI assistants using advanced RAG (Retrieval-Augmented Generation) technology. The system enables teachers to upload educational materials and interact with an AI that provides contextual answers, summaries, and educational content generation.

## 🎯 Mission Statement

**Democratize AI-powered education** by providing teachers with an easy-to-use platform that transforms static educational materials into interactive, intelligent learning experiences.

## 🏗️ System Architecture

### **Core Technology Stack**
- **Backend Framework**: Node.js + TypeScript + Express.js
- **AI & Language Processing**: LangChain + OpenAI (o3-mini model)
- **Database Layer**: PostgreSQL + Prisma ORM
- **Vector Storage**: Qdrant vector database
- **File Processing**: Multi-format document support
- **Authentication**: JWT with refresh token mechanism
- **Containerization**: Docker + Docker Compose

### **Service Architecture**
```
┌─────────────────────────────────────────────────────────────┐
│                    Study Flow API                           │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │  Auth Service │  │Project Service│  │ Chat Service  │   │
│  └───────────────┘  └───────────────┘  └───────────────┘   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │Document Proc. │  │  RAG Service  │  │LangChain Svc. │   │
│  └───────────────┘  └───────────────┘  └───────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │  PostgreSQL   │  │    Qdrant     │  │   OpenAI      │   │
│  │  (Metadata)   │  │  (Vectors)    │  │  (AI Model)   │   │
│  └───────────────┘  └───────────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Core Components

### **1. Authentication & User Management**
- **JWT-based authentication** with refresh tokens
- **Professor/Teacher accounts** as primary users
- **24-hour token expiration** with automatic refresh
- **Secure password hashing** using bcrypt

### **2. Project Management System**
- **Educational projects** as content containers
- **Subject-based organization** (Mathematics, Science, etc.)
- **Multi-document support** per project
- **RAG collection management** per project

### **3. Document Processing Pipeline**
- **Multi-format support**: PDF, DOCX, DOC, TXT, Markdown
- **LangChain-powered processing** for text extraction
- **Intelligent chunking** for optimal retrieval
- **Vector embedding generation** using OpenAI
- **Qdrant storage** for similarity search

### **4. RAG (Retrieval-Augmented Generation)**
- **Context-aware AI responses** based on uploaded materials
- **Source attribution** with similarity scores
- **Multilingual support** (Portuguese, English, expandable)
- **Conversation memory** for coherent dialogues

### **5. Educational AI Features**
- **Question Answering**: Context-based responses from materials
- **Document Summarization**: Intelligent content summaries
- **Concept Explanation**: Detailed educational explanations
- **Multilingual Processing**: Native support for multiple languages

## 📊 Data Models

### **Professor Model**
```typescript
interface Professor {
  id: string;              // CUID identifier
  email: string;           // Unique email address
  name: string;            // Full name
  password: string;        // Hashed password
  createdAt: Date;         // Account creation timestamp
  updatedAt: Date;         // Last update timestamp
  projects: Project[];     // Associated projects
}
```

### **Project Model**
```typescript
interface Project {
  id: string;                    // CUID identifier
  name: string;                  // Project display name
  subject: string;               // Academic subject
  description: string;           // Project description
  professorId: string;           // Owner reference
  qdrantCollectionId: string;    // Vector collection ID
  createdAt: Date;               // Creation timestamp
  updatedAt: Date;               // Last update timestamp
  documents: Document[];         // Uploaded documents
  conversations: Conversation[]; // Chat sessions
}
```

### **Document Model**
```typescript
interface Document {
  id: string;           // CUID identifier
  filename: string;     // Display filename
  originalName: string; // Original upload name
  s3Key: string;        // Storage key
  s3Bucket: string;     // Storage bucket
  mimeType: string;     // File MIME type
  size: number;         // File size in bytes
  textContent: string;  // Extracted text content
  projectId: string;    // Parent project
  uploadedById: string; // Uploader reference
  processedAt: Date;    // RAG processing timestamp
  createdAt: Date;      // Upload timestamp
  updatedAt: Date;      // Last update timestamp
}
```

### **Conversation Model**
```typescript
interface Conversation {
  id: string;           // CUID identifier
  projectId: string;    // Associated project
  title: string;        // Conversation title
  createdAt: Date;      // Creation timestamp
  updatedAt: Date;      // Last update timestamp
  messages: Message[];  // Chat messages
}
```

### **Message Model**
```typescript
interface Message {
  id: string;             // CUID identifier
  conversationId: string; // Parent conversation
  role: 'USER' | 'ASSISTANT'; // Message sender
  content: string;        // Message content
  metadata: object;       // Additional data (tokens, sources)
  createdAt: Date;        // Message timestamp
}
```

## 🔄 Key Workflows

### **Document Upload & Processing**
1. **Upload**: User uploads educational material
2. **Validation**: File type and size validation
3. **Storage**: File stored in configured storage system
4. **Extraction**: Text content extracted using LangChain
5. **Chunking**: Content split into optimal segments
6. **Embedding**: Vector embeddings generated via OpenAI
7. **Storage**: Vectors stored in Qdrant collection
8. **Indexing**: Document marked as processed

### **AI Chat Interaction**
1. **Query**: User submits question/request
2. **Embedding**: Query converted to vector embedding
3. **Retrieval**: Similar document chunks retrieved from Qdrant
4. **Context**: Relevant content assembled for AI model
5. **Generation**: AI generates response using context
6. **Attribution**: Sources and similarity scores provided
7. **Storage**: Conversation stored for memory/history

### **Project Management**
1. **Creation**: Professor creates new educational project
2. **Configuration**: Subject and description setup
3. **Document Addition**: Materials uploaded and processed
4. **Collection Setup**: Qdrant collection initialized
5. **Ready State**: Project ready for AI interactions

## 🔒 Security & Privacy

### **Data Protection**
- **Password Hashing**: bcrypt with salt rounds
- **JWT Security**: Signed tokens with expiration
- **Input Validation**: Zod schemas for all endpoints
- **Rate Limiting**: Protection against abuse
- **CORS Configuration**: Controlled cross-origin access

### **Access Control**
- **Authentication Required**: All endpoints protected
- **Ownership Validation**: Users access only their data
- **Project Isolation**: No cross-project data access
- **Conversation Privacy**: Private chat sessions

### **File Security**
- **Type Validation**: Whitelist of allowed file types
- **Size Limits**: Configurable upload size restrictions
- **Content Scanning**: Text extraction validation
- **Storage Isolation**: Project-based file organization

## 📈 Performance Specifications

### **Current Benchmarks**
- **Document Processing**: 188 chunks from 5.8MB PDF
- **Query Response Time**: 2-4 seconds average
- **Token Efficiency**: ~3000 tokens per complex query
- **File Size Support**: Up to 10MB per document
- **Concurrent Processing**: Multiple documents per project

### **Scalability Metrics**
- **Database**: PostgreSQL with connection pooling
- **Vector Operations**: Qdrant optimized collections
- **Memory Usage**: Efficient LangChain processing
- **Storage**: Configurable local/cloud storage
- **API Throughput**: Express.js with rate limiting

## 🌍 Internationalization

### **Current Language Support**
- **Portuguese**: Native support with context understanding
- **English**: Full feature compatibility
- **Mixed Content**: Handles multilingual documents

### **AI Model Capabilities**
- **Cross-language Understanding**: o3-mini multilingual support
- **Context Preservation**: Language-aware conversation memory
- **Response Generation**: Maintains query language preference

## 🔧 Configuration & Deployment

### **Environment Configuration**
- **Development**: Docker Compose with mock services
- **Production**: Configurable cloud services
- **Hybrid**: Local development with cloud AI services

### **Deployment Targets**
- **Containerized**: Docker and Docker Compose ready
- **Cloud Native**: AWS, GCP, Azure compatible
- **Self-hosted**: Complete local deployment option

### **Monitoring & Observability**
- **Health Checks**: Comprehensive system monitoring
- **Logging**: Structured logging with request tracing
- **Metrics**: Performance and usage analytics ready
- **Error Tracking**: Detailed error reporting

## 🚀 Future Enhancements

### **Planned Features**
- **Advanced Document Processing**: Dockling integration for layout awareness
- **Enhanced AI Capabilities**: Quiz generation, study guides
- **Collaboration Features**: Multi-professor projects
- **Analytics Dashboard**: Usage and performance insights
- **Mobile Optimization**: React Native companion app

### **Technical Improvements**
- **Caching Layer**: Redis for improved performance
- **Search Enhancement**: Full-text search capabilities
- **Batch Processing**: Multiple document handling
- **Export Features**: Conversation and data export
- **Integration APIs**: External system connectivity

## 📋 Development Standards

### **Code Quality**
- **TypeScript Strict Mode**: Type safety enforcement
- **Zod Validation**: Runtime type checking
- **Prisma ORM**: Type-safe database operations
- **Error Handling**: Comprehensive error management
- **Testing**: Automated test suite included

### **API Design**
- **RESTful Architecture**: Standard HTTP methods
- **JSON Communication**: Structured data exchange
- **Versioning Ready**: Future API version support
- **Documentation**: OpenAPI specification ready
- **Standards Compliance**: HTTP status codes and headers

## 🎓 Educational Impact

### **Target Users**
- **Primary**: Teachers and educators
- **Secondary**: Educational content creators
- **Tertiary**: Students with guided access

### **Use Cases**
- **Course Material Digitization**: Convert static content to interactive AI
- **Student Q&A Support**: 24/7 AI-powered study assistance
- **Content Summarization**: Quick material overview generation
- **Multilingual Education**: Cross-language educational support
- **Assessment Creation**: AI-assisted quiz and test generation

---

**Study Flow API represents the future of AI-powered education, making advanced RAG technology accessible to educators worldwide.** 🎓✨
