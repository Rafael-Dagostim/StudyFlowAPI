import { Request } from 'express';
import { Professor } from '@prisma/client';
import {
  SignUpData,
  SignInData,
  CreateProjectData,
  UpdateProjectData,
  ChatData
} from '../utils/validation';

// Extend Express Request type to include authenticated user
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

// Auth related types (using Zod-inferred types)
export interface SignUpRequest extends SignUpData {}
export interface SignInRequest extends SignInData {}

export interface AuthResponse {
  professor: {
    id: string;
    name: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
}

// Project related types (using Zod-inferred types)
export interface CreateProjectRequest extends CreateProjectData {}
export interface UpdateProjectRequest extends UpdateProjectData {}

// Document related types
export interface DocumentUploadRequest {
  files: Express.Multer.File[];
}

// AI Chat types (using Zod-inferred types)
export interface ChatRequest extends ChatData {}

export interface ChatResponse {
  response: string;
  conversationId: string;
  sources?: Array<{
    document: string;
    content: string;
    score: number;
  }>;
}

// RAG System Types
export interface RAGQueryResult {
  answer: string;
  sources: Array<{
    documentId: string;
    filename: string;
    content: string;
    score: number;
    chunkIndex?: number;
  }>;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  metadata?: {
    processingTime: number;
    model: string;
    temperature: number;
  };
}

export interface DocumentProcessingResult {
  documentId: string;
  chunksProcessed: number;
  collectionName: string;
  success: boolean;
  error?: string;
  processingTime?: number;
}

export interface ProjectRAGStatus {
  projectId: string;
  projectName: string;
  hasCollection: boolean;
  collectionName?: string;
  totalDocuments: number;
  documentsWithText: number;
  processedDocuments: number;
  pendingProcessing: number;
  collectionStats?: {
    name: string;
    vectorsCount: number;
    indexedVectorsCount: number;
    pointsCount: number;
    segmentsCount: number;
    status: string;
  };
  documents: Array<{
    id: string;
    filename: string;
    hasText: boolean;
    isProcessed: boolean;
    processedAt?: Date;
  }>;
}

// Chat Types
export interface ConversationResponse {
  id: string;
  projectId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  project?: {
    id: string;
    name: string;
    subject: string;
  };
  messages: MessageResponse[];
}

export interface MessageResponse {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: Date;
  metadata?: {
    tokensUsed?: {
      prompt: number;
      completion: number;
      total: number;
    };
    sources?: Array<{
      documentId: string;
      filename: string;
      content: string;
      score: number;
    }>;
    [key: string]: any;
  };
}

export interface ConversationListResponse {
  conversations: Array<{
    id: string;
    projectId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
    lastMessageAt: Date;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// OpenAI Service Types
export interface OpenAIConfig {
  embeddingModel: string;
  chatModel: string;
  maxTokens: number;
  temperature: number;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  tokensUsed: number;
  model: string;
}

export interface ChatCompletionResponse {
  content: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
  finishReason: string;
}

// Qdrant Service Types
export interface QdrantDocumentChunk {
  id: string;
  documentId: string;
  projectId: string;
  content: string;
  chunkIndex: number;
  metadata: {
    filename: string;
    originalName: string;
    mimeType: string;
    chunkSize: number;
    totalChunks: number;
    createdAt: string;
  };
}

export interface QdrantSearchResult {
  id: string;
  score: number;
  chunk: QdrantDocumentChunk;
}

export interface QdrantCollectionInfo {
  name: string;
  vectorsCount: number;
  indexedVectorsCount: number;
  pointsCount: number;
  segmentsCount: number;
  status: string;
}

// Qdrant types
export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    documentId: string;
    projectId: string;
    chunkIndex: number;
    metadata?: Record<string, any>;
  };
}

// Document processing types
export interface DocumentChunk {
  content: string;
  index: number;
  metadata: {
    page?: number;
    section?: string;
    [key: string]: any;
  };
}

// Health Check Types
export interface RAGHealthStatus {
  openai: {
    isHealthy: boolean;
    error?: string;
  };
  qdrant: {
    isHealthy: boolean;
    error?: string;
  };
  overall: boolean;
  configuration: {
    chunkSize: number;
    chunkOverlap: number;
    maxChunks: number;
    similarityThreshold: number;
    openaiModels: OpenAIConfig;
  };
  timestamp: string;
}

// Error types
export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

// Environment variables type
export interface EnvironmentVariables {
  NODE_ENV: string;
  PORT: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  OPENAI_API_KEY: string;
  OPENAI_EMBEDDING_MODEL: string;
  OPENAI_CHAT_MODEL: string;
  OPENAI_MAX_TOKENS: string;
  OPENAI_TEMPERATURE: string;
  QDRANT_HOST: string;
  QDRANT_PORT: string;
  QDRANT_API_KEY?: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_S3_BUCKET: string;
  MAX_FILE_SIZE: string;
  ALLOWED_FILE_TYPES: string;
  RAG_CHUNK_SIZE: string;
  RAG_CHUNK_OVERLAP: string;
  RAG_MAX_CHUNKS: string;
  RAG_SIMILARITY_THRESHOLD: string;
}
