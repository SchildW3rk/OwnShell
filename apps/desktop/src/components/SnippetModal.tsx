/**
 * Snippet Modal
 *
 * Modal for creating and editing snippets (quick commands)
 * Features:
 * - Label input
 * - Multi-line command textarea
 * - Category with autocomplete (datalist)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@ownshell/ui';
import { Snippet, useSnippetStore } from '../stores/useSnippetStore';

interface SnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  snippet?: Snippet; // If provided, we're editing; otherwise creating
}

export const SnippetModal: React.FC<SnippetModalProps> = ({ isOpen, onClose, snippet }) => {
  const { t } = useTranslation();
  const { categories, createSnippet, updateSnippet } = useSnippetStore();

  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [category, setCategory] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const labelInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!snippet;

  // Reset form when modal opens/closes or snippet changes
  useEffect(() => {
    if (isOpen) {
      if (snippet) {
        setLabel(snippet.label);
        setCommand(snippet.command);
        setCategory(snippet.category || '');
      } else {
        setLabel('');
        setCommand('');
        setCategory('');
      }
      // Focus label input after a short delay
      setTimeout(() => labelInputRef.current?.focus(), 100);
    }
  }, [isOpen, snippet]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!label.trim() || !command.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && snippet) {
        await updateSnippet(snippet.id, {
          label: label.trim(),
          command: command.trim(),
          category: category.trim() || null,
        });
      } else {
        await createSnippet({
          label: label.trim(),
          command: command.trim(),
          category: category.trim() || undefined,
        });
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60 cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-lg border border-shell-panel-border bg-shell-panel text-shell-panel-foreground shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-shell-panel-border px-4 py-3">
          <h2 className="text-base font-semibold text-shell-panel-foreground">
            {isEditing ? t('snippets.editSnippet') : t('snippets.newSnippet')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-shell-panel-muted transition-colors hover:bg-shell-panel-hover hover:text-shell-panel-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Label */}
          <div>
            <label htmlFor="snippet-label" className="mb-1 block text-sm text-shell-panel-muted">
              {t('snippets.label')} <span className="text-destructive">*</span>
            </label>
            <input
              ref={labelInputRef}
              id="snippet-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('snippets.labelPlaceholder')}
              className={cn(
                'w-full rounded-md px-3 py-2 text-sm',
                'border border-shell-control-border bg-shell-control',
                'text-shell-control-foreground placeholder:text-shell-panel-muted',
                'focus:outline-none focus:border-shell-focus-soft',
                'transition-colors'
              )}
              required
            />
          </div>

          {/* Command (Textarea) */}
          <div>
            <label htmlFor="snippet-command" className="mb-1 block text-sm text-shell-panel-muted">
              {t('snippets.command')} <span className="text-destructive">*</span>
            </label>
            <textarea
              id="snippet-command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t('snippets.commandPlaceholder')}
              rows={4}
              className={cn(
                'w-full resize-none rounded-md px-3 py-2 text-sm',
                'border border-shell-control-border bg-shell-control',
                'text-shell-control-foreground placeholder:text-shell-panel-muted',
                'font-mono',
                'focus:outline-none focus:border-shell-focus-soft',
                'transition-colors'
              )}
              required
            />
            <p className="mt-1 text-xs text-shell-panel-muted">{t('snippets.commandHint')}</p>
          </div>

          {/* Category (with datalist) */}
          <div>
            <label htmlFor="snippet-category" className="mb-1 block text-sm text-shell-panel-muted">
              {t('snippets.category')}{' '}
              <span className="text-shell-panel-muted/75">{t('snippets.categoryOptional')}</span>
            </label>
            <input
              id="snippet-category"
              type="text"
              list="snippet-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('snippets.categoryPlaceholder')}
              className={cn(
                'w-full rounded-md px-3 py-2 text-sm',
                'border border-shell-control-border bg-shell-control',
                'text-shell-control-foreground placeholder:text-shell-panel-muted',
                'focus:outline-none focus:border-shell-focus-soft',
                'transition-colors'
              )}
            />
            <datalist id="snippet-categories">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-shell-panel-muted">{t('snippets.categoryHint')}</p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={cn(
                'rounded-md px-4 py-2 text-sm',
                'bg-shell-control text-shell-control-foreground',
                'hover:bg-shell-control-hover',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors'
              )}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !label.trim() || !command.trim()}
              className={cn(
                'rounded-md px-4 py-2 text-sm',
                'bg-shell-control-active text-shell-control-active-foreground',
                'hover:brightness-110',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors'
              )}
            >
              {isSubmitting
                ? t('snippets.saving')
                : isEditing
                  ? t('snippets.update')
                  : t('snippets.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
