/**
 * Confirm Dialog Component
 *
 * Reusable confirmation dialog (i18n-agnostic, for use across the project)
 *
 * Features:
 * - Props-based styling with Dark-Theme defaults
 * - Backdrop click-to-close
 * - Loading state support
 * - Variant system (default/danger)
 */

import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  /** Dialog visibility state */
  isOpen: boolean;

  /** Dialog title */
  title: string;

  /** Dialog message/description */
  message: string;

  /** Confirm button label (no default - must be provided) */
  confirmLabel: string;

  /** Cancel button label (no default - must be provided) */
  cancelLabel: string;

  /** Dialog variant (affects color scheme) */
  variant?: 'default' | 'danger';

  /** Loading state (disables buttons, shows spinner) */
  isLoading?: boolean;

  /** Confirm button callback */
  onConfirm: () => void | Promise<void>;

  /** Cancel button callback (also triggered by backdrop click) */
  onCancel: () => void;

  /** Custom colors (optional - defaults to Dark-Theme) */
  colors?: {
    /** Backdrop overlay color */
    backdrop?: string;
    /** Dialog background color */
    background?: string;
    /** Border color */
    border?: string;
    /** Primary text color */
    text?: string;
    /** Secondary text color */
    textSecondary?: string;
    /** Danger variant background */
    dangerBg?: string;
    /** Default variant background */
    defaultBg?: string;
  };
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
  colors = {},
}) => {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  // Default Dark-Theme colors
  const defaultColors = {
    backdrop: 'bg-black/60 backdrop-blur-sm',
    background: 'bg-card',
    border: 'border-border',
    text: 'text-foreground',
    textSecondary: 'text-muted-foreground',
    dangerBg: 'bg-destructive/20',
    dangerIcon: 'text-destructive',
    defaultBg: 'bg-primary/20',
    defaultIcon: 'text-primary',
  };

  const backdropClass = colors.backdrop || defaultColors.backdrop;
  const bgClass = colors.background || defaultColors.background;
  const borderClass = colors.border || defaultColors.border;
  const textClass = colors.text || defaultColors.text;
  const textSecondaryClass = colors.textSecondary || defaultColors.textSecondary;
  const iconBgClass = isDanger
    ? colors.dangerBg || defaultColors.dangerBg
    : colors.defaultBg || defaultColors.defaultBg;
  const iconClass = isDanger ? defaultColors.dangerIcon : defaultColors.defaultIcon;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Backdrop */}
      <div className={`absolute inset-0 ${backdropClass}`} onClick={onCancel} />

      {/* Modal */}
      <div
        className={`relative ${bgClass} border ${borderClass} rounded-lg shadow-2xl w-96 max-w-[90vw] transition-colors duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center gap-3 px-5 py-4 border-b ${borderClass} transition-colors duration-200`}
        >
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBgClass} transition-colors duration-200`}
          >
            <AlertTriangle className={`w-5 h-5 ${iconClass} transition-colors duration-200`} />
          </div>
          <h3 className={`text-lg font-semibold ${textClass} transition-colors duration-200`}>
            {title}
          </h3>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <p className={`text-sm ${textSecondaryClass} transition-colors duration-200`}>
            {message}
          </p>
        </div>

        {/* Footer */}
        <div
          className={`flex justify-end gap-3 px-5 py-4 border-t ${borderClass} transition-colors duration-200`}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
            className="no-drag"
          >
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
            className={`no-drag ${isDanger ? 'bg-destructive hover:bg-destructive/80' : ''}`}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
