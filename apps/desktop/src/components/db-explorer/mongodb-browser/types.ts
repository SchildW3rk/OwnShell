export interface CollectionInfo {
  name: string;
  type: 'collection' | 'view';
  documentCount: number;
  avgDocumentSize: number;
  totalSize: number;
  indexes: number;
}

export interface MongoServerStats {
  collections: number;
  documents: number;
  dataSize: number;
}
