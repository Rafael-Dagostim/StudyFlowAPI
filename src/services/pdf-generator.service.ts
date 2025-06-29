const PdfPrinter = require('pdfmake');
import { TDocumentDefinitions, Content, StyleDictionary } from 'pdfmake/interfaces';
import { marked } from 'marked';
import path from 'path';
import fs from 'fs';

export interface PDFGenerationOptions {
  title: string;
  metadata?: {
    type?: string;
    generatedAt?: string;
    projectName?: string;
  };
}

export interface PDFGenerationResult {
  buffer: Buffer;
  pageCount: number;
}

export class PDFGeneratorService {
  private printer: any; // PdfPrinter instance

  constructor() {
    // Define fonts for pdfmake - use system fonts or downloaded fonts
    const fontDescriptors = {
      Roboto: {
        normal: path.join(__dirname, '../../node_modules/pdfmake/build/fonts/Roboto-Regular.ttf'),
        bold: path.join(__dirname, '../../node_modules/pdfmake/build/fonts/Roboto-Medium.ttf'),
        italics: path.join(__dirname, '../../node_modules/pdfmake/build/fonts/Roboto-Italic.ttf'),
        bolditalics: path.join(__dirname, '../../node_modules/pdfmake/build/fonts/Roboto-MediumItalic.ttf')
      }
    };

    // Check if fonts exist, otherwise use Helvetica (built-in)
    try {
      if (!fs.existsSync(fontDescriptors.Roboto.normal)) {
        // Use Helvetica as fallback (doesn't require external fonts)
        const fallbackFonts = {
          Helvetica: {
            normal: 'Helvetica',
            bold: 'Helvetica-Bold',
            italics: 'Helvetica-Oblique',
            bolditalics: 'Helvetica-BoldOblique'
          }
        };
        this.printer = new PdfPrinter(fallbackFonts);
      } else {
        this.printer = new PdfPrinter(fontDescriptors);
      }
    } catch (error) {
      // Fallback to Helvetica if any error occurs
      const fallbackFonts = {
        Helvetica: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
          italics: 'Helvetica-Oblique',
          bolditalics: 'Helvetica-BoldOblique'
        }
      };
      this.printer = new PdfPrinter(fallbackFonts);
    }
  }

  async generatePDF(
    content: string,
    fileType: string,
    options: PDFGenerationOptions
  ): Promise<PDFGenerationResult> {
    console.log('📝 [PDF-GEN] Starting PDF generation');
    console.log('📝 [PDF-GEN] Content length:', content.length);
    console.log('📝 [PDF-GEN] File type:', fileType);
    console.log('📝 [PDF-GEN] Options:', options);
    console.log('📝 [PDF-GEN] Content preview (first 300 chars):', content.substring(0, 300) + '...');
    
    try {
      // Parse content based on file type
      console.log('📝 [PDF-GEN] Creating document definition...');
      const docDefinition = this.createDocumentDefinition(content, fileType, options);
      console.log('📝 [PDF-GEN] Document definition created, content items:', Array.isArray(docDefinition.content) ? docDefinition.content.length : 1);
      
      // Create PDF document
      console.log('📝 [PDF-GEN] Creating PDF document...');
      const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
      
      // Convert to buffer
      const chunks: Buffer[] = [];
      
      return new Promise((resolve, reject) => {
        pdfDoc.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          console.log('📝 [PDF-GEN] PDF chunk received, size:', chunk.length);
        });
        pdfDoc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          // Estimate page count (rough calculation)
          const pageCount = Math.ceil(buffer.length / 3000); // Rough estimate
          console.log('✅ [PDF-GEN] PDF generation completed');
          console.log('📝 [PDF-GEN] Final buffer size:', buffer.length);
          console.log('📝 [PDF-GEN] Estimated page count:', pageCount);
          resolve({ buffer, pageCount });
        });
        pdfDoc.on('error', (error: any) => {
          console.error('❌ [PDF-GEN] PDF generation error:', error);
          reject(error);
        });
        pdfDoc.end();
      });
    } catch (error) {
      console.error('❌ [PDF-GEN] PDF generation error:', error);
      throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createDocumentDefinition(
    content: string,
    fileType: string,
    options: PDFGenerationOptions
  ): TDocumentDefinitions {
    const styles = this.getStyles();
    const parsedContent = this.parseMarkdownContent(content, fileType);
    
    const docDefinition: TDocumentDefinitions = {
      content: [
        // Header
        {
          text: options.title,
          style: 'header',
          alignment: 'center',
          margin: [0, 0, 0, 10]
        },
        {
          text: [
            options.metadata?.projectName ? `${options.metadata.projectName} • ` : '',
            this.formatFileType(fileType),
            ' • ',
            `Gerado em ${new Date(options.metadata?.generatedAt || Date.now()).toLocaleDateString('pt-BR')}`
          ],
          style: 'metadata',
          alignment: 'center',
          margin: [0, 0, 0, 30]
        },
        // Main content
        ...parsedContent
      ],
      styles: styles,
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      defaultStyle: {
        font: fs.existsSync(path.join(__dirname, '../../node_modules/pdfmake/build/fonts/Roboto-Regular.ttf')) ? 'Roboto' : 'Helvetica',
        fontSize: 11,
        lineHeight: 1.5
      }
    };

    return docDefinition;
  }

  private parseMarkdownContent(content: string, fileType: string): Content[] {
    const contentArray: Content[] = [];
    
    if (fileType === 'quiz') {
      return this.parseQuizContent(content);
    }

    // Parse markdown to structured content
    const lines = content.split('\n');
    let currentParagraph = '';

    for (const line of lines) {
      if (line.startsWith('# ')) {
        if (currentParagraph) {
          contentArray.push({ text: this.parseInlineMarkdown(currentParagraph), margin: [0, 0, 0, 10] });
          currentParagraph = '';
        }
        contentArray.push({
          text: line.substring(2),
          style: 'title',
          margin: [0, 20, 0, 10]
        });
      } else if (line.startsWith('## ')) {
        if (currentParagraph) {
          contentArray.push({ text: this.parseInlineMarkdown(currentParagraph), margin: [0, 0, 0, 10] });
          currentParagraph = '';
        }
        contentArray.push({
          text: line.substring(3),
          style: 'sectionHeader',
          margin: [0, 15, 0, 10]
        });
      } else if (line.startsWith('### ')) {
        if (currentParagraph) {
          contentArray.push({ text: this.parseInlineMarkdown(currentParagraph), margin: [0, 0, 0, 10] });
          currentParagraph = '';
        }
        contentArray.push({
          text: line.substring(4),
          style: 'subheader',
          margin: [0, 10, 0, 5]
        });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        if (currentParagraph) {
          contentArray.push({ text: this.parseInlineMarkdown(currentParagraph), margin: [0, 0, 0, 10] });
          currentParagraph = '';
        }
        const parsedContent = this.parseInlineMarkdown(line.substring(2));
        contentArray.push({
          text: Array.isArray(parsedContent) ? ['• ', ...parsedContent] : '• ' + parsedContent,
          margin: [20, 2, 0, 2]
        });
      } else if (line.match(/^\d+\. /)) {
        if (currentParagraph) {
          contentArray.push({ text: this.parseInlineMarkdown(currentParagraph), margin: [0, 0, 0, 10] });
          currentParagraph = '';
        }
        const parsedLine = this.parseInlineMarkdown(line);
        contentArray.push({
          text: parsedLine,
          margin: [20, 2, 0, 2]
        });
      } else if (line.trim() === '') {
        if (currentParagraph) {
          contentArray.push({ text: this.parseInlineMarkdown(currentParagraph), margin: [0, 0, 0, 10] });
          currentParagraph = '';
        }
      } else {
        currentParagraph += (currentParagraph ? ' ' : '') + line;
      }
    }

    // Add any remaining paragraph
    if (currentParagraph) {
      contentArray.push({ text: this.parseInlineMarkdown(currentParagraph), margin: [0, 0, 0, 10] });
    }

    return contentArray;
  }

  private parseQuizContent(content: string): Content[] {
    console.log('📝 [PDF-QUIZ] Starting quiz content parsing');
    console.log('📝 [PDF-QUIZ] Content length:', content.length);
    console.log('📝 [PDF-QUIZ] Content preview (first 500 chars):', content.substring(0, 500) + '...');
    
    const contentArray: Content[] = [];
    
    // Extract instructions
    const instructionMatch = content.match(/^## Instructions\n([\s\S]*?)(?=## Questions|$)/m);
    console.log('📝 [PDF-QUIZ] Instructions found:', !!instructionMatch);
    if (instructionMatch) {
      contentArray.push({
        text: 'Instruções',
        style: 'sectionHeader',
        margin: [0, 0, 0, 10]
      });
      contentArray.push({
        text: instructionMatch[1].trim(),
        style: 'instructions',
        margin: [0, 0, 0, 20]
      });
    }

    // Extract questions
    contentArray.push({
      text: 'Questões',
      style: 'sectionHeader',
      margin: [0, 20, 0, 15]
    });

    const questionRegex = /### Question (\d+)\n([\s\S]*?)(?=### Question \d+|## Answer Key|$)/g;
    let match;
    let questionCount = 0;

    console.log('📝 [PDF-QUIZ] Searching for questions...');
    while ((match = questionRegex.exec(content)) !== null) {
      questionCount++;
      const questionNumber = match[1];
      const questionContent = match[2].trim();
      
      console.log(`📝 [PDF-QUIZ] Found question ${questionNumber}, content length: ${questionContent.length}`);
      
      // Check if it's multiple choice
      const optionsMatch = questionContent.match(/^(.*?)\n\n?(A\..+\nB\..+)/s);
      console.log(`📝 [PDF-QUIZ] Question ${questionNumber} has multiple choice options:`, !!optionsMatch);
      
      contentArray.push({
        canvas: [{
          type: 'rect',
          x: -10,
          y: -5,
          w: 515,
          h: 1,
          lineColor: '#e0e0e0'
        }],
        margin: [0, 10, 0, 10]
      });

      contentArray.push({
        text: `Questão ${questionNumber}`,
        style: 'questionNumber',
        margin: [0, 0, 0, 5]
      });

      if (optionsMatch) {
        contentArray.push({
          text: optionsMatch[1].trim(),
          margin: [0, 0, 0, 10]
        });
        
        const options = optionsMatch[2].split('\n');
        options.forEach(option => {
          contentArray.push({
            text: option,
            margin: [20, 2, 0, 2]
          });
        });
      } else {
        contentArray.push({
          text: questionContent,
          margin: [0, 0, 0, 10]
        });
      }
    }
    
    console.log('📝 [PDF-QUIZ] Total questions found:', questionCount);

    // Extract answer key
    const answerKeyMatch = content.match(/## Answer Key\n([\s\S]*?)$/m);
    console.log('📝 [PDF-QUIZ] Answer key found:', !!answerKeyMatch);
    if (answerKeyMatch) {
      contentArray.push({
        pageBreak: 'before',
        text: 'Gabarito',
        style: 'sectionHeader',
        background: '#fff3cd',
        margin: [0, 0, 0, 15]
      });

      const answerLines = answerKeyMatch[1].trim().split('\n');
      console.log('📝 [PDF-QUIZ] Answer lines count:', answerLines.length);
      answerLines.forEach(line => {
        if (line.trim()) {
          contentArray.push({
            text: line,
            margin: [0, 5, 0, 5],
            background: '#fffdf0'
          });
        }
      });
    }
    
    console.log('📝 [PDF-QUIZ] Final content array length:', contentArray.length);
    return contentArray;
  }

  private parseInlineMarkdown(text: string): any {
    // Simple inline markdown parsing
    const parts: any[] = [];
    let remainingText = text;
    
    // Bold text
    const boldRegex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;
    
    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push({ text: match[1], bold: true });
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    
    return parts.length > 0 ? parts : text;
  }

  private getStyles(): StyleDictionary {
    return {
      header: {
        fontSize: 24,
        bold: true,
        color: '#5a67d8'
      },
      metadata: {
        fontSize: 10,
        color: '#666666'
      },
      title: {
        fontSize: 20,
        bold: true,
        color: '#5a67d8'
      },
      sectionHeader: {
        fontSize: 16,
        bold: true,
        color: '#5a67d8'
      },
      subheader: {
        fontSize: 14,
        bold: true,
        color: '#7c3aed'
      },
      instructions: {
        fontSize: 11,
        italics: true,
        fillColor: '#f8f9fa',
        margin: [10, 10, 10, 10]
      },
      questionNumber: {
        fontSize: 12,
        bold: true,
        color: '#5a67d8'
      }
    };
  }

  private formatFileType(type: string): string {
    const typeMap: { [key: string]: string } = {
      'study-guide': 'Guia de Estudos',
      'quiz': 'Questionário',
      'summary': 'Resumo',
      'lesson-plan': 'Plano de Aula',
      'custom': 'Documento'
    };
    return typeMap[type] || 'Documento';
  }
}