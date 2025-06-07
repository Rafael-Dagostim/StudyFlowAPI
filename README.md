# 🎓 Study Flow API

**AI-Powered Educational Platform Backend**

A production-ready RESTful API that enables teachers to create intelligent educational assistants using **RAG (Retrieval-Augmented Generation)** technology. Teachers can upload course materials and interact with an AI that can answer questions, create activities, and generate educational content.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![LangChain](https://img.shields.io/badge/LangChain-Powered-FF6B6B.svg)](https://langchain.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-o3--mini-412991.svg)](https://openai.com/)

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for development)
- OpenAI API key

### 1. Clone and Setup

```bash
git clone <your-repo>
cd study-flow-api

# Copy environment template
cp .env.docker.example .env.docker
# Edit .env.docker with your OpenAI API key
```

### 2. Start the System

```bash
# Start all services (API + Databases)
./docker-start.sh

# API will be available at http://localhost:3000
```

### 3. Test the System

```bash
# Run comprehensive test suite
node simple-test.js
```

## 🏗️ Architecture

### **Tech Stack**

- **Backend**: Node.js + TypeScript + Express.js
- **AI Framework**: LangChain + OpenAI (o3-mini model)
- **Database**: PostgreSQL + Prisma ORM
- **Vector Database**: Qdrant
- **File Storage**: Mock S3 (configurable for AWS S3)
- **Authentication**: JWT with refresh tokens
- **Validation**: Zod schemas

### **System Components**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │───▶│  Study Flow API │───▶│   PostgreSQL    │
│   (Frontend)    │    │   (Backend)     │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │     Qdrant      │    │     OpenAI      │
                       │ (Vector Store)  │    │   (AI Model)    │
                       └─────────────────┘    └─────────────────┘
```

## 🎯 Key Features

### ✅ **Completed Features**

- **🔐 Authentication System** - JWT with refresh tokens
- **📁 Project Management** - Create and manage educational projects
- **📄 Document Processing** - Multi-format support (PDF, DOCX, TXT, MD)
- **🧠 RAG Implementation** - LangChain-powered document analysis
- **💬 Intelligent Chat** - AI conversations with document context
- **🌍 Multilingual Support** - Portuguese and English
- **💾 Conversation Memory** - Context-aware discussions
- **📊 Source Attribution** - Citations with similarity scores
- **🔒 Security** - Rate limiting, validation, error handling

### 📚 **Educational AI Capabilities**

- **Question Answering** - Context-aware responses from uploaded materials
- **Document Summarization** - Intelligent content summaries
- **Concept Explanation** - Detailed educational explanations
- **Multilingual Processing** - Support for Portuguese and English content

## 📖 API Documentation

### **Base URL**

```
http://localhost:3000/api
```

### **Authentication**

```http
# Sign Up
POST /auth/signup
{
  "name": "Professor Name",
  "email": "professor@university.edu",
  "password": "SecurePass123!"
}

# Sign In
POST /auth/signin
{
  "email": "professor@university.edu",
  "password": "SecurePass123!"
}

# Get Profile
GET /auth/profile
Authorization: Bearer <token>
```

### **Project Management**

```http
# Create Project
POST /projects
Authorization: Bearer <token>
{
  "name": "Advanced Mathematics",
  "subject": "Calculus II",
  "description": "Advanced calculus concepts"
}

# Get Projects
GET /projects
Authorization: Bearer <token>

# Get Project Details
GET /projects/{id}
Authorization: Bearer <token>
```

### **Document Upload**

```http
# Upload Documents
POST /projects/{id}/documents
Authorization: Bearer <token>
Content-Type: multipart/form-data

files: [document files]
```

### **AI Chat**

```http
# Start New Conversation
POST /chat/conversations/chat
Authorization: Bearer <token>
{
  "projectId": "project_id",
  "message": "Explain compound interest from the uploaded materials"
}

# Continue Conversation
POST /chat/messages
Authorization: Bearer <token>
{
  "conversationId": "conversation_id",
  "message": "Can you give me an example?"
}
```

### **RAG Processing**

```http
# Process Project Documents
POST /chat/projects/{id}/rag/process
Authorization: Bearer <token>

