import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * LangChain-powered document processor for advanced text processing
 * Uses LangChain document loaders and text splitters
 */
export class LangChainDocumentProcessor {
  private static textSplitter: RecursiveCharacterTextSplitter;

  static {
    // Initialize text splitter with optimized settings
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1000'),
      chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '200'),
      separators: ['\n\n', '\n', '. ', ' ', ''],
    });
  }

  /**
   * Check if file type is supported by LangChain processing
   */
  static isFileTypeSupported(filename: string): boolean {
    const supportedExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const extension = path.extname(filename).toLowerCase();
    return supportedExtensions.includes(extension);
  }

  /**
   * Validate file for LangChain processing
   */
  static validateFile(file: Express.Multer.File): { isValid: boolean; error?: string } {
    // Check file size
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default
    if (file.size > maxSize) {
      return {
        isValid: false,
        error: `File size ${Math.round(file.size / 1024 / 1024)}MB exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
      };
    }

    // Check file type
    if (!this.isFileTypeSupported(file.originalname)) {
      return {
        isValid: false,
        error: `File type not supported by LangChain processor: ${path.extname(file.originalname)}`
      };
    }

    // Check for empty files
    if (file.size === 0) {
      return {
        isValid: false,
        error: 'Empty files are not allowed'
      };
    }

    return { isValid: true };
  }

  /**
   * Process document using LangChain loaders and splitters
   */
  static async processDocument(file: Express.Multer.File): Promise<{
    text: string;
    chunks: string[];
    metadata: {
      filename: string;
      fileType: string;
      size: number;
      chunkCount: number;
      processingMethod: string;
    };
  }> {
    try {
      console.log(`Processing document with LangChain: ${file.originalname}`);

      // Create temporary file for LangChain loaders
      const tempFilePath = await this.createTempFile(file);
      
      let documents: Document[] = [];

      try {
        // Load document based on file type
        const extension = path.extname(file.originalname).toLowerCase();
        
        switch (extension) {
          case '.pdf':
            const pdfLoader = new PDFLoader(tempFilePath);
            documents = await pdfLoader.load();
            break;
            
          case '.docx':
            const docxLoader = new DocxLoader(tempFilePath);
            documents = await docxLoader.load();
            break;
            
          case '.txt':
          case '.md':
            const textLoader = new TextLoader(tempFilePath);
            documents = await textLoader.load();
            break;
            
          default:
            throw new Error(`Unsupported file type: ${extension}`);
        }

        // Combine all document pages/sections into single text
        const text = documents.map(doc => doc.pageContent).join('\n\n');

        if (!text || text.trim().length === 0) {
          throw new Error('No text content could be extracted from the document');
        }

        // Split text using LangChain text splitter
        const splitDocuments = await this.textSplitter.splitDocuments(documents);
        const chunks = splitDocuments.map(doc => doc.pageContent);

        console.log(`Document processed: ${chunks.length} chunks created`);

        return {
          text: this.preprocessText(text),
          chunks,
          metadata: {
            filename: file.originalname,
            fileType: file.mimetype,
            size: file.size,
            chunkCount: chunks.length,
            processingMethod: 'LangChain with native loaders',
          },
        };
      } finally {
        // Clean up temporary file
        await this.cleanupTempFile(tempFilePath);
      }
    } catch (error) {
      console.error(`Error processing document with LangChain:`, error);
      throw new Error(`LangChain processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create temporary file for LangChain loaders
   */
  private static async createTempFile(file: Express.Multer.File): Promise<string> {
    const tempDir = process.env.TEMP_DIR || '/tmp';
    const tempFileName = `${uuidv4()}_${file.originalname}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    await fs.writeFile(tempFilePath, file.buffer);
    return tempFilePath;
  }

  /**
   * Clean up temporary file
   */
  private static async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`Could not delete temporary file ${filePath}:`, error);
    }
  }

  /**
   * Split existing text into chunks using LangChain splitter
   */
  static async splitText(text: string): Promise<string[]> {
    try {
      const document = new Document({ pageContent: text });
      const splitDocuments = await this.textSplitter.splitDocuments([document]);
      return splitDocuments.map(doc => doc.pageContent);
    } catch (error) {
      console.error('Error splitting text with LangChain:', error);
      // Fallback to basic chunking
      return this.basicChunkText(text);
    }
  }

  /**
   * Fallback basic text chunking
   */
  private static basicChunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;
      
      // If this isn't the last chunk, try to break at a sentence or paragraph
      if (end < text.length) {
        const searchStart = Math.max(end - 200, start);
        const sentenceEnd = text.lastIndexOf('.', end);
        const paragraphEnd = text.lastIndexOf('\n\n', end);
        
        if (sentenceEnd > searchStart) {
          end = sentenceEnd + 1;
        } else if (paragraphEnd > searchStart) {
          end = paragraphEnd + 2;
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end - overlap; // Add overlap between chunks
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Enhanced text preprocessing for better embeddings
   */
  static preprocessText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove excessive newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Clean up common PDF artifacts
      .replace(/\f/g, ' ') // form feed
      .replace(/\r/g, '') // carriage return
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Remove page numbers and headers/footers (common patterns)
      .replace(/^\d+\s*$/gm, '') // standalone numbers on their own lines
      .replace(/^Page \d+.*$/gm, '') // page headers
      // Trim and ensure content
      .trim();
  }

  /**
   * Get text splitter configuration
   */
  static getTextSplitterConfig() {
    return {
      chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1000'),
      chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '200'),
      separators: ['\n\n', '\n', '. ', ' ', ''],
    };
  }

  /**
   * Check if file exists in the uploads directory
   */
  static async fileExists(filename: string): Promise<boolean> {
    try {
      const uploadsDir = process.env.UPLOADS_DIR || './uploads';
      const filePath = path.join(uploadsDir, filename);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file information for processing
   */
  static getFileProcessingInfo(file: Express.Multer.File) {
    const extension = path.extname(file.originalname).toLowerCase();
    const isSupported = this.isFileTypeSupported(file.originalname);
    
    return {
      filename: file.originalname,
      extension,
      mimeType: file.mimetype,
      size: file.size,
      isSupported,
      estimatedChunks: Math.ceil(file.size / 1000), // Rough estimate
      processingMethod: isSupported ? 'LangChain Native Loaders' : 'Unsupported',
    };
  }

  /**
   * Batch process multiple files
   */
  static async processMultipleDocuments(
    files: Express.Multer.File[]
  ): Promise<Array<{
    filename: string;
    success: boolean;
    result?: {
      text: string;
      chunks: string[];
      metadata: any;
    };
    error?: string;
  }>> {
    const results = [];

    for (const file of files) {
      try {
        const result = await this.processDocument(file);
        results.push({
          filename: file.originalname,
          success: true,
          result,
        });
      } catch (error) {
        results.push({
          filename: file.originalname,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get processing statistics
   */
  static getProcessingStats(
    results: Array<{ success: boolean; result?: any; error?: string }>
  ) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalChunks = successful.reduce((sum, r) => sum + (r.result?.chunks.length || 0), 0);

    return {
      totalFiles: results.length,
      successful: successful.length,
      failed: failed.length,
      totalChunks,
      averageChunksPerFile: successful.length > 0 ? totalChunks / successful.length : 0,
      errors: failed.map(f => f.error),
    };
  }

  /**
   * Advanced document analysis
   */
  static analyzeDocument(text: string) {
    const words = text.split(/\s+/).length;
    const characters = text.length;
    const lines = text.split('\n').length;
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0).length;
    
    // Estimate reading time (average 200 words per minute)
    const readingTimeMinutes = Math.ceil(words / 200);
    
    // Language detection (basic)
    const portugueseWords = ['de', 'da', 'do', 'com', 'para', 'por', 'em', 'um', 'uma', 'que', 'não', 'é', 'são'];
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    
    const textLower = text.toLowerCase();
    const portugueseMatches = portugueseWords.filter(word => textLower.includes(` ${word} `)).length;
    const englishMatches = englishWords.filter(word => textLower.includes(` ${word} `)).length;
    
    const estimatedLanguage = portugueseMatches > englishMatches ? 'Portuguese' : 'English';

    return {
      statistics: {
        words,
        characters,
        lines,
        paragraphs,
        readingTimeMinutes,
      },
      estimatedLanguage,
      complexity: words > 10000 ? 'High' : words > 5000 ? 'Medium' : 'Low',
    };
  }
}
