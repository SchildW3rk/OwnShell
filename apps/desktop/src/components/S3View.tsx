/**
 * S3 View (TanStack Query)
 *
 * Main S3 browser interface composed of sub-components:
 * - S3ConnectionPicker: Connection selection
 * - S3BucketList: Bucket listing
 * - S3ObjectBrowser: Object browsing with context menu and preview
 */

import React, { useState, useEffect } from 'react';
import {
  useS3Connections,
  useS3Buckets,
  useS3Objects,
  useDeleteS3Objects,
  useGetPresignedUrl,
} from '../hooks/s3';
import { S3ConnectionPicker } from './s3/S3ConnectionPicker';
import { S3BucketList } from './s3/S3BucketList';
import { S3ObjectBrowser } from './s3/S3ObjectBrowser';

interface S3ViewProps {
  /** Initial S3 connection ID to load (v1.20.0 workspace integration) */
  initialConnectionId?: string;
}

export const S3View: React.FC<S3ViewProps> = ({ initialConnectionId }) => {
  // Local navigation state
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    initialConnectionId || null
  );
  const [currentBucket, setCurrentBucket] = useState<string | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState<string>('');

  // TanStack Query hooks
  const connectionsQuery = useS3Connections();
  const bucketsQuery = useS3Buckets(activeConnectionId);
  const objectsQuery = useS3Objects(activeConnectionId, currentBucket, currentPrefix);
  const deleteMutation = useDeleteS3Objects(activeConnectionId, currentBucket);
  const presignedUrlMutation = useGetPresignedUrl(activeConnectionId, currentBucket);

  // Auto-select connection with default bucket
  useEffect(() => {
    if (activeConnectionId && connectionsQuery.data) {
      const connection = connectionsQuery.data.find((c) => c.id === activeConnectionId);
      if (connection?.bucket_name && !currentBucket) {
        setCurrentBucket(connection.bucket_name);
      }
    }
  }, [activeConnectionId, connectionsQuery.data, currentBucket]);

  const activeConnection = connectionsQuery.data?.find((c) => c.id === activeConnectionId);

  // Show connection selection if no connection is active
  if (!activeConnectionId) {
    return (
      <S3ConnectionPicker
        connectionsQuery={connectionsQuery}
        onSelectConnection={setActiveConnectionId}
      />
    );
  }

  // Show bucket list if no bucket selected
  if (!currentBucket) {
    return (
      <S3BucketList
        connectionLabel={activeConnection?.label}
        bucketsQuery={bucketsQuery}
        onSelectBucket={(bucket) => {
          setCurrentBucket(bucket);
          setCurrentPrefix('');
        }}
        onBack={() => setActiveConnectionId(null)}
      />
    );
  }

  // Show object browser
  return (
    <S3ObjectBrowser
      connectionId={activeConnectionId}
      currentBucket={currentBucket}
      currentPrefix={currentPrefix}
      objectsQuery={objectsQuery}
      deleteMutation={deleteMutation}
      presignedUrlMutation={presignedUrlMutation}
      onPrefixChange={setCurrentPrefix}
      onBackToBuckets={() => {
        setCurrentBucket(null);
        setCurrentPrefix('');
      }}
    />
  );
};
