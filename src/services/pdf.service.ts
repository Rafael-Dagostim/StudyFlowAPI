import { PDFGeneratorService, PDFGenerationOptions } from './pdf-generator.service';

export interface PDFGenerationResult {
  buffer: Buffer;
  pageCount: number;
}

export class PDFService {
  private pdfGenerator: PDFGeneratorService;

  constructor() {
    this.pdfGenerator = new PDFGeneratorService();
  }



  async generatePDF(
    content: string,
    fileType: string,
    metadata?: any
  ): Promise<PDFGenerationResult> {
    console.log('📄 [PDF-SERVICE] PDF generation requested');
    console.log('📄 [PDF-SERVICE] Content length:', content.length);
    console.log('📄 [PDF-SERVICE] File type:', fileType);
    console.log('📄 [PDF-SERVICE] Metadata:', metadata);
    
    const options: PDFGenerationOptions = {
      title: metadata?.title || 'Generated Document',
      metadata: {
        type: this.formatFileType(fileType),
        generatedAt: new Date().toISOString(),
        projectName: metadata?.projectName
      }
    };
    
    console.log('📄 [PDF-SERVICE] Options prepared:', options);
    console.log('📄 [PDF-SERVICE] Calling PDF generator...');

    const result = await this.pdfGenerator.generatePDF(content, fileType, options);
    
    console.log('✅ [PDF-SERVICE] PDF generation completed');
    console.log('📄 [PDF-SERVICE] Result buffer size:', result.buffer.length);
    console.log('📄 [PDF-SERVICE] Result page count:', result.pageCount);
    
    return result;
  }

  async generateHTML(
    content: string,
    fileType: string,
    metadata?: any
  ): Promise<string> {
    // For now, return a simple HTML representation
    // In the future, this could be enhanced to generate proper HTML
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${metadata?.title || 'Generated Document'}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #5a67d8; }
          h2 { color: #5a67d8; border-bottom: 2px solid #5a67d8; padding-bottom: 10px; }
          h3 { color: #7c3aed; }
        </style>
      </head>
      <body>
        <h1>${metadata?.title || 'Generated Document'}</h1>
        <p>${this.formatFileType(fileType)} • Generated on ${new Date().toLocaleDateString()}</p>
        <hr>
        <div>${content.replace(/\n/g, '<br>')}</div>
      </body>
      </html>
    `;
  }



  private formatFileType(type: string): string {
    const typeMap: { [key: string]: string } = {
      'study-guide': 'Study Guide',
      'quiz': 'Quiz',
      'summary': 'Summary',
      'lesson-plan': 'Lesson Plan',
      'custom': 'Document'
    };
    return typeMap[type] || 'Document';
  }

}