# Get Processing Status
GET /chat/projects/{id}/rag/status
Authorization: Bearer <token>
```

## 🐳 Docker Setup

### **Production (Recommended)**

```bash
# Start full stack
./docker-start.sh

# View logs
docker compose logs api
docker compose logs postgres
docker compose logs qdrant

# Stop services
docker compose down
```

### **Development Mode**

```bash
# Start only databases
./docker-start.sh dev

# Run API locally
npm run dev
```

## 🔧 Configuration

### **Environment Variables**

Key variables in `.env.docker`:

```env
# OpenAI (Required)
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_CHAT_MODEL=o3-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# JWT Secrets (Generate strong secrets!)
JWT_SECRET=your_very_long_and_secure_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_EXPIRES_IN=24h

# RAG Configuration
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200
RAG_MAX_CHUNKS=5
RAG_SIMILARITY_THRESHOLD=0.4

# File Upload
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES=pdf,docx,doc,txt,md
```

## 🧪 Testing

### **Automated Test Suite**

```bash
# Run comprehensive tests
node simple-test.js
```

**Test Coverage:**

- ✅ API Health Check
- ✅ Authentication System
- ✅ Project Management
- ✅ Document Upload & Processing
- ✅ Portuguese AI Chat
- ✅ English AI Chat
- ✅ Conversation Memory
- ✅ Source Attribution

### **Manual Testing**

```bash
# Check API health
curl http://localhost:3000/health

# Test authentication
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test123!"}'
```

## 📁 Project Structure

```
study-flow-api/
├── src/
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Express middleware
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── types/              # TypeScript types
│   ├── utils/              # Utility functions
│   └── server.ts           # Main server file
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── migrations/         # Database migrations
├── uploads/                # File upload storage
├── docker-compose.yml      # Docker configuration
├── Dockerfile             # API container
├── simple-test.js         # Test suite
└── README.md              # This file
```

## 🔒 Security Features

- **JWT Authentication** with refresh tokens
- **Password Hashing** with bcrypt
- **Rate Limiting** on API endpoints
- **Input Validation** with Zod schemas
- **CORS Protection** with configurable origins
- **Security Headers** via Helmet
- **Error Handling** without information leakage

## 🌍 Supported File Formats

- **PDF** - Full text extraction
- **DOCX** - Microsoft Word documents
- **DOC** - Legacy Word format (best effort)
- **TXT** - Plain text files
- **MD** - Markdown files

## 📊 Performance & Scaling

### **Current Specifications**

- **Document Processing**: 188+ chunks from 5.8MB PDF
- **Response Time**: ~2-4 seconds for AI queries
- **Token Usage**: ~3000 tokens per complex query
- **File Size Limit**: 10MB per file
- **Concurrent Users**: Configurable via rate limiting

### **Scaling Considerations**

- **Database**: PostgreSQL with connection pooling
- **Vector Storage**: Qdrant with configurable collections
- **File Storage**: Ready for AWS S3 migration
- **Caching**: Redis integration ready
- **Load Balancing**: Stateless design supports horizontal scaling

### **Environment Targets**

- **Development**: Docker Compose
- **Staging**: AWS ECS/EKS or DigitalOcean
- **Production**: AWS, Google Cloud, or Azure

## 🐛 Troubleshooting

### **Common Issues**

**Connection Refused**

```bash
# Check if containers are running
docker compose ps

# Restart services
./docker-start.sh
```

**OpenAI API Errors**

- Verify API key in `.env.docker`
- Check OpenAI account credits
- Ensure o3-mini model access

**Document Processing Fails**

- Check file format is supported
- Verify file size under 10MB
- Check Qdrant container health

**Memory Issues**

```bash
# Check container resources
docker stats

# Increase Docker memory if needed
```

## 🤝 Contributing

1. **Development Setup**

   ```bash
   npm install
   cp .env.example .env
   # Configure environment variables
   npm run dev
   ```

2. **Code Style**

   - TypeScript strict mode
   - Zod for validation
   - Prisma for database operations
   - ESLint and Prettier (when configured)

3. **Testing**

   ```bash
   # Run test suite
   node simple-test.js

   # Manual testing
   npm run dev
   ```

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **LangChain** - AI framework and document processing
- **OpenAI** - o3-mini model and embeddings
- **Qdrant** - Vector database
- **Prisma** - Database ORM
- **Express.js** - Web framework

---
