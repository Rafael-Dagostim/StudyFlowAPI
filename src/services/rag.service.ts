import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../utils/database";
import { LangChainDocumentProcessor } from "./langchain-document.service";
import { openaiService } from "./openai.service";
import { qdrantService } from "./qdrant.service";
import { S3Service } from "./s3.service";
import { conversationMemoryService } from "./conversation-memory.service";

// ===========================
// INTERFACES & TYPES
// ===========================

export interface ProcessDocumentResult {
  documentId: string;
  chunksProcessed: number;
  collectionName: string;
  success: boolean;
  error?: string;
  processingTime?: number;
}

export interface QueryResult {
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
  conversationId?: string;
}

export interface DocumentChunk {
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

export interface BatchProcessResult {
  successful: number;
  failed: number;
  results: Array<{
    filename: string;
    success: boolean;
    document?: any;
    processResult?: ProcessDocumentResult;
    error?: string;
  }>;
}

export interface ProjectAnalysis {
  projectId: string;
  documentCount: number;
  totalWords: number;
  totalReadingTime: number;
  languages: string[];
  complexityDistribution: {
    High: number;
    Medium: number;
    Low: number;
  };
  documents: Array<{
    documentId: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    statistics: any;
    estimatedLanguage: string;
    complexity: string;
  }>;
}

export interface ProcessingRecommendation {
  type: 'processing' | 'compatibility' | 'setup' | 'performance';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: string;
  files?: string[];
}

// ===========================
// CONSOLIDATED RAG SERVICE
// ===========================

export class RAGService {
  private chunkSize: number;
  private chunkOverlap: number;
  private maxChunks: number;
  private similarityThreshold: number;

  constructor() {
    this.chunkSize = parseInt(process.env.RAG_CHUNK_SIZE || "1000");
    this.chunkOverlap = parseInt(process.env.RAG_CHUNK_OVERLAP || "200");
    this.maxChunks = parseInt(process.env.RAG_MAX_CHUNKS || "5");
    this.similarityThreshold = parseFloat(
      process.env.RAG_SIMILARITY_THRESHOLD || "0.4"
    );
  }

  // ===========================
  // CORE DOCUMENT PROCESSING
  // ===========================

  /**
   * Process a single document for RAG using LangChain
   */
  async processDocument(documentId: string): Promise<ProcessDocumentResult> {
    const startTime = Date.now();

    try {
      console.log(`Starting RAG processing for document: ${documentId}`);

      // Get document from database
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: { project: true },
      });

      if (!document) {
        throw new Error("Document not found");
      }

      // Check if already processed
      if (document.processedAt) {
        console.log(`Document ${documentId} already processed`);
        return {
          documentId,
          chunksProcessed: 0,
          collectionName: document.project.qdrantCollectionId || "",
          success: true,
          error: "Document already processed",
        };
      }

      // Extract text if not already done using LangChain
      let textContent = document.textContent;
      if (!textContent) {
        console.log("Extracting text content with LangChain...");

        // Get file from storage
        const fileBuffer = await S3Service.getFileContent(document.s3Key);
        const mockFile = {
          buffer: fileBuffer,
          originalname: document.originalName,
          mimetype: document.mimeType,
          size: document.size,
        } as Express.Multer.File;

        // Process document with LangChain
        const processResult = await LangChainDocumentProcessor.processDocument(
          mockFile
        );
        textContent = processResult.text;

        // Update document with extracted text
        await prisma.document.update({
          where: { id: documentId },
          data: { textContent },
        });
      }

      // Create or get Qdrant collection
      let collectionName = document.project.qdrantCollectionId;
      if (!collectionName) {
        collectionName = await qdrantService.createCollection(
          document.projectId
        );
        await prisma.project.update({
          where: { id: document.projectId },
          data: { qdrantCollectionId: collectionName },
        });
      }

      // Chunk the text using LangChain
      const textChunks = await LangChainDocumentProcessor.splitText(
        textContent
      );
      console.log(`Created ${textChunks.length} chunks with LangChain`);

      if (textChunks.length === 0) {
        throw new Error("No text chunks could be created from document");
      }

      // Generate embeddings
      console.log("Generating embeddings...");
      const embeddings = await openaiService.generateEmbeddings(textChunks);

      // Create document chunks
      const documentChunks: DocumentChunk[] = textChunks.map(
        (chunk, index) => ({
          id: uuidv4(),
          documentId,
          projectId: document.projectId,
          content: chunk,
          chunkIndex: index,
          metadata: {
            filename: document.filename,
            originalName: document.originalName,
            mimeType: document.mimeType,
            chunkSize: chunk.length,
            totalChunks: textChunks.length,
            createdAt: new Date().toISOString(),
          },
        })
      );

