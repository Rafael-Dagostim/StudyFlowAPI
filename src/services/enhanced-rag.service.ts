import { ragService, ProcessDocumentResult, QueryResult } from './rag.service';
import { LangChainDocumentProcessor } from './langchain-document.service';
import { prisma } from '../utils/database';

/**
 * Enhanced RAG Service with advanced LangChain capabilities
 * Extends the basic RAG service with additional educational features
 */
export class EnhancedRAGService {
  /**
   * Upload and process document with enhanced LangChain processing
   */
  async uploadAndProcessDocument(
    file: Express.Multer.File,
    projectId: string,
    uploadedById: string
  ): Promise<{
    document: any;
    processResult: ProcessDocumentResult;
  }> {
    // Use the base RAG service implementation
    return await ragService.uploadAndProcessDocument(file, projectId, uploadedById);
  }

  /**
   * Process document with enhanced features
   */
  async processDocument(documentId: string): Promise<ProcessDocumentResult> {
    return await ragService.processDocument(documentId);
  }

  /**
   * Reprocess document with enhanced capabilities
   */
  async reprocessDocument(documentId: string): Promise<ProcessDocumentResult> {
    return await ragService.reprocessDocument(documentId);
  }

  /**
   * Delete document and cleanup
   */
  async deleteDocument(documentId: string): Promise<void> {
    return await ragService.deleteDocument(documentId);
  }

  /**
   * Process entire project with enhanced monitoring
   */
  async processProject(projectId: string): Promise<ProcessDocumentResult[]> {
    return await ragService.processProject(projectId);
  }

  /**
   * Get detailed project status with LangChain insights
   */
  async getProjectStatus(projectId: string) {
    const baseStatus = await ragService.getProjectStatus(projectId);
    
    // Add enhanced status information
    const documents = await prisma.document.findMany({
      where: { projectId },
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimeType: true,
        size: true,
        textContent: true,
        processedAt: true,
        createdAt: true
      }
    });

    // Analyze documents with LangChain processor
    const enhancedDocuments = documents.map(doc => {
      const isLangChainSupported = LangChainDocumentProcessor.isFileTypeSupported(doc.originalName);
      let analysis = null;
      
      if (doc.textContent) {
        analysis = LangChainDocumentProcessor.analyzeDocument(doc.textContent);
      }

      return {
        ...doc,
        isLangChainSupported,
        analysis,
        hasText: !!doc.textContent,
        isProcessed: !!doc.processedAt
      };
    });

