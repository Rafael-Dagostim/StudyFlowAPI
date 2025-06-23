import { QdrantClient } from "@qdrant/qdrant-js";

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

export interface SearchResult {
  id: string;
  score: number;
  chunk: DocumentChunk;
}

export class QdrantService {
  private client: QdrantClient;
  private host: string;
  private port: number;

  constructor() {
    this.host = process.env.QDRANT_HOST || "localhost";
    this.port = parseInt(process.env.QDRANT_PORT || "6333");

    this.client = new QdrantClient({
      url: `http://${this.host}:${this.port}`,
      apiKey: process.env.QDRANT_API_KEY || undefined,
    });
  }

  /**
   * Create a collection for a project
   */
  async createCollection(
    projectId: string,
    vectorSize: number = 1536
  ): Promise<string> {
    const collectionName = `project_${projectId}`;

    try {
      console.log(`Creating Qdrant collection: ${collectionName}`);

      await this.client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: "Cosine", // Cosine similarity for text embeddings
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });

      console.log(`Collection ${collectionName} created successfully`);
      return collectionName;
    } catch (error) {
      // Check if collection already exists
      if (error instanceof Error && error.message.includes("already exists")) {
        console.log(`Collection ${collectionName} already exists`);
        return collectionName;
      }

      console.error(`Error creating collection ${collectionName}:`, error);
      throw new Error(
        `Failed to create collection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Check if collection exists
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.some((col) => col.name === collectionName);
    } catch (error) {
      console.error(
        `Error checking collection existence: ${collectionName}`,
        error
      );
      return false;
    }
  }

  /**
   * Store document chunks with their embeddings
   */
  async storeDocumentChunks(
    collectionName: string,
    chunks: DocumentChunk[],
    embeddings: number[][]
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error("Number of chunks must match number of embeddings");
    }

    try {
      console.log(
        `Storing ${chunks.length} document chunks in collection ${collectionName}`
      );

      const points = chunks.map((chunk, index) => ({
        id: chunk.id,
        vector: embeddings[index],
        payload: {
          documentId: chunk.documentId,
          projectId: chunk.projectId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          metadata: chunk.metadata,
        },
      }));

      await this.client.upsert(collectionName, {
        wait: true,
        points,
      });

      console.log(`Successfully stored ${chunks.length} chunks in Qdrant`);
    } catch (error) {
      console.error(`Error storing document chunks:`, error);
      throw new Error(
        `Failed to store document chunks: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Search for similar chunks using vector similarity
   */
  async searchSimilarChunks(
    collectionName: string,
    queryEmbedding: number[],
    limit: number = 5,
    scoreThreshold: number = 0.7
  ): Promise<SearchResult[]> {
    try {
      console.log(
        `Searching for similar chunks in collection ${collectionName}`
      );

      const searchResult = await this.client.search(collectionName, {
        vector: queryEmbedding,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
      });

      const results: SearchResult[] = searchResult.map((point) => ({
        id: point.id as string,
        score: point.score,
        chunk: {
          id: point.id as string,
          documentId: point.payload?.documentId as string,
          projectId: point.payload?.projectId as string,
          content: point.payload?.content as string,
          chunkIndex: point.payload?.chunkIndex as number,
          metadata: point.payload?.metadata as DocumentChunk["metadata"],
        },
      }));

      console.log(`Found ${results.length} similar chunks`);
      return results;
    } catch (error) {
      console.error(`Error searching similar chunks:`, error);
      throw new Error(
        `Failed to search similar chunks: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Delete document chunks from collection
   */
  async deleteDocumentChunks(
    collectionName: string,
    documentId: string
  ): Promise<void> {
    try {
      console.log(
        `Deleting chunks for document ${documentId} from collection ${collectionName}`
      );

      await this.client.delete(collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: "documentId",
              match: { value: documentId },
            },
          ],
        },
      });

      console.log(`Successfully deleted chunks for document ${documentId}`);
    } catch (error) {
      console.error(`Error deleting document chunks:`, error);
      throw new Error(
        `Failed to delete document chunks: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Delete entire collection
   */
  async deleteCollection(collectionName: string): Promise<void> {
    try {
      console.log(`Deleting collection ${collectionName}`);

      await this.client.deleteCollection(collectionName);

      console.log(`Successfully deleted collection ${collectionName}`);
    } catch (error) {
      console.error(`Error deleting collection:`, error);
      throw new Error(
        `Failed to delete collection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(collectionName: string) {
    try {
      const info = await this.client.getCollection(collectionName);
      return info;
    } catch (error) {
      console.error(`Error getting collection info:`, error);
      throw new Error(
        `Failed to get collection info: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName: string) {
    try {
      const info = await this.getCollectionInfo(collectionName);

      return {
        name: collectionName,
        vectorsCount: info.vectors_count || 0,
        indexedVectorsCount: info.indexed_vectors_count || 0,
        pointsCount: info.points_count || 0,
        segmentsCount: info.segments_count || 0,
        status: info.status,
      };
    } catch (error) {
      console.error(`Error getting collection stats:`, error);
      throw new Error(
        `Failed to get collection stats: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Health check for Qdrant connection
   */
  async healthCheck(): Promise<{ isHealthy: boolean; error?: string }> {
    try {
      const collections = await this.client.getCollections();
      return {
        isHealthy: true,
      };
    } catch (error) {
      return {
        isHealthy: false,
        error: `Qdrant health check failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * List all collections
   */
  async listCollections() {
    try {
      const result = await this.client.getCollections();
      return result.collections.map((col) => ({
        name: col.name,
        status: "active", // Default status since it's not provided in the API response
      }));
    } catch (error) {
      console.error("Error listing collections:", error);
      throw new Error(
        `Failed to list collections: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Count points in collection
   */
  async countPoints(collectionName: string): Promise<number> {
    try {
      const result = await this.client.count(collectionName);
      return result.count;
    } catch (error) {
      console.error(
        `Error counting points in collection ${collectionName}:`,
        error
      );
      throw new Error(
        `Failed to count points: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Scroll through points in collection (for debugging/inspection)
   */
  async scrollPoints(collectionName: string, limit: number = 10) {
    try {
      const result = await this.client.scroll(collectionName, {
        limit,
        with_payload: true,
        with_vector: false, // Don't include vectors to save bandwidth
      });

      return result.points.map((point) => ({
        id: point.id,
        payload: point.payload,
      }));
    } catch (error) {
      console.error(
        `Error scrolling points in collection ${collectionName}:`,
        error
      );
      throw new Error(
        `Failed to scroll points: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

// Export singleton instance
export const qdrantService = new QdrantService();
