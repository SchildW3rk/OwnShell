/**
 * Compose Editor Modal
 *
 * CodeMirror 6 based YAML editor for docker-compose files
 * with live editing and deploy capabilities
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Play, Square, RotateCcw, FileCode, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';
import toast from 'react-hot-toast';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../utils/codemirror-theme';

interface ComposeEditorModalProps {
  sessionId: string;
  projectName: string;
  onClose: () => void;
  onStackUpdated?: () => void;
}

export const ComposeEditorModal: React.FC<ComposeEditorModalProps> = ({
  sessionId,
  projectName,
  onClose,
  onStackUpdated,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load compose file path and content
  useEffect(() => {
    const loadComposeFile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Get file path from container labels
        const pathResult = await window.electronAPI.docker.composeFilePath(sessionId, projectName);

        if (!pathResult.success || !pathResult.path) {
          setError(pathResult.error || 'Could not find compose file path');
          setIsLoading(false);
          return;
        }

        setFilePath(pathResult.path);

        // Read file content
        const contentResult = await window.electronAPI.docker.composeFileRead(
          sessionId,
          pathResult.path
        );

        if (!contentResult.success || contentResult.content === undefined) {
          setError(contentResult.error || 'Could not read compose file');
          setIsLoading(false);
          return;
        }

        setOriginalContent(contentResult.content);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load compose file');
        setIsLoading(false);
      }
    };

    loadComposeFile();
  }, [sessionId, projectName]);

  // Initialize CodeMirror editor
  useEffect(() => {
    if (!editorRef.current || isLoading || error) return;

    // Get current theme
    const currentTheme = useThemeStore.getState().getResolvedTheme();
    const initialAppearance = useAppearanceStore.getState();

    const state = EditorState.create({
      doc: originalContent,
      extensions: [
        basicSetup,
        yaml(),
        themeCompartment.current.of(
          getCodeMirrorTheme(currentTheme, {
            editorFontFamily: initialAppearance.editorFontFamily,
            editorFontSize: initialAppearance.editorFontSize,
          })
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const currentContent = update.state.doc.toString();
            setHasChanges(currentContent !== originalContent);
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [originalContent, isLoading, error]);

  // Update theme when app theme changes
  useEffect(() => {
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        effects: themeCompartment.current.reconfigure(
          getCodeMirrorTheme(resolvedTheme, {
            editorFontFamily,
            editorFontSize,
          })
        ),
      });
    }
  }, [resolvedTheme, editorFontFamily, editorFontSize]);

  const getCurrentContent = () => {
    return editorViewRef.current?.state.doc.toString() || '';
  };

  const handleSave = async () => {
    if (!filePath) return;

    setIsSaving(true);
    try {
      const content = getCurrentContent();
      const result = await window.electronAPI.docker.composeFileWrite(sessionId, filePath, content);

      if (result.success) {
        setOriginalContent(content);
        setHasChanges(false);
        toast.success(t('docker.compose.saved', 'File saved'));
      } else {
        toast.error(result.error || t('docker.compose.saveFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('docker.compose.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!filePath) return;

    // Save first if there are changes
    if (hasChanges) {
      await handleSave();
    }

    setIsDeploying(true);
    try {
      const result = await window.electronAPI.docker.composeUp(sessionId, filePath, {
        detached: true,
      });

      if (result.success) {
        toast.success(t('docker.compose.deployed', 'Stack deployed'));
        onStackUpdated?.();
      } else {
        toast.error(result.error || t('docker.compose.deployFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('docker.compose.deployFailed'));
    } finally {
      setIsDeploying(false);
    }
  };

  const handleStop = async () => {
    if (!filePath) return;

    setIsStopping(true);
    try {
      const result = await window.electronAPI.docker.composeDown(sessionId, filePath);

      if (result.success) {
        toast.success(t('docker.compose.stackStopped'));
        onStackUpdated?.();
      } else {
        toast.error(result.error || t('docker.compose.stopFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('docker.compose.stopFailed'));
    } finally {
      setIsStopping(false);
    }
  };

  const handleRestart = async () => {
    await handleStop();
    await handleDeploy();
  };

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative bg-background border border-border rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
            <div className="flex items-center gap-3">
              <FileCode className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {t('docker.compose.editor', 'Compose Editor')}
                </h2>
                <p className="text-xs text-muted-foreground">{projectName}</p>
              </div>
              {hasChanges && (
                <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                  {t('docker.compose.unsaved', 'Unsaved')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving || isLoading}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span className="ml-1.5">{t('docker.compose.save', 'Save')}</span>
              </Button>

              <div className="w-px h-6 bg-secondary" />

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleDeploy}
                disabled={isDeploying || isLoading}
              >
                {isDeploying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span className="ml-1.5">{t('docker.compose.up', 'Up')}</span>
              </Button>

              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleStop}
                disabled={isStopping || isLoading}
              >
                {isStopping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span className="ml-1.5">{t('docker.compose.down', 'Down')}</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRestart}
                disabled={isDeploying || isStopping || isLoading}
                title={t('docker.compose.restart', 'Restart')}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>

              <div className="w-px h-6 bg-secondary" />

              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* File Path */}
          {filePath && (
            <div className="px-4 py-2 bg-secondary border-b border-border">
              <code className="text-xs text-muted-foreground font-mono">{filePath}</code>
            </div>
          )}

          {/* Editor Content */}
          <div className="flex-1 overflow-hidden bg-background">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {t('docker.compose.loadError', 'Could not load compose file')}
                  </h3>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
            ) : (
              <div ref={editorRef} className="h-full" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComposeEditorModal;
