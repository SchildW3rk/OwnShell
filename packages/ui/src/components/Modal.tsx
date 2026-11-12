/**
 * Modal Component
 *
 * Centered overlay modal with backdrop
 * Design: Dark Mode First, Modern Professional
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
  showCloseButton?: boolean;
  /** Optional footer content (buttons, actions) */
  footer?: React.ReactNode;
  /** Allow closing by clicking backdrop (default: true) */
  closeOnBackdrop?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  footer,
  closeOnBackdrop = true,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl max-h-[85vh]',
    xl: 'max-w-4xl',
    fullscreen: 'w-full h-full max-w-full max-h-full m-0',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => closeOnBackdrop && onClose()}
      />

      {/* Modal */}
      <div
        className={cn(
          'relative bg-card border border-border rounded-lg shadow-2xl',
          'w-full mx-4',
          sizeStyles[size],
          'max-h-[90vh] flex flex-col',
          'transition-colors duration-200'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border transition-colors duration-200">
            {title && (
              <h2 className="text-lg font-semibold text-foreground transition-colors duration-200">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors duration-200 rounded p-1 hover:bg-secondary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 transition-colors duration-200">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
