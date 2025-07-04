import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export class OpenAIService {
  private openai: OpenAI;
  private embeddingModel: string;
  private chatModel: string;
  private maxTokens: number;
  // private temperature: number; // Removed for o3-mini compatibility

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.embeddingModel =
      process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    this.chatModel = process.env.OPENAI_CHAT_MODEL || "o3-mini";
    this.maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || "4000");
  }

  /**
   * Generate embeddings for text chunks with retry logic
   */
  async generateEmbeddings(
    texts: string[],
    retries: number = 3
  ): Promise<number[][]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(
          `Generating embeddings for ${texts.length} text chunks... (attempt ${attempt}/${retries})`
        );

        const response = await this.openai.embeddings.create({
          model: this.embeddingModel,
          input: texts,
          encoding_format: "float",
        });

        const embeddings = response.data.map((item) => item.embedding);
        console.log(`Generated ${embeddings.length} embeddings successfully`);

        return embeddings;
      } catch (error) {
        console.error(
          `Error generating embeddings (attempt ${attempt}/${retries}):`,
          error
        );

        if (attempt === retries) {
          throw new Error(
            `Failed to generate embeddings after ${retries} attempts: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }

        // Wait before retrying (exponential backoff)
        const waitTime = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
    throw new Error("Unexpected error in generateEmbeddings");
  }

  /**
   * Generate a single embedding for a query with retry logic
   */
  async generateQueryEmbedding(
    query: string,
    retries: number = 3
  ): Promise<number[]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.embeddingModel,
          input: [query],
          encoding_format: "float",
        });

        return response.data[0].embedding;
      } catch (error) {
        console.error(
          `Error generating query embedding (attempt ${attempt}/${retries}):`,
          error
        );

        if (attempt === retries) {
          throw new Error(
            `Failed to generate query embedding after ${retries} attempts: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }

        // Wait before retrying (exponential backoff)
        const waitTime = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
    throw new Error("Unexpected error in generateQueryEmbedding");
  }

  /**
   * Generate chat completion with context and retry logic
   */
  async generateChatCompletion(
    messages: ChatCompletionMessageParam[],
    contextDocuments?: string[],
    retries: number = 3
  ): Promise<{
    content: string;
    tokensUsed: {
      prompt: number;
      completion: number;
      total: number;
    };
  }> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Add context to system message if provided
        const systemMessage = this.buildSystemMessage(contextDocuments);

        const messagesWithContext: ChatCompletionMessageParam[] = [
          systemMessage,
          ...messages,
        ];

        console.log(
          `Generating chat completion with ${messages.length} messages... (attempt ${attempt}/${retries})`
        );

        const response = await this.openai.chat.completions.create({
          model: this.chatModel,
          messages: messagesWithContext,
          max_completion_tokens: this.maxTokens,
          // Note: o3-mini doesn't support temperature parameter
          // temperature: this.temperature,
          stream: false,
        });

        const content = response.choices[0]?.message?.content || "";
        const usage = response.usage;

        console.log(
          `Chat completion generated successfully. Tokens used: ${
            usage?.total_tokens || 0
          }`
        );

        return {
          content,
          tokensUsed: {
            prompt: usage?.prompt_tokens || 0,
            completion: usage?.completion_tokens || 0,
            total: usage?.total_tokens || 0,
          },
        };
      } catch (error) {
        console.error(
          `Error generating chat completion (attempt ${attempt}/${retries}):`,
          error
        );

        if (attempt === retries) {
          throw new Error(
            `Failed to generate chat completion after ${retries} attempts: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }

        // Wait before retrying (exponential backoff)
        const waitTime = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
    throw new Error("Unexpected error in generateChatCompletion");
  }

  /**
   * Generate streaming chat completion with enhanced error handling
   */
  async generateStreamingChatCompletion(
    messages: ChatCompletionMessageParam[],
    contextDocuments?: string[],
    retries: number = 2
  ) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const systemMessage = this.buildSystemMessage(contextDocuments);

        const messagesWithContext: ChatCompletionMessageParam[] = [
          systemMessage,
          ...messages,
        ];

        console.log(
          `Generating streaming chat completion with ${messages.length} messages... (attempt ${attempt}/${retries})`
        );

        const stream = await this.openai.chat.completions.create({
          model: this.chatModel,
          messages: messagesWithContext,
          max_completion_tokens: this.maxTokens,
          // Note: o3-mini doesn't support temperature parameter
          // temperature: this.temperature,
          stream: true,
        });

        return stream;
      } catch (error) {
        console.error(
          `Error generating streaming chat completion (attempt ${attempt}/${retries}):`,
          error
        );

        if (attempt === retries) {
          throw new Error(
            `Failed to generate streaming chat completion after ${retries} attempts: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }

        // Wait before retrying (exponential backoff)
        const waitTime = Math.pow(2, attempt - 1) * 1000; // 1s, 2s
        console.log(`Retrying streaming request in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
    throw new Error("Unexpected error in generateStreamingChatCompletion");
  }

  /**
   * Build system message with context
   */
  private buildSystemMessage(
    contextDocuments?: string[]
  ): ChatCompletionMessageParam {
    let systemContent = `You are an intelligent educational assistant that helps students and educators with their study materials. You provide accurate, helpful, and well-structured responses based on the provided context.

Key instructions:
1. Use the provided context documents to answer questions accurately
2. If information is not available in the context, clearly state this
3. Provide educational explanations that help understanding
4. Format responses clearly with proper structure
5. Be concise but comprehensive in your explanations
6. Cite specific parts of the documents when relevant`;

    if (contextDocuments && contextDocuments.length > 0) {
      systemContent += `\n\nContext Documents:\n${contextDocuments
        .map((doc, index) => `\n--- Document ${index + 1} ---\n${doc}`)
        .join("")}`;
    }

    return {
      role: "system",
      content: systemContent,
    };
  }

  /**
   * Validate API key and model availability
   */
  async validateConfiguration(): Promise<{ isValid: boolean; error?: string }> {
    try {
      // Test with a simple embedding request
      await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: ["test"],
        encoding_format: "float",
      });

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `OpenAI configuration validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      embeddingModel: this.embeddingModel,
      chatModel: this.chatModel,
      maxTokens: this.maxTokens,
      // temperature: this.temperature, // Removed for o3-mini compatibility
    };
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Split text to fit within token limits
   */
  splitTextForTokens(text: string, maxTokens: number = 8000): string[] {
    const estimatedTokens = this.estimateTokens(text);

    if (estimatedTokens <= maxTokens) {
      return [text];
    }

    const chunks: string[] = [];
    const approxChunkSize = Math.floor(
      (text.length * maxTokens) / estimatedTokens
    );

    for (let i = 0; i < text.length; i += approxChunkSize) {
      chunks.push(text.slice(i, i + approxChunkSize));
    }

    return chunks;
  }
}

// Export singleton instance
export const openaiService = new OpenAIService();
