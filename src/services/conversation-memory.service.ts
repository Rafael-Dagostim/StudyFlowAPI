import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { openaiService } from "./openai.service";
import { prisma } from "../utils/database";

export interface ConversationMemory {
  recentMessages: Array<{ role: "USER" | "ASSISTANT"; content: string; createdAt: Date }>;
  summary?: string;
  entities: Map<string, EntityInfo>;
  tokenCount: number;
  memoryType: 'buffer' | 'summary' | 'hybrid';
}

export interface EntityInfo {
  name: string;
  type: 'person' | 'concept' | 'topic' | 'document';
  mentions: number;
  lastMentioned: Date;
  context: string;
}

export interface MemoryConfig {
  maxTokens: number;
  maxMessages: number;
  summaryThreshold: number;
  entityThreshold: number;
}

export class ConversationMemoryService {
  private config: MemoryConfig;

  constructor() {
    this.config = {
      maxTokens: parseInt(process.env.MEMORY_MAX_TOKENS || "1500"),
      maxMessages: parseInt(process.env.MEMORY_MAX_MESSAGES || "20"),
      summaryThreshold: parseInt(process.env.MEMORY_SUMMARY_THRESHOLD || "10"),
      entityThreshold: parseInt(process.env.MEMORY_ENTITY_THRESHOLD || "2"),
    };
  }

  /**
   * Get optimized conversation memory for AI context
   */
  async getConversationMemory(conversationId: string): Promise<ConversationMemory> {
    try {
      // Get all messages for this conversation
      const allMessages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        include: {
          conversation: {
            include: {
              project: {
                select: { name: true, subject: true }
              }
            }
          }
        }
      });

      if (allMessages.length === 0) {
        return {
          recentMessages: [],
          entities: new Map(),
          tokenCount: 0,
          memoryType: 'buffer'
        };
      }

      // Estimate token count for messages
      const messagesWithTokens = allMessages.map(msg => ({
        ...msg,
        estimatedTokens: this.estimateTokens(msg.content)
      }));

      const totalTokens = messagesWithTokens.reduce((sum, msg) => sum + msg.estimatedTokens, 0);

