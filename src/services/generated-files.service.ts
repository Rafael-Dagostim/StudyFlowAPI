import { GeneratedFile, GeneratedFileVersion } from '@prisma/client';
import { prisma } from '../utils/database';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { PDFService } from './pdf.service';
import { OpenAIService } from './openai.service';
import { QdrantService } from './qdrant.service';

export interface CreateFileParams {
  projectId: string;
  professorId: string;
  prompt: string;
  displayName: string;
  fileType: 'study-guide' | 'quiz' | 'summary' | 'lesson-plan' | 'custom';
  format: 'pdf' | 'markdown' | 'docx';
  options?: {
    includeImages?: boolean;
    language?: 'en' | 'pt';
    difficulty?: 'basic' | 'intermediate' | 'advanced';
    customPrompt?: string;
  };
}

export interface EditFileParams {
  fileId: string;
  editPrompt: string;
  baseVersion?: number;
}

export interface GenerationContext {
  sources: Array<{
    documentId: string;
    filename: string;
    content: string;
    similarity: number;
  }>;
  projectInfo: {
    name: string;
    description: string;
    subject: string;
  };
}

export class GeneratedFilesService {
  private tempDir = path.join(process.cwd(), 'temp', 'generated-files');
  private storageDir = path.join(process.cwd(), 'storage', 'generated-files');
  private pdfService: PDFService;
  private openaiService: OpenAIService;
  private qdrantService: QdrantService;
  
  constructor() {
    this.pdfService = new PDFService();
    this.openaiService = new OpenAIService();
    this.qdrantService = new QdrantService();
    this.ensureTempDir();
  }

