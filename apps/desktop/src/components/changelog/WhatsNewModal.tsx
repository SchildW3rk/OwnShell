/**
 * What's New Modal (v1.18.0)
 *
 * Shows release notes after an app update
 * Fetches changelog from the OwnShell release service
 */

import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

interface ReleaseInfo {
  version: string;
  name: string;
  body: string;
  publishedAt: string;
}

interface WhatsNewModalProps {
  version: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Simple markdown renderer for release notes
 * Handles: headers, lists, bold, links
 */
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {lines.map((line, index) => {
        const trimmedLine = line.trim();

        // Empty line
        if (!trimmedLine) {
          return <div key={index} className="h-2" />;
        }

        // H2 Header
        if (trimmedLine.startsWith('## ')) {
          return (
            <h3 key={index} className="text-base font-semibold text-foreground mt-4 mb-2">
              {trimmedLine.slice(3)}
            </h3>
          );
        }

        // H3 Header
        if (trimmedLine.startsWith('### ')) {
          return (
            <h4 key={index} className="text-sm font-semibold text-foreground mt-3 mb-1">
              {trimmedLine.slice(4)}
            </h4>
          );
        }

        // List item
        if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          const text = trimmedLine.slice(2);
          return (
            <div key={index} className="flex items-start gap-2 py-0.5">
              <span className="text-primary mt-1.5 text-xs">●</span>
              <span className="text-sm text-muted-foreground">{renderInlineFormatting(text)}</span>
            </div>
          );
        }

        // Regular paragraph
        return (
          <p key={index} className="text-sm text-muted-foreground py-0.5">
            {renderInlineFormatting(trimmedLine)}
          </p>
        );
      })}
    </div>
  );
};

/**
 * Render inline formatting (bold, code, links)
 */
function renderInlineFormatting(text: string): React.ReactNode {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-medium text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1 py-0.5 bg-secondary rounded text-xs font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ version, isOpen, onClose }) => {
  const { t } = useTranslation();
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch release notes when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchRelease = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await window.electronAPI.releases.getChangelog(version);

        if (result.success && result.release) {
          setRelease(result.release);
        } else {
          setError(result.error || 'Failed to load release notes');
        }
      } catch (err) {
        setError('Failed to load release notes');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRelease();
  }, [isOpen, version]);

  if (!isOpen) return null;

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {t('changelog.whatsNew', "What's New")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('changelog.version', 'Version {{version}}', { version })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {t('changelog.checkReleaseService', 'Check the release service for release notes')}
              </p>
            </div>
          )}

          {!isLoading && !error && release && (
            <>
              {/* Release name if different from version */}
              {release.name && release.name !== `v${version}` && (
                <p className="text-sm font-medium text-foreground mb-3">{release.name}</p>
              )}

              {/* Release date */}
              <p className="text-xs text-muted-foreground mb-4">
                {t('changelog.released', 'Released {{date}}', {
                  date: formatDate(release.publishedAt),
                })}
              </p>

              {/* Release notes */}
              <MarkdownContent content={release.body} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/30">
          <div className="flex-1" />
          <Button variant="primary" onClick={onClose}>
            {t('changelog.gotIt', 'Got it!')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewModal;
