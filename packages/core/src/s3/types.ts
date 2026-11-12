/**
 * S3 Object Storage Types
 *
 * Types for S3-compatible object storage (AWS S3, Hetzner, MinIO, etc.)
 */

// ============================================
// S3 BUCKET & OBJECT TYPES
// ============================================

/**
 * S3 Bucket information
 */
export interface S3Bucket {
  /** Bucket name */
  name: string;
  /** Creation date (if available) */
  creationDate?: Date;
}

/**
 * S3 Object (file or folder prefix)
 */
export interface S3Object {
  /** Full object key (path) */
  key: string;
  /** Display name (extracted from key) */
  name: string;
  /** File size in bytes (0 for folders) */
  size: number;
  /** Last modified date */
  lastModified: Date;
  /** Is this a folder (common prefix)? */
  isFolder: boolean;
  /** Storage class (STANDARD, GLACIER, etc.) */
  storageClass?: string;
  /** ETag (content hash) */
  etag?: string;
}

/**
 * Result of listing objects in a bucket
 */
export interface S3ListObjectsResult {
  /** Objects in current "directory" */
  objects: S3Object[];
  /** Common prefixes (subfolders) */
  prefixes: string[];
  /** Is there more data to fetch? */
  isTruncated: boolean;
  /** Continuation token for pagination */
  nextContinuationToken?: string;
}

// ============================================
// S3 CORS CONFIGURATION
// ============================================

/**
 * Allowed HTTP methods for CORS
 */
export type S3CORSMethod = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD';

/**
 * S3 CORS Rule
 */
export interface S3CORSRule {
  /** Unique identifier for the rule */
  id?: string;
  /** Allowed origins (e.g., ["https://example.com", "*"]) */
  allowedOrigins: string[];
  /** Allowed HTTP methods */
  allowedMethods: S3CORSMethod[];
  /** Allowed request headers */
  allowedHeaders?: string[];
  /** Headers exposed to the client */
  exposeHeaders?: string[];
  /** Max age in seconds for preflight cache */
  maxAgeSeconds?: number;
}

// ============================================
// S3 CONNECTION CONFIG
// ============================================

/**
 * S3 Connection configuration (for creating client)
 */
export interface S3ConnectionConfig {
  /** S3 endpoint URL (e.g., "https://fsn1.your-objectstorage.com") */
  endpoint: string;
  /** Region (e.g., "fsn1", "us-east-1") */
  region: string;
  /** Access Key ID */
  accessKeyId: string;
  /** Secret Access Key */
  secretAccessKey: string;
  /** Optional: Default bucket */
  bucketName?: string;
}

// ============================================
// S3 OPERATION RESULTS
// ============================================

/**
 * Result of testing S3 connection
 */
export interface S3TestConnectionResult {
  success: boolean;
  error?: string;
  /** Number of buckets found (if successful) */
  bucketCount?: number;
}

/**
 * Result of listing buckets
 */
export interface S3ListBucketsResult {
  success: boolean;
  buckets?: S3Bucket[];
  error?: string;
}

/**
 * Result of deleting objects
 */
export interface S3DeleteObjectsResult {
  success: boolean;
  /** Keys that were successfully deleted */
  deleted?: string[];
  /** Errors for keys that failed */
  errors?: Array<{
    key: string;
    code: string;
    message: string;
  }>;
  error?: string;
}

/**
 * Result of getting presigned URL
 */
export interface S3PresignedUrlResult {
  success: boolean;
  url?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * Result of CORS operations
 */
export interface S3CORSResult {
  success: boolean;
  rules?: S3CORSRule[];
  error?: string;
}
