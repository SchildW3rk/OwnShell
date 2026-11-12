/**
 * Docker Images View
 *
 * Lists all Docker images with the ability to delete unused images
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Trash2, RefreshCw, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { Button, LoadingState, EmptyState } from '@ownshell/ui';
import { DockerImage } from '@ownshell/core';
import { useDockerImages, useRemoveImage, usePruneImages } from '../../hooks/docker';

interface DockerImagesViewProps {
  sessionId: string;
}

export const DockerImagesView: React.FC<DockerImagesViewProps> = ({ sessionId }) => {
  const { t } = useTranslation();

  const imagesQuery = useDockerImages(sessionId);
  const removeImageMutation = useRemoveImage(sessionId);
  const pruneImagesMutation = usePruneImages(sessionId);

  const images = imagesQuery.data?.images || [];
  const isLoading = imagesQuery.isLoading;
  const isMutating = removeImageMutation.isPending || pruneImagesMutation.isPending;

  const handleRemoveImage = (imageId: string, imageName: string) => {
    if (confirm(t('docker.removeImageConfirm', { name: imageName }))) {
      removeImageMutation.mutate({ imageId });
    }
  };

  const handlePruneImages = () => {
    if (confirm(t('docker.pruneImagesConfirm', 'Remove all unused images?'))) {
      pruneImagesMutation.mutate({ all: false });
    }
  };

  const handleRefresh = () => {
    imagesQuery.refetch();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t('docker.images', 'Images')}</h2>
          <span className="text-xs text-muted-foreground">({images.length})</span>
          {isMutating && <Loader2 className="w-4 h-4 animate-spin text-primary ml-2" />}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handlePruneImages}
            disabled={isLoading || isMutating}
            title={t('docker.pruneImages', 'Remove unused images')}
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            {t('docker.prune', 'Prune')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {imagesQuery.data?.error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">{imagesQuery.data.error}</span>
        </div>
      )}

      {/* Images List */}
      <div className="flex-1 overflow-auto">
        {isLoading && images.length === 0 ? (
          <LoadingState />
        ) : images.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t('docker.noImages', 'No images found')}
          />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">
                  {t('docker.repository', 'Repository')}
                </th>
                <th className="text-left px-4 py-2 font-medium">{t('docker.tag', 'Tag')}</th>
                <th className="text-left px-4 py-2 font-medium">
                  {t('docker.imageId', 'Image ID')}
                </th>
                <th className="text-left px-4 py-2 font-medium">
                  {t('docker.created', 'Created')}
                </th>
                <th className="text-right px-4 py-2 font-medium">{t('docker.size', 'Size')}</th>
                <th className="text-right px-4 py-2 font-medium">
                  {t('docker.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {images.map((image) => (
                <ImageRow
                  key={`${image.repository}:${image.tag}:${image.id}`}
                  image={image}
                  onRemove={() => handleRemoveImage(image.id, `${image.repository}:${image.tag}`)}
                  isRemoving={removeImageMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

interface ImageRowProps {
  image: DockerImage;
  onRemove: () => void;
  isRemoving: boolean;
}

const ImageRow = React.memo<ImageRowProps>(function ImageRow({ image, onRemove, isRemoving }) {
  const isUntagged = image.repository === '<none>' || image.tag === '<none>';

  return (
    <tr className="hover:bg-surface transition-colors">
      <td className="px-4 py-3">
        <span
          className={`text-sm font-medium ${isUntagged ? 'text-muted-foreground italic' : 'text-foreground'}`}
        >
          {image.repository}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-sm ${isUntagged ? 'text-muted-foreground italic' : 'text-accent'}`}>
          {image.tag}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-muted-foreground font-mono">{image.id.slice(0, 12)}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-muted-foreground">{image.created}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-muted-foreground">{image.sizeHuman}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={isRemoving}
          title={isUntagged ? 'Remove dangling image' : 'Remove image'}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );
});

export default DockerImagesView;