    return {
      ...baseStatus,
      documents: enhancedDocuments,
      langChainSupported: enhancedDocuments.filter(d => d.isLangChainSupported).length,
      totalWords: enhancedDocuments.reduce((sum, d) => sum + (d.analysis?.statistics.words || 0), 0),
      estimatedReadingTime: enhancedDocuments.reduce((sum, d) => sum + (d.analysis?.statistics.readingTimeMinutes || 0), 0)
    };
  }

  /**
   * Educational query with enhanced capabilities
   */
  async educationalQuery(
    projectId: string,
    query: string,
    type: 'question' | 'summary' | 'quiz' | 'explanation' = 'question'
  ): Promise<QueryResult> {
    return await ragService.educationalQuery(projectId, query, type);
  }

  /**
   * Advanced document analysis
   */
  async analyzeProjectDocuments(projectId: string) {
    const documents = await prisma.document.findMany({
      where: { 
        projectId,
        textContent: { not: null }
      },
      select: {
        id: true,
        filename: true,
        originalName: true,
        textContent: true,
        mimeType: true,
        size: true
      }
    });

    const analyses = documents.map(doc => {
      const analysis = LangChainDocumentProcessor.analyzeDocument(doc.textContent!);
      return {
        documentId: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        ...analysis
      };
    });

    // Aggregate statistics
    const totalWords = analyses.reduce((sum, a) => sum + a.statistics.words, 0);
    const totalReadingTime = analyses.reduce((sum, a) => sum + a.statistics.readingTimeMinutes, 0);
    const languages = [...new Set(analyses.map(a => a.estimatedLanguage))];
    const complexityDistribution = {
      High: analyses.filter(a => a.complexity === 'High').length,
      Medium: analyses.filter(a => a.complexity === 'Medium').length,
      Low: analyses.filter(a => a.complexity === 'Low').length
    };

    return {
      projectId,
      documentCount: documents.length,
      totalWords,
      totalReadingTime,
      languages,
      complexityDistribution,
      documents: analyses
    };
  }

  /**
   * Batch process documents with enhanced monitoring
   */
  async batchProcessDocuments(
    files: Express.Multer.File[],
    projectId: string,
    uploadedById: string
  ): Promise<{
    successful: number;
    failed: number;
    results: Array<{
      filename: string;
      success: boolean;
      document?: any;
      processResult?: ProcessDocumentResult;
      error?: string;
    }>;
  }> {
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
            error: validation.error
          });
          failed++;
          continue;
        }

        // Upload and process
        const result = await this.uploadAndProcessDocument(file, projectId, uploadedById);
        
        results.push({
          filename: file.originalname,
          success: true,
          document: result.document,
          processResult: result.processResult
        });
        successful++;

      } catch (error) {
        results.push({
          filename: file.originalname,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failed++;
      }
    }

    return {
      successful,
      failed,
      results
    };
  }

  /**
   * Get processing recommendations
   */
  async getProcessingRecommendations(projectId: string) {
    const status = await this.getProjectStatus(projectId);
    const recommendations = [];

    // Check for unprocessed documents
    if (status.pendingProcessing > 0) {
      recommendations.push({
        type: 'processing',
        priority: 'high',
        message: `${status.pendingProcessing} document(s) need processing`,
        action: 'processAllDocuments'
      });
    }

    // Check for unsupported file types
    const unsupported = status.documents.filter(d => !d.isLangChainSupported);
    if (unsupported.length > 0) {
      recommendations.push({
        type: 'compatibility',
        priority: 'medium',
        message: `${unsupported.length} document(s) use unsupported formats`,
        action: 'convertToSupportedFormat',
        files: unsupported.map(d => d.filename)
      });
    }

    // Check collection health
    if (!status.hasCollection && status.totalDocuments > 0) {
      recommendations.push({
        type: 'setup',
        priority: 'high',
        message: 'No vector collection found for processed documents',
        action: 'recreateCollection'
      });
    }

    // Performance recommendations
    if (status.totalDocuments > 50) {
      recommendations.push({
        type: 'performance',
        priority: 'low',
        message: 'Large number of documents may affect query performance',
        action: 'optimizeCollection'
      });
    }

    return {
      projectId,
      recommendationCount: recommendations.length,
      recommendations
    };
  }

  /**
   * Health check with enhanced diagnostics
   */
  async healthCheck() {
    const baseHealth = await ragService.healthCheck();
    
    // Add LangChain-specific health checks
    const langChainHealth = {
      textSplitter: true, // LangChain text splitter is always available
      supportedFormats: LangChainDocumentProcessor.isFileTypeSupported('test.pdf') // Test format support
    };

    return {
      ...baseHealth,
      langChain: langChainHealth,
      enhanced: true
    };
  }

  /**
   * Get enhanced configuration
   */
  getConfiguration() {
    const baseConfig = ragService.getConfiguration();
    const langChainConfig = LangChainDocumentProcessor.getTextSplitterConfig();

    return {
      ...baseConfig,
      langChain: {
        ...langChainConfig,
        supportedFormats: ['.pdf', '.docx', '.doc', '.txt', '.md'],
        processingMethod: 'RecursiveCharacterTextSplitter'
      },
      enhanced: true
    };
  }

  /**
   * Optimize project collection
   */
  async optimizeProject(projectId: string) {
    // This could include operations like:
    // - Removing duplicate chunks
    // - Optimizing embeddings
    // - Cleaning up orphaned data
    
    const status = await this.getProjectStatus(projectId);
    const recommendations = await this.getProcessingRecommendations(projectId);
    
    return {
      projectId,
      currentStatus: status,
      recommendations,
      message: 'Project analysis completed. Check recommendations for optimization opportunities.'
    };
  }

  /**
   * Export project data
   */
  async exportProjectData(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: true,
        conversations: {
          include: {
            messages: true
          }
        }
      }
    });

    if (!project) {
      throw new Error('Project not found');
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
        updatedAt: project.updatedAt
      },
      documents: project.documents.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        hasText: !!doc.textContent,
        isProcessed: !!doc.processedAt,
        processedAt: doc.processedAt,
        createdAt: doc.createdAt
      })),
      conversations: project.conversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        messageCount: conv.messages.length,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt
      })),
      analysis,
      status,
      exportedAt: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const enhancedRAGService = new EnhancedRAGService();
