import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  HeadObjectCommand, 
  ListObjectsV2Command,
  CopyObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Validate required environment variables
if (
  !process.env.AWS_ACCESS_KEY_ID ||
  !process.env.AWS_SECRET_ACCESS_KEY ||
  !process.env.AWS_S3_BUCKET
) {
  throw new Error(
    'AWS credentials and S3 bucket must be configured in environment variables'
  );
}

// Initialize S3 client with v3 SDK
const client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export class S3Service {
  private static bucket = process.env.AWS_S3_BUCKET;

  /**
   * Upload a file to S3 using AWS SDK v3
   */
  static async uploadFile(
    file: Express.Multer.File,
    projectId: string
  ): Promise<string> {
    if (!this.bucket) {
      throw new Error('AWS S3 bucket not configured');
    }

    // Generate unique key
    const fileExtension = path.extname(file.originalname);
    const fileName = path.basename(file.originalname, fileExtension);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const key = `projects/${projectId}/documents/${uuidv4()}_${sanitizedFileName}${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentDisposition: `attachment; filename="${file.originalname}"`,
      Metadata: {
        originalName: file.originalname,
        projectId: projectId,
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      const result = await client.send(command);
      console.log(`File uploaded successfully: ${result.ETag}`);
      return key;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error(
        `Failed to upload file to S3: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Generate a presigned URL for downloading a file using AWS SDK v3
   */
  static async getDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    if (!this.bucket) {
      throw new Error('AWS S3 bucket not configured');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const url = await getSignedUrl(client, command, { expiresIn });
      return url;
    } catch (error) {
      console.error('S3 presigned URL error:', error);
      throw new Error(
        `Failed to generate download URL: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Get file content from S3 using AWS SDK v3
   */
  static async getFileContent(key: string): Promise<Buffer> {
    if (!this.bucket) {
      throw new Error('AWS S3 bucket not configured');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const result = await client.send(command);
      
      if (!result.Body) {
        throw new Error('No file content received from S3');
      }

      // Convert ReadableStream to Buffer
      const chunks: Uint8Array[] = [];
      const reader = result.Body.transformToWebStream().getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error('S3 get object error:', error);
      throw new Error(
        `Failed to get file from S3: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Delete a file from S3 using AWS SDK v3
   */
  static async deleteFile(key: string): Promise<void> {
    if (!this.bucket) {
      throw new Error('AWS S3 bucket not configured');
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await client.send(command);
      console.log(`File deleted successfully: ${key}`);
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error(
        `Failed to delete file from S3: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Check if file exists in S3 using AWS SDK v3
   */
  static async fileExists(key: string): Promise<boolean> {
    if (!this.bucket) {
      throw new Error('AWS S3 bucket not configured');
    }

    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * List files in a project directory using AWS SDK v3
   */
  static async listProjectFiles(projectId: string): Promise<Array<{
    Key?: string;
    LastModified?: Date;
    Size?: number;
    ETag?: string;
  }>> {
    if (!this.bucket) {
      throw new Error('AWS S3 bucket not configured');
    }

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: `projects/${projectId}/documents/`,
    });

    try {
      const result = await client.send(command);
      return result.Contents || [];
    } catch (error) {
      console.error('S3 list objects error:', error);
      throw new Error(
        `Failed to list project files: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Get file metadata from S3 using AWS SDK v3
   */
  static async getFileMetadata(key: string): Promise<{
    ContentLength?: number;
    LastModified?: Date;
    ContentType?: string;
    ETag?: string;
    Metadata?: Record<string, string>;
  }> {
    if (!this.bucket) {
      throw new Error('AWS S3 bucket not configured');
    }

    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const result = await client.send(command);
      return {
        ContentLength: result.ContentLength,
        LastModified: result.LastModified,
        ContentType: result.ContentType,
        ETag: result.ETag,
        Metadata: result.Metadata,
      };
    } catch (error) {
      console.error('S3 head object error:', error);
      throw new Error(
        `Failed to get file metadata: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Get S3 client instance for advanced operations
   */
  static getClient(): S3Client {
    return client;
  }

  /**
   * Get bucket name
   */
  static getBucketName(): string | undefined {
    return this.bucket;
  }

  /**
   * Copy file within S3 bucket using AWS SDK v3
   */
  static async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    if (!this.bucket) {
      throw new Error('AWS S3 bucket not configured');
    }

    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      Key: destinationKey,
      CopySource: `${this.bucket}/${sourceKey}`,
    });

    try {
      await client.send(command);
      console.log(`File copied successfully: ${sourceKey} -> ${destinationKey}`);
    } catch (error) {
      console.error('S3 copy error:', error);
      throw new Error(
        `Failed to copy file in S3: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Get storage statistics for a project
   */
  static async getProjectStorageStats(projectId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    averageFileSize: number;
  }> {
    try {
      const files = await this.listProjectFiles(projectId);
      
      const totalFiles = files.length;
      const totalSize = files.reduce((sum, file) => sum + (file.Size || 0), 0);
      const averageFileSize = totalFiles > 0 ? totalSize / totalFiles : 0;

      return {
        totalFiles,
        totalSize,
        averageFileSize,
      };
    } catch (error) {
      console.error('Error getting project storage stats:', error);
      throw new Error(
        `Failed to get storage statistics: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Validate S3 connection and permissions
   */
  static async validateConnection(): Promise<{ isValid: boolean; error?: string }> {
    try {
      if (!this.bucket) {
        return {
          isValid: false,
          error: 'S3 bucket not configured'
        };
      }

      // Try to list objects to validate connection and permissions
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      });

      await client.send(command);
      
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `S3 connection validation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      };
    }
  }
}