  private async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create directories:', error);
    }
  }

  async createFile(params: CreateFileParams): Promise<GeneratedFile> {
    // Generate safe filename
    const fileName = this.generateFileName(params.displayName);
    
    // Check if file exists
    const existingFile = await prisma.generatedFile.findUnique({
      where: {
        projectId_fileName: {
          projectId: params.projectId,
          fileName
        }
      }
    });

    if (existingFile) {
      // Create new version instead
      const newVersion = await this.createNewVersion({
        fileId: existingFile.id,
        editPrompt: params.prompt
      });
      
      return await prisma.generatedFile.findUnique({
        where: { id: existingFile.id },
        include: { versions: true }
      }) as GeneratedFile;
    }

    // Create new file record
    const file = await prisma.generatedFile.create({
      data: {
        projectId: params.projectId,
        professorId: params.professorId,
        fileName,
        displayName: params.displayName,
        fileType: params.fileType,
        format: params.format
      }
    });

    // Create initial version record with pending status
    const version = await prisma.generatedFileVersion.create({
      data: {
        fileId: file.id,
        version: 1,
        prompt: params.prompt,
        s3Key: '', // Will be updated after generation
        sizeBytes: 0,
        generationTime: 0
      }
    });

    // Update current version
    await prisma.generatedFile.update({
      where: { id: file.id },
      data: { currentVersion: 1 }
    });

    // Start background generation (don't await)
    this.generateFileContentAsync(file, 1, params.prompt, {
      ...params.options,
      isEdit: false,
      isActualEdit: false
    }, params.professorId)
      .catch(error => {
        console.error('Background file generation failed:', error);
        // Update status to failed
        this.updateGenerationStatus(file.id, 1, 'failed', error.message);
      });

    return file;
  }

  async createNewVersion(params: EditFileParams): Promise<GeneratedFileVersion> {
    // Get file and determine version
    const file = await prisma.generatedFile.findUnique({
      where: { id: params.fileId },
      include: { versions: { orderBy: { version: 'desc' } } }
    });

    if (!file) {
      throw new Error('File not found');
    }

    const newVersion = file.currentVersion + 1;
    const baseVer = params.baseVersion || file.currentVersion;

    // Get base version content if editing
    let baseContent = '';
    if (baseVer > 0) {
      const baseVersion = await prisma.generatedFileVersion.findUnique({
        where: {
          fileId_version: {
            fileId: params.fileId,
            version: baseVer
          }
        }
      });

      if (baseVersion) {
        // For now, we'll regenerate content without base content
        // In production, you'd want to implement S3 download for base content
        console.warn('Base content retrieval not implemented yet');
      }
    }

    // Create version record
    const version = await prisma.generatedFileVersion.create({
      data: {
        fileId: params.fileId,
        version: newVersion,
        editPrompt: params.editPrompt,
        baseVersion: baseVer,
        prompt: this.buildEditPrompt(params.editPrompt, baseContent),
        s3Key: '', // Will be updated after generation
        sizeBytes: 0,
        generationTime: 0
      }
    });

    // Update current version
    await prisma.generatedFile.update({
      where: { id: params.fileId },
      data: { currentVersion: newVersion }
    });

    // Start background generation for new version (don't await)
    this.generateFileContentAsync(file, newVersion, params.editPrompt, {
      isEdit: true,
      isActualEdit: !!baseContent, // Only true edit if we have base content
      baseContent
    }, file.professorId)
      .catch(error => {
        console.error('Background file generation failed for new version:', error);
        // Update status to failed
        this.updateGenerationStatus(params.fileId, newVersion, 'failed', error.message);
      });

    return version;
  }

  private async generateFileContent(
    file: GeneratedFile,
    version: number,
    prompt: string,
    options: any = {}
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Gather context from project
      const context = await this.gatherProjectContext(file.projectId, prompt);

      // Generate content with AI
      const content = await this.generateWithAI(prompt, context, file.fileType, options);

      // Create temp file with random name
      const tempFileName = `${uuidv4()}.${file.format}`;
      const tempFilePath = path.join(this.tempDir, tempFileName);

      // Format content based on type
      let fileBuffer: Buffer;
      let pageCount: number | undefined;

      switch (file.format) {
        case 'pdf':
          // Generate PDF using the new PDF service
          const pdfResult = await this.pdfService.generatePDF(content, file.fileType, {
            title: file.displayName,
            projectName: context.projectInfo.name
          });
          fileBuffer = pdfResult.buffer;
          pageCount = pdfResult.pageCount;
          break;
        case 'markdown':
          // Add markdown frontmatter
          const markdownContent = `---
title: ${file.displayName}
type: ${file.fileType}
project: ${context.projectInfo.name}
generated: ${new Date().toISOString()}
version: ${version}
---

${content}`;
          fileBuffer = Buffer.from(markdownContent, 'utf-8');
          break;
        case 'docx':
          // For now, save as markdown until DOCX service is implemented
          fileBuffer = Buffer.from(content, 'utf-8');
          break;
        default:
          throw new Error(`Unsupported format: ${file.format}`);
      }

      // Save to permanent storage
      const fileDir = path.join(this.storageDir, file.id, `v${version}`);
      await fs.mkdir(fileDir, { recursive: true });
      
      const storagePath = path.join(fileDir, `file.${file.format}`);
      await fs.writeFile(storagePath, fileBuffer);
      
      // Save metadata
      const metadataPath = path.join(fileDir, 'metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify({
        prompt,
        generatedAt: new Date().toISOString(),
        context: context.sources,
        options,
        fileInfo: {
          format: file.format,
          fileType: file.fileType,
          displayName: file.displayName,
          sizeBytes: fileBuffer.length,
          pageCount
        }
      }, null, 2));

      // Generate a storage key for database
      const storageKey = `${file.id}/v${version}/file.${file.format}`;

      // Update version record
      await prisma.generatedFileVersion.update({
        where: {
          fileId_version: {
            fileId: file.id,
            version
          }
        },
        data: {
          s3Key: storageKey,
          sizeBytes: fileBuffer.length,
          pageCount,
          contextUsed: context.sources,
          generationTime: Math.floor((Date.now() - startTime) / 1000)
        }
      });


    } catch (error) {
      console.error('File generation error:', error);
      
      // Update version with error
      await prisma.generatedFileVersion.update({
        where: {
          fileId_version: {
            fileId: file.id,
            version
          }
        },
        data: {
          s3Key: '',
          sizeBytes: 0,
          generationTime: Math.floor((Date.now() - startTime) / 1000)
        }
      });

      throw error;
    }
  }

  private async generateFileContentAsync(
    file: GeneratedFile,
    version: number,
    prompt: string,
    options: any = {},
    professorId: string
  ): Promise<void> {
    try {
      console.log(`Starting async generation for file ${file.id}, version ${version}`);
      
      // Import WebSocket service to send notifications
      const { getWebSocketService } = await import('../services/websocket.service');
      const webSocketService = getWebSocketService();
      
      // Notify start of generation
      webSocketService.notifyFileGeneration(professorId, {
        fileId: file.id,
        version,
        status: 'generating',
        progress: 0,
        message: 'Starting content generation...'
      });

      // Update status to generating
      await this.updateGenerationStatus(file.id, version, 'generating');

      // Generate content using existing logic
      await this.generateFileContent(file, version, prompt, options);
      
      // Notify completion
      webSocketService.notifyFileGeneration(professorId, {
        fileId: file.id,
        version,
        status: 'completed',
        progress: 100,
        message: 'File generation completed successfully!'
      });

      // Update status to completed
      await this.updateGenerationStatus(file.id, version, 'completed');

      console.log(`Async generation completed for file ${file.id}, version ${version}`);
      
    } catch (error) {
      console.error(`Async generation failed for file ${file.id}:`, error);
      
      // Import WebSocket service for error notification
      const { getWebSocketService } = await import('../services/websocket.service');
      const webSocketService = getWebSocketService();
      
      // Notify error
      webSocketService.notifyFileGeneration(professorId, {
        fileId: file.id,
        version,
        status: 'failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });

      // Update status to failed
      await this.updateGenerationStatus(file.id, version, 'failed', error instanceof Error ? error.message : 'Unknown error');
      
      throw error;
    }
  }

  private async updateGenerationStatus(
    fileId: string, 
    version: number, 
    status: 'pending' | 'generating' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status
      };
      
      if (status === 'failed' && errorMessage) {
        updateData.errorMessage = errorMessage;
      }
      
      await prisma.generatedFileVersion.update({
        where: {
          fileId_version: {
            fileId,
            version
          }
        },
        data: updateData
      });
      
      console.log(`Status updated for file ${fileId} v${version}: ${status}`);
      
    } catch (error) {
      console.error('Failed to update generation status:', error);
    }
  }

  private async gatherProjectContext(
    projectId: string,
    prompt: string
  ): Promise<GenerationContext> {
    console.log('🔍 [CONTEXT] Starting context gathering for project:', projectId);
    console.log('📝 [CONTEXT] Search prompt:', prompt);
    
    // Get project info with collection ID
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { 
        name: true, 
        description: true, 
        subject: true,
        qdrantCollectionId: true,
        documents: {
          select: {
            id: true,
            filename: true
          }
        }
      }
    });

    if (!project) {
      console.error('❌ [CONTEXT] Project not found:', projectId);
      throw new Error('Project not found');
    }
    
    console.log('✅ [CONTEXT] Project found:', project.name);
    console.log('📊 [CONTEXT] Project documents count:', project.documents.length);
    console.log('🗂️ [CONTEXT] Qdrant collection ID:', project.qdrantCollectionId);

    // If no documents or no collection, return empty context
    if (!project.qdrantCollectionId || project.documents.length === 0) {
      console.log('⚠️ [CONTEXT] No documents or collection - returning empty context');
      return {
        sources: [],
        projectInfo: {
          name: project.name,
          description: project.description,
          subject: project.subject
        }
      };
    }

    // Extract search query from prompt
    const searchQuery = this.extractSearchTerms(prompt);
    console.log('🔎 [CONTEXT] Extracted search terms:', searchQuery);
    
    if (!searchQuery || searchQuery.trim().length === 0) {
      console.log('⚠️ [CONTEXT] No search terms extracted - returning empty context');
      return {
        sources: [],
        projectInfo: {
          name: project.name,
          description: project.description,
          subject: project.subject
        }
      };
    }

    try {
      console.log('🔗 [CONTEXT] Generating embeddings for search query...');
      // Generate embeddings for the search query
      const embeddings = await this.openaiService.generateEmbeddings([searchQuery]);
      const queryEmbedding = embeddings[0]; // Get first (and only) embedding
      console.log('✅ [CONTEXT] Embeddings generated, length:', queryEmbedding?.length || 0);
      
      console.log('🔍 [CONTEXT] Searching Qdrant for similar chunks...');
      // Search for relevant content in Qdrant
      const searchResults = await this.qdrantService.searchSimilarChunks(
        project.qdrantCollectionId,
        queryEmbedding,
        5 // Get top 5 most relevant chunks
      );
      
      console.log('📊 [CONTEXT] Search results count:', searchResults.length);
      searchResults.forEach((result, i) => {
        console.log(`📄 [CONTEXT] Result ${i + 1}: similarity=${result.score.toFixed(3)}, content_length=${result.chunk.content.length}`);
      });

      // Transform results into context sources
      const sources = searchResults.map(result => {
        const document = project.documents.find(doc => doc.id === result.chunk.documentId);
        return {
          documentId: result.chunk.documentId,
          filename: document?.filename || 'Unknown',
          content: result.chunk.content,
          similarity: result.score
        };
      });
      
      console.log('✅ [CONTEXT] Context gathering completed with', sources.length, 'sources');

      return {
        sources,
        projectInfo: {
          name: project.name,
          description: project.description,
          subject: project.subject
        }
      };
    } catch (error) {
      console.error('❌ [CONTEXT] Error searching for context:', error);
      // Return empty sources if search fails
      return {
        sources: [],
        projectInfo: {
          name: project.name,
          description: project.description,
          subject: project.subject
        }
      };
    }
  }

  private async generateWithAI(
    prompt: string,
    context: GenerationContext,
    fileType: string,
    options: any = {}
  ): Promise<string> {
    console.log('🔥 [AI GENERATION] Starting AI content generation');
    console.log('📝 [AI GENERATION] Input prompt:', prompt);
    console.log('📊 [AI GENERATION] Context sources count:', context.sources.length);
    console.log('🗂️ [AI GENERATION] File type:', fileType);
    console.log('⚙️ [AI GENERATION] Options:', options);
    console.log('📝 [AI GENERATION] Is edit:', !!options.isEdit);
    console.log('📝 [AI GENERATION] Is actual edit:', !!options.isActualEdit);
    
    // Build context for AI
    const contextText = context.sources
      .map(source => `From "${source.filename}":\n${source.content}`)
      .join('\n\n---\n\n');

    console.log('📄 [AI GENERATION] Context text length:', contextText.length);
    if (contextText.length > 0) {
      console.log('📄 [AI GENERATION] Context preview (first 200 chars):', contextText.substring(0, 200) + '...');
    } else {
      console.log('⚠️ [AI GENERATION] NO CONTEXT TEXT - generating without source material');
    }

    // Get template for file type - choose based on whether it's an actual edit or fresh generation
    const template = options.isActualEdit ? 
      this.getEditPromptTemplate(fileType) : 
      this.getPromptTemplate(fileType);
    
    console.log('📋 [AI GENERATION] Template type:', options.isActualEdit ? 'EDIT' : 'FRESH GENERATION');
    console.log('📋 [AI GENERATION] Template length:', template.length);
    
    // Build full prompt
    const fullPrompt = template
      .replace('{prompt}', prompt)
      .replace('{context}', contextText)
      .replace('{projectName}', context.projectInfo.name)
      .replace('{subject}', context.projectInfo.subject)
      .replace('{language}', options.language || 'en')
      .replace('{difficulty}', options.difficulty || 'intermediate')
      .replace('{baseContent}', options.baseContent || '');

    console.log('📝 [AI GENERATION] Full prompt length:', fullPrompt.length);
    console.log('📝 [AI GENERATION] Full prompt preview (first 500 chars):', fullPrompt.substring(0, 500) + '...');
    
    try {
      console.log('🤖 [AI GENERATION] Calling OpenAI API...');
      // Generate content with OpenAI
      const response = await this.openaiService.generateChatCompletion([
        { role: 'user', content: fullPrompt }
      ]);
      
      console.log('✅ [AI GENERATION] OpenAI response received');
      console.log('📄 [AI GENERATION] Response content length:', response.content?.length || 0);
      console.log('📄 [AI GENERATION] Response content preview (first 500 chars):', (response.content || '').substring(0, 500) + '...');
      
      if (!response.content || response.content.length === 0) {
        console.error('❌ [AI GENERATION] Empty response from OpenAI!');
        throw new Error('Empty response from OpenAI');
      }
      
      return response.content;
    } catch (error) {
      console.error('❌ [AI GENERATION] Error calling OpenAI:', error);
      throw error;
    }
  }

  private getPromptTemplate(fileType: string): string {
    const templates = {
      'study-guide': `
You are an educational content creator. Create a comprehensive study guide based on the following request and context materials.

Request: {prompt}

Project: {projectName}
Subject: {subject}
Language: {language}
Difficulty Level: {difficulty}

Context Materials:
{context}

Create a well-structured study guide in markdown format with:
1. A clear title
2. Learning objectives
3. Key concepts and definitions
4. Detailed explanations with examples
5. Practice questions
6. Summary of main points

Use proper markdown formatting with headers, bullet points, and emphasis where appropriate.
`,
      'quiz': `
You are an educational assessment creator. Create a comprehensive quiz based on the following request and context materials.

Request: {prompt}

Project: {projectName}
Subject: {subject}
Language: {language}
Difficulty Level: {difficulty}

Context Materials:
{context}

IMPORTANT: Create a complete quiz with EXACTLY this markdown format:

## Instructions
Write clear, concise instructions for taking this quiz. Include time estimates and any special requirements.

## Questions

### Question 1
Write a clear, specific question based on the context materials. Make sure it tests understanding of the subject matter.

A. First option
B. Second option  
C. Third option
D. Fourth option

### Question 2
Write another question that tests different aspects of the material.

A. First option
B. Second option
C. Third option
D. Fourth option

### Question 3
Continue with more questions - aim for 8-12 total questions.

A. First option
B. Second option
C. Third option
D. Fourth option

[Continue with more questions in the same format...]

## Answer Key
Question 1: [Correct answer letter] - [Brief explanation why this is correct]
Question 2: [Correct answer letter] - [Brief explanation why this is correct]
Question 3: [Correct answer letter] - [Brief explanation why this is correct]
[Continue for all questions...]

Requirements:
- Use ONLY the markdown format shown above
- Create 8-12 multiple choice questions
- Base questions on the provided context materials
- Include detailed answer explanations
- Questions should test comprehension, not just memorization
- Use proper markdown headers (##, ###)
`,
      'summary': `
You are a content summarizer. Create a clear and concise summary based on the following request and context materials.

Request: {prompt}

Project: {projectName}
Subject: {subject}
Language: {language}

Context Materials:
{context}

Create a summary in markdown format with:
1. A clear title
2. Main topics covered
3. Key points and concepts
4. Important conclusions or takeaways

Keep it concise but comprehensive.
`,
      'lesson-plan': `
You are an educational planner. Create a detailed lesson plan based on the following request and context materials.

Request: {prompt}

Project: {projectName}
Subject: {subject}
Language: {language}
Difficulty Level: {difficulty}

Context Materials:
{context}

Create a lesson plan in markdown format with:
1. Lesson title and objectives
2. Prerequisites/prior knowledge needed
3. Materials needed
4. Lesson structure with timing
5. Activities and assessments
6. Homework/follow-up activities

Structure the plan to be practical and actionable for teachers.
`,
      'custom': `
You are a versatile content creator. Create content based on the following request and context materials.

Request: {prompt}

Project: {projectName}
Subject: {subject}
Language: {language}

Context Materials:
{context}

Create well-structured content in markdown format that directly addresses the request. Use appropriate formatting and organization.
`
    };

    return templates[fileType as keyof typeof templates] || templates.custom;
  }

  private buildEditPrompt(editPrompt: string, baseContent: string): string {
    if (!baseContent) {
      // If no base content, treat as fresh generation
      return editPrompt;
    }
    return `
Edit the following content based on this request: ${editPrompt}

Original content:
${baseContent}

Provide the complete updated content in the same format.
`;
  }
  
  private getEditPromptTemplate(fileType: string): string {
    // Template for actual edits when base content exists
    return `
You are editing existing educational content. Based on the edit request and available context materials, modify the existing content.

Edit Request: {prompt}

Project: {projectName}
Subject: {subject}
Language: {language}
Difficulty Level: {difficulty}

Context Materials (for reference):
{context}

Existing Content to Edit:
{baseContent}

Provide the complete updated content in the same markdown format, incorporating the requested changes.
`;
  }

  private extractSearchTerms(prompt: string): string {
    console.log('🔤 [SEARCH] Extracting search terms from prompt:', prompt);
    
    // Simple extraction - in production, could use NLP for better term extraction
    const words = prompt.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['create', 'generate', 'make', 'about', 'with', 'guide', 'quiz', 'crie', 'sobre', 'perguntas', 'alternativas', 'tema'].includes(word));
    
    console.log('🔤 [SEARCH] All words after filtering:', words);
    const searchTerms = words.slice(0, 5).join(' ');
    console.log('🔤 [SEARCH] Final search terms:', searchTerms);
    
    return searchTerms;
  }

  private generateFileName(displayName: string): string {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  private getContentType(format: string): string {
    const types = {
      pdf: 'application/pdf',
      markdown: 'text/markdown',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return types[format as keyof typeof types] || 'application/octet-stream';
  }

  async getProjectFiles(projectId: string): Promise<GeneratedFile[]> {
    return await prisma.generatedFile.findMany({
      where: { projectId },
      include: {
        versions: {
          orderBy: { version: 'desc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async getFileById(fileId: string): Promise<GeneratedFile | null> {
    return await prisma.generatedFile.findUnique({
      where: { id: fileId },
      include: {
        versions: {
          orderBy: { version: 'desc' }
        }
      }
    });
  }

  async downloadFile(fileId: string, version?: number): Promise<{ buffer: Buffer; metadata: any }> {
    const file = await this.getFileById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    const targetVersion = version || file.currentVersion;
    const fileVersion = (file as any).versions?.find((v: any) => v.version === targetVersion);
    
    if (!fileVersion) {
      throw new Error('Version not found');
    }

    // Read file from storage
    const filePath = path.join(this.storageDir, fileId, `v${targetVersion}`, `file.${file.format}`);
    
    try {
      const buffer = await fs.readFile(filePath);
      
      // Add version suffix to filename if not the current version
      const versionSuffix = targetVersion !== file.currentVersion ? `_v${targetVersion}` : '';
      const filename = `${file.displayName}${versionSuffix}.${file.format}`;
      
      return {
        buffer,
        metadata: {
          filename,
          contentType: this.getContentType(file.format),
          size: buffer.length
        }
      };
    } catch (error) {
      console.error('Error reading file:', error);
      throw new Error('File not found in storage');
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    const file = await this.getFileById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    // Delete all versions from storage
    try {
      const fileDir = path.join(this.storageDir, fileId);
      await fs.rm(fileDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error deleting file storage:', error);
    }

    // Delete from database (versions will be cascade deleted)
    await prisma.generatedFile.delete({
      where: { id: fileId }
    });
  }
}