      // Store in Qdrant
      console.log("Storing chunks in Qdrant...");
      await qdrantService.storeDocumentChunks(
        collectionName,
        documentChunks,
        embeddings
      );

      // Mark document as processed
      await prisma.document.update({
        where: { id: documentId },
        data: { processedAt: new Date() },
      });

      const processingTime = Date.now() - startTime;
      console.log(
        `Document ${documentId} processed successfully in ${processingTime}ms`
      );

      return {
        documentId,
        chunksProcessed: textChunks.length,
        collectionName,
        success: true,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Error processing document ${documentId}:`, error);

      return {
        documentId,
        chunksProcessed: 0,
        collectionName: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        processingTime,
      };
    }
  }

  /**
   * Process all unprocessed documents in a project
   */
  async processProject(projectId: string): Promise<ProcessDocumentResult[]> {
    console.log(`Processing all documents in project: ${projectId}`);

    const documents = await prisma.document.findMany({
      where: {
        projectId,
        processedAt: null, // Only unprocessed documents
      },
    });

    const results = [];
    for (const document of documents) {
      const result = await this.processDocument(document.id);
      results.push(result);
    }

    return results;
  }

  /**
   * Reprocess a document (delete existing embeddings and reprocess)
   */
  async reprocessDocument(documentId: string): Promise<ProcessDocumentResult> {
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: { project: true },
      });

      if (!document) {
        throw new Error("Document not found");
      }

      // Delete existing embeddings if collection exists
      if (document.project.qdrantCollectionId) {
        try {
          await qdrantService.deleteDocumentChunks(
            document.project.qdrantCollectionId,
            documentId
          );
        } catch (error) {
          console.warn("Could not delete existing chunks:", error);
        }
      }

      // Reset processed status
      await prisma.document.update({
        where: { id: documentId },
        data: { processedAt: null },
      });

      // Process again
      return await this.processDocument(documentId);
    } catch (error) {
      console.error("Error reprocessing document:", error);
      return {
        documentId,
        chunksProcessed: 0,
        collectionName: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Upload and process a document in one operation using LangChain
   */
  async uploadAndProcessDocument(
    file: Express.Multer.File,
    projectId: string,
    uploadedById: string
  ): Promise<{
    document: any;
    processResult: ProcessDocumentResult;
  }> {
    try {
      // Validate file with LangChain processor
      const validation = LangChainDocumentProcessor.validateFile(file);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Upload file to storage
      const s3Key = await S3Service.uploadFile(file, projectId);

      // Process document with LangChain to extract text and analyze
      const processedDocument =
        await LangChainDocumentProcessor.processDocument(file);

      // Create document record
      const document = await prisma.document.create({
        data: {
          filename: file.originalname,
          originalName: file.originalname,
          s3Key,
          s3Bucket: process.env.AWS_S3_BUCKET || "local-storage",
          mimeType: file.mimetype,
          size: file.size,
          textContent: processedDocument.text,
          projectId,
          uploadedById,
        },
      });

      // Process document for RAG (this will use the already extracted text)
      const processResult = await this.processDocument(document.id);

      return {
        document,
        processResult,
      };
    } catch (error) {
      console.error("Error in uploadAndProcessDocument:", error);
      throw error;
    }
  }

  /**
   * Delete a document and its embeddings
   */
  async deleteDocument(documentId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { project: true },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    // Delete embeddings from Qdrant
    if (document.project.qdrantCollectionId) {
      try {
        await qdrantService.deleteDocumentChunks(
          document.project.qdrantCollectionId,
          documentId
        );
      } catch (error) {
        console.warn("Could not delete document chunks from Qdrant:", error);
      }
    }

    // Delete file from storage
    try {
      await S3Service.deleteFile(document.s3Key);
    } catch (error) {
      console.warn("Could not delete file from storage:", error);
    }
  }

  // ===========================
  // QUERY & CONVERSATION
  // ===========================

  /**
   * Query documents using RAG
   */
  async queryDocuments(projectId: string, query: string): Promise<QueryResult> {
    try {
      console.log(`Querying project ${projectId} with: "${query}"`);

      // Get project and collection info
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project || !project.qdrantCollectionId) {
        throw new Error("Project not found or no documents processed");
      }

      // Generate query embedding
      const queryEmbedding = await openaiService.generateQueryEmbedding(query);

      // Search for similar chunks
      const searchResults = await qdrantService.searchSimilarChunks(
        project.qdrantCollectionId,
        queryEmbedding,
        this.maxChunks,
        this.similarityThreshold
      );

      if (searchResults.length === 0) {
        return {
          answer:
            "Desculpe, não encontrei informações relevantes nos documentos para responder sua pergunta.",
          sources: [],
          tokensUsed: { prompt: 0, completion: 0, total: 0 },
        };
      }

      // Prepare context documents
      const contextDocuments = searchResults.map(
        (result) => result.chunk.content
      );

      // Generate AI response
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "user",
          content: query,
        },
      ];

      const aiResponse = await openaiService.generateChatCompletion(
        messages,
        contextDocuments
      );

      // Prepare sources
      const sources = searchResults.map((result) => ({
        documentId: result.chunk.documentId,
        filename: result.chunk.metadata.filename,
        content: result.chunk.content.substring(0, 200) + "...",
        score: result.score,
        chunkIndex: result.chunk.chunkIndex,
      }));

      return {
        answer: aiResponse.content,
        sources,
        tokensUsed: aiResponse.tokensUsed,
      };
    } catch (error) {
      console.error("Error in queryDocuments:", error);
      throw new Error(
        `Query failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Query documents with enhanced conversation memory
   */
  async queryDocumentsWithMemory(
    projectId: string,
    query: string,
    conversationId: string
  ): Promise<QueryResult> {
    try {
      console.log(
        `Querying project ${projectId} with enhanced memory. Query: "${query}"`
      );

      // Get project and collection info
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project || !project.qdrantCollectionId) {
        throw new Error("Project not found or no documents processed");
      }

      // Get optimized conversation memory
      const conversationMemory = await conversationMemoryService.getConversationMemory(conversationId);
      
      console.log(`Using ${conversationMemory.memoryType} memory with ${conversationMemory.recentMessages.length} messages and ${conversationMemory.tokenCount} tokens`);

      // Generate query embedding
      const queryEmbedding = await openaiService.generateQueryEmbedding(query);

      // Search for similar chunks
      const searchResults = await qdrantService.searchSimilarChunks(
        project.qdrantCollectionId,
        queryEmbedding,
        this.maxChunks,
        this.similarityThreshold
      );

      if (searchResults.length === 0) {
        // Even with no document context, we can still provide a response using conversation memory
        const memoryMessages = conversationMemoryService.formatMemoryForAI(conversationMemory);
        memoryMessages.push({
          role: "user",
          content: query
        });

        const aiResponse = await openaiService.generateChatCompletion(memoryMessages);

        return {
          answer: aiResponse.content,
          sources: [],
          tokensUsed: aiResponse.tokensUsed,
        };
      }

      // Prepare context documents
      const contextDocuments = searchResults.map(
        (result) => result.chunk.content
      );

      // Build messages with memory and context
      const memoryMessages = conversationMemoryService.formatMemoryForAI(conversationMemory);
      
      // Add current query
      memoryMessages.push({
        role: "user",
        content: query,
      });

      // Generate AI response with enhanced context
      const aiResponse = await openaiService.generateChatCompletion(
        memoryMessages,
        contextDocuments
      );

      // Prepare sources
      const sources = searchResults.map((result) => ({
        documentId: result.chunk.documentId,
        filename: result.chunk.metadata.filename,
        content: result.chunk.content.substring(0, 200) + "...",
        score: result.score,
        chunkIndex: result.chunk.chunkIndex,
      }));

      return {
        answer: aiResponse.content,
        sources,
        tokensUsed: aiResponse.tokensUsed,
      };
    } catch (error) {
      console.error("Error in queryDocumentsWithMemory:", error);
      throw new Error(
        `Query with memory failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Educational query with different types and memory
   */
  async educationalQuery(
    projectId: string,
    query: string,
    type: "question" | "summary" | "quiz" | "explanation" = "question",
    conversationId?: string
  ): Promise<QueryResult> {
    // Enhance query based on type
    let enhancedQuery = query;

    switch (type) {
      case "summary":
        enhancedQuery = `Por favor, faça um resumo detalhado sobre: ${query}`;
        break;
      case "quiz":
        enhancedQuery = `Crie questões de múltipla escolha com 4 alternativas sobre: ${query}`;
        break;
      case "explanation":
        enhancedQuery = `Explique detalhadamente o conceito e forneça exemplos práticos sobre: ${query}`;
        break;
      default:
        enhancedQuery = query;
    }

    // Use memory if conversation ID provided
    if (conversationId) {
      return await this.queryDocumentsWithMemory(projectId, enhancedQuery, conversationId);
    } else {
      return await this.queryDocuments(projectId, enhancedQuery);
    }
  }

  // ===========================
  // BATCH OPERATIONS
  // ===========================

  /**
   * Batch process multiple documents with enhanced monitoring
   */
  async batchProcessDocuments(
    files: Express.Multer.File[],
    projectId: string,
    uploadedById: string
  ): Promise<BatchProcessResult> {
    const results = [];
    let successful = 0;
    let failed = 0;

    for (const file of files) {
      try {
        // Validate with LangChain processor
        const validation = LangChainDocumentProcessor.validateFile(file);
        if (!validation.isValid) {
          results.push({
            filename: file.originalname,
            success: false,
            error: validation.error,
          });
          failed++;
          continue;
        }

        // Upload and process
        const result = await this.uploadAndProcessDocument(
          file,
          projectId,
          uploadedById
        );

        results.push({
          filename: file.originalname,
          success: true,
          document: result.document,
          processResult: result.processResult,
        });
        successful++;
      } catch (error) {
        results.push({
          filename: file.originalname,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        failed++;
      }
    }

    return {
      successful,
      failed,
      results,
    };
  }

  // ===========================
  // PROJECT STATUS & ANALYTICS
  // ===========================

  /**
   * Get comprehensive project processing status
   */
  async getProjectStatus(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          select: {
            id: true,
            filename: true,
            originalName: true,
            mimeType: true,
            size: true,
            textContent: true,
            processedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const totalDocuments = project.documents.length;
    const documentsWithText = project.documents.filter(
      (doc) => doc.textContent
    ).length;
    const processedDocuments = project.documents.filter(
      (doc) => doc.processedAt
    ).length;
    const pendingProcessing = totalDocuments - processedDocuments;

    let collectionStats = null;
    if (project.qdrantCollectionId) {
      try {
        collectionStats = await qdrantService.getCollectionStats(
          project.qdrantCollectionId
        );
      } catch (error) {
        console.warn("Could not get collection stats:", error);
      }
    }

    // Enhanced document analysis
    const enhancedDocuments = project.documents.map((doc) => {
      const isLangChainSupported =
        LangChainDocumentProcessor.isFileTypeSupported(doc.originalName);
      let analysis = null;

      if (doc.textContent) {
        analysis = LangChainDocumentProcessor.analyzeDocument(doc.textContent);
      }

      return {
        ...doc,
        isLangChainSupported,
        analysis,
        hasText: !!doc.textContent,
        isProcessed: !!doc.processedAt,
        supportedByLangChain: isLangChainSupported,
      };
    });

    return {
      projectId: project.id,
      projectName: project.name,
      hasCollection: !!project.qdrantCollectionId,
      collectionName: project.qdrantCollectionId || null,
      totalDocuments,
      documentsWithText,
      processedDocuments,
      pendingProcessing,
      collectionStats,
      documents: enhancedDocuments,
      // Enhanced analytics
      langChainSupported: enhancedDocuments.filter(
        (d) => d.isLangChainSupported
      ).length,
      totalWords: enhancedDocuments.reduce(
        (sum, d) => sum + (d.analysis?.statistics.words || 0),
        0
      ),
      estimatedReadingTime: enhancedDocuments.reduce(
        (sum, d) => sum + (d.analysis?.statistics.readingTimeMinutes || 0),
        0
      ),
    };
  }

  /**
   * Advanced document analysis for a project
   */
  async analyzeProjectDocuments(projectId: string): Promise<ProjectAnalysis> {
    const documents = await prisma.document.findMany({
      where: {
        projectId,
        textContent: { not: null },
      },
      select: {
        id: true,
        filename: true,
        originalName: true,
        textContent: true,
        mimeType: true,
        size: true,
      },
    });

    const analyses = documents.map((doc) => {
      const analysis = LangChainDocumentProcessor.analyzeDocument(
        doc.textContent!
      );
      return {
        documentId: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        ...analysis,
      };
    });

    // Aggregate statistics
    const totalWords = analyses.reduce((sum, a) => sum + a.statistics.words, 0);
    const totalReadingTime = analyses.reduce(
      (sum, a) => sum + a.statistics.readingTimeMinutes,
      0
    );
    const languages = [...new Set(analyses.map((a) => a.estimatedLanguage))];
    const complexityDistribution = {
      High: analyses.filter((a) => a.complexity === "High").length,
      Medium: analyses.filter((a) => a.complexity === "Medium").length,
      Low: analyses.filter((a) => a.complexity === "Low").length,
    };

    return {
      projectId,
      documentCount: documents.length,
      totalWords,
      totalReadingTime,
      languages,
      complexityDistribution,
      documents: analyses,
    };
  }

  /**
   * Get processing recommendations for a project
   */
  async getProcessingRecommendations(projectId: string): Promise<{
    projectId: string;
    recommendationCount: number;
    recommendations: ProcessingRecommendation[];
  }> {
    const status = await this.getProjectStatus(projectId);
    const recommendations: ProcessingRecommendation[] = [];

    // Check for unprocessed documents
    if (status.pendingProcessing > 0) {
      recommendations.push({
        type: "processing",
        priority: "high",
        message: `${status.pendingProcessing} document(s) need processing`,
        action: "processAllDocuments",
      });
    }

    // Check for unsupported file types
    const unsupported = status.documents.filter((d) => !d.isLangChainSupported);
    if (unsupported.length > 0) {
      recommendations.push({
        type: "compatibility",
        priority: "medium",
        message: `${unsupported.length} document(s) use unsupported formats`,
        action: "convertToSupportedFormat",
        files: unsupported.map((d) => d.filename),
      });
    }

    // Check collection health
    if (!status.hasCollection && status.totalDocuments > 0) {
      recommendations.push({
        type: "setup",
        priority: "high",
        message: "No vector collection found for processed documents",
        action: "recreateCollection",
      });
    }

    // Performance recommendations
    if (status.totalDocuments > 50) {
      recommendations.push({
        type: "performance",
        priority: "low",
        message: "Large number of documents may affect query performance",
        action: "optimizeCollection",
      });
    }

    return {
      projectId,
      recommendationCount: recommendations.length,
      recommendations,
    };
  }

  /**
   * Optimize project collection
   */
  async optimizeProject(projectId: string) {
    const status = await this.getProjectStatus(projectId);
    const recommendations = await this.getProcessingRecommendations(projectId);

    return {
      projectId,
      currentStatus: status,
      recommendations,
      message:
        "Project analysis completed. Check recommendations for optimization opportunities.",
    };
  }

  /**
   * Export comprehensive project data
   */
  async exportProjectData(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: true,
        conversations: {
          include: {
            messages: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const analysis = await this.analyzeProjectDocuments(projectId);
    const status = await this.getProjectStatus(projectId);

    return {
      project: {
        id: project.id,
        name: project.name,
        subject: project.subject,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      documents: project.documents.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        hasText: !!doc.textContent,
        isProcessed: !!doc.processedAt,
        processedAt: doc.processedAt,
        createdAt: doc.createdAt,
      })),
      conversations: project.conversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        messageCount: conv.messages.length,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      })),
      analysis,
      status,
      exportedAt: new Date().toISOString(),
    };
  }

  // ===========================
  // SYSTEM HEALTH & CONFIG
  // ===========================

  /**
   * Health check for RAG services
   */
  async healthCheck() {
    const openaiHealth = await openaiService.validateConfiguration();
    const qdrantHealth = await qdrantService.healthCheck();
    const memoryConfig = conversationMemoryService.getConfiguration();

    return {
      openai: openaiHealth,
      qdrant: qdrantHealth,
      memory: {
        isConfigured: true,
        maxTokens: memoryConfig.maxTokens,
        maxMessages: memoryConfig.maxMessages,
      },
      langChain: {
        textSplitter: true,
        supportedFormats: LangChainDocumentProcessor.isFileTypeSupported("test.pdf"),
      },
      enhanced: true,
      overall: openaiHealth.isValid && qdrantHealth.isHealthy,
    };
  }

  /**
   * Get comprehensive RAG configuration
   */
  getConfiguration() {
    return {
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      maxChunks: this.maxChunks,
      similarityThreshold: this.similarityThreshold,
      openaiModels: openaiService.getModelInfo(),
      langChain: {
        ...LangChainDocumentProcessor.getTextSplitterConfig(),
        supportedFormats: [".pdf", ".docx", ".doc", ".txt", ".md"],
        processingMethod: "RecursiveCharacterTextSplitter",
      },
      memory: conversationMemoryService.getConfiguration(),
      enhanced: true,
    };
  }
}

// Export singleton instance
export const ragService = new RAGService();
