import { useState } from 'react';

import {
  useCreateApiCollection,
  useCreateApiRequest,
  useDeleteApiCollection,
  useDeleteApiRequest,
  useDuplicateApiRequest,
  useUpdateApiCollection,
  useUpdateApiRequest,
} from '../../hooks/api/useApiQueries';
import { useApiStore } from '../../stores/useApiStore';
import type { ApiCollectionsTable, ApiRequestsTable } from './types';

interface UseMainApiActionsOptions {
  ensureApiPane: () => void;
}

export function useMainApiActions({ ensureApiPane }: UseMainApiActionsOptions) {
  const [deleteApiCollectionConfirm, setDeleteApiCollectionConfirm] = useState<string | null>(null);
  const [deleteApiRequestConfirm, setDeleteApiRequestConfirm] = useState<string | null>(null);
  const [editingApiCollection, setEditingApiCollection] = useState<ApiCollectionsTable | null>(
    null
  );
  const [editingApiRequest, setEditingApiRequest] = useState<ApiRequestsTable | null>(null);
  const [editApiName, setEditApiName] = useState('');

  const { selectRequest } = useApiStore();
  const createApiCollectionMutation = useCreateApiCollection();
  const updateApiCollectionMutation = useUpdateApiCollection();
  const deleteApiCollectionMutation = useDeleteApiCollection();
  const createApiRequestMutation = useCreateApiRequest();
  const updateApiRequestMutation = useUpdateApiRequest();
  const deleteApiRequestMutation = useDeleteApiRequest();
  const duplicateApiRequestMutation = useDuplicateApiRequest();

  const handleSelectApiRequest = (id: string) => {
    selectRequest(id);
    ensureApiPane();
  };

  const handleCreateApiCollection = (parentId?: string | null) => {
    createApiCollectionMutation.mutate({
      name: 'New Collection',
      parent_id: parentId ?? null,
    });

    ensureApiPane();
  };

  const handleCreateApiRequest = (collectionId?: string | null) => {
    createApiRequestMutation.mutate(
      {
        name: 'New Request',
        collection_id: collectionId ?? null,
        method: 'GET',
        url: '',
      },
      {
        onSuccess: (request) => {
          selectRequest(request.id);
          ensureApiPane();
        },
      }
    );
  };

  const handleEditApiCollection = (collection: ApiCollectionsTable) => {
    setEditingApiCollection(collection);
    setEditApiName(collection.name);
  };

  const handleSaveApiCollection = () => {
    if (!editingApiCollection || !editApiName.trim()) return;
    updateApiCollectionMutation.mutate(
      { id: editingApiCollection.id, data: { name: editApiName.trim() } },
      {
        onSuccess: () => {
          setEditingApiCollection(null);
          setEditApiName('');
        },
      }
    );
  };

  const handleDeleteApiCollection = (id: string) => {
    setDeleteApiCollectionConfirm(id);
  };

  const confirmDeleteApiCollection = () => {
    if (!deleteApiCollectionConfirm) return;
    deleteApiCollectionMutation.mutate(deleteApiCollectionConfirm, {
      onSettled: () => {
        setDeleteApiCollectionConfirm(null);
      },
    });
  };

  const handleEditApiRequest = (request: ApiRequestsTable) => {
    setEditingApiRequest(request);
    setEditApiName(request.name);
  };

  const handleSaveApiRequest = () => {
    if (!editingApiRequest || !editApiName.trim()) return;
    updateApiRequestMutation.mutate(
      { id: editingApiRequest.id, data: { name: editApiName.trim() } },
      {
        onSuccess: () => {
          setEditingApiRequest(null);
          setEditApiName('');
        },
      }
    );
  };

  const handleDeleteApiRequest = (id: string) => {
    setDeleteApiRequestConfirm(id);
  };

  const confirmDeleteApiRequest = () => {
    if (!deleteApiRequestConfirm) return;
    deleteApiRequestMutation.mutate(deleteApiRequestConfirm, {
      onSettled: () => {
        setDeleteApiRequestConfirm(null);
      },
    });
  };

  const handleDuplicateApiRequest = (id: string) => {
    duplicateApiRequestMutation.mutate(id, {
      onSuccess: (duplicate) => {
        selectRequest(duplicate.id);
        ensureApiPane();
      },
    });
  };

  const cancelEditApiCollection = () => {
    setEditingApiCollection(null);
    setEditApiName('');
  };

  const cancelEditApiRequest = () => {
    setEditingApiRequest(null);
    setEditApiName('');
  };

  return {
    deleteApiCollectionConfirm,
    deleteApiRequestConfirm,
    editingApiCollection,
    editingApiRequest,
    editApiName,
    setEditApiName,
    isSavingApiCollection: updateApiCollectionMutation.isPending,
    isSavingApiRequest: updateApiRequestMutation.isPending,
    handleSelectApiRequest,
    handleCreateApiCollection,
    handleCreateApiRequest,
    handleEditApiCollection,
    handleSaveApiCollection,
    handleDeleteApiCollection,
    confirmDeleteApiCollection,
    cancelDeleteApiCollection: () => setDeleteApiCollectionConfirm(null),
    handleEditApiRequest,
    handleSaveApiRequest,
    handleDeleteApiRequest,
    confirmDeleteApiRequest,
    cancelDeleteApiRequest: () => setDeleteApiRequestConfirm(null),
    handleDuplicateApiRequest,
    cancelEditApiCollection,
    cancelEditApiRequest,
  };
}