      // Decide memory strategy based on conversation length
      if (allMessages.length <= this.config.summaryThreshold && totalTokens <= this.config.maxTokens) {
        // Use buffer memory for short conversations
        return await this.createBufferMemory(messagesWithTokens);
      } else {
        // Use hybrid memory for longer conversations
        return await this.createHybridMemory(messagesWithTokens, conversationId);
      }

    } catch (error) {
      console.error("Error getting conversation memory:", error);
      return {
        recentMessages: [],
        entities: new Map(),
        tokenCount: 0,
        memoryType: 'buffer'
      };
    }
  }

  /**
   * Create buffer memory (recent messages only)
   */
  private async createBufferMemory(messages: any[]): Promise<ConversationMemory> {
    let tokenCount = 0;
    const recentMessages = [];
    
    // Take messages from most recent, staying under token limit
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (tokenCount + msg.estimatedTokens > this.config.maxTokens) {
        break;
      }
      
      recentMessages.unshift({
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt
      });
      tokenCount += msg.estimatedTokens;
    }

    const entities = await this.extractEntities(recentMessages);

    return {
      recentMessages,
      entities,
      tokenCount,
      memoryType: 'buffer'
    };
  }

  /**
   * Create hybrid memory (summary + recent messages + entities)
   */
  private async createHybridMemory(messages: any[], conversationId: string): Promise<ConversationMemory> {
    try {
      // Split messages into older (for summary) and recent (for buffer)
      const splitPoint = Math.max(0, messages.length - this.config.maxMessages);
      const olderMessages = messages.slice(0, splitPoint);
      const recentMessages = messages.slice(splitPoint);

      // Generate summary of older messages if they exist
      let summary: string | undefined;
      let summaryTokens = 0;

      if (olderMessages.length > 0) {
        summary = await this.generateConversationSummary(olderMessages, conversationId);
        summaryTokens = this.estimateTokens(summary);
      }

      // Add recent messages while staying under token limit
      const recentMemory = [];
      let tokenCount = summaryTokens;

      for (let i = recentMessages.length - 1; i >= 0; i--) {
        const msg = recentMessages[i];
        if (tokenCount + msg.estimatedTokens > this.config.maxTokens) {
          break;
        }
        
        recentMemory.unshift({
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt
        });
        tokenCount += msg.estimatedTokens;
      }

      // Extract entities from all messages
      const allMessageContent = messages.map(m => ({ 
        role: m.role, 
        content: m.content, 
        createdAt: m.createdAt 
      }));
      const entities = await this.extractEntities(allMessageContent);

      return {
        recentMessages: recentMemory,
        summary,
        entities,
        tokenCount,
        memoryType: 'hybrid'
      };

    } catch (error) {
      console.error("Error creating hybrid memory:", error);
      // Fallback to buffer memory
      return await this.createBufferMemory(messages);
    }
  }

  /**
   * Generate conversation summary using AI
   */
  private async generateConversationSummary(messages: any[], conversationId: string): Promise<string> {
    try {
      // Check if we have a cached summary
      const existingSummary = await this.getCachedSummary(conversationId, messages.length);
      if (existingSummary) {
        return existingSummary;
      }

      // Create summary prompt
      const conversationText = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const summaryPrompt = `Please provide a concise summary of the following conversation, focusing on key topics discussed, questions asked, and important information shared. Keep the summary under 200 words:

${conversationText}

Summary:`;

      const summaryResponse = await openaiService.generateChatCompletion(
        [{ role: "user", content: summaryPrompt }]
      );

      const summary = summaryResponse.content;

      // Cache the summary
      await this.cacheSummary(conversationId, messages.length, summary);

      return summary;

    } catch (error) {
      console.error("Error generating conversation summary:", error);
      return "Previous conversation covered various topics related to the course materials.";
    }
  }

  /**
   * Extract entities (topics, concepts, people) from conversation
   */
  private async extractEntities(messages: Array<{ role: string; content: string; createdAt: Date }>): Promise<Map<string, EntityInfo>> {
    const entities = new Map<string, EntityInfo>();

    try {
      // Simple entity extraction based on patterns and frequency
      const allText = messages.map(m => m.content).join(' ');
      
      // Extract potential entities (simple approach)
      const words = allText.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3);

      const wordFreq = new Map<string, number>();
      words.forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      });

      // Identify frequently mentioned terms as entities
      for (const [word, count] of wordFreq.entries()) {
        if (count >= this.config.entityThreshold && this.isLikelyEntity(word)) {
          entities.set(word, {
            name: word,
            type: this.classifyEntity(word),
            mentions: count,
            lastMentioned: new Date(), // Most recent message date
            context: this.extractEntityContext(word, allText)
          });
        }
      }

      return entities;

    } catch (error) {
      console.error("Error extracting entities:", error);
      return entities;
    }
  }

  /**
   * Check if a word is likely to be an entity
   */
  private isLikelyEntity(word: string): boolean {
    // Filter out common words, pronouns, etc.
    const commonWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'que', 'para', 'como', 'uma', 'dos', 'das', 'por', 'com', 'sobre', 'este', 'esta'
    ]);
    
    return !commonWords.has(word) && 
           word.length > 3 && 
           !/^\d+$/.test(word); // Not just numbers
  }

  /**
   * Classify entity type based on context
   */
  private classifyEntity(word: string): EntityInfo['type'] {
    // Simple classification logic
    if (word.includes('doc') || word.includes('pdf') || word.includes('arquivo')) {
      return 'document';
    }
    if (word.endsWith('ção') || word.endsWith('mento') || word.includes('conceito')) {
      return 'concept';
    }
    return 'topic';
  }

  /**
   * Extract context around entity mentions
   */
  private extractEntityContext(entity: string, text: string): string {
    const regex = new RegExp(`\\b${entity}\\b`, 'gi');
    const matches = [...text.matchAll(regex)];
    
    if (matches.length === 0) return '';
    
    // Get context around first mention
    const firstMatch = matches[0];
    const start = Math.max(0, firstMatch.index! - 50);
    const end = Math.min(text.length, firstMatch.index! + entity.length + 50);
    
    return text.slice(start, end).trim();
  }

  /**
   * Get cached summary if available (disabled - requires schema update)
   */
  private async getCachedSummary(conversationId: string, messageCount: number): Promise<string | null> {
    // TODO: Add ConversationSummary table to Prisma schema
    // For now, we'll regenerate summaries each time
    return null;
  }

  /**
   * Cache conversation summary (disabled - requires schema update)
   */
  private async cacheSummary(conversationId: string, messageCount: number, summary: string): Promise<void> {
    // TODO: Add ConversationSummary table to Prisma schema
    // For now, we'll skip caching and regenerate summaries as needed
    console.log(`Summary generated for conversation ${conversationId} (${messageCount} messages)`);
  }

  /**
   * Format memory for AI context
   */
  formatMemoryForAI(memory: ConversationMemory): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];

    // Add summary if available
    if (memory.summary) {
      messages.push({
        role: "system",
        content: `Previous conversation summary: ${memory.summary}`
      });
    }

    // Add entity context if significant entities exist
    if (memory.entities.size > 0) {
      const entityContext = Array.from(memory.entities.entries())
        .filter(([_, entity]) => entity.mentions >= this.config.entityThreshold)
        .map(([name, entity]) => `${name} (${entity.type}, mentioned ${entity.mentions} times)`)
        .slice(0, 5) // Limit to top 5 entities
        .join(', ');

      if (entityContext) {
        messages.push({
          role: "system",
          content: `Key topics in this conversation: ${entityContext}`
        });
      }
    }

    // Add recent messages
    memory.recentMessages.forEach(msg => {
      messages.push({
        role: msg.role === "USER" ? "user" : "assistant",
        content: msg.content
      });
    });

    return messages;
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English/Portuguese
    return Math.ceil(text.length / 4);
  }

  /**
   * Get memory configuration
   */
  getConfiguration(): MemoryConfig {
    return { ...this.config };
  }

  /**
   * Update memory configuration
   */
  updateConfiguration(newConfig: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export singleton instance
export const conversationMemoryService = new ConversationMemoryService();
