/**
 * Delete Confirmation Dialog (Generic)
 *
 * Reusable dialog for deleting databases, schemas, or other resources.
 * Implements type-to-confirm safety check and irreversible action checkbox.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input } from '@ownshell/ui';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  /** The name of the item to delete */
  itemName: string;
  /** The type of item (e.g., "Database", "Schema") for display */
  itemType: string;
  /** Optional custom warning message */
  warningMessage?: string;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  itemName,
  itemType,
  warningMessage,
}) => {
  const { t } = useTranslation();

  const [confirmText, setConfirmText] = useState('');
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setConfirmCheckbox(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isDeleteAllowed) {
      return;
    }

    onConfirm();
  };

  const handleClose = () => {
    setConfirmText('');
    setConfirmCheckbox(false);
    onClose();
  };

  // Delete is only allowed if:
  // 1. User typed the exact item name
  // 2. User checked the "I understand" checkbox
  const isDeleteAllowed = confirmText === itemName && confirmCheckbox;

  const defaultWarningMessage =
    warningMessage ||
    t(
      'db.deleteWarningMessage',
      'This will permanently delete the {{itemType}} and all its data.',
      { itemType: itemType.toLowerCase() }
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('db.dropItem', 'Drop {{itemType}}', { itemType })}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive mb-1">
              {t('db.deleteWarningTitle', 'This action cannot be undone!')}
            </p>
            <p className="text-sm text-muted-foreground">{defaultWarningMessage}</p>
          </div>
        </div>

        {/* Item Name Display */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            {t('db.deleteConfirmPrompt', 'You are about to delete the following {{itemType}}:', {
              itemType: itemType.toLowerCase(),
            })}
          </p>
          <div className="px-4 py-3 bg-surface border border-border rounded">
            <p className="font-mono font-bold text-foreground text-lg">{itemName}</p>
          </div>
        </div>

        {/* Type-to-Confirm Input */}
        <div>
          <label
            htmlFor="confirm-item-name"
            className="block text-sm font-medium text-foreground mb-1"
          >
            {t('db.typeToConfirm', 'Type the {{itemType}} name to confirm', {
              itemType: itemType.toLowerCase(),
            })}{' '}
            *
          </label>
          <Input
            id="confirm-item-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={itemName}
            autoFocus
            autoComplete="off"
            className={
              confirmText.length > 0 && confirmText !== itemName ? 'border-destructive' : ''
            }
          />
          {confirmText.length > 0 && confirmText !== itemName && (
            <p className="text-xs text-destructive mt-1">
              {t('db.nameMismatch', '{{itemType}} name does not match', { itemType })}
            </p>
          )}
        </div>

        {/* Confirmation Checkbox */}
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="confirm-irreversible"
            checked={confirmCheckbox}
            onChange={(e) => setConfirmCheckbox(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-primary cursor-pointer"
          />
          <label
            htmlFor="confirm-irreversible"
            className="text-sm text-foreground cursor-pointer select-none"
          >
            {t('db.confirmIrreversible', 'I understand this action is irreversible')}
          </label>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" variant="danger" disabled={!isDeleteAllowed || isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isLoading ? (
              t('common.deleting', 'Deleting...')
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                {t('db.dropItem', 'Drop {{itemType}}', { itemType })}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
