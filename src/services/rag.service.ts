import { prisma } from "../utils/database";
import { openaiService } from "./openai.service";
import { qdrantService } from "./qdrant.service";
import { LangChainDocumentProcessor } from "./langchain-document.service";
import { S3Service } from "./s3.service";
import { v4 as uuidv4 } from "uuid";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

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
   * Process all documents in a project
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
   * Query documents with conversation memory
   */
  async queryDocumentsWithMemory(
    projectId: string,
    query: string,
    conversationHistory: Array<{ role: "USER" | "ASSISTANT"; content: string }>
  ): Promise<QueryResult> {
    try {
      console.log(
        `Querying project ${projectId} with memory. Query: "${query}"`
      );

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

      // Build conversation messages with memory
      const messages: ChatCompletionMessageParam[] = [];

      // Add conversation history
      conversationHistory.forEach((msg) => {
        messages.push({
          role: msg.role === "USER" ? "user" : "assistant",
          content: msg.content,
        });
      });

      // Add current query
      messages.push({
        role: "user",
        content: query,
      });

      // Generate AI response with context and memory
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
      console.error("Error in queryDocumentsWithMemory:", error);
      throw new Error(
        `Query with memory failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get conversation history for memory
   */
  async getConversationHistory(
    conversationId: string
  ): Promise<Array<{ role: "USER" | "ASSISTANT"; content: string }>> {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 10, // Limit to last 10 messages to avoid token limits
    });

    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Get project processing status
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
            textContent: true,
            processedAt: true,
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
      documents: project.documents.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        hasText: !!doc.textContent,
        isProcessed: !!doc.processedAt,
        processedAt: doc.processedAt,
        supportedByLangChain: LangChainDocumentProcessor.isFileTypeSupported(
          doc.originalName
        ),
      })),
    };
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
   * Educational query with different types
   */
  async educationalQuery(
    projectId: string,
    query: string,
    type: "question" | "summary" | "quiz" | "explanation" = "question"
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

    return await this.queryDocuments(projectId, enhancedQuery);
  }

  /**
   * Health check for RAG services
   */
  async healthCheck() {
    const openaiHealth = await openaiService.validateConfiguration();
    const qdrantHealth = await qdrantService.healthCheck();

    return {
      openai: openaiHealth,
      qdrant: qdrantHealth,
      overall: openaiHealth.isValid && qdrantHealth.isHealthy,
    };
  }

  /**
   * Get RAG configuration
   */
  getConfiguration() {
    return {
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      maxChunks: this.maxChunks,
      similarityThreshold: this.similarityThreshold,
      openaiModels: openaiService.getModelInfo(),
      langChain: LangChainDocumentProcessor.getTextSplitterConfig(),
    };
  }
}

// Export singleton instance
export const ragService = new RAGService();
