/**
 * S3 Connection table
 * Stores S3-compatible object storage connections (AWS S3, Hetzner, MinIO, etc.)
 */
export interface S3ConnectionsTable {
  id: string; // UUID v4
  label: string; // Display name (e.g., "Hetzner Backup")
  endpoint: string; // S3 endpoint URL (e.g., "https://fsn1.your-objectstorage.com")
  region: string; // Region (e.g., "fsn1", "us-east-1")
  access_key_id_encrypted: string; // AES-256-GCM encrypted
  secret_access_key_encrypted: string; // AES-256-GCM encrypted
  bucket_name: string | null; // Optional default bucket (null = list all buckets mode)
  favorite: number; // SQLite boolean (0/1) for sidebar favorites
  folder_id: string | null; // Optional sidebar folder
  sort_order: number; // Manual ordering hook for sidebar organization
  created_at: number; // Unix timestamp in milliseconds
  updated_at: number; // Unix timestamp in milliseconds
}

export interface NewS3Connection {
  id: string;
  label: string;
  endpoint: string;
  region: string;
  access_key_id_encrypted: string;
  secret_access_key_encrypted: string;
  bucket_name: string | null;
  favorite?: number;
  folder_id?: string | null;
  sort_order?: number;
  created_at: number;
  updated_at: number;
}

export interface S3ConnectionUpdate {
  label?: string;
  endpoint?: string;
  region?: string;
  access_key_id_encrypted?: string;
  secret_access_key_encrypted?: string;
  bucket_name?: string | null;
  favorite?: number;
  folder_id?: string | null;
  sort_order?: number;
  updated_at: number;
}
